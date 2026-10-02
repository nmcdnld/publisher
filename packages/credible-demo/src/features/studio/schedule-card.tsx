// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { CalendarClock, ChevronDown, Play, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
   Popover,
   PopoverContent,
   PopoverTrigger,
} from "@/components/ui/popover";
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
   useInsightSchedule,
   useRunScheduleNow,
   useSetInsightSchedule,
   useViewer,
} from "@/data/hooks";
import { DETECTORS, STUDIO_SOURCES } from "@/data/insight-runs";
import type {
   InsightCadence,
   InsightDetector,
   InsightRun,
   InsightSchedule,
} from "@/data/types";
import {
   describeNext,
   describeSchedule,
   nextOccurrence,
   WEEKDAYS,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { detectorIcon } from "./meta";
import { useNow } from "./run-steps";

type Draft = Omit<InsightSchedule, "updatedAt">;

const CADENCES: { id: InsightCadence; label: string }[] = [
   { id: "hourly", label: "Hourly" },
   { id: "daily", label: "Daily" },
   { id: "weekdays", label: "Weekdays" },
   { id: "weekly", label: "Weekly" },
];

const TIMES = Array.from({ length: 24 * 2 }, (_, i) => {
   const h = String(Math.floor(i / 2)).padStart(2, "0");
   return `${h}:${i % 2 ? "30" : "00"}`;
});
const MINUTES = ["00", "15", "30", "45"];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
   return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
         <span className="shrink-0 text-muted-foreground">{label}</span>
         <span className="min-w-0 text-right">{value}</span>
      </div>
   );
}

/**
 * When For you refreshes on its own, what it looks at, and what it may
 * feature, folded into a header button that says when it runs next.
 */
export function ScheduleMenu({
   running,
   onStarted,
}: {
   running: boolean;
   onStarted: (run: InsightRun) => void;
}) {
   const schedule = useInsightSchedule().data;
   const runNow = useRunScheduleNow();
   const [open, setOpen] = useState(false);
   const [editing, setEditing] = useState(false);
   useNow(true, 30_000);

   if (!schedule) return <Skeleton className="h-9 w-40 rounded-md" />;

   return (
      <>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button variant="outline">
                  <CalendarClock
                     className={cn(schedule.enabled && "text-primary")}
                  />
                  {schedule.enabled
                     ? `Next run ${describeNext(nextOccurrence(schedule))}`
                     : "Schedule paused"}
                  <ChevronDown className="text-muted-foreground" />
               </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4 p-4">
               <ScheduleDetails schedule={schedule} />
               <div className="flex gap-2">
                  <Button
                     variant="outline"
                     size="sm"
                     className="flex-1"
                     disabled={running || runNow.isPending}
                     onClick={() =>
                        runNow.mutate([], {
                           onSuccess: (run) => {
                              setOpen(false);
                              onStarted(run);
                              toast("Running the schedule now");
                           },
                        })
                     }
                  >
                     <Play />
                     Run now
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     className="flex-1"
                     onClick={() => {
                        setOpen(false);
                        setEditing(true);
                     }}
                  >
                     <Settings2 />
                     Edit schedule
                  </Button>
               </div>
            </PopoverContent>
         </Popover>

         <ScheduleDialog
            open={editing}
            onOpenChange={setEditing}
            schedule={schedule}
         />
      </>
   );
}

function ScheduleDetails({ schedule }: { schedule: InsightSchedule }) {
   const { recipe } = schedule;
   return (
      <>
         <div>
            <h2 className="text-sm font-semibold">Schedule</h2>
            <p className="text-xs text-muted-foreground">
               {schedule.enabled
                  ? `${describeSchedule(schedule)}. Its best findings are featured automatically; the rest wait here as candidates.`
                  : "Paused. For you only changes when you feature something."}
            </p>
         </div>

         <div className="space-y-2">
            <Row
               label="Looks for"
               value={recipe.detectors
                  .map((d) => DETECTORS[d].label.toLowerCase())
                  .join(", ")}
            />
            <Row
               label="In"
               value={
                  <span className="font-mono text-xs">
                     {recipe.sources.length
                        ? recipe.sources.join(", ")
                        : "every source"}
                  </span>
               }
            />
            {recipe.focus && <Row label="Steer" value={`“${recipe.focus}”`} />}
            <Row
               label="Features"
               value={
                  schedule.autoFeature === 0
                     ? "nothing; review by hand"
                     : `top ${schedule.autoFeature} scoring ${Math.round(schedule.minScore * 100)}+`
               }
            />
         </div>
      </>
   );
}

