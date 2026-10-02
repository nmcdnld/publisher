// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AlertTriangle,
   HelpCircle,
   ListTree,
   Loader2,
   Square,
} from "lucide-react";
import { Component, useMemo, useState } from "react";
import type {
   Block,
   ReportSection,
} from "@malloy-publisher/app-manifest/analyst/blocks";
import { blockLabels } from "@malloy-publisher/app-manifest/analyst/blocks";
import {
   datasetMap,
   metricMap,
   visibleReport,
   type AnalystRecord,
} from "@/analyst/record";
import { splitTokens } from "@malloy-publisher/app-manifest/analyst/tokens";
import { AiAvatar } from "@/components/people";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptionalThreadUi } from "@/features/threads/thread-context";
import { cn } from "@/lib/utils";
import { citedIds, MetricText, RenderBlock, type RenderCtx } from "./registry";
import { TraceDrawer, workLine, type TraceFocus } from "./trace-drawer";

const layoutClass: Record<ReportSection["layout"], string> = {
   row: "grid grid-cols-2 gap-2 @lg:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]",
   "grid-2": "grid gap-2.5 @xl:grid-cols-2",
   "grid-3": "grid gap-2.5 @xl:grid-cols-2 @4xl:grid-cols-3",
   stack: "grid gap-2.5",
};

function StatusLine({ text, onStop }: { text?: string; onStop?: () => void }) {
   return (
      <div
         className="flex items-center gap-2 text-sm text-muted-foreground"
         role="status"
         aria-live="polite"
      >
         <Loader2 className="size-3.5 shrink-0 animate-spin" />
         <span
            key={text}
            className="min-w-0 flex-1 truncate animate-in fade-in"
         >
            {text ?? "Working"}…
         </span>
         {onStop && (
            <Button
               size="sm"
               variant="ghost"
               className="h-6 gap-1 px-2 text-xs"
               onClick={onStop}
            >
               <Square className="size-2.5 fill-current" />
               Stop
            </Button>
         )}
      </div>
   );
}

function ReportSkeleton() {
   return (
      <div className="space-y-2.5">
         <Skeleton className="h-5 w-3/4" />
         <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
               <Skeleton key={i} className="h-16" />
            ))}
         </div>
         <Skeleton className="h-40" />
      </div>
   );
}

/** Wraps a block with the admin's "Why?" affordance. */
function BlockFrame({
   block,
   ctx,
   onWhy,
}: {
   block: Block;
   ctx: RenderCtx;
   onWhy?: (focus: TraceFocus) => void;
}) {
   return (
      <div className="group/block relative min-w-0">
         <RenderBlock block={block} ctx={ctx} />
         {onWhy && block.type !== "followUps" && (
            <button
               type="button"
               onClick={() =>
                  onWhy({
                     label: `this ${blockLabels[block.type].toLowerCase()}`,
                     ...citedIds(block),
                  })
               }
               className="absolute top-1 right-1 hidden items-center gap-0.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-xs ring-1 ring-border group-hover/block:flex hover:text-foreground focus-visible:flex"
            >
               <HelpCircle className="size-3" />
               Why?
            </button>
         )}
      </div>
   );
}

class ReportBoundary extends Component<
   { children: React.ReactNode },
   { error?: Error }
> {
   state: { error?: Error } = {};
   static getDerivedStateFromError(error: Error) {
      return { error };
   }
   render() {
      if (!this.state.error) return this.props.children;
      return (
         <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            This report couldn't be drawn: {this.state.error.message}
         </div>
      );
   }
}

export function AnalystMessage(props: {
   record: AnalystRecord;
   live?: boolean;
   /** Drawn under the report once it has finished, such as Save. */
   actions?: React.ReactNode;
}) {
   return (
      <ReportBoundary>
         <AnalystReport {...props} />
      </ReportBoundary>
   );
}

