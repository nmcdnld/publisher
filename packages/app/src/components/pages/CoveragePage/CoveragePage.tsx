// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   BookOpenIcon,
   Loader2Icon,
   PlusIcon,
   RefreshCwIcon,
   RotateCcwIcon,
   SparklesIcon,
   SquareIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAiHealth } from "../../../ai/consoleAi";
import { cn } from "../../../lib/utils";
import { errorMessage, useOntology } from "../../../ontology/useOntology";
import type { Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Input } from "../../ui/input";
import { Skeleton } from "../../ui/misc";
import { TailwindScope } from "../../ui/scope";
import { AskButton } from "../../chat/AskButton";
import type { AskContext } from "../../chat/askWindowStore";
import { dictionaryHref } from "../DictionaryPage/shared";
import { ASKED_RUN_ID, useAskedRun } from "./asked";
import {
   coverageMarkdown,
   type CoverageRun,
   gapBacklog,
   JUDGE_LABEL,
   previousOf,
   withChatVerdict,
   withInvestigation,
} from "./model";
import {
   GapBacklog,
   HeatMap,
   QuestionDetail,
   QuestionList,
   ScoreCard,
} from "./parts";
import { ScoreGradeChip } from "./ScoreGradeChip";
import { useCoverageRun } from "./useCoverageRun";

const COUNTS = [10, 25, 50, 100];

export default function CoveragePage({
   environmentName,
   packageName,
}: {
   environmentName: string;
   packageName: string;
}) {
   const ontology = useOntology(environmentName, packageName);
   return (
      <TailwindScope>
         {ontology.data ? (
            <Coverage ontology={ontology.data} />
         ) : ontology.error ? (
            <div className="p-6 text-sm text-destructive">
               {errorMessage(ontology.error)}
            </div>
         ) : (
            <div className="mx-auto max-w-6xl space-y-4 p-6">
               <Skeleton className="h-10 w-1/3" />
               <Skeleton className="h-32 w-full" />
               <Skeleton className="h-72 w-full" />
            </div>
         )}
      </TailwindScope>
   );
}

