// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowRight,
   ChevronDown,
   LoaderCircle,
   WandSparkles,
   X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
   Popover,
   PopoverContent,
   PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStartInsightRun } from "@/data/hooks";
import { DETECTORS, STUDIO_SOURCES } from "@/data/insight-runs";
import type { InsightDetector, InsightRecipe, InsightRun } from "@/data/types";
import { cn } from "@/lib/utils";
import { showsPackage, useWorkspaces } from "@/lib/workspaces";
import { detectorIcon, ModelBadge, useGeneratorModel } from "./meta";
import { RunSteps } from "./run-steps";

const ALL_DETECTORS = Object.keys(DETECTORS) as InsightDetector[];

const STEERS = [
   "anything unusual in cancellations",
   "what changed in margin",
   "which customers are driving growth",
];

/**
 * The Studio's primary action: one press finds one new insight, written with
 * the Studio's existing insights as context so it adds something they don't.
 * What to look for, and where, sits behind the chevron.
 */
export function GenerateButton({
   running,
   onStarted,
}: {
   /** A run is in flight, manual or scheduled. */
   running: boolean;
   onStarted: (run: InsightRun) => void;
}) {
   const [recipe, setRecipe] = useState<InsightRecipe>({
      focus: "",
      sources: [],
      detectors: ALL_DETECTORS,
   });
   const start = useStartInsightRun();
   const generator = useGeneratorModel();
   const storefront = showsPackage(useWorkspaces().active, "storefront");
   const busy = running || start.isPending;
   const customized =
      !!recipe.focus.trim() ||
      recipe.sources.length > 0 ||
      recipe.detectors.length < ALL_DETECTORS.length;

   return (
      <div className="flex">
         <Button
            className="rounded-r-none"
            disabled={busy || recipe.detectors.length === 0}
            onClick={() => start.mutate([recipe], { onSuccess: onStarted })}
         >
            {busy ? (
               <LoaderCircle className="animate-spin" />
            ) : (
               <WandSparkles />
            )}
            {busy ? "Generating…" : "Generate insight"}
         </Button>
         <Popover>
            <PopoverTrigger asChild>
               <Button
                  size="icon"
                  className="relative rounded-l-none border-l border-primary-foreground/20"
                  aria-label="Generation settings"
               >
                  <ChevronDown />
                  {customized && (
                     <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary-foreground" />
                  )}
               </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[26rem] space-y-4 p-4">
               <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                     <h2 className="text-sm font-semibold">What to look for</h2>
                     {generator && <ModelBadge model={generator} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                     Each press adds one candidate, chosen to cover ground the
                     insights you already have don't. Every number is computed
                     from a query and every chart reads only query results.
                  </p>
               </div>

               <div className="space-y-1.5">
                  <Label htmlFor="studio-focus">
                     Steer the analyst{" "}
                     <span className="font-normal text-muted-foreground">
                        (optional)
                     </span>
                  </Label>
                  <Textarea
                     id="studio-focus"
                     rows={2}
                     value={recipe.focus}
                     onChange={(e) =>
                        setRecipe({ ...recipe, focus: e.target.value })
                     }
                     placeholder="e.g. anything unusual in returns or shipping"
                     className="resize-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                     {(storefront ? STEERS : []).map((s) => (
                        <button
                           key={s}
                           onClick={() => setRecipe({ ...recipe, focus: s })}
                           className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                        >
                           {s}
                        </button>
                     ))}
                  </div>
               </div>

               <div className="space-y-1.5">
                  <Label>Kinds of finding</Label>
                  <ToggleGroup
                     type="multiple"
                     variant="outline"
                     size="sm"
                     value={recipe.detectors}
                     onValueChange={(v) =>
                        setRecipe({
                           ...recipe,
                           detectors: v as InsightDetector[],
                        })
                     }
                     className="flex-wrap"
                  >
                     {ALL_DETECTORS.map((d) => {
                        const Icon = detectorIcon[d];
                        return (
                           <Tooltip key={d}>
                              <TooltipTrigger asChild>
                                 <ToggleGroupItem
                                    value={d}
                                    className="gap-1.5 px-2.5 text-xs"
                                 >
                                    <Icon className="size-3.5" />
                                    {DETECTORS[d].label}
                                 </ToggleGroupItem>
                              </TooltipTrigger>
                              <TooltipContent>
                                 {DETECTORS[d].description}
                              </TooltipContent>
                           </Tooltip>
                        );
                     })}
                  </ToggleGroup>
                  {recipe.detectors.length === 0 && (
                     <p className="text-xs text-negative">
                        Pick at least one kind of finding.
                     </p>
                  )}
               </div>

               {storefront && (
                  <div className="space-y-1.5">
                     <Label>
                        In{" "}
                        <span className="font-normal text-muted-foreground">
                           {recipe.sources.length === 0 ? "· every source" : ""}
                        </span>
                     </Label>
                     <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        value={recipe.sources}
                        onValueChange={(sources) =>
                           setRecipe({ ...recipe, sources })
                        }
                        className="flex-wrap"
                     >
                        {STUDIO_SOURCES.map((s) => (
                           <ToggleGroupItem
                              key={s.name}
                              value={s.name}
                              className="px-2.5 font-mono text-xs"
                           >
                              {s.name}
                           </ToggleGroupItem>
                        ))}
                     </ToggleGroup>
                  </div>
               )}

               {generator === "scripted" && (
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                     This Worker has no{" "}
                     <code className="font-mono">OPENROUTER_API_KEY</code>, so a
                     scripted planner runs real queries, writes its own chart
                     specs, and goes through the same checks. Set the key to
                     generate with Claude Opus 5.5.
                  </p>
               )}
            </PopoverContent>
         </Popover>
      </div>
   );
}

