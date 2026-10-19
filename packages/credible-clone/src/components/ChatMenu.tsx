// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import {
   Download,
   Ellipsis,
   Link2,
   type LucideIcon,
   PencilLine,
   Pin,
   Server,
   Share2,
   Sparkles,
   Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAgent } from "../agent";
import type { Chat } from "../fixtures";
import { DEFAULT_MODEL, modelInfo } from "../models";

type MenuItem = {
   label: string;
   icon: LucideIcon;
   danger?: boolean;
};

const chatMenu: MenuItem[][] = [
   [
      { label: "Rename", icon: PencilLine },
      { label: "Pin", icon: Pin },
   ],
   [
      { label: "Share", icon: Share2 },
      { label: "Copy link", icon: Link2 },
      { label: "Export", icon: Download },
   ],
   [{ label: "Delete", icon: Trash2, danger: true }],
];

/**
 * Overflow menu for a chat, with the model and connectors it runs on in the
 * footer. Stubs: every item just closes the menu.
 */
export function ChatMenu({
   chat,
   placement,
   className,
}: {
   chat: Chat;
   /** `left` beside a vertical toolbar, `below` from a header. */
   placement: "left" | "below";
   className?: string;
}) {
   const { status, refresh } = useAgent();
   const [open, setOpen] = useState(false);
   const ref = useRef<HTMLDivElement>(null);

   useEffect(() => {
      if (!open) return;
      const onPointerDown = (e: PointerEvent) => {
         if (!ref.current?.contains(e.target as Node)) setOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
         if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
         document.removeEventListener("pointerdown", onPointerDown);
         document.removeEventListener("keydown", onKeyDown);
      };
   }, [open]);

   const model = modelInfo(chat.model ?? status?.defaultModel ?? DEFAULT_MODEL);

   return (
      <div ref={ref} className="relative">
         <button
            type="button"
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
               if (!open) refresh();
               setOpen((o) => !o);
            }}
            className={clsx(className, open && "bg-hover text-ink")}
         >
            <Ellipsis className="size-3.5" />
         </button>
         {open && (
            <div
               role="menu"
               className={clsx(
                  "absolute z-30 w-48 overflow-hidden rounded-md border border-line bg-surface text-[11px] text-ink shadow-md",
                  placement === "left"
                     ? "top-0 right-full mr-1"
                     : "top-full right-0 mt-1",
               )}
            >
               <div className="p-1">
                  {chatMenu.map((group, i) => (
                     <div
                        key={group[0].label}
                        className={clsx(
                           i > 0 && "mt-1 border-t border-line pt-1",
                        )}
                     >
                        {group.map(({ label, icon: Icon, danger }) => (
                           <button
                              key={label}
                              type="button"
                              role="menuitem"
                              onClick={() => setOpen(false)}
                              className={clsx(
                                 "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-hover",
                                 danger && "text-red-700 dark:text-red-400",
                              )}
                           >
                              <Icon
                                 className={clsx(
                                    "size-3 shrink-0",
                                    !danger && "text-muted",
                                 )}
                              />
                              {label}
                           </button>
                        ))}
                     </div>
                  ))}
               </div>

               <div className="space-y-1 border-t border-line bg-panel px-3 py-2 text-[10px]">
                  <div className="flex items-center gap-2">
                     <Sparkles className="size-3 shrink-0 text-muted" />
                     <span className="truncate">{model.label}</span>
                     <span className="ml-auto shrink-0 text-[9px] text-muted">
                        {model.vendor}
                     </span>
                  </div>
                  {status ? (
                     status.mcpServers.map((s) => (
                        <div
                           key={s.id}
                           className="flex items-center gap-2"
                           title={s.connected ? s.url : (s.error ?? s.url)}
                        >
                           <Server className="size-3 shrink-0 text-muted" />
                           <span className="truncate">{s.name}</span>
                           <span className="ml-auto shrink-0 text-[9px] text-muted">
                              {s.connected
                                 ? `${s.tools.length} tools`
                                 : "Unreachable"}
                           </span>
                           <span
                              className={clsx(
                                 "size-1.5 shrink-0 rounded-full",
                                 s.connected ? "bg-emerald-500" : "bg-red-500",
                              )}
                           />
                        </div>
                     ))
                  ) : (
                     <div className="flex items-center gap-2 text-muted">
                        <Server className="size-3 shrink-0" />
                        Checking connectors…
                        <span className="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-faint" />
                     </div>
                  )}
               </div>
            </div>
         )}
      </div>
   );
}
