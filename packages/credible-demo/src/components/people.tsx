// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthorId, Person } from "@/data/types";
import { usePeople, useViewer } from "@/data/hooks";
import { cn } from "@/lib/utils";

const hueClass: Record<Person["hue"], string> = {
   1: "bg-chart-1/15 text-chart-1",
   2: "bg-chart-2/15 text-chart-2",
   3: "bg-chart-3/20 text-chart-3",
   4: "bg-chart-4/15 text-chart-4",
   5: "bg-chart-5/15 text-chart-5",
};

export function PersonAvatar({
   person,
   className,
}: {
   person: Person;
   className?: string;
}) {
   return (
      <Avatar className={cn("size-7", className)}>
         <AvatarFallback
            className={cn("text-[10px] font-semibold", hueClass[person.hue])}
         >
            {person.initials}
         </AvatarFallback>
      </Avatar>
   );
}

export function AiAvatar({ className }: { className?: string }) {
   return (
      <Avatar className={cn("size-7", className)}>
         <AvatarFallback className="bg-primary text-primary-foreground">
            <Sparkles className="size-3.5" />
         </AvatarFallback>
      </Avatar>
   );
}

/** Overlapping faces of colleagues who opened something: social proof. */
export function AvatarStack({ ids, max = 4 }: { ids: string[]; max?: number }) {
   const { byId } = usePeople();
   const shown = ids.slice(0, max).flatMap((id) => byId.get(id) ?? []);
   return (
      <div className="flex -space-x-1.5">
         {shown.map((p) => (
            <Tooltip key={p.id}>
               <TooltipTrigger asChild>
                  <span className="rounded-full bg-card ring-2 ring-card">
                     <PersonAvatar person={p} className="size-6" />
                  </span>
               </TooltipTrigger>
               <TooltipContent>{p.name}</TooltipContent>
            </Tooltip>
         ))}
         {ids.length > max && (
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card">
               +{ids.length - max}
            </span>
         )}
      </div>
   );
}

export function useAuthorName() {
   const { byId } = usePeople();
   const viewer = useViewer().data;
   return (id: AuthorId) => {
      if (id === "ai") return "Credible AI";
      if (id === viewer?.person.id) return "You";
      return byId.get(id)?.name ?? "Someone";
   };
}

export function Byline({
   authorId,
   authorName,
   suffix,
   className,
}: {
   authorId: AuthorId;
   /** Shown when this app doesn't know the author, as for a file someone else wrote. */
   authorName?: string;
   suffix?: React.ReactNode;
   className?: string;
}) {
   const { byId } = usePeople();
   const known = useAuthorName()(authorId);
   const person = authorId === "ai" ? undefined : byId.get(authorId);
   const name = person || authorId === "ai" || !authorName ? known : authorName;
   return (
      <div className={cn("flex min-w-0 items-center gap-2 text-sm", className)}>
         {person ? (
            <PersonAvatar person={person} className="size-6" />
         ) : (
            <AiAvatar className="size-6" />
         )}
         <span className="font-medium">{name}</span>
         {suffix && (
            <span className="truncate text-muted-foreground">{suffix}</span>
         )}
      </div>
   );
}
