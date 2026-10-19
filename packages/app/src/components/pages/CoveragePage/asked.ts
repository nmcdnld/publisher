// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useSyncExternalStore } from "react";
import { postAi } from "../../../ai/consoleAi";
import type { ChatScope } from "../../chat/chatHistory";
import {
   type Classification,
   type ConceptType,
   countStatuses,
   coverageScore,
   type CoverageRun,
   savedCategories,
} from "./model";

/** Mirrors `Evaluation` in `packages/console-ai/src/coverage.ts`. */
type Evaluation =
   | { analytical: false }
   | {
        analytical: true;
        persona: string;
        category: string;
        concepts: Array<{ type: ConceptType; text: string }>;
        result: Classification;
     };

/**
 * Questions asked in the Ask window, kept per package as one run whose
 * questions are the distinct inputs: asking the same thing again adds an ask
 * and refreshes the verdict rather than adding a question.
 */
export const ASKED_RUN_ID = "asked";
const KEEP = 200;
const UNSORTED = "Unsorted";
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; run?: CoverageRun }>();

function key(scope: ChatScope) {
   return `coverage-asked:${scope.environment}/${scope.package}`;
}

function read(storageKey: string): CoverageRun | undefined {
   const raw = localStorage.getItem(storageKey);
   const cached = cache.get(storageKey);
   if (cached && cached.raw === raw) return cached.run;
   let run: CoverageRun | undefined;
   try {
      run = raw ? (JSON.parse(raw) as CoverageRun) : undefined;
   } catch {
      // A corrupt entry is replaced on the next write.
   }
   cache.set(storageKey, { raw, run });
   return run;
}

function write(storageKey: string, run: CoverageRun | undefined) {
   try {
      if (run) localStorage.setItem(storageKey, JSON.stringify(run));
      else localStorage.removeItem(storageKey);
   } catch {
      // The heat map misses this ask; the chat is unaffected.
   }
   listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
   listeners.add(listener);
   const onStorage = (e: StorageEvent) =>
      e.key?.startsWith("coverage-asked:") && listener();
   window.addEventListener("storage", onStorage);
   return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
   };
}

/** Case, spacing and trailing punctuation do not make a question new. */
export function normalizeQuestion(text: string): string {
   return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\s?.!]+$/, "");
}

function questionId(normalized: string): string {
   let hash = 0x811c9dc5;
   for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
   }
   return `chat:${(hash >>> 0).toString(36)}`;
}

function empty(): CoverageRun {
   return {
      id: ASKED_RUN_ID,
      setId: ASKED_RUN_ID,
      at: Date.now(),
      questions: [],
      results: {},
      failed: {},
      investigations: {},
      asks: {},
   };
}

function lastAsked(run: CoverageRun, id: string) {
   return run.asks?.[id]?.at(-1)?.at ?? 0;
}

/** Keep the most recently asked questions, then rescore. */
function settle(run: CoverageRun): CoverageRun {
   let next = run;
   if (run.questions.length > KEEP) {
      const kept = [...run.questions]
         .sort((a, b) => lastAsked(run, b.id) - lastAsked(run, a.id))
         .slice(0, KEEP);
      const ids = new Set(kept.map((q) => q.id));
      const pick = <T>(record: Record<string, T> | undefined) =>
         Object.fromEntries(
            Object.entries(record ?? {}).filter(([id]) => ids.has(id)),
         );
      next = {
         ...run,
         questions: run.questions.filter((q) => ids.has(q.id)),
         results: pick(run.results),
         failed: pick(run.failed),
         investigations: pick(run.investigations),
         asks: pick(run.asks),
      };
   }
   const counts = countStatuses(next.questions, next.results);
   return { ...next, counts, score: coverageScore(counts) };
}

export function useAskedRun(scope: ChatScope) {
   const storageKey = key(scope);
   const run = useSyncExternalStore(subscribe, () => read(storageKey));
   const update = useCallback(
      (change: (run: CoverageRun) => CoverageRun) => {
         const current = read(storageKey);
         if (current) write(storageKey, settle(change(current)));
      },
      [storageKey],
   );
   const clear = useCallback(() => write(storageKey, undefined), [storageKey]);
   return { run, update, clear };
}

export interface AskedTurn {
   scope: ChatScope;
   threadId: string;
   question: string;
   /** The user's earlier turns in the thread, oldest first. */
   earlier: string[];
   /** The reply as Markdown, with the tools it called. */
   answer: string;
   model?: string;
}

/**
 * Judge one finished Ask turn from its answer and file it in the package's
 * asked-in-chat run. Turns that are not analytical questions are dropped.
 */
export async function recordAsked(turn: AskedTurn): Promise<void> {
   const normalized = normalizeQuestion(turn.question);
   if (!normalized) return;
   const id = questionId(normalized);
   const storageKey = key(turn.scope);
   const at = Date.now();
   const known = read(storageKey)?.questions.find((q) => q.id === id);
   const categories = [
      ...new Set([
         ...savedCategories({
            environmentName: turn.scope.environment,
            packageName: turn.scope.package,
         }),
         ...(read(storageKey)?.questions.map((q) => q.category) ?? []),
      ]),
   ].filter((c) => c !== UNSORTED);

   let evaluation: Evaluation | undefined;
   let failure: string | undefined;
   try {
      evaluation = await postAi<Evaluation>("/coverage/evaluate", {
         scope: turn.scope,
         model: turn.model,
         question: turn.question,
         earlier: turn.earlier,
         answer: turn.answer,
         categories,
      });
   } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
   }
   if (evaluation && !evaluation.analytical) return;
   // An unjudged question is kept only once it has been judged before.
   if (!evaluation && !known) return;

   // Read again: other turns may have landed while this one was judged.
   const run = read(storageKey) ?? empty();
   const existing = run.questions.find((q) => q.id === id);
   const questions = existing
      ? run.questions
      : [
           ...run.questions,
           {
              id,
              text: turn.question.trim(),
              persona: evaluation?.persona ?? "",
              category: evaluation?.category || UNSORTED,
              concepts: evaluation?.concepts ?? [],
           },
        ];
   const asks = {
      ...run.asks,
      [id]: [
         ...(run.asks?.[id] ?? []),
         {
            at,
            threadId: turn.threadId,
            status: evaluation?.result.status,
         },
      ],
   };
   if (!evaluation) {
      write(
         storageKey,
         settle({
            ...run,
            at,
            questions,
            asks,
            failed: run.results[id]
               ? run.failed
               : { ...run.failed, [id]: failure ?? "Not judged" },
         }),
      );
      return;
   }
   const { [id]: _failed, ...failed } = run.failed;
   write(
      storageKey,
      settle({
         ...run,
         at,
         questions,
         asks,
         failed,
         results: { ...run.results, [id]: { ...evaluation.result, id } },
         investigations: {
            ...run.investigations,
            [id]: {
               transcript: `**Asked:** ${turn.question.trim()}\n\n${turn.answer}`,
               verdict: evaluation.result.status,
               model: evaluation.result.model,
               via: "asked",
               at,
            },
         },
      }),
   );
}
