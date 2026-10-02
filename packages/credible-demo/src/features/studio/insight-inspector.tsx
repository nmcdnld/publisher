// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowUpRight,
   CalendarClock,
   CircleCheck,
   CircleX,
   EyeOff,
   Star,
   StarOff,
   Undo2,
   UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AnalysisMenu } from "@/components/analysis-actions";
import { DeltaBadge } from "@/components/delta-badge";
import { EvidenceChart } from "@/components/evidence-chart";
import { MalloyBlock } from "@/components/malloy-block";
import { useAuthorName } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { ResultsGrid } from "@/components/results-grid";
import { Glance } from "@/components/glance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSetInsightStatus } from "@/data/hooks";
import { DETECTORS } from "@/data/insight-runs";
import type { Analysis, InsightRun, StudioInsight } from "@/data/types";
import { InsightCard } from "@/pages/discover";
import { deltaTone, formatValue, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isChartProgram, programText } from "@malloy-publisher/app-manifest/analyst/chart-program";
import { modelLabel } from "@/analyst/insights";
import {
   DetectorBadge,
   ModelBadge,
   ScoreMeter,
   STATUS_LABEL,
   StatusDot,
} from "./meta";

const toneText = {
   good: "text-positive",
   bad: "text-negative",
   flat: "text-muted-foreground",
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
   return (
      <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
         {children}
      </h3>
   );
}

/**
 * Everything about one insight: the finding at full size, why the run kept it,
 * what it verified, the query and its rows, and the card For you would show.
 */
