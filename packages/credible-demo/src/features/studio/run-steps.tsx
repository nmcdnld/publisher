// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Check, CircleX, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import type { InsightRun } from "@/data/types";
import { cn } from "@/lib/utils";

/** The current time, re-read every `ms` while `active`. */
export function useNow(active: boolean, ms = 250): number {
   const [now, setNow] = useState(Date.now);
   useEffect(() => {
      if (!active) return;
      const id = setInterval(() => setNow(Date.now()), ms);
      return () => clearInterval(id);
   }, [active, ms]);
   return active ? now : Date.now();
}

export function formatDuration(ms: number): string {
   const s = Math.round(ms / 1000);
   return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Each step the run reported, ticked off as its time passes. A live run's
 * steps arrive as it works, so its latest one stays active until it ends.
 */
export function RunSteps({
   run,
   limit = 7,
   className,
}: {
   run: InsightRun;
   /** Show only the latest steps, with a count of the rest. */
   limit?: number;
   className?: string;
}) {
   const running = run.status === "running";
   const live = run.engine === "live";
   const now = useNow(running);
   const elapsed = running
      ? now - Date.parse(run.startedAt)
      : Number.POSITIVE_INFINITY;
   const pct = running
      ? Math.min(live ? 95 : 98, (elapsed / run.durationMs) * 100)
      : 100;
   const hidden = Math.max(0, run.steps.length - limit);

   return (
      <div className={cn("space-y-3", className)}>
         {running && <Progress value={pct} className="h-1" />}
         <ol className="space-y-2">
            {hidden > 0 && (
               <li className="pl-6.5 text-xs text-muted-foreground">
                  {hidden} earlier {hidden === 1 ? "step" : "steps"}
               </li>
            )}
            {run.steps.map((step, i) => {
               if (i < hidden) return null;
               const next =
                  run.steps[i + 1]?.at ??
                  (live && running ? Number.POSITIVE_INFINITY : run.durationMs);
               const failedHere =
                  run.status === "failed" && i === run.steps.length - 1;
               const state = failedHere
                  ? "failed"
                  : elapsed >= next
                    ? "done"
                    : elapsed >= step.at
                      ? "active"
                      : "pending";
               return (
                  <li
                     key={i}
                     className={cn(
                        "flex items-start gap-2.5 text-sm transition-opacity",
                        state === "pending" && "opacity-40",
                     )}
                  >
                     <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                        {state === "done" && (
                           <Check className="size-3.5 text-positive" />
                        )}
                        {state === "active" && (
                           <LoaderCircle className="size-3.5 animate-spin text-primary" />
                        )}
                        {state === "failed" && (
                           <CircleX className="size-3.5 text-negative" />
                        )}
                        {state === "pending" && (
                           <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                        )}
                     </span>
                     <span className="min-w-0">
                        <span className="block leading-tight">
                           {step.label}
                        </span>
                        {step.detail && state !== "pending" && (
                           <span className="block text-xs text-muted-foreground tabular-nums">
                              {step.detail}
                           </span>
                        )}
                     </span>
                  </li>
               );
            })}
         </ol>
         {run.error && (
            <p className="rounded-md bg-negative/10 px-3 py-2 text-xs text-negative">
               {run.error}
            </p>
         )}
      </div>
   );
}
