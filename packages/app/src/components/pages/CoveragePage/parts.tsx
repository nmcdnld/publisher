// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowDownRightIcon,
   ArrowLeftIcon,
   ArrowUpRightIcon,
   CheckIcon,
   CopyIcon,
   DownloadIcon,
   FileDownIcon,
   FileTextIcon,
   MessagesSquareIcon,
   MinusIcon,
   RotateCcwIcon,
   Trash2Icon,
   XIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAiHealth } from "../../../ai/consoleAi";
import { cn } from "../../../lib/utils";
import type { Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
} from "../../ui/card";
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
} from "../../ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { dictionaryHref } from "../DictionaryPage/shared";
import { Markdown } from "../../chat/Markdown";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { CoverageChat } from "./CoverageChat";
import { ScoreGradeChip } from "./ScoreGradeChip";
import {
   downloadMarkdown,
   handoffFilename,
   handoffMarkdown,
   printPdf,
} from "./handoff";
import {
   type Ask,
   type ChatVerdict,
   type Classification,
   countStatuses,
   type CoverageRun,
   type CoverageStatus,
   type Gap,
   gapsMarkdown,
   type Investigation,
   JUDGE_LABEL,
   missingConcept,
   type Question,
   STATUS_META,
   STATUSES,
} from "./model";

export function ScoreCard({
   run,
   previous,
   trend,
}: {
   run: CoverageRun;
   previous?: CoverageRun;
   trend: number[];
}) {
   const counts = run.counts ?? countStatuses(run.questions, run.results);
   const judged = counts.answerable + counts.partial + counts.missing;
   const unscored = run.questions.filter(
      (q) => !run.results[q.id] && run.failed[q.id],
   ).length;
   const waiting = run.questions.length - judged - unscored;
   const live =
      run.score ??
      (judged
         ? Math.round(((counts.answerable + counts.partial / 2) / judged) * 100)
         : undefined);
   const delta =
      run.score !== undefined && previous?.score !== undefined
         ? run.score - previous.score
         : undefined;
   return (
      <Card className="gap-4">
         <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
               <div className="text-xs text-muted-foreground">
                  Coverage score
               </div>
               <div className="flex items-baseline gap-2">
                  <span
                     className={cn(
                        "text-5xl font-semibold tabular-nums tracking-tight",
                        run.score === undefined && "text-muted-foreground",
                     )}
                  >
                     {live ?? "–"}
                  </span>
                  {live !== undefined && (
                     <ScoreGradeChip
                        score={live}
                        provisional={run.score === undefined}
                        className="self-center"
                     />
                  )}
                  {delta !== undefined && (
                     <span
                        className={cn(
                           "flex items-center text-sm font-medium tabular-nums",
                           delta > 0
                              ? "text-answerable"
                              : delta < 0
                                ? "text-missing"
                                : "text-muted-foreground",
                        )}
                        title={`Was ${previous?.score} on ${new Date(previous!.at).toLocaleString()}`}
                     >
                        {delta > 0 ? (
                           <ArrowUpRightIcon className="size-4" />
                        ) : delta < 0 ? (
                           <ArrowDownRightIcon className="size-4" />
                        ) : (
                           <MinusIcon className="size-4" />
                        )}
                        {delta > 0 ? `+${delta}` : delta}
                     </span>
                  )}
               </div>
               <div className="text-xs text-muted-foreground">
                  answerable, with a partial answer worth half
               </div>
            </div>
            <div className="min-w-64 flex-1 space-y-2">
               <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                  {STATUSES.map((s) =>
                     counts[s] ? (
                        <div
                           key={s}
                           className={cn(STATUS_META[s].cell, "transition-all")}
                           style={{
                              width: `${(counts[s] / Math.max(run.questions.length, 1)) * 100}%`,
                           }}
                        />
                     ) : null,
                  )}
               </div>
               <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {STATUSES.map((s) => (
                     <span key={s} className="flex items-center gap-1.5">
                        <span
                           className={cn(
                              "size-2 rounded-sm",
                              STATUS_META[s].cell,
                           )}
                        />
                        <span className="tabular-nums">{counts[s]}</span>
                        <span className="text-muted-foreground">
                           {STATUS_META[s].label.toLowerCase()}
                        </span>
                     </span>
                  ))}
                  {unscored > 0 && (
                     <span
                        className="text-destructive"
                        title={Object.values(run.failed)[0]}
                     >
                        {unscored} not scored
                     </span>
                  )}
                  {waiting > 0 && (
                     <span className="text-muted-foreground">
                        {waiting} waiting
                     </span>
                  )}
               </div>
            </div>
            {trend.length > 1 && <Trend values={trend} />}
         </CardContent>
      </Card>
   );
}