function AnalystReport({
   record,
   live = false,
   actions,
}: {
   record: AnalystRecord;
   live?: boolean;
   actions?: React.ReactNode;
}) {
   const ui = useOptionalThreadUi();
   const ask = ui?.ask;
   const running = ui?.live;
   const [drawer, setDrawer] = useState(false);
   const [focus, setFocus] = useState<TraceFocus | null>(null);
   const report = useMemo(() => visibleReport(record), [record]);
   const ctx: RenderCtx = useMemo(
      () => ({
         metrics: metricMap(record),
         datasets: datasetMap(record),
         onFollowUp: live || running || !ask ? undefined : (q) => ask(q),
      }),
      [record, live, running, ask],
   );
   const admin = ui?.audience === "admin" && record.audience === "admin";
   const onWhy = admin
      ? (f: TraceFocus) => {
           setFocus(f);
           setDrawer(true);
        }
      : undefined;
   const isRunning = record.status === "running";
   const partial = record.partial || record.status === "partial";
   const answerMetrics = report
      ? splitTokens(report.answer).flatMap((p) =>
           "metricId" in p ? [p.metricId] : [],
        )
      : [];

   return (
      <div className="flex gap-2">
         <AiAvatar className="size-6" />
         <div className="@container min-w-0 flex-1 space-y-3">
            {report ? (
               <div className="space-y-3">
                  {(report.title || report.answer) && (
                     <div className="group/block relative space-y-1">
                        {report.title && (
                           <h3 className="text-sm font-semibold">
                              {report.title}
                           </h3>
                        )}
                        {report.answer ? (
                           <p className="text-[15px] leading-relaxed">
                              <MetricText text={report.answer} ctx={ctx} />
                           </p>
                        ) : (
                           !isRunning && (
                              <p className="text-sm text-muted-foreground">
                                 The analyst couldn't state this in one checked
                                 line; the details are below.
                              </p>
                           )
                        )}
                        {onWhy && answerMetrics.length > 0 && (
                           <button
                              type="button"
                              onClick={() =>
                                 onWhy({
                                    label: "the answer",
                                    metrics: answerMetrics,
                                    datasets: [],
                                 })
                              }
                              className="absolute top-0 right-0 hidden items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border group-hover/block:flex hover:text-foreground"
                           >
                              <HelpCircle className="size-3" />
                              Why?
                           </button>
                        )}
                     </div>
                  )}
                  {report.sections.map((section, i) => (
                     <section key={i} className="space-y-1.5">
                        {section.heading && (
                           <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                              {section.heading}
                           </h4>
                        )}
                        <div
                           className={cn(
                              layoutClass[section.layout] ?? layoutClass.stack,
                           )}
                        >
                           {section.blocks.map((block, j) => (
                              <BlockFrame
                                 key={j}
                                 block={block}
                                 ctx={ctx}
                                 onWhy={isRunning ? undefined : onWhy}
                              />
                           ))}
                        </div>
                     </section>
                  ))}
               </div>
            ) : isRunning ? (
               <ReportSkeleton />
            ) : (
               <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  {record.error ?? "The analyst couldn't finish this question."}
               </div>
            )}

            {isRunning && (
               <StatusLine
                  text={record.statusText}
                  onStop={live ? ui?.stop : undefined}
               />
            )}

            {partial && !isRunning && (
               <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  <p>
                     <span className="font-medium">Partial answer.</span> The
                     analyst stopped early
                     {record.summary?.reason
                        ? ` (${record.summary.reason})`
                        : ""}
                     . Every number shown is checked, but it may not cover the
                     whole question.
                  </p>
               </div>
            )}

            {actions && !isRunning && (
               <div className="-ml-2 flex items-center gap-1">{actions}</div>
            )}

            {admin && !isRunning && (
               <button
                  type="button"
                  onClick={() => {
                     setFocus(null);
                     setDrawer(true);
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
               >
                  <ListTree className="size-3" />
                  {workLine(record) ?? "Run details"}
                  {record.grounding && record.grounding.dropped.length > 0 && (
                     <span className="text-destructive">
                        · {record.grounding.dropped.length} dropped
                     </span>
                  )}
                  <span className="underline underline-offset-2">
                     Show work
                  </span>
               </button>
            )}
            {admin && (
               <TraceDrawer
                  record={record}
                  open={drawer}
                  onOpenChange={setDrawer}
                  focus={focus}
                  onClearFocus={() => setFocus(null)}
               />
            )}
         </div>
      </div>
   );
}
