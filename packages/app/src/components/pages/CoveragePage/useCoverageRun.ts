// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
   aiUrl,
   postAi,
   useAiHealth,
   useChatModel,
} from "../../../ai/consoleAi";
import type { Ontology } from "../../../ontology/types";
import {
   catalogFor,
   type ChatVerdict,
   type Classification,
   countStatuses,
   coverageScore,
   type CoverageRun,
   type Investigation,
   isCompleteQuestion,
   type Question,
   QuestionSetSchema,
   useRunHistory,
   withChatVerdict,
   withInvestigation,
} from "./model";

const BATCH = 8;
const CONCURRENCY = 3;
/** Agent checks run one question each and take tens of seconds. */
const AGENT_CONCURRENCY = 4;

type LiveRun = CoverageRun & {
   /** The question stream is still open. */
   streaming: boolean;
   /** Every question the stream produced is in `questions`. */
   collected: boolean;
};

function newId() {
   return Math.random().toString(36).slice(2, 10);
}
/**
 * One coverage run: Opus streams questions, and each question goes to the
 * classifier as soon as the stream has moved past it, so the heat map fills
 * in while questions are still arriving. A finished run lands in history.
 */
export function useCoverageRun(ontology: Ontology) {
   const history = useRunHistory(ontology);
   const chat = useChat({
      connection: fetchServerSentEvents(aiUrl("/coverage/questions")),
      outputSchema: QuestionSetSchema,
   });
   const [run, setRun] = useState<LiveRun>();
   const runRef = useRef(run);
   runRef.current = run;
   /** Questions sent to a judge in this run, whatever came back. */
   const sent = useRef(new Set<string>());
   const inflight = useRef(0);
   const [tick, setTick] = useState(0);
   const health = useAiHealth();
   const [picked] = useChatModel();
   const modelRef = useRef<string | undefined>(undefined);
   modelRef.current = picked ?? health.data?.defaultModel;
   const judgeWith: CoverageRun["judgeWith"] =
      health.data?.chat && health.data.publisherMcp ? "agent" : "batch";
   const catalog = useMemo(() => catalogFor(ontology), [ontology]);
   const scope = useMemo(
      () => ({
         environment: ontology.environmentName,
         package: ontology.packageName,
      }),
      [ontology.environmentName, ontology.packageName],
   );

   // Take each question once the stream has moved on to the next one, and
   // everything that parses once the stream has ended.
   const streamed = chat.final ?? chat.partial;
   const before = useRef<unknown>(undefined);
   /** Questions the run already had when this stream started. */
   const streamBase = useRef(0);
   useEffect(() => {
      const current = runRef.current;
      if (!current || current.collected) return;
      const ended = !current.streaming;
      if (streamed === before.current) {
         // A stream that failed or was stopped before writing anything still
         // has to settle the run, or it reads as busy forever.
         if (ended) {
            setRun((r) =>
               r?.id === current.id ? { ...r, collected: true } : r,
            );
         }
         return;
      }
      const list = (streamed?.questions ?? []) as unknown[];
      const settled = ended || chat.final ? list : list.slice(0, -1);
      let ready = 0;
      while (ready < settled.length && isCompleteQuestion(settled[ready])) {
         ready++;
      }
      const base = streamBase.current;
      if (!ended && ready <= current.questions.length - base) return;
      setRun((r) =>
         r?.id === current.id
            ? {
                 ...r,
                 domain: r.domain ?? streamed?.domain,
                 collected: ended,
                 questions: [
                    ...r.questions,
                    ...settled.slice(r.questions.length - base, ready).map(
                       (q, i): Question => ({
                          ...(q as Omit<Question, "id">),
                          id: `q${r.questions.length + i + 1}`,
                       }),
                    ),
                 ],
              }
            : r,
      );
   }, [streamed, chat.final, run?.streaming, run?.collected]);

   const pump = useCallback(() => {
      const current = runRef.current;
      if (!current) return;
      const agent = current.judgeWith === "agent";
      const size = agent ? 1 : BATCH;
      while (inflight.current < (agent ? AGENT_CONCURRENCY : CONCURRENCY)) {
         const pending = current.questions.filter(
            (q) =>
               !sent.current.has(q.id) &&
               !current.results[q.id] &&
               !current.failed[q.id],
         );
         if (!pending.length || (pending.length < size && !current.collected)) {
            break;
         }
         const batch = pending.slice(0, size);
         for (const q of batch) sent.current.add(q.id);
         inflight.current++;
         const runId = current.id;
         const judged = agent
            ? postAi<Classification>("/coverage/check", {
                 scope,
                 model: modelRef.current,
                 question: batch[0],
              }).then((c) => [c])
            : postAi<{ results: Classification[] }>("/coverage/classify", {
                 scope,
                 catalog,
                 questions: batch.map(({ id, text, concepts }) => ({
                    id,
                    text,
                    concepts,
                 })),
              }).then((r) => r.results);
         judged
            .then((results) =>
               setRun((r) =>
                  r?.id === runId
                     ? {
                          ...r,
                          investigations: {
                             ...r.investigations,
                             ...Object.fromEntries(
                                results
                                   .filter((c) => c.answer)
                                   .map((c): [string, Investigation] => [
                                      c.id,
                                      {
                                         transcript: `**Asked:** ${batch.find((q) => q.id === c.id)?.text ?? ""}\n\n${c.answer}`,
                                         verdict: c.status,
                                         model: c.model,
                                         via: "rescore",
                                         at: Date.now(),
                                      },
                                   ]),
                             ),
                          },
                          results: {
                             ...r.results,
                             ...Object.fromEntries(
                                results.map(({ answer: _a, ...c }) => {
                                   const chat = r.results[c.id]?.chat;
                                   return [
                                      c.id,
                                      chat
                                         ? {
                                              ...c,
                                              status: chat.status,
                                              chat: {
                                                 ...chat,
                                                 batch: c.status,
                                              },
                                           }
                                         : c,
                                   ];
                                }),
                             ),
                          },
                       }
                     : r,
               ),
            )
            .catch((error: unknown) => {
               const reason =
                  error instanceof Error ? error.message : String(error);
               setRun((r) =>
                  r?.id === runId
                     ? {
                          ...r,
                          failed: {
                             ...r.failed,
                             ...Object.fromEntries(
                                batch.map((q) => [q.id, reason]),
                             ),
                          },
                       }
                     : r,
               );
            })
            .finally(() => {
               if (runRef.current?.id === runId) inflight.current--;
               setTick((t) => t + 1);
            });
      }
   }, [scope, catalog]);

   useEffect(pump, [pump, run?.questions.length, run?.collected, tick]);

   const settledCount = run
      ? Object.keys(run.results).length + Object.keys(run.failed).length
      : 0;
   const finished =
      Boolean(run?.collected) && settledCount >= (run?.questions.length ?? 0);
   const { save } = history;
   useEffect(() => {
      if (
         !run ||
         !finished ||
         run.score !== undefined ||
         !run.questions.length
      ) {
         return;
      }
      const counts = countStatuses(run.questions, run.results);
      const done = { ...run, counts, score: coverageScore(counts) };
      setRun(done);
      const { streaming: _s, collected: _c, ...saved } = done;
      save(saved);
   }, [finished, run, save]);

   const start = (next: LiveRun) => {
      sent.current = new Set();
      inflight.current = 0;
      setRun(next);
   };

   /**
    * Write `count` questions. With `onto`, they are added to that run's
    * matrix and only the new ones are judged; the grown set gets a new
    * `setId`, since its score no longer compares with the smaller set's.
    */
   const generate = async (
      count: number,
      focus?: string,
      onto?: CoverageRun,
   ) => {
      chat.stop();
      chat.clear();
      before.current = streamed;
      const id = onto?.id ?? newId();
      const existing = onto?.questions ?? [];
      streamBase.current = existing.length;
      start(
         {
            id,
            setId: newId(),
            at: Date.now(),
            domain: onto?.domain,
            focus: [onto?.focus, focus].filter(Boolean).join(", ") || undefined,
            judgeWith,
            questions: existing,
            results: onto?.results ?? {},
            failed: onto?.failed ?? {},
            investigations: onto?.investigations,
            streaming: true,
            collected: false,
         },
      );
      try {
         await chat.sendMessage(
            `Write ${count} questions${focus ? ` about ${focus}` : ""}.`,
            {
               body: {
                  scope,
                  description: ontology.description,
                  sources: ontology.sources
                     .filter((s) => !s.extendsId)
                     .map((s) => ({ name: s.name, doc: s.doc })),
                  count,
                  focus,
                  existing: existing.map(({ text, category }) => ({
                     text,
                     category,
                  })),
               },
            },
         );
      } finally {
         setRun((r) => (r?.id === id ? { ...r, streaming: false } : r));
      }
   };

   /**
    * Score the same questions again, against the model as it is now, each
    * one answered by the chat agent with Publisher's tools ("Re-run as
    * chat"); the retrieval-only classifier stands in when Publisher's MCP
    * endpoint is unreachable.
    */
   const rescore = (from: CoverageRun) => {
      chat.stop();
      start({
         ...from,
         id: newId(),
         at: Date.now(),
         judgeWith,
         results: {},
         failed: {},
         investigations: {},
         score: undefined,
         counts: undefined,
         streaming: false,
         collected: true,
      });
   };

   /**
    * Judge again only the questions whose check failed (a rate limit, a
    * timeout), keeping every verdict the run already has. The run keeps its
    * id, so the saved copy is replaced once the retries settle.
    */
   const retryFailed = (from: CoverageRun) => {
      chat.stop();
      start({
         ...from,
         judgeWith,
         failed: {},
         score: undefined,
         counts: undefined,
         streaming: false,
         collected: true,
      });
   };

   /** Change run `id`, whether it is the live run or a saved one. */
   const updateRun = (
      id: string,
      change: (run: CoverageRun) => CoverageRun,
   ) => {
      const live = runRef.current;
      if (live?.id !== id) {
         history.update(id, change);
         return;
      }
      const next = { ...live, ...change(live) };
      runRef.current = next;
      setRun(next);
      if (next.score === undefined) return;
      const { streaming: _s, collected: _c, ...saved } = next;
      save(saved);
   };

   /** Record a chat verdict for one question; it rescores the run. */
   const saveVerdict = (
      runId: string,
      questionId: string,
      verdict: Omit<ChatVerdict, "batch">,
   ) => updateRun(runId, (r) => withChatVerdict(r, questionId, verdict));

   /** Keep the latest chat investigation of one question with the run. */
   const saveInvestigation = (
      runId: string,
      questionId: string,
      investigation: Investigation,
   ) =>
      updateRun(runId, (r) => withInvestigation(r, questionId, investigation));

   const stop = () => {
      chat.stop();
      setRun((r) => (r ? { ...r, streaming: false } : r));
   };

   return {
      run,
      history: history.runs,
      generate,
      rescore,
      retryFailed,
      saveVerdict,
      saveInvestigation,
      stop,
      generating: Boolean(run?.streaming),
      busy: Boolean(run) && !finished,
      error: chat.error,
   };
}
