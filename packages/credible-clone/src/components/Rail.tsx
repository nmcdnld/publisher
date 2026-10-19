// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import {
   House,
   LayoutDashboard,
   LayoutGrid,
   MessageSquare,
   NotebookText,
   PanelLeft,
   type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { currentUser, workspace } from "../fixtures";
import { useSaved } from "../saved";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const PINNED_KEY = "credible-clone:rail-pinned";
const HOVER_OPEN_DELAY_MS = 150;

const items: { to: string; label: string; icon: LucideIcon }[] = [
   { to: `/workspaces/${workspace.id}`, label: workspace.name, icon: House },
   { to: "/chats", label: "Chats", icon: MessageSquare },
   { to: "/packages", label: "Packages", icon: LayoutGrid },
];

export function Rail() {
   const [pinned, setPinned] = useState(
      () => localStorage.getItem(PINNED_KEY) === "true",
   );
   const [hovered, setHovered] = useState(false);
   const hoverTimer = useRef<number>(undefined);
   const expanded = pinned || hovered;
   const { saved } = useSaved();

   useEffect(() => {
      localStorage.setItem(PINNED_KEY, String(pinned));
   }, [pinned]);

   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            setPinned((p) => !p);
            setHovered(false);
         }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
   }, []);

   const openSoon = () => {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(
         () => setHovered(true),
         HOVER_OPEN_DELAY_MS,
      );
   };
   const close = () => {
      window.clearTimeout(hoverTimer.current);
      setHovered(false);
   };

   const togglePinned = () => {
      setPinned((p) => !p);
      setHovered(false);
   };

   return (
      // The outer aside reserves layout space; the inner panel overlays the
      // page when expanded by hover only, so content doesn't jump.
      <aside
         className={clsx(
            "ui-zoom relative shrink-0 transition-[width] duration-200",
            pinned ? "w-56" : "w-12",
         )}
      >
         <div
            onMouseEnter={openSoon}
            onMouseLeave={close}
            onFocus={() => setHovered(true)}
            onBlur={(e) => {
               if (!e.currentTarget.contains(e.relatedTarget)) close();
            }}
            className={clsx(
               "absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden border-r border-line bg-rail py-2.5 transition-[width,box-shadow] duration-200",
               expanded ? "w-56" : "w-12",
               hovered && !pinned && "shadow-xl",
            )}
         >
            <div className="mb-4 flex h-7 items-center gap-2 px-3">
               <Link
                  to={`/workspaces/${workspace.id}`}
                  aria-label="Credible"
                  className="flex h-6 shrink-0 items-center text-ink"
               >
                  <Logo compact={!expanded} />
               </Link>
               <button
                  type="button"
                  onClick={togglePinned}
                  aria-label={pinned ? "Collapse sidebar" : "Pin sidebar open"}
                  aria-pressed={pinned}
                  title={`${pinned ? "Collapse" : "Pin open"} (⌘B)`}
                  className={clsx(
                     "ml-auto rounded p-1 text-muted hover:bg-hover hover:text-ink",
                     !expanded && "sr-only",
                  )}
               >
                  <PanelLeft className="size-3.5" />
               </button>
            </div>

            <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto px-2">
               {items.map(({ to, label, icon }) => (
                  <RailLink
                     key={to}
                     to={to}
                     label={label}
                     icon={icon}
                     expanded={expanded}
                  />
               ))}
               {saved.map(({ path, title, kind }) => (
                  <RailLink
                     key={path}
                     to={path}
                     label={title}
                     icon={
                        kind === "dashboard" ? LayoutDashboard : NotebookText
                     }
                     expanded={expanded}
                  />
               ))}
            </nav>

            <div className="mt-auto flex items-center gap-2 px-3">
               <span
                  title={currentUser.email}
                  className="flex size-6 shrink-0 items-center justify-center rounded bg-neutral-700 text-[11px] font-medium text-white"
               >
                  {currentUser.initial}
               </span>
               <Label visible={expanded}>
                  <span className="truncate text-[11px]">
                     {currentUser.email}
                  </span>
               </Label>
               {expanded && <ThemeToggle />}
            </div>
         </div>
      </aside>
   );
}

function RailLink({
   to,
   label,
   icon: Icon,
   expanded,
}: {
   to: string;
   label: string;
   icon: LucideIcon;
   expanded: boolean;
}) {
   return (
      <NavLink
         to={to}
         title={expanded ? undefined : label}
         aria-label={label}
         className={({ isActive }) =>
            clsx(
               "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-[12px] whitespace-nowrap text-muted hover:bg-hover hover:text-ink",
               isActive && "bg-line/70 text-ink",
            )
         }
      >
         <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
         <Label visible={expanded}>{label}</Label>
      </NavLink>
   );
}

function Label({
   visible,
   children,
}: {
   visible: boolean;
   children: ReactNode;
}) {
   return (
      <span
         className={clsx(
            "min-w-0 truncate transition-opacity duration-150",
            visible ? "opacity-100" : "opacity-0",
         )}
      >
         {children}
      </span>
   );
}
