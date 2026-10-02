// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ArrowUpRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalyses, useInsightRuns, useStudioInsights } from "@/data/hooks";
import type { InsightRun, InsightStatus } from "@/data/types";
import { GenerateButton, RunCard } from "@/features/studio/generate-panel";
import { InsightInspector } from "@/features/studio/insight-inspector";
import { InsightList } from "@/features/studio/insight-list";
import { RunHistory } from "@/features/studio/run-history";
import { ScheduleMenu } from "@/features/studio/schedule-card";
import { relativeTime } from "@/lib/format";

type View = InsightStatus | "all";

const VIEWS: { id: View; label: string }[] = [
   { id: "featured", label: "For you" },
   { id: "candidate", label: "Candidates" },
   { id: "dismissed", label: "Dismissed" },
   { id: "all", label: "All" },
];

const EMPTY: Record<View, string> = {
   featured:
      "Nothing is featured, so For you is empty. Feature a candidate, or let the schedule do it.",
   candidate: "No candidates waiting. Press Generate insight to find one.",
   dismissed: "Nothing dismissed.",
   all: "No insights yet. Press Generate insight to find the first.",
};

export function StudioPage() {
   const [params, setParams] = useSearchParams();
   const runFilter = params.get("run");
   const view = (params.get("view") as View | null) ?? "candidate";
   const insights = useStudioInsights().data;
   const runs = useInsightRuns().data;
   const { byId: analyses } = useAnalyses();
   const [activeRunId, setActiveRunId] = useState<string | null>(null);
   const listRef = useRef<HTMLElement>(null);

   const update = (patch: Record<string, string | null>) =>
      setParams(
         (prev) => {
            const next = new URLSearchParams(prev);
            for (const [k, v] of Object.entries(patch)) {
               if (v === null) next.delete(k);
               else next.set(k, v);
            }
            return next;
         },
         { replace: true },
      );

   const inRun = (insights ?? []).filter(
      (i) => !runFilter || i.runId === runFilter,
   );
   const counts = Object.fromEntries(
      VIEWS.map((v) => [
         v.id,
         v.id === "all"
            ? inRun.length
            : inRun.filter((i) => i.status === v.id).length,
      ]),
   ) as Record<View, number>;
   const shown = insights
      ? inRun.filter((i) => view === "all" || i.status === view)
      : undefined;

   const requested = params.get("insight");
   const selected =
      (insights ?? []).find((i) => i.id === requested) ?? shown?.[0];
   const runsById = new Map(runs?.map((r) => [r.id, r]));
   const running = runs?.find((r) => r.status === "running");
   const activeRun =
      (activeRunId ? runsById.get(activeRunId) : undefined) ?? running;

   const showRun = (run: InsightRun | string) => {
      const id = typeof run === "string" ? run : run.id;
      update({ run: id, view: "all", insight: null });
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
   };

   useEffect(() => {
      if (running && !activeRunId) setActiveRunId(running.id);
   }, [running, activeRunId]);

   const finished = useRef(new Set<string>());
   useEffect(() => {
      if (!activeRun || activeRun.status === "running") return;
      if (finished.current.has(activeRun.id)) return;
      finished.current.add(activeRun.id);
      if (activeRun.id !== activeRunId) return;
      const kept = activeRun.insightIds.length;
      if (activeRun.trigger === "manual" && kept === 1) {
         update({
            view: "candidate",
            run: null,
            insight: activeRun.insightIds[0],
         });
         setActiveRunId(null);
         toast.success("Added a new candidate");
         return;
      }
      const featured = activeRun.featuredIds.length;
      toast.success(
         kept
            ? `Kept ${kept} ${kept === 1 ? "finding" : "findings"}${featured ? `, featured ${featured} in For you` : ""}`
            : "Run finished with nothing new",
         kept
            ? { action: { label: "Review", onClick: () => showRun(activeRun) } }
            : undefined,
      );
   }, [activeRun, activeRunId]);

   const filterRun = runFilter ? runsById.get(runFilter) : undefined;
   const startedRun = (run: InsightRun) => setActiveRunId(run.id);

   return (
      <PageContainer className="max-w-[1400px] space-y-8">
         <PageHeader
            title="Studio"
            description="Generate insights from your governed models, inspect how each was found, and decide what reaches For you."
            actions={
               <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" asChild>
                     <Link to="/">
                        See For you
                        <ArrowUpRight />
                     </Link>
                  </Button>
                  <ScheduleMenu running={!!running} onStarted={startedRun} />
                  <GenerateButton running={!!running} onStarted={startedRun} />
               </div>
            }
         />

         <section ref={listRef} className="scroll-mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
               <Tabs
                  value={view}
                  onValueChange={(v) => update({ view: v, insight: null })}
               >
                  <TabsList>
                     {VIEWS.map((v) => (
                        <TabsTrigger key={v.id} value={v.id}>
                           {v.label}
                           <span className="text-muted-foreground tabular-nums">
                              {counts[v.id]}
                           </span>
                        </TabsTrigger>
                     ))}
                  </TabsList>
               </Tabs>
               {runFilter && (
                  <Badge variant="secondary" className="gap-1 py-1">
                     From the{" "}
                     {filterRun?.trigger === "schedule" ? "scheduled" : ""} run{" "}
                     {filterRun ? relativeTime(filterRun.startedAt) : ""}
                     <button
                        onClick={() => update({ run: null })}
                        aria-label="Show insights from every run"
                     >
                        <X className="size-3" />
                     </button>
                  </Badge>
               )}
            </div>

            <div className="grid items-start gap-6 @4xl:grid-cols-[340px_minmax(0,1fr)]">
               <div className="space-y-2">
                  {activeRun && (
                     <RunCard
                        run={activeRun}
                        onReview={showRun}
                        onClose={() => setActiveRunId(null)}
                     />
                  )}
                  <InsightList
                     insights={shown}
                     selectedId={selected?.id}
                     onSelect={(id) => update({ insight: id })}
                     empty={EMPTY[view]}
                  />
               </div>
               <div className="@4xl:sticky @4xl:top-6">
                  <InsightInspector
                     insight={selected}
                     analysis={
                        selected ? analyses.get(selected.analysisId) : undefined
                     }
                     run={selected ? runsById.get(selected.runId) : undefined}
                     onShowRun={showRun}
                  />
               </div>
            </div>
         </section>

         <RunHistory
            runs={runs}
            selectedRunId={runFilter}
            onShowRun={(id) =>
               runFilter === id ? update({ run: null }) : showRun(id)
            }
         />
      </PageContainer>
   );
}
