// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ChevronLeft,
   ChevronRight,
   FlaskConical,
   Loader2,
   RotateCcw,
   Sparkles,
   WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
   useAnalyses,
   useInsightRuns,
   useSetInsightStatus,
   useStartInsightRun,
   useStudioInsights,
} from "@/data/hooks";
import { DETECTORS } from "@/data/insight-runs";
import type {
   Analysis,
   InsightDetector,
   InsightStatus,
   StudioInsight,
} from "@/data/types";
import { workspaceKey } from "@/lib/workspaces";
import { InsightCard } from "@/pages/discover";

const SEEN_KEY = "destination.for-you.seen";
const DRY_KEY = "destination.for-you.dry";
const SEEN_LIMIT = 60;

type Seen = Record<string, number>;

function readSeen(): Seen {
   try {
      return JSON.parse(
         sessionStorage.getItem(workspaceKey(SEEN_KEY)) ?? "{}",
      ) as Seen;
   } catch {
      return {};
   }
}

function markSeen(analysisId: string) {
   const seen = { ...readSeen(), [analysisId]: Date.now() };
   const kept = Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, SEEN_LIMIT);
   try {
      sessionStorage.setItem(
         workspaceKey(SEEN_KEY),
         JSON.stringify(Object.fromEntries(kept)),
      );
   } catch {
      // Without storage For you still ranks, it just can't skip what you've read.
   }
}

/** Records that this analysis was opened, so For you moves past it. */
export function useMarkSeen(analysisId: string) {
   useEffect(() => markSeen(analysisId), [analysisId]);
}

const isDry = () => sessionStorage.getItem(workspaceKey(DRY_KEY)) === "1";
const setDry = (dry: boolean) =>
   dry
      ? sessionStorage.setItem(workspaceKey(DRY_KEY), "1")
      : sessionStorage.removeItem(workspaceKey(DRY_KEY));

/** How much reading `from` suggests wanting `to`, before the insight's own score. */
function relatedness(from: Analysis, to: Analysis): number {
   const shared = from.topics.filter((t) => to.topics.includes(t)).length;
   const { source, view } = from.provenance;
   return (
      shared * 0.25 +
      (to.provenance.source === source ? 0.1 : 0) +
      (view && to.provenance.view === view ? 0.15 : 0)
   );
}

/**
 * Hides an insight from For you and says so, with an undo that puts back the
 * status it had.
 */
function useHideInsight() {
   const setStatus = useSetInsightStatus();
   const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
   const toggle = (id: string, hide: boolean) =>
      setHidden((prev) => {
         const next = new Set(prev);
         if (hide) next.add(id);
         else next.delete(id);
         return next;
      });
   const hide = (id: string, restore: InsightStatus = "featured") => {
      toggle(id, true);
      setStatus.mutate([id, "dismissed"]);
      toast("You'll see fewer insights like this", {
         action: {
            label: "Undo",
            onClick: () => {
               toggle(id, false);
               setStatus.mutate([id, restore]);
            },
         },
      });
   };
   return { hidden, hide };
}

const ALL_DETECTORS = Object.keys(DETECTORS) as InsightDetector[];

/**
 * Insights to read after this one, a card at a time: related ones first, ones
 * you haven't opened this session ahead of ones you have. Paging past the
 * last asks the Studio for more like this one, and what it finds becomes the
 * next page.
 */
