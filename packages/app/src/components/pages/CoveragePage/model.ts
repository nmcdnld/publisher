// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import type { Entity, Ontology } from "../../../ontology/types";

const CONCEPT_TYPES = [
   "source",
   "measure",
   "dimension",
   "view",
   "dimensional_value",
] as const;
export type ConceptType = (typeof CONCEPT_TYPES)[number];

/** Mirrors `QuestionSetSchema` in `packages/console-ai/src/coverage.ts`; types only. */
export const QuestionSetSchema = z.object({
   domain: z.string(),
   questions: z.array(
      z.object({
         text: z.string(),
         persona: z.string(),
         category: z.string(),
         concepts: z.array(
            z.object({ type: z.enum(CONCEPT_TYPES), text: z.string() }),
         ),
      }),
   ),
});

export type GeneratedQuestion = z.infer<
   typeof QuestionSetSchema
>["questions"][number];
export interface Question extends GeneratedQuestion {
   id: string;
}

export type CoverageStatus = "answerable" | "partial" | "missing";
export const STATUSES: CoverageStatus[] = ["answerable", "partial", "missing"];

export const STATUS_META: Record<
   CoverageStatus,
   { label: string; cell: string; text: string }
> = {
   answerable: {
      label: "Answerable",
      cell: "bg-answerable",
      text: "text-answerable",
   },
   partial: {
      label: "Partly answerable",
      cell: "bg-partial",
      text: "text-partial",
   },
   missing: { label: "Missing", cell: "bg-missing", text: "text-missing" },
};

/** Mirrors `Classification` in `packages/console-ai/src/coverage.ts`. */
export interface Classification {
   id: string;
   status: CoverageStatus;
   confidence: number;
   probabilities: Record<CoverageStatus, number>;
   concepts: Array<{ type: ConceptType; text: string; present: number }>;
   retrieval: "get_context" | "lexical";
   retrieved: Array<{ model: string; source: string; fields: string[] }>;
   /** `transcript` judges a question asked in the Ask window from its answer. */
   judge: "jev" | "opus" | "agent" | "transcript";
   judgeNote?: string;
   /** The agent's reply, for an `agent` verdict. */
   answer?: string;
   model?: string;
   ms: number;
   error?: string;
   /** A verdict saved from re-running the question as a chat; `status` follows it. */
   chat?: ChatVerdict;
}

export interface ChatVerdict {
   status: CoverageStatus;
   /** The batch verdict it replaced, absent when the batch never classified it. */
   batch?: CoverageStatus;
   model?: string;
   at: number;
}

export interface Counts {
   answerable: number;
   partial: number;
   missing: number;
}

export interface CoverageRun {
   id: string;
   /** Shared by every run that scored the same questions, so their scores compare. */
   setId: string;
   at: number;
   domain?: string;
   focus?: string;
   questions: Question[];
   results: Record<string, Classification>;
   /** Questions whose classify call failed, with why. */
   failed: Record<string, string>;
   /** `agent` answers each question with the chat agent; absent means `batch`. */
   judgeWith?: "batch" | "agent";
   /** The latest chat investigation of each question, by question id. */
   investigations?: Record<string, Investigation>;
   /** Each time a question was asked in the Ask window, oldest first. */
   asks?: Record<string, Ask[]>;
   score?: number;
   counts?: Counts;
}

export interface Ask {
   at: number;
   threadId: string;
   /** The verdict that asking got; absent when judging it failed. */
   status?: CoverageStatus;
}

export interface Investigation {
   /** The conversation as Markdown: questions, answers and the queries run. */
   transcript: string;
   /** The verdict its latest reply closed with. */
   verdict?: CoverageStatus;
   model?: string;
   /**
    * `chat` from "Re-run as chat", `rescore` from an agent re-score, `asked`
    * from a question asked in the Ask window.
    */
   via: "chat" | "rescore" | "asked";
   at: number;
}

export function withInvestigation(
   run: CoverageRun,
   questionId: string,
   investigation: Investigation,
): CoverageRun {
   return {
      ...run,
      investigations: { ...run.investigations, [questionId]: investigation },
   };
}

