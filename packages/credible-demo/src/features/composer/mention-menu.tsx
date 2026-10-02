// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { EntityIcon } from "@/components/entity-icon";
import {
   Popover,
   PopoverAnchor,
   PopoverContent,
} from "@/components/ui/popover";
import { entityKinds } from "@/data/entities";
import { formatTokens } from "@/data/models";
import type { EntityRef } from "@/data/types";
import { cn } from "@/lib/utils";
import type { MentionState, useMentionMenu } from "./use-mention-menu";

export function MentionMenu({
   mention,
   menu,
   loading,
   onSelect,
   onClose,
   ignoreOutside,
}: {
   mention: MentionState | null;
   menu: ReturnType<typeof useMentionMenu>;
   loading: boolean;
   onSelect: (entity: EntityRef) => void;
   onClose: () => void;
   /** Clicks here (the textarea) do not close the menu. */
   ignoreOutside: React.RefObject<HTMLElement | null>;
}) {
   const list = useRef<HTMLDivElement>(null);
   const { items, grouped, active, setActive, kind, setKind, kinds } = menu;
   const current = items[active];

   useEffect(() => {
      list.current
         ?.querySelector(`[data-index="${active}"]`)
         ?.scrollIntoView({ block: "nearest" });
   }, [active, items]);

   return (
      <Popover open={menu.open} onOpenChange={(o) => !o && onClose()}>
         <PopoverAnchor asChild>
            <span
               aria-hidden
               className="pointer-events-none absolute w-px"
               style={
                  mention
                     ? {
                          top: mention.anchor.top,
                          left: mention.anchor.left,
                          height: mention.anchor.height,
                       }
                     : undefined
               }
            />
         </PopoverAnchor>
         <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="flex w-[22rem] flex-col overflow-hidden p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
               if (ignoreOutside.current?.contains(e.target as Node))
                  e.preventDefault();
            }}
            // Keep focus in the textarea while the menu is clicked.
            onMouseDown={(e) => e.preventDefault()}
         >
            <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5 [scrollbar-width:none]">
               {[null, ...kinds].map((k) => (
                  <button
                     key={k ?? "all"}
                     type="button"
                     onClick={() => setKind(k)}
                     className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                        kind === k &&
                           "bg-secondary font-medium text-secondary-foreground",
                     )}
                  >
                     {k ? entityKinds[k].plural : "All"}
                  </button>
               ))}
            </div>

            <div
               ref={list}
               role="listbox"
               aria-label="Workspace references"
               className="max-h-72 overflow-y-auto p-1"
            >
               {items.map((e, i) => {
                  const heading =
                     grouped && (i === 0 || items[i - 1].kind !== e.kind);
                  return (
                     <div key={e.id}>
                        {heading && (
                           <div className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              {entityKinds[e.kind].plural}
                           </div>
                        )}
                        <button
                           type="button"
                           role="option"
                           aria-selected={i === active}
                           data-index={i}
                           onMouseMove={() => i !== active && setActive(i)}
                           onClick={() => onSelect(e)}
                           className={cn(
                              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                              i === active &&
                                 "bg-accent text-accent-foreground",
                           )}
                        >
                           <EntityIcon
                              kind={e.kind}
                              className="size-4 shrink-0 text-muted-foreground"
                           />
                           <span className="min-w-0 flex-1 truncate text-sm">
                              {e.label}
                           </span>
                           <span className="max-w-[45%] shrink truncate text-[11px] text-muted-foreground">
                              {grouped ? e.detail : entityKinds[e.kind].label}
                           </span>
                        </button>
                     </div>
                  );
               })}
               {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                     {loading
                        ? "Loading the workspace…"
                        : mention?.query
                          ? `Nothing in the workspace matches “${mention.query}”`
                          : "Nothing to reference yet"}
                  </p>
               )}
               {loading && items.length > 0 && (
                  <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                     <Loader2 className="size-3 animate-spin" />
                     Reading package sources…
                  </p>
               )}
            </div>

            {current && (
               <div className="space-y-0.5 border-t bg-muted/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                     <span className="truncate font-mono text-muted-foreground">
                        @{current.handle}
                     </span>
                     <span className="shrink-0 text-muted-foreground tabular-nums">
                        ~{formatTokens(current.tokens)} tokens
                     </span>
                  </div>
                  {current.description && (
                     <p className="line-clamp-2 text-xs text-foreground/80">
                        {current.description}
                     </p>
                  )}
               </div>
            )}
            <div className="flex gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
               <span>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> navigate
               </span>
               <span>
                  <Kbd>↵</Kbd> insert
               </span>
               <span>
                  <Kbd>esc</Kbd> close
               </span>
            </div>
         </PopoverContent>
      </Popover>
   );
}

export function Kbd({ children }: { children: React.ReactNode }) {
   return (
      <kbd className="mr-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border bg-background px-1 font-sans text-[10px]">
         {children}
      </kbd>
   );
}