function Trend({ values }: { values: number[] }) {
   const w = 120;
   const h = 36;
   const points = values
      .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * h}`)
      .join(" ");
   return (
      <div className="text-right">
         <svg width={w} height={h} className="overflow-visible">
            <polyline
               points={points}
               fill="none"
               className="stroke-primary"
               strokeWidth={2}
               strokeLinejoin="round"
            />
         </svg>
         <div className="text-[10px] text-muted-foreground">
            last {values.length} scores of these questions
         </div>
      </div>
   );
}

const POINTS = { answerable: 1, partial: 0.5, missing: 0 } as const;

function heatRows(run: CoverageRun) {
   const categories = new Map<string, Question[]>();
   for (const q of run.questions) {
      categories.set(q.category, [...(categories.get(q.category) ?? []), q]);
   }
   return [...categories.entries()]
      .map(([category, questions]) => {
         const judged = questions.filter((q) => run.results[q.id]);
         const points = judged.reduce(
            (sum, q) => sum + POINTS[run.results[q.id].status],
            0,
         );
         return {
            category,
            questions,
            score: judged.length
               ? Math.round((points / judged.length) * 100)
               : undefined,
         };
      })
      .sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
}

/**
 * The generated set's cells by theme, and below them the questions asked in
 * the Ask window, one cell per distinct question however often it was asked.
 */
export function HeatMap({
   run,
   asked,
   selectedId,
   onSelect,
   onClearAsked,
}: {
   run?: CoverageRun;
   asked?: CoverageRun;
   selectedId?: string;
   onSelect: (id: string) => void;
   onClearAsked: () => void;
}) {
   const askedCount = asked?.questions.length ?? 0;
   const askCount = Object.values(asked?.asks ?? {}).reduce(
      (sum, a) => sum + a.length,
      0,
   );
   return (
      <Card>
         <CardHeader>
            <CardTitle>Heat map</CardTitle>
            <CardDescription>
               One cell per question, grouped by theme, weakest theme first.
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-1.5">
            {run && (
               <HeatRows
                  run={run}
                  selectedId={selectedId}
                  onSelect={onSelect}
               />
            )}
            {run?.questions.length === 0 && (
               <p className="text-sm text-muted-foreground">
                  Questions appear here as they are written.
               </p>
            )}
            {asked && askedCount > 0 && (
               <div className={cn("space-y-1.5", run && "border-t pt-4 mt-4")}>
                  <div className="flex flex-wrap items-baseline gap-x-2 pb-1">
                     <span className="flex items-center gap-1.5 text-sm font-medium">
                        <MessagesSquareIcon className="size-3.5 text-muted-foreground" />
                        Asked in chat
                     </span>
                     <span className="text-xs text-muted-foreground">
                        {askedCount} distinct question
                        {askedCount === 1 ? "" : "s"}, asked {askCount} time
                        {askCount === 1 ? "" : "s"}
                        {asked.score !== undefined
                           ? ` · scores ${asked.score}`
                           : ""}
                        ; judged from each chat&apos;s own answer
                     </span>
                     {asked.score !== undefined && (
                        <ScoreGradeChip score={asked.score} />
                     )}
                     <Button
                        size="xs"
                        variant="ghost"
                        className="ml-auto text-muted-foreground"
                        onClick={onClearAsked}
                        title="Forget the questions asked in chat for this package"
                     >
                        <Trash2Icon /> Clear
                     </Button>
                  </div>
                  <HeatRows
                     run={asked}
                     selectedId={selectedId}
                     onSelect={onSelect}
                  />
               </div>
            )}
         </CardContent>
      </Card>
   );
}

function HeatRows({
   run,
   selectedId,
   onSelect,
}: {
   run: CoverageRun;
   selectedId?: string;
   onSelect: (id: string) => void;
}) {
   return heatRows(run).map((row) => (
      <div key={row.category} className="flex items-center gap-3">
         <div className="w-44 shrink-0 truncate text-sm" title={row.category}>
            {row.category}
         </div>
         <div className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {row.score ?? ""}
         </div>
         <div className="flex flex-wrap gap-1">
            {row.questions.map((q) => (
               <Cell
                  key={q.id}
                  question={q}
                  result={run.results[q.id]}
                  failed={run.failed[q.id]}
                  asks={run.asks?.[q.id]}
                  selected={q.id === selectedId}
                  onClick={() => onSelect(q.id)}
               />
            ))}
         </div>
      </div>
   ));
}

function Cell({
   question,
   result,
   failed,
   asks,
   selected,
   onClick,
}: {
   question: Question;
   result?: Classification;
   failed?: string;
   asks?: Ask[];
   selected: boolean;
   onClick: () => void;
}) {
   const gap = missingConcept(result);
   const repeats = asks && asks.length > 1 ? asks.length : undefined;
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <button
               onClick={onClick}
               aria-label={question.text}
               className={cn(
                  "flex size-5 items-center justify-center rounded-[3px] text-[9px] font-semibold tabular-nums text-white transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-ring",
                  result
                     ? STATUS_META[result.status].cell
                     : failed
                       ? "border border-dashed border-destructive text-destructive"
                       : "animate-pulse bg-muted",
                  result && result.confidence < 0.6 && "opacity-60",
                  selected &&
                     "ring-2 ring-foreground ring-offset-1 ring-offset-background",
               )}
            >
               {repeats && (repeats > 99 ? "99+" : repeats)}
            </button>
         </TooltipTrigger>
         <TooltipContent className="max-w-xs space-y-1">
            <p>{question.text}</p>
            <p className="text-[11px] opacity-80">
               {result
                  ? `${STATUS_META[result.status].label}${gap ? ` · missing ${gap.text}` : ""}`
                  : failed
                    ? `Not classified: ${failed}`
                    : "Classifying…"}
            </p>
            {asks && asks.length > 0 && (
               <p className="text-[11px] opacity-80">{askSummary(asks)}</p>
            )}
         </TooltipContent>
      </Tooltip>
   );
}

/** "Asked in chat 4 times, last Oct 6, 6:40 PM; 3 answerable, 1 missing". */
function askSummary(asks: Ask[]): string {
   if (!asks.length) return "Asked in chat";
   const last = new Date(asks.at(-1)!.at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
   });
   const tally = STATUSES.map((s) => {
      const n = asks.filter((a) => a.status === s).length;
      return n ? `${n} ${STATUS_META[s].label.toLowerCase()}` : "";
   }).filter(Boolean);
   const times = asks.length === 1 ? "once" : `${asks.length} times`;
   return `Asked in chat ${times}, last ${last}${asks.length > 1 && tally.length ? `; ${tally.join(", ")}` : ""}`;
}

export function GapBacklog({
   run,
   gaps,
   onSelect,
}: {
   run: CoverageRun;
   gaps: Gap[];
   onSelect: (id: string) => void;
}) {
   const [copied, setCopied] = useState(false);
   const byId = new Map(run.questions.map((q) => [q.id, q]));
   return (
      <Card className="gap-4">
         <CardHeader className="flex flex-row items-start justify-between">
            <div className="space-y-1.5">
               <CardTitle>Gap backlog</CardTitle>
               <CardDescription>
                  Concepts questions needed and retrieval did not find.
               </CardDescription>
            </div>
            {gaps.length > 0 && (
               <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                     await navigator.clipboard.writeText(
                        gapsMarkdown(run, gaps),
                     );
                     setCopied(true);
                     setTimeout(() => setCopied(false), 1500);
                  }}
               >
                  {copied ? <CheckIcon /> : <CopyIcon />} Markdown
               </Button>
            )}
         </CardHeader>
         <CardContent className="space-y-1">
            {gaps.length === 0 && (
               <p className="text-sm text-muted-foreground">
                  {run.score === undefined ? "Nothing yet." : "No gaps found."}
               </p>
            )}
            {gaps.slice(0, 25).map((gap) => (
               <details
                  key={gap.key}
                  className="group rounded-md px-2 py-1.5 hover:bg-accent/50"
               >
                  <summary className="flex cursor-pointer list-none items-center gap-2">
                     <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {gap.questionIds.length}
                     </span>
                     <span className="min-w-0 flex-1 truncate text-sm">
                        {gap.text}
                     </span>
                     <Badge variant="outline" className="shrink-0 font-normal">
                        {gap.type.replace("_", " ")}
                     </Badge>
                     {gap.blocking > 0 && (
                        <Badge
                           variant="missing"
                           className="shrink-0"
                           title="Questions this is the only gap in"
                        >
                           blocks {gap.blocking}
                        </Badge>
                     )}
                  </summary>
                  <ul className="mt-1 space-y-0.5 pl-8">
                     {gap.questionIds.map((id) => (
                        <li key={id}>
                           <button
                              onClick={() => onSelect(id)}
                              className="text-left text-xs text-muted-foreground hover:text-foreground"
                           >
                              {byId.get(id)?.text}
                           </button>
                        </li>
                     ))}
                  </ul>
               </details>
            ))}
         </CardContent>
      </Card>
   );
}

export function QuestionList({
   run,
   onSelect,
}: {
   run: CoverageRun;
   onSelect: (id: string) => void;
}) {
   const [filter, setFilter] = useState<CoverageStatus | "all">("all");
   const shown = run.questions.filter(
      (q) => filter === "all" || run.results[q.id]?.status === filter,
   );
   return (
      <Card className="gap-4">
         <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Questions</CardTitle>
            <Tabs
               value={filter}
               onValueChange={(v) => setFilter(v as typeof filter)}
            >
               <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  {STATUSES.map((s) => (
                     <TabsTrigger key={s} value={s}>
                        {s === "partial" ? "Partial" : STATUS_META[s].label}
                     </TabsTrigger>
                  ))}
               </TabsList>
            </Tabs>
         </CardHeader>
         <CardContent className="max-h-[32rem] space-y-px overflow-y-auto">
            {shown.map((q) => {
               const result = run.results[q.id];
               const gap = missingConcept(result);
               return (
                  <button
                     key={q.id}
                     onClick={() => onSelect(q.id)}
                     className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
                  >
                     <span
                        className={cn(
                           "mt-1.5 size-2 shrink-0 rounded-sm",
                           result
                              ? STATUS_META[result.status].cell
                              : "bg-muted",
                        )}
                     />
                     <span className="min-w-0 flex-1">
                        <span className="block text-sm">{q.text}</span>
                        <span className="block text-xs text-muted-foreground">
                           {q.persona} · {q.category}
                           {gap && (
                              <>
                                 {" · "}
                                 <span
                                    className={STATUS_META[result!.status].text}
                                 >
                                    missing {gap.text}
                                 </span>
                              </>
                           )}
                        </span>
                     </span>
                  </button>
               );
            })}
         </CardContent>
      </Card>
   );
}

export function QuestionDetail({
   ontology,
   run,
   questionId,
   onSaveVerdict,
   onSaveInvestigation,
   onClose,
}: {
   ontology: Ontology;
   run: CoverageRun;
   questionId?: string;
   onSaveVerdict: (
      questionId: string,
      verdict: Omit<ChatVerdict, "batch">,
   ) => void;
   onSaveInvestigation: (
      questionId: string,
      investigation: Investigation,
   ) => void;
   onClose: () => void;
}) {
   const health = useAiHealth();
   const question = run.questions.find((q) => q.id === questionId);
   const result = questionId ? run.results[questionId] : undefined;
   const investigation: Investigation | undefined =
      (questionId && run.investigations?.[questionId]) ||
      (result?.answer
         ? {
              transcript: result.answer,
              verdict: result.status,
              model: result.model,
              via: "rescore",
              at: run.at,
           }
         : undefined);
   const chatKey = `${run.id}:${questionId}`;
   const [chat, setChat] = useState<{ key: string; attempt: number }>();
   const chatting = chat?.key === chatKey;
   return (
      <Sheet
         open={Boolean(question)}
         onOpenChange={(open) => {
            if (open) return;
            setChat(undefined);
            onClose();
         }}
      >
         <SheetContent
            className={
               chatting ? "gap-0 sm:max-w-2xl" : "overflow-y-auto sm:max-w-xl"
            }
         >
            {question && (
               <>
                  <SheetHeader>
                     <div className="flex flex-wrap gap-1.5">
                        {result && (
                           <Badge variant={result.status}>
                              {STATUS_META[result.status].label}
                           </Badge>
                        )}
                        <Badge variant="outline">{question.category}</Badge>
                        <Badge variant="outline">{question.persona}</Badge>
                     </div>
                     <SheetTitle className="text-lg leading-snug">
                        {question.text}
                     </SheetTitle>
                     <SheetDescription>
                        {chatting
                           ? "Re-run as a chat: the agent answers it with Publisher's MCP tools and skills, then gives its own verdict."
                           : result?.chat && !result.chat.batch
                             ? "Verdict saved from a chat re-run."
                             : result?.judge === "transcript"
                               ? `Judged from the chat's own answer${result.model ? ` (${result.model})` : ""}. ${askSummary(run.asks?.[question.id] ?? [])}.`
                               : result?.judge === "agent"
                                 ? `Answered by the chat agent with Publisher's tools${result.model ? ` (${result.model})` : ""}, in ${(result.ms / 1000).toFixed(1)}s.`
                                 : result
                                   ? `Judged by ${JUDGE_LABEL[result.judge]} from ${result.retrieval === "get_context" ? "get_context" : "a keyword match over the model"}, ${Math.round(result.confidence * 100)}% confident, in ${(result.ms / 1000).toFixed(1)}s.`
                                   : run.failed[question.id]
                                     ? `Not classified: ${run.failed[question.id]}`
                                     : "Classifying…"}
                     </SheetDescription>
                     <div className="flex flex-wrap gap-2 pt-2">
                        {chatting ? (
                           <>
                              <Button
                                 size="xs"
                                 variant="outline"
                                 onClick={() => setChat(undefined)}
                              >
                                 <ArrowLeftIcon /> Verdict
                              </Button>
                              <Button
                                 size="xs"
                                 variant="outline"
                                 onClick={() =>
                                    setChat({
                                       key: chatKey,
                                       attempt: (chat?.attempt ?? 0) + 1,
                                    })
                                 }
                              >
                                 <RotateCcwIcon /> Run again
                              </Button>
                           </>
                        ) : (
                           <Button
                              size="xs"
                              disabled={!health.data?.chat}
                              title={
                                 health.data?.chat
                                    ? "Answer this question for real with the model's tools, and check the verdict"
                                    : "Needs the console-ai Worker with an OpenRouter key"
                              }
                              onClick={() =>
                                 setChat({ key: chatKey, attempt: 0 })
                              }
                           >
                              <MessagesSquareIcon /> Re-run as chat
                           </Button>
                        )}
                        <HandoffMenu
                           className="ml-auto"
                           build={() => ({
                              filename: handoffFilename(ontology, question),
                              title: `Coverage gap: ${question.text}`,
                              markdown: handoffMarkdown({
                                 ontology,
                                 run,
                                 question,
                                 result,
                                 investigation,
                              }),
                           })}
                           hasInvestigation={Boolean(investigation)}
                        />
                     </div>
                  </SheetHeader>
                  {chatting ? (
                     <CoverageChat
                        key={`${chatKey}:${chat.attempt}`}
                        ontology={ontology}
                        question={question}
                        result={result}
                        onSave={(verdict) =>
                           onSaveVerdict(question.id, verdict)
                        }
                        onInvestigation={(found) =>
                           onSaveInvestigation(question.id, found)
                        }
                     />
                  ) : (
                     <div className="space-y-6 px-4 pb-6">
                        {result?.chat && (
                           <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                              {STATUS_META[result.chat.status].label} is the
                              verdict saved from a chat re-run
                              {result.chat.model
                                 ? ` (${result.chat.model})`
                                 : ""}
                              {result.chat.batch
                                 ? result.chat.batch === result.chat.status
                                    ? ", agreeing with the batch verdict."
                                    : `; the batch said ${STATUS_META[result.chat.batch].label.toLowerCase()}, and the evidence below is the batch's.`
                                 : "; the batch never classified it."}
                           </p>
                        )}
                        {result?.judgeNote && (
                           <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                              {result.judgeNote}
                           </p>
                        )}
                        {result?.error && (
                           <p className="text-xs text-destructive">
                              {result.error}
                           </p>
                        )}
                        {result &&
                           result.judge !== "agent" &&
                           result.judge !== "transcript" && (
                              <section className="space-y-2">
                                 <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Verdict
                                 </h3>
                                 {STATUSES.map((s) => (
                                    <div
                                       key={s}
                                       className="flex items-center gap-2 text-xs"
                                    >
                                       <span className="w-28">
                                          {STATUS_META[s].label}
                                       </span>
                                       <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                          <div
                                             className={
                                                STATUS_META[s].cell + " h-full"
                                             }
                                             style={{
                                                width: `${result.probabilities[s] * 100}%`,
                                             }}
                                          />
                                       </div>
                                       <span className="w-9 text-right tabular-nums text-muted-foreground">
                                          {Math.round(
                                             result.probabilities[s] * 100,
                                          )}
                                          %
                                       </span>
                                    </div>
                                 ))}
                              </section>
                           )}
                        <section className="space-y-2">
                           <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              What it needs
                           </h3>
                           {(
                              result?.concepts ??
                              question.concepts.map((c) => ({
                                 ...c,
                                 present: -1,
                              }))
                           ).map((c, i) => (
                              <div
                                 key={i}
                                 className="flex items-center gap-2 text-sm"
                              >
                                 {c.present < 0 ? (
                                    <span className="size-4" />
                                 ) : c.present >= 0.5 ? (
                                    <CheckIcon className="size-4 text-answerable" />
                                 ) : (
                                    <XIcon className="size-4 text-missing" />
                                 )}
                                 <span className="flex-1">{c.text}</span>
                                 <Badge
                                    variant="outline"
                                    className="font-normal"
                                 >
                                    {c.type.replace("_", " ")}
                                 </Badge>
                              </div>
                           ))}
                        </section>
                        {investigation && (
                           <section className="space-y-2">
                              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                 {investigation.via === "chat"
                                    ? "Chat investigation"
                                    : investigation.via === "asked"
                                      ? "The chat's answer, latest ask"
                                      : "The agent's answer"}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                 {investigation.verdict
                                    ? `Closed with ${STATUS_META[investigation.verdict].label.toLowerCase()}`
                                    : "No verdict yet"}
                                 {investigation.model
                                    ? ` · ${investigation.model}`
                                    : ""}
                                 {` · ${new Date(
                                    investigation.at,
                                 ).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                 })}`}
                              </p>
                              <div className="rounded-md border px-3 py-2">
                                 <Markdown text={investigation.transcript} />
                              </div>
                           </section>
                        )}
                        {result && result.retrieved.length > 0 && (
                           <section className="space-y-3">
                              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                 What retrieval found
                              </h3>
                              {result.retrieved.map((r) => (
                                 <Retrieved
                                    key={`${r.model}:${r.source}`}
                                    ontology={ontology}
                                    retrieved={r}
                                 />
                              ))}
                           </section>
                        )}
                     </div>
                  )}
               </>
            )}
         </SheetContent>
      </Sheet>
   );
}