export const JUDGE_LABEL: Record<Classification["judge"], string> = {
   jev: "Jev",
   opus: "Opus",
   agent: "the chat agent",
   transcript: "a read of the chat's answer",
};

/** A concept the verdict judged absent; -1 means it was not judged. */
export function isAbsent(concept: { present: number }) {
   return concept.present >= 0 && concept.present < 0.5;
}

export function isCompleteQuestion(q: unknown): q is GeneratedQuestion {
   const question = q as Partial<GeneratedQuestion> | undefined;
   return Boolean(
      question?.text &&
         question.category &&
         Array.isArray(question.concepts) &&
         question.concepts.length > 0 &&
         question.concepts.every(
            (c) => c?.text && CONCEPT_TYPES.includes(c.type as ConceptType),
         ),
   );
}

export function countStatuses(
   questions: Question[],
   results: Record<string, Classification>,
): Counts {
   const counts: Counts = { answerable: 0, partial: 0, missing: 0 };
   for (const q of questions) {
      const r = results[q.id];
      if (r) counts[r.status]++;
   }
   return counts;
}

/**
 * `run` with a chat verdict saved for one question. The batch evidence is
 * kept; an unfinished run gets its score when the batch finishes.
 */
export function withChatVerdict(
   run: CoverageRun,
   questionId: string,
   verdict: Omit<ChatVerdict, "batch">,
): CoverageRun {
   const question = run.questions.find((q) => q.id === questionId);
   if (!question) return run;
   const existing = run.results[questionId];
   const batch = existing?.chat ? existing.chat.batch : existing?.status;
   const result: Classification = {
      ...(existing ?? {
         id: questionId,
         confidence: 1,
         probabilities: { answerable: 0, partial: 0, missing: 0 },
         concepts: [],
         retrieval: "get_context",
         retrieved: [],
         judge: "opus",
         ms: 0,
      }),
      status: verdict.status,
      chat: { ...verdict, batch },
   };
   const { [questionId]: _failed, ...failed } = run.failed;
   const results = { ...run.results, [questionId]: result };
   if (run.score === undefined) return { ...run, results, failed };
   const counts = countStatuses(run.questions, results);
   return { ...run, results, failed, counts, score: coverageScore(counts) };
}

/** Percent of questions answerable, with a partial answer worth half. */
export function coverageScore(counts: Counts): number | undefined {
   const total = counts.answerable + counts.partial + counts.missing;
   if (!total) return undefined;
   return Math.round(((counts.answerable + counts.partial / 2) / total) * 100);
}

export interface ScoreGrade {
   label: string;
   description: string;
   chip: string;
}

/** Highest threshold first; a score takes the first grade it reaches. */
const SCORE_GRADES: Array<{ min: number } & ScoreGrade> = [
   {
      min: 90,
      label: "Excellent",
      description: "Nearly every question is answerable from the model.",
      chip: "border-transparent bg-answerable text-white",
   },
   {
      min: 75,
      label: "Good",
      description: "Most questions are answerable; a few gaps remain.",
      chip: "border-transparent bg-answerable/15 text-answerable",
   },
   {
      min: 60,
      label: "Fair",
      description: "Many questions work, but gaps are common.",
      chip: "border-transparent bg-partial/20 text-partial",
   },
   {
      min: 40,
      label: "Weak",
      description: "Large parts of the question set cannot be answered.",
      chip: "border-transparent bg-missing/15 text-missing",
   },
   {
      min: 0,
      label: "Poor",
      description: "Most questions cannot be answered from the model.",
      chip: "border-transparent bg-missing text-white",
   },
];

export function scoreGrade(score: number): ScoreGrade {
   return SCORE_GRADES.find((g) => score >= g.min) ?? SCORE_GRADES.at(-1)!;
}

export interface Gap {
   key: string;
   type: ConceptType;
   text: string;
   /** Questions that need this concept and did not find it. */
   questionIds: string[];
   /** Of those, how many it alone blocks (the only absent concept). */
   blocking: number;
   categories: string[];
}

