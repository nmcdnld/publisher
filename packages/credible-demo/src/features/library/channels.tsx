// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Button } from "@/components/ui/button";
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle
} from "@/components/ui/dialog";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFollowTopic, useSetBriefing, useViewer } from "@/data/hooks";
import type { BriefingSubscription, Topic } from "@/data/types";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Hash, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** A channel id, `following` for every channel the viewer follows, or null for all. */
export type Channel = string | null;
export const FOLLOWING = "following";

const Count = ({ children }: { children: React.ReactNode }) => (
   <span className="text-xs text-muted-foreground tabular-nums">
      {children}
   </span>
);

export function ChannelPicker({
   topics,
   followed,
   counts,
   value,
   onChange,
}: {
   topics: Topic[];
   followed: Set<string>;
   /** How many entries each channel holds under the other filters. */
   counts: Map<string, number>;
   value: Channel;
   onChange: (channel: Channel) => void;
}) {
   const label =
      value === FOLLOWING
         ? "Following"
         : value
            ? `#${topics.find((t) => t.id === value)?.label ?? value}`
            : "All channels";
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button
               variant="outline"
               size="sm"
               className={cn(value && "border-primary bg-primary/10")}
            >
               <Hash />
               {label}
               <ChevronDown className="text-muted-foreground" />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuRadioGroup
               value={value ?? "all"}
               onValueChange={(v) => onChange(v === "all" ? null : v)}
            >
               <DropdownMenuRadioItem value="all">
                  All channels
               </DropdownMenuRadioItem>
               <DropdownMenuRadioItem value={FOLLOWING}>
                  <span className="flex-1">Channels I follow</span>
                  <Count>{followed.size}</Count>
               </DropdownMenuRadioItem>
               <DropdownMenuSeparator />
               <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Channels
               </DropdownMenuLabel>
               {topics.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id}>
                     <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                           #{t.label}
                           {followed.has(t.id) && (
                              <Check className="size-3 text-primary" />
                           )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                           {t.description}
                        </span>
                     </span>
                     <Count>{counts.get(t.id) ?? 0}</Count>
                  </DropdownMenuRadioItem>
               ))}
            </DropdownMenuRadioGroup>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

export function FollowButton({
   topicId,
   followed,
}: {
   topicId: string;
   followed: boolean;
}) {
   const follow = useFollowTopic();
   return (
      <Button
         size="sm"
         variant={followed ? "secondary" : "outline"}
         disabled={follow.isPending}
         onClick={() => follow.mutate([topicId, !followed])}
      >
         {followed ? <Check /> : <Plus />}
         {followed ? "Following" : "Follow"}
      </Button>
   );
}

/** Above the entries while a channel is picked: what it is, and following it. */
export function ChannelHeader({
   channel,
   topics,
   followed,
   count,
   onChange,
}: {
   channel: string;
   topics: Topic[];
   followed: Set<string>;
   /** Unset while the entries are still loading. */
   count?: number;
   onChange: (channel: Channel) => void;
}) {
   if (channel === FOLLOWING) {
      const mine = topics.filter((t) => followed.has(t.id));
      return (
         <div className="rounded-xl border bg-gradient-to-br from-accent to-card p-5">
            <h2 className="text-xl font-semibold tracking-tight">
               Channels you follow
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
               {mine.length
                  ? "What's posted to these shows up here and in your daily briefing."
                  : "You don't follow any channels yet. Pick one from Channels to follow it."}
            </p>
            {mine.length > 0 && (
               <div className="mt-3 flex flex-wrap gap-1.5">
                  {mine.map((t) => (
                     <button
                        key={t.id}
                        onClick={() => onChange(t.id)}
                        className="rounded-full border bg-card px-2.5 py-0.5 text-xs hover:bg-muted"
                     >
                        #{t.label}
                     </button>
                  ))}
               </div>
            )}
         </div>
      );
   }
   const topic = topics.find((t) => t.id === channel);
   return (
      <div className="rounded-xl border bg-gradient-to-br from-accent to-card p-5">
         <div className="flex items-start justify-between gap-3">
            <div>
               <h2 className="text-xl font-semibold tracking-tight">
                  #{topic?.label ?? channel}
               </h2>
               {topic?.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                     {topic.description}
                  </p>
               )}
            </div>
            <FollowButton topicId={channel} followed={followed.has(channel)} />
         </div>
         {count !== undefined && (
            <p className="mt-3 text-xs text-muted-foreground">
               {count} item{count === 1 ? "" : "s"}
            </p>
         )}
      </div>
   );
}