export function InsightInspector({
   insight,
   analysis,
   run,
   onShowRun,
}: {
   insight: StudioInsight | undefined;
   analysis: Analysis | undefined;
   run: InsightRun | undefined;
   onShowRun: (runId: string) => void;
}) {
   const setStatus = useSetInsightStatus();
   const authorName = useAuthorName();

   if (!insight) {
      return (
         <Card className="items-center justify-center p-10 text-center text-sm text-muted-foreground">
            Pick an insight to inspect how it was found.
         </Card>
      );
   }
   if (!analysis) return <Skeleton className="h-[40rem] rounded-xl" />;

   const { metric } = insight;
   const featured = insight.status === "featured";
   const dismissed = insight.status === "dismissed";
   const passed = insight.checks.filter((c) => c.passed).length;
   const program = isChartProgram(analysis.evidence.spec)
      ? analysis.evidence.spec
      : undefined;
   const change = (status: StudioInsight["status"], message: string) =>
      setStatus.mutate([insight.id, status], {
         onSuccess: () =>
            toast(message, {
               action: {
                  label: "Undo",
                  onClick: () => setStatus.mutate([insight.id, insight.status]),
               },
            }),
      });

   return (
      <Card className="gap-0 overflow-hidden p-0">
         <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
               <StatusDot status={insight.status} />
               {STATUS_LABEL[insight.status]}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
               {featured ? (
                  <Button
                     size="sm"
                     variant="outline"
                     disabled={setStatus.isPending}
                     onClick={() => change("candidate", "Removed from For you")}
                  >
                     <StarOff />
                     Remove from For you
                  </Button>
               ) : (
                  <Button
                     size="sm"
                     disabled={setStatus.isPending}
                     onClick={() => change("featured", "Featured in For you")}
                  >
                     <Star />
                     Feature in For you
                  </Button>
               )}
               {dismissed ? (
                  <Button
                     size="sm"
                     variant="ghost"
                     disabled={setStatus.isPending}
                     onClick={() =>
                        change("candidate", "Restored as a candidate")
                     }
                  >
                     <Undo2 />
                     Restore
                  </Button>
               ) : (
                  <Button
                     size="sm"
                     variant="ghost"
                     disabled={setStatus.isPending}
                     onClick={() => change("dismissed", "Dismissed")}
                  >
                     <EyeOff />
                     Dismiss
                  </Button>
               )}
               <Button size="sm" variant="ghost" asChild>
                  <Link to={`/analysis/${analysis.id}`}>
                     <ArrowUpRight />
                     Open
                  </Link>
               </Button>
               <AnalysisMenu analysis={analysis} />
            </div>
         </div>

         <div className="space-y-6 p-5">
            <header className="space-y-3">
               <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                     <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {metric.label}
                     </p>
                     <div className="flex flex-wrap items-center gap-2">
                        <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
                           {formatValue(metric.value, metric.format, {
                              compact: metric.format === "currency",
                           })}
                        </span>
                        <DeltaBadge delta={insight.delta} />
                     </div>
                  </div>
                  <Glance
                     metric={metric}
                     className={cn(
                        "mt-1 h-12 w-28 shrink-0",
                        toneText[deltaTone(insight.delta)],
                     )}
                  />
               </div>
               <h2 className="text-xl leading-snug font-semibold tracking-tight">
                  {insight.headline}
               </h2>
               <p className="leading-relaxed text-muted-foreground">
                  {analysis.narrative}
               </p>
               {analysis.details.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                     {analysis.details.map((d) => (
                        <li key={d}>{d}</li>
                     ))}
                  </ul>
               )}
            </header>

            <Tabs defaultValue="chart" className="gap-3">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <TabsList>
                     <TabsTrigger value="chart">Chart</TabsTrigger>
                     <TabsTrigger value="rows">
                        Rows
                        <span className="text-muted-foreground tabular-nums">
                           {analysis.evidence.rows.length}
                        </span>
                     </TabsTrigger>
                     <TabsTrigger value="malloy">Malloy</TabsTrigger>
                     {program && (
                        <TabsTrigger value="spec">Chart code</TabsTrigger>
                     )}
                     <TabsTrigger value="preview">For you card</TabsTrigger>
                  </TabsList>
                  <Provenance provenance={analysis.provenance} />
               </div>
               <TabsContent value="chart" className="rounded-lg border p-4">
                  {analysis.evidence.caption && (
                     <p className="mb-3 text-sm text-muted-foreground">
                        {analysis.evidence.caption}
                     </p>
                  )}
                  <EvidenceChart evidence={analysis.evidence} />
               </TabsContent>
               <TabsContent
                  value="rows"
                  className="overflow-hidden rounded-lg border"
               >
                  <ResultsGrid
                     evidence={analysis.evidence}
                     filename={analysis.title}
                  />
               </TabsContent>
               <TabsContent value="malloy">
                  <MalloyBlock value={analysis.malloy} />
               </TabsContent>
               {program && (
                  <TabsContent value="spec" className="space-y-2">
                     <p className="text-xs text-muted-foreground">
                        {program.library === "chartjs"
                           ? "A Chart.js config"
                           : "A TanStack Charts program"}{" "}
                        written for this insight
                        {run?.model ? ` by ${modelLabel(run.model)}` : ""}. It
                        names its datasets; the rows are bound in from the query
                        results.
                     </p>
                     <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                        {programText(program)}
                     </pre>
                  </TabsContent>
               )}
               <TabsContent value="preview">
                  <div className="rounded-lg border border-dashed bg-muted/20 p-4">
                     <div className="grid max-w-sm">
                        <InsightCard insight={insight} />
                     </div>
                     <p className="mt-3 text-xs text-muted-foreground">
                        {featured
                           ? "This is how it appears under For you on Discover."
                           : "How it would appear under For you once featured."}
                     </p>
                  </div>
               </TabsContent>
            </Tabs>

            <div className="grid gap-6 @4xl:grid-cols-2">
               <section>
                  <SectionLabel>Why it surfaced</SectionLabel>
                  <div className="space-y-3 rounded-lg border p-4">
                     <div className="flex items-center justify-between gap-2">
                        <DetectorBadge
                           detector={insight.detector}
                           className="text-xs text-foreground"
                        />
                        <ScoreMeter score={insight.score} />
                     </div>
                     <p className="text-xs text-muted-foreground">
                        {DETECTORS[insight.detector].description}. The score
                        weighs how far outside normal the move is by how much of
                        the business it touches.
                     </p>
                     <ol className="space-y-2 text-sm">
                        {insight.reasons.map((r, i) => (
                           <li key={r} className="flex gap-2.5">
                              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">
                                 {i + 1}
                              </span>
                              <span className="leading-snug">{r}</span>
                           </li>
                        ))}
                     </ol>
                  </div>
               </section>
               <section>
                  <SectionLabel>
                     Checks · {passed} of {insight.checks.length} passed
                  </SectionLabel>
                  <ul className="divide-y rounded-lg border">
                     {insight.checks.map((c) => (
                        <li
                           key={c.label}
                           className="flex items-start gap-2.5 px-4 py-2.5 text-sm"
                        >
                           {c.passed ? (
                              <CircleCheck className="mt-0.5 size-4 shrink-0 text-positive" />
                           ) : (
                              <CircleX className="mt-0.5 size-4 shrink-0 text-amber-500" />
                           )}
                           <span className="min-w-0">
                              <span className="block leading-snug">
                                 {c.label}
                              </span>
                              {c.detail && (
                                 <span className="block text-xs text-muted-foreground">
                                    {c.detail}
                                 </span>
                              )}
                           </span>
                        </li>
                     ))}
                  </ul>
               </section>
            </div>

            {run && (
               <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                     {run.trigger === "schedule" ? (
                        <CalendarClock className="size-3.5" />
                     ) : (
                        <UserRound className="size-3.5" />
                     )}
                     {run.trigger === "schedule"
                        ? "Found by a scheduled run"
                        : `Found by a run ${authorName(run.startedBy).replace(/^You$/, "you")} started`}{" "}
                     {relativeTime(insight.generatedAt)}
                  </span>
                  {run.recipe.focus && (
                     <span>· steered by “{run.recipe.focus}”</span>
                  )}
                  {run.featuredIds.includes(insight.id) && (
                     <span>· featured automatically</span>
                  )}
                  <ModelBadge model={run.model} />
                  <Button
                     variant="link"
                     size="xs"
                     className="ml-auto h-auto p-0 text-xs"
                     onClick={() => onShowRun(run.id)}
                  >
                     Everything from this run
                  </Button>
               </footer>
            )}
         </div>
      </Card>
   );
}