const TYPE_WEIGHT: Record<ConceptType, number> = {
   measure: 0,
   source: 1,
   dimension: 2,
   view: 3,
   dimensional_value: 4,
};

function conceptKey(type: string, text: string) {
   const words = text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !["the", "a", "an", "of", "per", "by"].includes(w))
      .map((w) => w.replace(/(ies|es|s)$/, ""));
   return `${type}:${words.join(" ")}`;
}

/** The concepts a run looked for and did not find, most-needed first. */
export function gapBacklog(run: CoverageRun): Gap[] {
   const gaps = new Map<string, Gap>();
   const byId = new Map(run.questions.map((q) => [q.id, q]));
   for (const result of Object.values(run.results)) {
      if (result.status === "answerable") continue;
      const absent = result.concepts.filter(isAbsent);
      for (const concept of absent) {
         const key = conceptKey(concept.type, concept.text);
         const gap =
            gaps.get(key) ??
            ({
               key,
               type: concept.type,
               text: concept.text,
               questionIds: [],
               blocking: 0,
               categories: [],
            } satisfies Gap);
         if (!gap.questionIds.includes(result.id)) {
            gap.questionIds.push(result.id);
            if (absent.length === 1) gap.blocking++;
            const category = byId.get(result.id)?.category;
            if (category && !gap.categories.includes(category)) {
               gap.categories.push(category);
            }
         }
         gaps.set(key, gap);
      }
   }
   return [...gaps.values()].sort(
      (a, b) =>
         b.questionIds.length - a.questionIds.length ||
         b.blocking - a.blocking ||
         TYPE_WEIGHT[a.type] - TYPE_WEIGHT[b.type],
   );
}

/** The single concept to name a non-answerable question's gap by. */
export function missingConcept(result: Classification | undefined) {
   if (!result || result.status === "answerable") return undefined;
   return [...result.concepts]
      .filter(isAbsent)
      .sort(
         (a, b) =>
            a.present - b.present || TYPE_WEIGHT[a.type] - TYPE_WEIGHT[b.type],
      )[0];
}

export function gapsMarkdown(run: CoverageRun, gaps: Gap[]): string {
   const byId = new Map(run.questions.map((q) => [q.id, q]));
   return [
      `# Coverage gaps${run.domain ? ` (${run.domain})` : ""}`,
      "",
      `Score ${run.score ?? "?"} over ${run.questions.length} questions.`,
      "",
      ...gaps.map((gap) =>
         [
            `- **${gap.text}** (${gap.type.replace("_", " ")}): ${gap.questionIds.length} question${gap.questionIds.length === 1 ? "" : "s"}${gap.blocking ? `, the only gap in ${gap.blocking}` : ""}`,
            ...gap.questionIds
               .slice(0, 3)
               .map((id) => `  - ${byId.get(id)?.text ?? id}`),
         ].join("\n"),
      ),
   ].join("\n");
}

const ASKED_LIMIT = 40;