export function ForYouPanel({ analysis }: { analysis: Analysis }) {
   const insights = useStudioInsights().data;
   const allAnalyses = useAnalyses().data;
   const runs = useInsightRuns().data;
   const start = useStartInsightRun();
   const { hidden, hide } = useHideInsight();
   const [seen] = useState(readSeen);
   const [dry, setDryState] = useState(isDry);
   const [runId, setRunId] = useState<string>();
   const [autoStarted, setAutoStarted] = useState(false);
   const [page, setPage] = useState(0);
   const order = useRef<string[]>([]);

   const ranked = useMemo(() => {
      if (!insights || !allAnalyses) return undefined;
      const analyses = new Map(allAnalyses.map((a) => [a.id, a]));
      const rank = (i: StudioInsight) =>
         i.score +
         relatedness(analysis, analyses.get(i.analysisId)!) +
         (i.status === "featured" ? 0.1 : 0);
      const pool = insights.filter(
         (i) =>
            i.status !== "dismissed" &&
            !hidden.has(i.id) &&
            i.analysisId !== analysis.id &&
            analyses.has(i.analysisId),
      );
      const fresh = pool
         .filter((i) => !seen[i.analysisId])
         .sort((a, b) => rank(b) - rank(a));
      const again = pool
         .filter((i) => seen[i.analysisId])
         .sort((a, b) => seen[a.analysisId] - seen[b.analysisId]);
      const next = [...fresh, ...again];
      // Keep pages where they were when the list grows, so a new finding lands
      // after the last page instead of renumbering the ones already paged.
      const byId = new Map(next.map((i) => [i.id, i]));
      const kept = order.current.filter((id) => byId.has(id));
      const added = next.filter((i) => !kept.includes(i.id)).map((i) => i.id);
      order.current = [...kept, ...added];
      return order.current.map((id) => byId.get(id)!);
   }, [insights, allAnalyses, analysis, hidden, seen]);

   const running = runs?.some((r) => r.status === "running");
   const mine = runs?.find((r) => r.id === runId);
   const digging = !!running || start.isPending;
   const total = ranked?.length ?? 0;
   // The page after the last card is where the Studio is asked for more.
   const current = Math.min(page, total);
   const atEnd = !!ranked && current === total;

   useEffect(() => {
      if (mine && mine.status !== "running") {
         const found = mine.insightIds.length > 0;
         setDry(!found);
         setDryState(!found);
         setRunId(undefined);
      }
   }, [mine]);

   const findMore = () => {
      setDry(false);
      setDryState(false);
      start.mutate(
         [
            {
               focus: [analysis.title, ...analysis.topics].join(" "),
               sources: [],
               detectors: ALL_DETECTORS,
            },
         ],
         { onSuccess: (run) => setRunId(run.id) },
      );
   };

   useEffect(() => {
      if (atEnd && !dry && !digging && !autoStarted) {
         setAutoStarted(true);
         findMore();
      }
      // findMore reads only the analysis, which is fixed for this panel.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [atEnd, dry, digging, autoStarted]);

   const insight = ranked?.[current];

   return (
      <section className="space-y-2">
         <div className="flex items-center gap-1.5 px-2">
            <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
               <Sparkles className="size-3" />
               For you
            </h3>
            <div className="ml-auto flex items-center gap-0.5">
               <span className="mr-1 text-[11px] text-muted-foreground tabular-nums">
                  {!ranked ? "" : atEnd ? "More" : `${current + 1} of ${total}`}
               </span>
               <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Previous insight"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
               >
                  <ChevronLeft />
               </Button>
               <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Next insight"
                  disabled={!ranked || atEnd}
                  onClick={() => setPage(current + 1)}
               >
                  <ChevronRight />
               </Button>
            </div>
         </div>
         <div className="px-2">
            {!ranked ? (
               <Skeleton className="h-[26rem] rounded-xl" />
            ) : insight ? (
               <InsightCard
                  key={insight.id}
                  insight={insight}
                  onDismiss={() => hide(insight.id, insight.status)}
               />
            ) : (
               <EndOfList
                  digging={digging}
                  dry={dry}
                  empty={total === 0}
                  onFindMore={findMore}
                  onRestart={() => setPage(0)}
               />
            )}
         </div>
         <p className="px-2 text-[11px] text-muted-foreground">
            {analysis.topics.length
               ? `Related to ${analysis.topics
                    .slice(0, 2)
                    .map((t) => `#${t}`)
                    .join(" and ")}, drafted by AI from your governed models.`
               : "Drafted by AI from your governed models."}{" "}
            <Link
               to="/studio"
               className="font-medium text-primary hover:underline"
            >
               Open Studio
            </Link>
         </p>
      </section>
   );
}

function EndOfList({
   digging,
   dry,
   empty,
   onFindMore,
   onRestart,
}: {
   digging: boolean;
   dry: boolean;
   empty: boolean;
   onFindMore: () => void;
   onRestart: () => void;
}) {
   return (
      <Card className="min-h-[18rem] items-center justify-center gap-3 border-dashed p-6 text-center text-sm text-muted-foreground">
         {digging ? (
            <>
               <Loader2 className="size-5 animate-spin text-primary" />
               <p className="font-medium text-foreground">
                  Studio is looking for more like this
               </p>
               <p>Scanning the model for changes, anomalies and shifts.</p>
            </>
         ) : dry ? (
            <>
               <p className="font-medium text-foreground">
                  You're all caught up
               </p>
               <p>
                  Nothing new cleared the bar. Steer a run in Studio, or look
                  again.
               </p>
               <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                     <Link to="/studio">
                        <FlaskConical />
                        Open Studio
                     </Link>
                  </Button>
                  {!empty && (
                     <Button variant="ghost" size="sm" onClick={onRestart}>
                        <RotateCcw />
                        Back to first
                     </Button>
                  )}
               </div>
               <button
                  onClick={onFindMore}
                  className="text-xs underline-offset-2 hover:text-foreground hover:underline"
               >
                  Try another scan
               </button>
            </>
         ) : (
            <>
               <WandSparkles className="size-5 text-primary" />
               <p className="font-medium text-foreground">Keep going</p>
               <p>Ask Studio for more insights like the one you're reading.</p>
               <Button size="sm" onClick={onFindMore}>
                  <WandSparkles />
                  Find more like this
               </Button>
            </>
         )}
      </Card>
   );
}