function HandoffMenu({
   build,
   hasInvestigation,
   className,
}: {
   build: () => { filename: string; title: string; markdown: string };
   hasInvestigation: boolean;
   className?: string;
}) {
   const [open, setOpen] = useState(false);
   const item =
      "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <Button
               size="xs"
               variant="outline"
               className={className}
               title="Download this verdict for a coding agent to fix the model from"
            >
               <DownloadIcon /> Download
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 p-1">
            <button
               className={item}
               onClick={() => {
                  const doc = build();
                  downloadMarkdown(doc.filename, doc.markdown);
                  setOpen(false);
               }}
            >
               <FileTextIcon className="mt-0.5 size-4 shrink-0" />
               <span>
                  Markdown (.md)
                  <span className="block text-xs text-muted-foreground">
                     Best to hand a coding agent
                  </span>
               </span>
            </button>
            <button
               className={item}
               onClick={() => {
                  const doc = build();
                  setOpen(false);
                  printPdf(doc.title, doc.markdown);
               }}
            >
               <FileDownIcon className="mt-0.5 size-4 shrink-0" />
               <span>
                  PDF
                  <span className="block text-xs text-muted-foreground">
                     Opens the print dialog; choose Save as PDF
                  </span>
               </span>
            </button>
            <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
               {hasInvestigation
                  ? "Includes the verdict, recommended changes, exit criteria and the full investigation."
                  : "No chat investigation yet: Re-run as chat first for recommendations and exit criteria."}
            </p>
         </PopoverContent>
      </Popover>
   );
}