/**
 * The run in flight, or the one that just ended, in the slot at the top of the
 * insight list where its finding will land.
 */
export function RunCard({
   run,
   onReview,
   onClose,
}: {
   run: InsightRun;
   onReview: (run: InsightRun) => void;
   onClose: () => void;
}) {
   const running = run.status === "running";
   const kept = run.insightIds.length;
   const title = running
      ? run.trigger === "schedule"
         ? "Running the schedule"
         : "Finding a new insight"
      : run.status === "failed"
        ? "The run failed"
        : kept
          ? `Found ${kept} ${kept === 1 ? "finding" : "findings"}`
          : "Nothing new this time";

   return (
      <div
         className={cn(
            "rounded-xl border bg-card p-3",
            running && "border-dashed border-primary/40 bg-primary/[0.03]",
         )}
      >
         <div className="mb-3 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
               <span className="truncate text-sm font-medium">{title}</span>
               {run.model && <ModelBadge model={run.model} />}
            </span>
            {!running && (
               <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                  aria-label="Hide run"
               >
                  <X />
               </Button>
            )}
         </div>
         <RunSteps run={run} limit={running ? 4 : 2} />
         {run.status === "done" &&
            (kept > 0 ? (
               <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => onReview(run)}
               >
                  Review {kept === 1 ? "it" : `all ${kept}`}
                  <ArrowRight />
               </Button>
            ) : (
               <p className="mt-3 text-xs text-muted-foreground">
                  Nothing new cleared the bar. Try another kind of finding, more
                  sources, or a different steer.
               </p>
            ))}
         {run.status === "done" && !!run.dropped?.length && (
            <DroppedDrafts dropped={run.dropped} />
         )}
      </div>
   );
}

/** Drafts the checks threw out, so a thin run explains itself. */
export function DroppedDrafts({
   dropped,
}: {
   dropped: NonNullable<InsightRun["dropped"]>;
}) {
   return (
      <details className="mt-3 text-xs text-muted-foreground">
         <summary className="cursor-pointer select-none">
            {dropped.length} {dropped.length === 1 ? "draft" : "drafts"} failed
            the checks and {dropped.length === 1 ? "was" : "were"} dropped
         </summary>
         <ul className="mt-2 space-y-2">
            {dropped.map((d, i) => (
               <li key={i}>
                  <span className="text-foreground">{d.headline}</span>
                  <ul className="mt-0.5 list-disc pl-4">
                     {d.issues.map((issue, j) => (
                        <li key={j}>{issue}</li>
                     ))}
                  </ul>
               </li>
            ))}
         </ul>
      </details>
   );
}