export function BriefingDialog() {
   const viewer = useViewer().data;
   const setBriefing = useSetBriefing();
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState<BriefingSubscription | null>(null);
   const current = viewer?.briefing;
   const form = draft ?? current;

   return (
      <Dialog
         open={open}
         onOpenChange={(o) => {
            setOpen(o);
            if (o) setDraft(current ?? null);
         }}
      >
         {/* <DialogTrigger asChild>
            <Button
               variant={current?.enabled ? "secondary" : "outline"}
               title={
                  current?.enabled
                     ? `Daily briefing to ${current.channel === "slack" ? current.destination : "email"} at ${current.time}`
                     : "Get a daily briefing"
               }
            >
               <BellRing />
               {current?.enabled ? `Briefing · ${current.time}` : "Briefing"}
            </Button>
         </DialogTrigger> */}
         {form && (
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Daily briefing</DialogTitle>
                  <DialogDescription>
                     Every morning, the top posts from the channels you follow,
                     sent where you already work.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <Label htmlFor="briefing-on">
                        Send me this every morning
                     </Label>
                     <Switch
                        id="briefing-on"
                        checked={form.enabled}
                        onCheckedChange={(enabled) =>
                           setDraft({ ...form, enabled })
                        }
                     />
                  </div>
                  <div
                     className={cn(
                        "grid grid-cols-2 gap-3",
                        !form.enabled && "opacity-50",
                     )}
                  >
                     <div className="space-y-1.5">
                        <Label>Send to</Label>
                        <Select
                           value={form.channel}
                           disabled={!form.enabled}
                           onValueChange={(channel) =>
                              setDraft({
                                 ...form,
                                 channel:
                                    channel as BriefingSubscription["channel"],
                                 destination:
                                    channel === "slack"
                                       ? "#growth-daily"
                                       : "alex@credible.dev",
                              })
                           }
                        >
                           <SelectTrigger className="w-full">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="slack">Slack</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                           </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-1.5">
                        <Label>Time</Label>
                        <Select
                           value={form.time}
                           disabled={!form.enabled}
                           onValueChange={(time) => setDraft({ ...form, time })}
                        >
                           <SelectTrigger className="w-full">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {[
                                 "07:00",
                                 "07:30",
                                 "08:00",
                                 "08:30",
                                 "09:00",
                              ].map((t) => (
                                 <SelectItem key={t} value={t}>
                                    {t}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                     <div className="col-span-2 space-y-1.5">
                        <Label htmlFor="briefing-dest">
                           {form.channel === "slack"
                              ? "Slack channel"
                              : "Email address"}
                        </Label>
                        <Input
                           id="briefing-dest"
                           value={form.destination}
                           disabled={!form.enabled}
                           onChange={(e) =>
                              setDraft({ ...form, destination: e.target.value })
                           }
                        />
                     </div>
                  </div>
               </div>
               <DialogFooter>
                  <Button
                     disabled={setBriefing.isPending}
                     onClick={() =>
                        setBriefing.mutate([form], {
                           onSuccess: () => {
                              setOpen(false);
                              toast.success(
                                 form.enabled
                                    ? `Briefing scheduled for ${form.time} every morning`
                                    : "Daily briefing turned off",
                              );
                           },
                        })
                     }
                  >
                     Save
                  </Button>
               </DialogFooter>
            </DialogContent>
         )}
      </Dialog>
   );
}
