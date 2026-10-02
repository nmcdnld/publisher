// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Check, ChevronDown, Sparkles, TriangleAlert } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
   chatModels,
   contextSegments,
   formatTokens,
   resolveModel,
   type ChatModel,
   type ContextUsage,
} from "@/data/models";
import { cn } from "@/lib/utils";
import { Kbd } from "./mention-menu";

/** Above this share of the window, older turns are summarized to make room. */
const WARN_AT = 0.75;

function tone(share: number) {
   if (share > 1) return "text-destructive";
   if (share > WARN_AT) return "text-chart-3";
   return "text-muted-foreground";
}

/** How full the context window is, as a ring. */
export function ContextRing({
   share,
   className,
}: {
   share: number;
   className?: string;
}) {
   const r = 6;
   const c = 2 * Math.PI * r;
   const shown = Math.min(1, Math.max(share, 0.02));
   return (
      <svg
         viewBox="0 0 16 16"
         className={cn("size-3.5 -rotate-90", tone(share), className)}
         aria-hidden
      >
         <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth="2.5"
         />
         <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray={`${shown * c} ${c}`}
            strokeLinecap="round"
         />
      </svg>
   );
}

const percent = (share: number) =>
   share < 0.01 && share > 0 ? "<1%" : `${Math.round(share * 100)}%`;

export function ModelPicker({
   value,
   onChange,
   usage,
   open,
   onOpenChange,
   onDone,
}: {
   value: string;
   onChange: (id: string) => void;
   usage: ContextUsage;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   /** Takes focus back when the menu closes. */
   onDone: () => void;
}) {
   const resolved = resolveModel(value);
   const share = usage.total / resolved.window;

   return (
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
         <DropdownMenuTrigger asChild>
            <button
               type="button"
               className="inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
               aria-label={`Model: ${resolved.label}, ${percent(share)} of context used`}
            >
               <ContextRing share={share} />
               <span className="truncate">{resolved.label}</span>
               <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent
            align="start"
            collisionPadding={12}
            className="w-[23rem] p-0"
            onCloseAutoFocus={(e) => {
               e.preventDefault();
               onDone();
            }}
         >
            <div className="p-1">
               <DropdownMenuLabel className="flex items-center justify-between text-xs font-normal text-muted-foreground">
                  Model
                  <span>
                     <Kbd>⌘</Kbd>
                     <Kbd>/</Kbd>
                  </span>
               </DropdownMenuLabel>
               <DropdownMenuPrimitive.RadioGroup
                  value={resolved.id}
                  onValueChange={onChange}
               >
                  {chatModels.map((m) => (
                     <ModelItem
                        key={m.id}
                        value={m.id}
                        label={m.label}
                        icon={
                           m.house ? (
                              <Sparkles className="size-3.5 text-primary" />
                           ) : undefined
                        }
                        description={m.description}
                        share={usage.total / m.window}
                        window={m.window}
                     />
                  ))}
               </DropdownMenuPrimitive.RadioGroup>
            </div>
            <DropdownMenuSeparator className="mx-0 my-0" />
            <ContextMeter usage={usage} model={resolved} />
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

function ModelItem({
   value,
   label,
   description,
   icon,
   share,
   window,
}: {
   value: string;
   label: string;
   description: string;
   icon?: React.ReactNode;
   share: number;
   window: number;
}) {
   const tooBig = share > 1;
   return (
      <DropdownMenuPrimitive.RadioItem
         value={value}
         className="group relative flex cursor-default items-start gap-2 rounded-sm py-1.5 pr-2 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50"
      >
         <DropdownMenuPrimitive.ItemIndicator className="absolute top-2 left-2">
            <Check className="size-3.5" />
         </DropdownMenuPrimitive.ItemIndicator>
         <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium">
               {icon}
               {label}
            </span>
            <span
               className={cn(
                  "block truncate text-xs text-muted-foreground",
                  tooBig && "text-destructive",
               )}
            >
               {tooBig ? "Too much context for this model" : description}
            </span>
         </span>
         <span
            className={cn(
               "mt-0.5 flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums",
               tone(share),
            )}
            title={`${percent(share)} of a ${formatTokens(window)} window`}
         >
            {formatTokens(window)}
            <ContextRing share={share} className="size-3" />
         </span>
      </DropdownMenuPrimitive.RadioItem>
   );
}

/** What is filling the selected model's window, part by part. */
export function ContextMeter({
   usage,
   model,
}: {
   usage: ContextUsage;
   model: ChatModel;
}) {
   const share = usage.total / model.window;
   return (
      <div className="space-y-2.5 bg-muted/40 px-3 py-2.5">
         <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium">Context</span>
            <span className={cn("tabular-nums", tone(share))}>
               {formatTokens(usage.total)} / {formatTokens(model.window)} ·{" "}
               {percent(share)}
            </span>
         </div>
         <div
            className="flex h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Context used"
            aria-valuemin={0}
            aria-valuemax={model.window}
            aria-valuenow={usage.total}
         >
            {contextSegments.map((s) =>
               usage[s.key] > 0 ? (
                  <div
                     key={s.key}
                     className={cn(
                        "h-full min-w-0.5 border-r border-background last:border-r-0",
                        s.color,
                     )}
                     style={{
                        width: `${Math.min(100, (usage[s.key] / model.window) * 100)}%`,
                     }}
                  />
               ) : null,
            )}
         </div>
         <ul className="space-y-1">
            {contextSegments.map((s) => (
               <li
                  key={s.key}
                  className={cn(
                     "flex items-center gap-2 text-xs",
                     usage[s.key] === 0 && "opacity-50",
                  )}
               >
                  <span className={cn("size-2 shrink-0 rounded-sm", s.color)} />
                  <span className="flex-1 text-muted-foreground">
                     {s.label}
                  </span>
                  <span className="tabular-nums">
                     {formatTokens(usage[s.key])}
                  </span>
               </li>
            ))}
         </ul>
         {share > WARN_AT && (
            <p
               className={cn(
                  "flex gap-1.5 text-xs",
                  share > 1 ? "text-destructive" : "text-foreground/80",
               )}
            >
               <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
               {share > 1
                  ? `This won't fit in ${model.label}. Remove an attachment or reference, or pick a model with a larger window.`
                  : "Close to the limit: older turns will be summarized to make room."}
            </p>
         )}
      </div>
   );
}
