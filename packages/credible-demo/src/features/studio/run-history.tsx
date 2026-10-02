// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   CalendarClock,
   ChevronRight,
   CircleX,
   LoaderCircle,
   UserRound,
} from "lucide-react";
import { useState } from "react";
import { useAuthorName } from "@/components/people";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DETECTORS } from "@/data/insight-runs";
import type { InsightRun } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DroppedDrafts } from "./generate-panel";
import { ModelBadge } from "./meta";
import { formatDuration, RunSteps } from "./run-steps";

/** Every run, newest first; open one to see what it did, or filter to what it found. */
export function RunHistory({
   runs,
   selectedRunId,
   onShowRun,
}: {
   runs: InsightRun[] | undefined;
   selectedRunId: string | null;
   onShowRun: (runId: string) => void;
}) {
   const [open, setOpen] = useState<string | null>(null);
   const authorName = useAuthorName();

   return (
      <section>
         <div className="mb-3 flex items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Runs</h2>
            <span className="text-sm text-muted-foreground">
               Every scan, scheduled or by hand
            </span>
         </div>
         <Card className="gap-0 divide-y p-0">
            {!runs &&
               [0, 1, 2].map((i) => <Skeleton key={i} className="m-3 h-10" />)}
            {runs?.map((run) => {
               const expanded = open === run.id;
               const who =
                  run.trigger === "schedule"
                     ? run.startedBy === "ai"
                        ? "Scheduled"
                        : `Scheduled · run now by ${authorName(run.startedBy)}`
                     : `Manual · ${authorName(run.startedBy)}`;
               return (
                  <div
                     key={run.id}
                     className={cn(selectedRunId === run.id && "bg-accent/40")}
                  >
                     <div className="flex items-center gap-3 px-4 py-3">
                        <button
                           onClick={() => setOpen(expanded ? null : run.id)}
                           aria-expanded={expanded}
                           className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                           <ChevronRight
                              className={cn(
                                 "size-4 shrink-0 text-muted-foreground transition-transform",
                                 expanded && "rotate-90",
                              )}
                           />
                           <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                              {run.status === "running" ? (
                                 <LoaderCircle className="size-4 animate-spin text-primary" />
                              ) : run.status === "failed" ? (
                                 <CircleX className="size-4 text-negative" />
                              ) : run.trigger === "schedule" ? (
                                 <CalendarClock className="size-4 text-muted-foreground" />
                              ) : (
                                 <UserRound className="size-4 text-muted-foreground" />
                              )}
                           </span>
                           <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                 {run.recipe.focus
                                    ? `“${run.recipe.focus}”`
                                    : run.recipe.detectors
                                         .map((d) => DETECTORS[d].label)
                                         .join(", ")}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                 {who} · {relativeTime(run.startedAt)}
                                 {run.status !== "running" &&
                                    ` · ${formatDuration(run.durationMs)}`}
                                 {" · "}
                                 <span className="font-mono">
                                    {run.recipe.sources.length
                                       ? run.recipe.sources.join(", ")
                                       : "every source"}
                                 </span>
                              </span>
                           </span>
                        </button>
                        <ModelBadge
                           model={run.model}
                           className="hidden shrink-0 md:inline-flex"
                        />
                        <span className="hidden shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                           {run.status === "running"
                              ? "Running…"
                              : run.status === "failed"
                                ? "Failed"
                                : `${run.insightIds.length} kept${
                                     run.featuredIds.length
                                        ? ` · ${run.featuredIds.length} featured`
                                        : ""
                                  }`}
                        </span>
                        {run.insightIds.length > 0 && (
                           <Button
                              size="sm"
                              variant={
                                 selectedRunId === run.id
                                    ? "secondary"
                                    : "ghost"
                              }
                              className="h-7 shrink-0 text-xs"
                              onClick={() => onShowRun(run.id)}
                           >
                              {selectedRunId === run.id
                                 ? "Showing"
                                 : "Show findings"}
                           </Button>
                        )}
                     </div>
                     {expanded && (
                        <div className="px-4 pb-4 pl-[4.25rem]">
                           <RunSteps run={run} limit={60} />
                           {!!run.queries && (
                              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                                 {run.queries}{" "}
                                 {run.queries === 1 ? "query" : "queries"}
                                 {run.costUsd
                                    ? ` · $${run.costUsd.toFixed(2)} of model time`
                                    : ""}
                              </p>
                           )}
                           {!!run.dropped?.length && (
                              <DroppedDrafts dropped={run.dropped} />
                           )}
                        </div>
                     )}
                  </div>
               );
            })}
         </Card>
      </section>
   );
}