function Retrieved({
   ontology,
   retrieved,
}: {
   ontology: Ontology;
   retrieved: Classification["retrieved"][number];
}) {
   const source =
      ontology.entities.get(`${retrieved.model}:${retrieved.source}`) ??
      ontology.sources.find((s) => s.name === retrieved.source);
   return (
      <div className="space-y-1.5">
         {source ? (
            <Link
               to={dictionaryHref(ontology, source.id)}
               className="font-mono text-sm font-medium hover:text-primary"
            >
               {retrieved.source}
            </Link>
         ) : (
            <span className="font-mono text-sm font-medium">
               {retrieved.source}
            </span>
         )}{" "}
         <span className="font-mono text-[11px] text-muted-foreground">
            {retrieved.model}
         </span>
         <div className="flex flex-wrap gap-1">
            {retrieved.fields.map((field) => {
               const entity = source
                  ? ontology.entities.get(`${source.id}.${field}`)
                  : undefined;
               const chip = (
                  <span className="rounded border px-1.5 py-0.5 font-mono text-[11px]">
                     {field}
                  </span>
               );
               return entity ? (
                  <Link
                     key={field}
                     to={dictionaryHref(ontology, entity.id)}
                     className="hover:text-primary"
                  >
                     {chip}
                  </Link>
               ) : (
                  <span key={field} className="text-muted-foreground">
                     {chip}
                  </span>
               );
            })}
         </div>
      </div>
   );
}