function Coverage({ ontology }: { ontology: Ontology }) {
   const health = useAiHealth();
   const coverage = useCoverageRun(ontology);
   const [count, setCount] = useState(25);
   const [focus, setFocus] = useState("");
   const [viewingId, setViewingId] = useState<string>();
   const [selectedId, setSelectedId] = useState<string>();

   const run: CoverageRun | undefined =
      (viewingId && coverage.history.find((r) => r.id === viewingId)) ||
      coverage.run ||
      coverage.history[0];
   const gaps = useMemo(() => (run ? gapBacklog(run) : []), [run]);
   const previous = run ? previousOf(coverage.history, run) : undefined;
   const trend = run
      ? coverage.history
           .filter((r) => r.setId === run.setId && r.score !== undefined)
           .reverse()
           .map((r) => r.score!)
      : [];

   const ai = health.data;
   const canGenerate = Boolean(ai?.chat);
   const canClassify = Boolean(ai && (ai.chat || ai.jev));
   const judges = run
      ? [...new Set(Object.values(run.results).map((r) => r.judge))]
      : [];
   const retrieval = run
      ? [...new Set(Object.values(run.results).map((r) => r.retrieval))]
      : [];
   const chatVerdicts = run
      ? Object.values(run.results).filter((r) => r.chat).length
      : 0;
   const failedReasons = run
      ? run.questions
           .filter((q) => !run.results[q.id] && run.failed[q.id])
           .map((q) => run.failed[q.id])
      : [];
   const failedCount = failedReasons.length;
   const judgeNote = run
      ? Object.values(run.results).find((r) => r.judgeNote)?.judgeNote
      : undefined;

   const scope = useMemo(
      () => ({
         environment: ontology.environmentName,
         package: ontology.packageName,
      }),
      [ontology.environmentName, ontology.packageName],
   );
   const asked = useAskedRun(scope);
   const askContext = useMemo<AskContext>(
      () => ({
         scope,
         page: coverageMarkdown(ontology, run, gaps, asked.run),
         subject: `${ontology.packageName} coverage`,
         suggestions: [
            "Which gap should I close first, and how?",
            "Why do the weakest themes score low?",
            "Which questions asked in chat does the model fail most?",
         ],
      }),
      [scope, ontology, run, gaps, asked.run],
   );
   const selectedRun = selectedId?.startsWith("chat:") ? asked.run : run;

   return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
         <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
               <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Question coverage
               </div>
               <h1 className="text-3xl font-semibold tracking-tight">
                  {ontology.packageName}
               </h1>
               <p className="text-base text-muted-foreground">
                  How many of the questions people would ask can this model
                  answer? Opus writes the questions; each is checked against
                  what <code className="font-mono text-sm">get_context</code>{" "}
                  actually retrieves.
               </p>
            </div>
            <div className="flex items-center gap-2">
               <AskButton context={askContext} />
               <Button variant="outline" size="sm" asChild>
                  <Link to={dictionaryHref(ontology)}>
                     <BookOpenIcon /> Dictionary
                  </Link>
               </Button>
            </div>
         </header>

         <Card className="py-4">
            <CardContent className="flex flex-wrap items-center gap-3 px-4">
               <div className="flex items-center gap-1 rounded-md border p-0.5">
                  {COUNTS.map((n) => (
                     <button
                        key={n}
                        onClick={() => setCount(n)}
                        className={cn(
                           "rounded px-2.5 py-1 text-xs tabular-nums",
                           n === count
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent",
                        )}
                     >
                        {n}
                     </button>
                  ))}
               </div>
               <Input
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Optional focus, e.g. retention, a persona"
                  className="h-8 max-w-72"
               />
               {coverage.generating ? (
                  <Button size="sm" variant="outline" onClick={coverage.stop}>
                     <SquareIcon /> Stop
                  </Button>
               ) : (
                  <>
                     <Button
                        size="sm"
                        disabled={!canGenerate || coverage.busy}
                        title={
                           run
                              ? "Write more questions and add them to this matrix"
                              : undefined
                        }
                        onClick={() => {
                           setViewingId(undefined);
                           void coverage.generate(
                              count,
                              focus.trim() || undefined,
                              run,
                           );
                        }}
                     >
                        {run ? <PlusIcon /> : <SparklesIcon />}
                        {run ? "Add" : "Write"} {count} questions
                     </Button>
                     {run && (
                        <Button
                           size="sm"
                           variant="ghost"
                           disabled={!canGenerate || coverage.busy}
                           title="Start a separate set with fresh questions; this one stays in Recent runs"
                           onClick={() => {
                              setViewingId(undefined);
                              setSelectedId(undefined);
                              void coverage.generate(
                                 count,
                                 focus.trim() || undefined,
                              );
                           }}
                        >
                           <SparklesIcon /> New set
                        </Button>
                     )}
                  </>
               )}
               {run && (
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={!canClassify || coverage.busy}
                     onClick={() => {
                        setViewingId(undefined);
                        coverage.rescore(run);
                     }}
                     title="Score the same questions against the model as it is now: the chat agent answers each one with Publisher's tools, as Re-run as chat does"
                  >
                     <RefreshCwIcon /> Re-score these
                  </Button>
               )}
               {run && failedCount > 0 && !coverage.busy && (
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={!canClassify}
                     onClick={() => {
                        setViewingId(undefined);
                        coverage.retryFailed(run);
                     }}
                     title="Judge only the questions whose check failed; verdicts already in this run are kept"
                  >
                     <RotateCcwIcon /> Retry {failedCount} failed
                  </Button>
               )}
               {coverage.busy && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <Loader2Icon className="size-3.5 animate-spin" />
                     {coverage.generating
                        ? "Writing questions"
                        : coverage.run?.judgeWith === "agent"
                          ? `Answering with the chat agent, ${Object.keys(coverage.run.results).length + Object.keys(coverage.run.failed).length} of ${coverage.run.questions.length}`
                          : "Classifying"}
                  </span>
               )}
               <div className="ml-auto flex flex-wrap gap-1.5">
                  {judges.map((j) => (
                     <Badge key={j} variant="secondary" title={judgeNote}>
                        judged by {JUDGE_LABEL[j]}
                     </Badge>
                  ))}
                  {chatVerdicts > 0 && (
                     <Badge
                        variant="secondary"
                        title="Verdicts saved from re-running a question as a chat"
                     >
                        {chatVerdicts} from chat
                     </Badge>
                  )}
                  {retrieval.map((r) => (
                     <Badge key={r} variant="outline">
                        {r === "get_context"
                           ? "get_context"
                           : "keyword retrieval"}
                     </Badge>
                  ))}
               </div>
            </CardContent>
            {failedCount > 0 && !coverage.busy && (
               <CardContent className="px-4 text-xs">
                  <p className="text-destructive">
                     {failedCount} of {run!.questions.length} questions were
                     not scored, so the score covers the rest:{" "}
                     {failedReasons[0]}
                  </p>
               </CardContent>
            )}
            {(health.isSuccess && !ai) || coverage.error || (ai && !ai.chat) ? (
               <CardContent className="px-4 text-xs">
                  {health.isSuccess && !ai ? (
                     <p className="text-muted-foreground">
                        The AI Worker is not running, so new runs are off; saved
                        runs still show below. Start it with{" "}
                        <code className="font-mono">
                           cd packages/console-ai && bun run dev
                        </code>
                        .
                     </p>
                  ) : ai && !ai.chat ? (
                     <p className="text-muted-foreground">
                        Writing questions needs an{" "}
                        <code className="font-mono">OPENROUTER_API_KEY</code> in{" "}
                        <code className="font-mono">
                           packages/console-ai/.dev.vars
                        </code>
                        .
                     </p>
                  ) : (
                     <p className="text-destructive">
                        {coverage.error?.message}
                     </p>
                  )}
               </CardContent>
            ) : null}
         </Card>

         {run ? (
            <ScoreCard run={run} previous={previous} trend={trend} />
         ) : (
            <Card className="py-12">
               <CardContent className="mx-auto max-w-md space-y-2 text-center">
                  <p className="font-medium">No runs yet</p>
                  <p className="text-sm text-muted-foreground">
                     Write a set of questions to see what this model can answer,
                     where it falls short, and which concepts would close the
                     most gaps. Re-score the same set after a model change to
                     see the number move. Questions asked in the Ask window land
                     in the heat map on their own.
                  </p>
               </CardContent>
            </Card>
         )}
         {(run || Boolean(asked.run?.questions.length)) && (
            <HeatMap
               run={run}
               asked={asked.run}
               selectedId={selectedId}
               onSelect={setSelectedId}
               onClearAsked={() => {
                  if (selectedId?.startsWith("chat:")) setSelectedId(undefined);
                  asked.clear();
               }}
            />
         )}
         {run && (
            <div className="grid gap-6 lg:grid-cols-2">
               <GapBacklog run={run} gaps={gaps} onSelect={setSelectedId} />
               <QuestionList run={run} onSelect={setSelectedId} />
            </div>
         )}
         {selectedRun && (
            <QuestionDetail
               ontology={ontology}
               run={selectedRun}
               questionId={selectedId}
               onSaveVerdict={(questionId, verdict) =>
                  selectedRun.id === ASKED_RUN_ID
                     ? asked.update((r) =>
                          withChatVerdict(r, questionId, verdict),
                       )
                     : coverage.saveVerdict(selectedRun.id, questionId, verdict)
               }
               onSaveInvestigation={(questionId, investigation) =>
                  selectedRun.id === ASKED_RUN_ID
                     ? asked.update((r) =>
                          withInvestigation(r, questionId, investigation),
                       )
                     : coverage.saveInvestigation(
                          selectedRun.id,
                          questionId,
                          investigation,
                       )
               }
               onClose={() => setSelectedId(undefined)}
            />
         )}

         {coverage.history.length > 0 && (
            <section className="space-y-2">
               <h2 className="text-sm font-semibold">Recent runs</h2>
               <div className="flex flex-wrap gap-2">
                  {coverage.history.map((r) => (
                     <button
                        key={r.id}
                        onClick={() => {
                           setViewingId(r.id);
                           setSelectedId(undefined);
                        }}
                        className={cn(
                           "rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent",
                           r.id === run?.id && "border-primary",
                        )}
                     >
                        <div className="flex items-center gap-2">
                           <span className="text-base font-semibold tabular-nums">
                              {r.score ?? "–"}
                           </span>
                           {r.score !== undefined && (
                              <ScoreGradeChip score={r.score} />
                           )}
                        </div>
                        <div className="text-muted-foreground">
                           {r.questions.length} questions
                           {r.focus ? ` · ${r.focus}` : ""}
                        </div>
                        <div className="text-muted-foreground">
                           {new Date(r.at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                           })}
                        </div>
                     </button>
                  ))}
               </div>
            </section>
         )}
      </div>
   );
}
