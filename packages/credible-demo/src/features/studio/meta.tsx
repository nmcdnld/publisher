// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import {
   Activity,
   ChartPie,
   Cpu,
   Sparkles,
   Split,
   TrendingUp,
   type LucideIcon,
} from "lucide-react";
import { INSIGHT_MODEL, modelLabel } from "@/analyst/insights";
import { DETECTORS } from "@/data/insight-runs";
import type { InsightDetector, InsightStatus } from "@/data/types";
import { cn } from "@/lib/utils";

export const detectorIcon: Record<InsightDetector, LucideIcon> = {
   change: TrendingUp,
   anomaly: Activity,
   mix: ChartPie,
   driver: Split,
};

export function DetectorBadge({
   detector,
   className,
}: {
   detector: InsightDetector;
   className?: string;
}) {
   const Icon = detectorIcon[detector];
   return (
      <span
         className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground",
            className,
         )}
      >
         <Icon className="size-3" />
         {DETECTORS[detector].one}
      </span>
   );
}

/** Who wrote a run: the model, the keyless scripted planner, or canned samples. */
export function ModelBadge({
   model,
   className,
}: {
   model: string | undefined;
   className?: string;
}) {
   const isModel = model === INSIGHT_MODEL;
   const Icon = isModel ? Sparkles : Cpu;
   return (
      <span
         title={model}
         className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            isModel
               ? "border-primary/30 bg-primary/5 text-primary"
               : "text-muted-foreground",
            className,
         )}
      >
         <Icon className="size-3" />
         {modelLabel(model)}
      </span>
   );
}

/** What a new run will be written by here: Opus when the Worker has a key. */
export function useGeneratorModel() {
   return useQuery({
      queryKey: ["analyst", "config"],
      queryFn: async () => {
         const r = await fetch("/api/analyst/config");
         if (!r.ok) return "sample";
         const c = (await r.json()) as { mode?: string; insightModel?: string };
         return c.mode === "model"
            ? (c.insightModel ?? INSIGHT_MODEL)
            : "scripted";
      },
      staleTime: 5 * 60_000,
      retry: false,
   }).data;
}

export const STATUS_LABEL: Record<InsightStatus, string> = {
   featured: "In For you",
   candidate: "Candidate",
   dismissed: "Dismissed",
};

export function StatusDot({ status }: { status: InsightStatus }) {
   return (
      <span
         aria-hidden
         className={cn(
            "inline-block size-1.5 shrink-0 rounded-full",
            status === "featured" && "bg-primary",
            status === "candidate" && "bg-amber-500",
            status === "dismissed" && "bg-muted-foreground/40",
         )}
      />
   );
}

/** The run's 0-1 score as five pips and a number, so candidates compare at a glance. */
export function ScoreMeter({
   score,
   className,
}: {
   score: number;
   className?: string;
}) {
   const filled = Math.round(score * 5);
   return (
      <span
         className={cn("inline-flex items-center gap-1.5", className)}
         title={`Score ${Math.round(score * 100)} of 100`}
      >
         <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
               <span
                  key={i}
                  className={cn(
                     "h-2.5 w-1 rounded-full",
                     i < filled ? "bg-primary" : "bg-muted-foreground/20",
                  )}
               />
            ))}
         </span>
         <span className="text-[11px] text-muted-foreground tabular-nums">
            {Math.round(score * 100)}
         </span>
      </span>
   );
}
