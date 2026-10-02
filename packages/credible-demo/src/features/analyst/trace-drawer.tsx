// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AlertTriangle,
   Brain,
   Check,
   ChevronRight,
   CircleDollarSign,
   Database,
   Sigma,
   Wrench,
   X,
} from "lucide-react";
import { useState } from "react";
import { blockLabels } from "@malloy-publisher/app-manifest/analyst/blocks";
import type { TraceStep } from "@/analyst/events";
import { formatMetric, resolveText } from "@malloy-publisher/app-manifest/analyst/format";
import { metricMap, type AnalystRecord } from "@/analyst/record";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface TraceFocus {
   label: string;
   metrics: string[];
   datasets: string[];
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** "Explored in 9 steps · 2 queries · 2.1s · $0.03", the collapsed line under a report. */
export function workLine(r: AnalystRecord) {
   const s = r.summary;
   if (!s) return undefined;
   const parts = [
      `Explored in ${s.toolCalls} step${s.toolCalls === 1 ? "" : "s"}`,
      `${s.queries} quer${s.queries === 1 ? "y" : "ies"}`,
      seconds(s.durationMs),
   ];
   if (r.mode === "model") parts.push(usd(s.costUsd));
   return parts.join(" · ");
}

/**
 * Which steps a block rests on: the tool calls that produced its metrics and
 * datasets, and the queries behind those metrics.
 */
function stepsFor(r: AnalystRecord, focus: TraceFocus) {
   const datasets = new Set(focus.datasets);
   for (const id of focus.metrics) {
      const m = r.metrics.find((x) => x.id === id);
      if (m) datasets.add(m.datasetId);
   }
   const metrics = new Set(focus.metrics);
   return (step: TraceStep) =>
      step.kind === "tool" &&
      ((step.metricId && metrics.has(step.metricId)) ||
         (step.datasetId && datasets.has(step.datasetId)));
}

function Json({ value }: { value: unknown }) {
   const [open, setOpen] = useState(false);
   const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
   return (
      <div>
         <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
         >
            <ChevronRight
               className={cn(
                  "size-3 transition-transform",
                  open && "rotate-90",
               )}
            />
            {open ? "Hide" : "Show"} detail
         </button>
         {open && (
            <pre className="mt-1 max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
               {text}
            </pre>
         )}
      </div>
   );
}

function Step({
   step,
   r,
   dim,
}: {
   step: TraceStep;
   r: AnalystRecord;
   dim: boolean;
}) {
   const metrics = metricMap(r);
   const wrap = (
      icon: React.ReactNode,
      body: React.ReactNode,
      tone?: string,
   ) => (
      <li className={cn("flex gap-2.5 py-2", dim && "opacity-35")}>
         <span
            className={cn(
               "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted",
               tone,
            )}
         >
            {icon}
         </span>
         <div className="min-w-0 flex-1 space-y-1 text-xs">{body}</div>
      </li>
   );
   switch (step.kind) {
      case "iteration":
         return (
            <li className={cn("pt-3 pb-1", dim && "opacity-35")}>
               <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {step.phase} · turn {step.index + 1} · {step.model}
               </p>
            </li>
         );
      case "tool": {
         const metric = step.metricId ? metrics.get(step.metricId) : undefined;
         const ds = step.datasetId
            ? r.datasets.find((d) => d.id === step.datasetId)
            : undefined;
         return wrap(
            step.toolName === "compute_metric" ? (
               <Sigma className="size-3" />
            ) : step.toolName === "run_query" ? (
               <Database className="size-3" />
            ) : (
               <Wrench className="size-3" />
            ),
            <>
               <p className="flex flex-wrap items-center gap-1.5">
                  <code className="font-mono font-medium">{step.toolName}</code>
                  {!step.ok && <Badge variant="destructive">failed</Badge>}
                  {ds && (
                     <Badge variant="secondary">
                        {ds.id} · {ds.title} · {ds.rowCount} rows
                     </Badge>
                  )}
                  {metric && (
                     <Badge variant="secondary">
                        {metric.id} = {formatMetric(metric)}
                     </Badge>
                  )}
                  <span className="ml-auto text-muted-foreground tabular-nums">
                     {step.durationMs}ms
                  </span>
               </p>
               {step.error && <p className="text-destructive">{step.error}</p>}
               {ds && (
                  <pre className="rounded bg-muted px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">
                     {ds.query}
                  </pre>
               )}
               <Json value={{ args: step.args, result: step.resultPreview }} />
            </>,
            step.ok ? undefined : "bg-destructive/15 text-destructive",
         );
      }
      case "text":
      case "reasoning":
         return wrap(
            <Brain className="size-3" />,
            <p
               className={cn(
                  "whitespace-pre-wrap text-muted-foreground",
                  step.kind === "reasoning" && "italic",
               )}
            >
               {step.text.length > 600
                  ? `${step.text.slice(0, 600)}…`
                  : step.text}
            </p>,
         );
      case "usage":
         return wrap(
            <CircleDollarSign className="size-3" />,
            <p className="text-muted-foreground tabular-nums">
               {step.phase} · {step.model} ·{" "}
               {step.promptTokens.toLocaleString()} in /{" "}
               {step.completionTokens.toLocaleString()} out
               {step.costUsd !== undefined ? ` · ${usd(step.costUsd)}` : ""}
            </p>,
         );
      case "grounding":
         return wrap(
            step.ok ? <Check className="size-3" /> : <X className="size-3" />,
            step.ok ? (
               <p>Grounding passed: every number traces to a metric.</p>
            ) : (
               <div className="space-y-1">
                  <p className="font-medium text-destructive">
                     Grounding dropped {step.dropped.length} item
                     {step.dropped.length === 1 ? "" : "s"}
                  </p>
                  {step.dropped.map((d, i) => (
                     <p key={i} className="text-destructive/90">
                        {d.blockType ? blockLabels[d.blockType] : d.path}:{" "}
                        {d.reason}
                     </p>
                  ))}
               </div>
            ),
            step.ok
               ? "bg-emerald-500/15 text-emerald-700"
               : "bg-destructive/15 text-destructive",
         );
      case "note":
         return wrap(
            <AlertTriangle className="size-3" />,
            <p
               className={cn(
                  step.level === "error" && "text-destructive",
                  step.level === "warning" &&
                     "text-amber-700 dark:text-amber-400",
               )}
            >
               {step.text}
            </p>,
         );
   }
}

export function TraceDrawer({
   record,
   open,
   onOpenChange,
   focus,
   onClearFocus,
}: {
   record: AnalystRecord;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   focus?: TraceFocus | null;
   onClearFocus: () => void;
}) {
   const metrics = metricMap(record);
   const inFocus = focus ? stepsFor(record, focus) : null;
   const dropped = record.grounding?.dropped ?? [];
   return (
      <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent className="w-full gap-0 sm:max-w-xl">
            <SheetHeader className="border-b">
               <SheetTitle>Show work</SheetTitle>
               <SheetDescription>
                  {[
                     workLine(record),
                     record.mode === "scripted"
                        ? "scripted planner"
                        : record.model,
                  ]
                     .filter(Boolean)
                     .join(" · ")}
               </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
               {focus && (
                  <div className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs">
                     <span className="min-w-0 flex-1">
                        Steps behind{" "}
                        <span className="font-medium">{focus.label}</span>
                     </span>
                     <Button
                        size="sm"
                        variant="ghost"
                        className="h-6"
                        onClick={onClearFocus}
                     >
                        Show all
                     </Button>
                  </div>
               )}

               {dropped.length > 0 && (
                  <section className="space-y-1.5">
                     <h3 className="text-xs font-semibold text-destructive">
                        Dropped by grounding
                     </h3>
                     {dropped.map((d, i) => (
                        <div
                           key={i}
                           className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
                        >
                           <p className="font-medium text-destructive">
                              {d.blockType ? blockLabels[d.blockType] : d.path}{" "}
                              <span className="font-mono font-normal opacity-70">
                                 {d.path}
                              </span>
                           </p>
                           <p className="text-destructive/90">{d.reason}</p>
                        </div>
                     ))}
                  </section>
               )}

               {record.findings && !focus && (
                  <section className="space-y-1.5">
                     <h3 className="text-xs font-semibold">
                        Findings from the explorer
                     </h3>
                     <ul className="space-y-1 text-xs">
                        {record.findings.findings.map((f) => (
                           <li key={f.id} className="flex gap-2">
                              <Badge variant="outline" className="shrink-0">
                                 {f.kind}
                              </Badge>
                              <span>{resolveText(f.headline, metrics)}</span>
                           </li>
                        ))}
                        {record.findings.openQuestions.map((q) => (
                           <li key={q} className="text-muted-foreground">
                              Open: {q}
                           </li>
                        ))}
                     </ul>
                  </section>
               )}

               <section>
                  <h3 className="text-xs font-semibold">Trace</h3>
                  {record.trace?.length ? (
                     <ol className="divide-y">
                        {record.trace.map((s) => (
                           <Step
                              key={s.id}
                              step={s}
                              r={record}
                              dim={
                                 !!inFocus &&
                                 s.kind !== "grounding" &&
                                 !inFocus(s)
                              }
                           />
                        ))}
                     </ol>
                  ) : (
                     <p className="pt-2 text-xs text-muted-foreground">
                        No trace was recorded for this run. Traces reach admins
                        only.
                     </p>
                  )}
               </section>
            </div>
         </SheetContent>
      </Sheet>
   );
}
