// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import {
   Bookmark,
   Code,
   Ellipsis,
   type LucideIcon,
   MessagesSquare,
   Pencil,
   RefreshCw,
   Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSaved, type Shortcut } from "../saved";

const iconButton =
   "flex size-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink";

type MenuItem = {
   label: string;
   icon: LucideIcon;
   danger?: boolean;
   count?: number;
   onSelect?: () => void;
};

/**
 * Bookmark and overflow menu for a piece of content. Bookmarking adds a
 * shortcut to the rail; apart from viewing chats, the menu items are stubs.
 */
export function ContentActions({
   shortcut,
   chatCount,
   onViewChats,
}: {
   shortcut: Shortcut;
   /** How many chats were started from this page. */
   chatCount?: number;
   onViewChats?: () => void;
}) {
   const menu: { heading: string; items: MenuItem[] }[] = [
      {
         heading: "View",
         items: [
            ...(onViewChats
               ? [
                    {
                       label: "View chats from here",
                       icon: MessagesSquare,
                       count: chatCount,
                       onSelect: onViewChats,
                    },
                 ]
               : []),
            { label: "Code", icon: Code },
            { label: "Refresh data", icon: RefreshCw },
         ],
      },
      {
         heading: "Manage",
         items: [
            { label: "Edit", icon: Pencil },
            { label: "Delete", icon: Trash2, danger: true },
         ],
      },
   ];
   const { isSaved, toggle } = useSaved();
   const saved = isSaved(shortcut.path);
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

   return (
      <div className="flex items-center gap-0.5">
         <button
            type="button"
            aria-label={saved ? "Remove bookmark" : "Bookmark"}
            title={saved ? "Remove bookmark" : "Bookmark"}
            aria-pressed={saved}
            onClick={() => toggle(shortcut)}
            className={clsx(iconButton, saved && "text-ink")}
         >
            <Bookmark className={clsx("size-3.5", saved && "fill-current")} />
         </button>
         <div ref={ref} className="relative">
            <button
               type="button"
               aria-label="More actions"
               title="More actions"
               aria-haspopup="menu"
               aria-expanded={open}
               onClick={() => setOpen((o) => !o)}
               className={clsx(iconButton, open && "bg-hover text-ink")}
            >
               <Ellipsis className="size-3.5" />
            </button>
            {open && (
               <div
                  role="menu"
                  className="absolute top-full right-0 z-[1300] mt-1 min-w-40 rounded-md border border-line bg-surface p-1 text-[11px] shadow-md"
               >
                  {menu.map((group, i) => (
                     <div
                        key={group.heading}
                        className={clsx(
                           i > 0 && "mt-1 border-t border-line pt-1",
                        )}
                     >
                        <p className="px-2 pt-0.5 pb-1 text-[9px] text-muted">
                           {group.heading}
                        </p>
                        {group.items.map(
                           ({ label, icon: Icon, danger, count, onSelect }) => (
                              <button
                                 key={label}
                                 type="button"
                                 role="menuitem"
                                 onClick={() => {
                                    setOpen(false);
                                    onSelect?.();
                                 }}
                                 className={clsx(
                                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left whitespace-nowrap hover:bg-hover",
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
                                 {count !== undefined && (
                                    <span className="ml-auto pl-3 text-[9px] text-muted">
                                       {count}
                                    </span>
                                 )}
                              </button>
                           ),
                        )}
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