function ScheduleDialog({
   open,
   onOpenChange,
   schedule,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   schedule: InsightSchedule;
}) {
   const save = useSetInsightSchedule();
   const briefing = useViewer().data?.briefing;
   const [draft, setDraft] = useState<Draft>(schedule);
   const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
   const setRecipe = (patch: Partial<Draft["recipe"]>) =>
      set({ recipe: { ...draft.recipe, ...patch } });
   const off = !draft.enabled;

   return (
      <Dialog
         open={open}
         onOpenChange={(o) => {
            onOpenChange(o);
            if (o) setDraft(schedule);
         }}
      >
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>Insight schedule</DialogTitle>
               <DialogDescription>
                  A run on a timer, so For you is fresh before anyone opens it.
                  Its best findings are featured automatically; the rest wait
                  here as candidates.
               </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
               <div className="flex items-center justify-between">
                  <Label htmlFor="schedule-on">Run on a schedule</Label>
                  <Switch
                     id="schedule-on"
                     checked={draft.enabled}
                     onCheckedChange={(enabled) => set({ enabled })}
                  />
               </div>

               <div className={cn("space-y-5", off && "opacity-50")}>
                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                        <Label>Every</Label>
                        <Select
                           value={draft.cadence}
                           disabled={off}
                           onValueChange={(v) =>
                              set({ cadence: v as InsightCadence })
                           }
                        >
                           <SelectTrigger className="w-full">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {CADENCES.map((c) => (
                                 <SelectItem key={c.id} value={c.id}>
                                    {c.label}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                     {draft.cadence === "hourly" ? (
                        <div className="space-y-1.5">
                           <Label>At minute</Label>
                           <Select
                              value={draft.time.split(":")[1]}
                              disabled={off}
                              onValueChange={(m) =>
                                 set({
                                    time: `${draft.time.split(":")[0]}:${m}`,
                                 })
                              }
                           >
                              <SelectTrigger className="w-full">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 {MINUTES.map((m) => (
                                    <SelectItem key={m} value={m}>
                                       :{m}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                     ) : (
                        <div className="space-y-1.5">
                           <Label>At</Label>
                           <Select
                              value={
                                 TIMES.includes(draft.time)
                                    ? draft.time
                                    : "06:00"
                              }
                              disabled={off}
                              onValueChange={(time) => set({ time })}
                           >
                              <SelectTrigger className="w-full">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                 {TIMES.map((t) => (
                                    <SelectItem key={t} value={t}>
                                       {t}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                     )}
                     {draft.cadence === "weekly" && (
                        <div className="col-span-2 space-y-1.5">
                           <Label>On</Label>
                           <Select
                              value={String(draft.weekday)}
                              disabled={off}
                              onValueChange={(d) => set({ weekday: Number(d) })}
                           >
                              <SelectTrigger className="w-full">
                                 <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                 {WEEKDAYS.map((d, i) => (
                                    <SelectItem key={d} value={String(i)}>
                                       {d}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </div>
                     )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                     <Label>Look for</Label>
                     <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        disabled={off}
                        value={draft.recipe.detectors}
                        onValueChange={(v) =>
                           setRecipe({ detectors: v as InsightDetector[] })
                        }
                        className="flex-wrap"
                     >
                        {(Object.keys(DETECTORS) as InsightDetector[]).map(
                           (d) => {
                              const Icon = detectorIcon[d];
                              return (
                                 <ToggleGroupItem
                                    key={d}
                                    value={d}
                                    className="gap-1.5 px-2.5 text-xs"
                                 >
                                    <Icon className="size-3.5" />
                                    {DETECTORS[d].label}
                                 </ToggleGroupItem>
                              );
                           },
                        )}
                     </ToggleGroup>
                  </div>
                  <div className="space-y-1.5">
                     <Label>
                        In{" "}
                        <span className="font-normal text-muted-foreground">
                           {draft.recipe.sources.length === 0
                              ? "· every source"
                              : ""}
                        </span>
                     </Label>
                     <ToggleGroup
                        type="multiple"
                        variant="outline"
                        size="sm"
                        disabled={off}
                        value={draft.recipe.sources}
                        onValueChange={(sources) => setRecipe({ sources })}
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
                  <div className="space-y-1.5">
                     <Label htmlFor="schedule-focus">
                        Standing steer{" "}
                        <span className="font-normal text-muted-foreground">
                           (optional)
                        </span>
                     </Label>
                     <Textarea
                        id="schedule-focus"
                        rows={2}
                        disabled={off}
                        value={draft.recipe.focus}
                        onChange={(e) => setRecipe({ focus: e.target.value })}
                        placeholder="e.g. keep an eye on returns and shipping"
                        className="resize-none"
                     />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                        <Label>Feature automatically</Label>
                        <Select
                           value={String(draft.autoFeature)}
                           disabled={off}
                           onValueChange={(n) =>
                              set({ autoFeature: Number(n) })
                           }
                        >
                           <SelectTrigger className="w-full">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="0">
                                 None, I'll review
                              </SelectItem>
                              {[1, 2, 3, 5].map((n) => (
                                 <SelectItem key={n} value={String(n)}>
                                    Top {n}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-1.5">
                        <Label>Only if they score</Label>
                        <Select
                           value={String(draft.minScore)}
                           disabled={off || draft.autoFeature === 0}
                           onValueChange={(s) => set({ minScore: Number(s) })}
                        >
                           <SelectTrigger className="w-full">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {[0.5, 0.6, 0.7, 0.8].map((s) => (
                                 <SelectItem key={s} value={String(s)}>
                                    {Math.round(s * 100)} or more
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                     <Label
                        htmlFor="schedule-notify"
                        className="flex-col items-start gap-0.5"
                     >
                        <span>Tell me when it features something</span>
                        <span className="text-xs font-normal text-muted-foreground">
                           {briefing?.destination
                              ? `Posts to ${briefing.destination}`
                              : "Posts to your briefing channel"}
                        </span>
                     </Label>
                     <Switch
                        id="schedule-notify"
                        disabled={off}
                        checked={draft.notify}
                        onCheckedChange={(notify) => set({ notify })}
                     />
                  </div>
               </div>
            </div>

            <DialogFooter className="items-center sm:justify-between">
               <span className="text-xs text-muted-foreground">
                  {draft.enabled
                     ? `${describeSchedule(draft)} · next ${describeNext(nextOccurrence(draft))}`
                     : "Paused"}
               </span>
               <Button
                  disabled={
                     save.isPending ||
                     (draft.enabled && draft.recipe.detectors.length === 0)
                  }
                  onClick={() =>
                     save.mutate([draft], {
                        onSuccess: (saved) => {
                           onOpenChange(false);
                           toast.success(
                              saved.enabled
                                 ? `Scheduled: ${describeSchedule(saved).toLowerCase()}`
                                 : "Schedule paused",
                           );
                        },
                     })
                  }
               >
                  Save schedule
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
