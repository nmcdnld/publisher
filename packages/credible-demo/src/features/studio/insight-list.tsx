// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Star } from "lucide-react";
import { DeltaBadge } from "@/components/delta-badge";
import { Glance } from "@/components/glance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetInsightStatus } from "@/data/hooks";
import type { StudioInsight } from "@/data/types";
import { deltaTone, formatValue, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DetectorBadge, ScoreMeter, STATUS_LABEL, StatusDot } from "./meta";

const toneText = {
   good: "text-positive",
   bad: "text-negative",
   flat: "text-muted-foreground",
} as const;

export function InsightList({
   insights,
   selectedId,
   onSelect,
   empty,
}: {
   insights: StudioInsight[] | undefined;
   selectedId: string | undefined;
   onSelect: (id: string) => void;
   empty: React.ReactNode;
}) {
   if (!insights) {
      return (
         <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
               <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
         </div>
      );
   }
   if (insights.length === 0) {
      return (
         <Card className="items-center p-8 text-center text-sm text-muted-foreground">
            {empty}
         </Card>
      );
   }
   return (
      <ul className="space-y-2" role="listbox" aria-label="Insights">
         {insights.map((i) => (
            <InsightRow
               key={i.id}
               insight={i}
               selected={i.id === selectedId}
               onSelect={() => onSelect(i.id)}
            />
         ))}
      </ul>
   );
}

function InsightRow({
   insight,
   selected,
   onSelect,
}: {
   insight: StudioInsight;
   selected: boolean;
   onSelect: () => void;
}) {
   const setStatus = useSetInsightStatus();
   const featured = insight.status === "featured";
   const { metric } = insight;

   return (
      <li
         role="option"
         aria-selected={selected}
         className={cn(
            "group relative rounded-xl border bg-card p-3 transition-[border-color,box-shadow]",
            selected
               ? "border-primary/50 ring-2 ring-primary/15"
               : "hover:border-foreground/15",
            insight.status === "dismissed" && !selected && "opacity-60",
         )}
      >
         <button
            onClick={onSelect}
            className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={insight.headline}
         />
         <div className="pointer-events-none relative flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
               <div className="flex items-center gap-2">
                  <DetectorBadge detector={insight.detector} />
                  <span className="text-[11px] text-muted-foreground">
                     {relativeTime(insight.generatedAt)}
                  </span>
               </div>
               <p className="line-clamp-2 text-sm leading-snug font-medium">
                  {insight.headline}
               </p>
               <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold tabular-nums">
                     {formatValue(metric.value, metric.format, {
                        compact: metric.format === "currency",
                     })}
                  </span>
                  <DeltaBadge delta={insight.delta} />
               </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
               <Glance
                  metric={metric}
                  className={cn("h-7 w-14", toneText[deltaTone(insight.delta)])}
               />
               <ScoreMeter score={insight.score} />
            </div>
         </div>
         <div className="relative mt-2 flex items-center justify-between border-t pt-2">
            <span className="pointer-events-none inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
               <StatusDot status={insight.status} />
               {STATUS_LABEL[insight.status]}
            </span>
            <Button
               variant="ghost"
               size="xs"
               disabled={setStatus.isPending}
               onClick={() =>
                  setStatus.mutate([
                     insight.id,
                     featured ? "candidate" : "featured",
                  ])
               }
               className={cn(
                  "text-[11px]",
                  !featured &&
                     !selected &&
                     "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
               )}
            >
               <Star className={cn(featured && "fill-current text-primary")} />
               {featured ? "Featured" : "Feature"}
            </Button>
         </div>
      </li>
   );
}