/** The Question Coverage page as markdown, for "Ask about this". */
export function coverageMarkdown(
   ontology: Pick<Ontology, "packageName">,
   run: CoverageRun | undefined,
   gaps: Gap[],
   asked: CoverageRun | undefined,
): string {
   const lines = [`# Question coverage of package ${ontology.packageName}`];
   if (run) {
      const counts = run.counts ?? countStatuses(run.questions, run.results);
      const themes = new Map<string, Question[]>();
      for (const q of run.questions) {
         themes.set(q.category, [...(themes.get(q.category) ?? []), q]);
      }
      lines.push(
         `Generated set${run.domain ? ` (${run.domain})` : ""}${run.focus ? `, focus ${run.focus}` : ""}: score ${run.score ?? "not finished"} over ${run.questions.length} questions; ${counts.answerable} answerable, ${counts.partial} partial, ${counts.missing} missing.`,
         "## By theme",
         ...[...themes.entries()].map(([theme, questions]) => {
            const c = countStatuses(questions, run.results);
            return `- ${theme}: score ${coverageScore(c) ?? "?"} (${c.answerable} answerable, ${c.partial} partial, ${c.missing} missing)`;
         }),
         gapsMarkdown(run, gaps.slice(0, 15)).replace(/^# /, "## "),
      );
   } else {
      lines.push("No generated question set yet.");
   }
   if (asked?.questions.length) {
      const times = (id: string) => asked.asks?.[id]?.length ?? 0;
      lines.push(
         `## Asked in chat (score ${asked.score ?? "?"} over ${asked.questions.length} distinct questions)`,
         ...[...asked.questions]
            .sort((a, b) => times(b.id) - times(a.id))
            .slice(0, ASKED_LIMIT)
            .map((q) => {
               const status = asked.results[q.id]?.status;
               const gap = missingConcept(asked.results[q.id]);
               return `- ${q.text} [${q.category}] asked ${times(q.id)}×: ${status ? STATUS_META[status].label : "not judged"}${gap ? `, missing ${gap.text}` : ""}`;
            }),
      );
   }
   return lines.join("\n");
}

/** The model's sources in the shape the Worker's lexical retrieval reads. */
export function catalogFor(ontology: Ontology) {
   return ontology.sources.map((source) => {
      const fields = (source.fieldIds ?? [])
         .map((id) => ontology.entities.get(id))
         .filter((f): f is Entity => Boolean(f));
      return {
         model: source.modelPath,
         source: source.name,
         doc: source.doc,
         joins: fields.filter((f) => f.kind === "join").map((f) => f.name),
         fields: fields.map((f) => ({
            name: f.name,
            kind: f.kind,
            type: f.dataType,
            doc: f.doc,
         })),
      };
   });
}

// --- Run history, kept in this browser -------------------------------------

const KEEP = 5;
const listeners = new Set<() => void>();
const cache = new Map<string, CoverageRun[]>();

function historyKey(
   ontology: Pick<Ontology, "environmentName" | "packageName">,
) {
   return `coverage:${ontology.environmentName}/${ontology.packageName}`;
}

/** The themes the package's saved runs file questions under. */
export function savedCategories(
   ontology: Pick<Ontology, "environmentName" | "packageName">,
): string[] {
   return [
      ...new Set(
         readHistory(historyKey(ontology)).flatMap((r) =>
            r.questions.map((q) => q.category),
         ),
      ),
   ];
}

function readHistory(key: string): CoverageRun[] {
   if (!cache.has(key)) {
      try {
         cache.set(key, JSON.parse(localStorage.getItem(key) ?? "[]"));
      } catch {
         cache.set(key, []);
      }
   }
   return cache.get(key)!;
}

export function useRunHistory(ontology: Ontology) {
   const key = historyKey(ontology);
   const runs = useSyncExternalStore(
      (listener) => {
         listeners.add(listener);
         return () => listeners.delete(listener);
      },
      () => readHistory(key),
   );
   const save = useCallback(
      (run: CoverageRun) => {
         const next = [run, ...readHistory(key).filter((r) => r.id !== run.id)]
            .sort((a, b) => b.at - a.at)
            .slice(0, KEEP);
         cache.set(key, next);
         try {
            localStorage.setItem(key, JSON.stringify(next));
         } catch {
            // History is a convenience; the run on screen is unaffected.
         }
         listeners.forEach((l) => l());
      },
      [key],
   );
   /** Change a saved run from its latest copy; a no-op when it is gone. */
   const update = useCallback(
      (id: string, change: (run: CoverageRun) => CoverageRun) => {
         const current = readHistory(key).find((r) => r.id === id);
         if (current) save(change(current));
      },
      [key, save],
   );
   return { runs, save, update };
}

/** The last finished run of the same question set before `run`, for a delta. */
export function previousOf(runs: CoverageRun[], run: CoverageRun) {
   return runs.find(
      (r) => r.setId === run.setId && r.at < run.at && r.score !== undefined,
   );
}
