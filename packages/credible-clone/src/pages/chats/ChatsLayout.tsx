// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import {
   ChevronLeft,
   ChevronRight,
   FileText,
   Folder,
   LayoutGrid,
   Plus,
   Search,
   X,
   type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { previewOf, useChats } from "../../chats";
import { timeAgo, type Chat } from "../../fixtures";

const itemClass = (active: boolean) =>
   clsx("block rounded-lg px-2 py-2 hover:bg-hover", active && "bg-hover");

type FilterKey = "package" | "report" | "artifact";

type Filter = { key: FilterKey; value: string };

type Template = {
   key: FilterKey;
   label: string;
   icon: LucideIcon;
   /** Every value this template can filter on, read off a chat. */
   valuesOf: (chat: Chat) => string[];
};

/** "1 dashboard" and "2 dashboards" are both a dashboard. */
const artifactKind = (artifact: string) =>
   artifact.replace(/^\d+\s+/, "").replace(/s$/, "");

const templates: Template[] = [
   {
      key: "package",
      label: "Package",
      icon: Folder,
      valuesOf: (c) => (c.scope.package ? [c.scope.package] : []),
   },
   {
      key: "report",
      label: "Report",
      icon: FileText,
      valuesOf: (c) => (c.scope.report ? [c.scope.report.title] : []),
   },
   {
      key: "artifact",
      label: "Created",
      icon: LayoutGrid,
      valuesOf: (c) => (c.artifacts ?? []).map(artifactKind),
   },
];

const templateOf = (key: FilterKey) => templates.find((t) => t.key === key)!;

type Option = { filter: Filter; count: number };

type MenuItem =
   | { kind: "template"; template: Template; count: number }
   | { kind: "option"; option: Option; showTemplate: boolean };

export function ChatsLayout() {
   const { chats, messages } = useChats();
   const [query, setQuery] = useState("");
   const [filters, setFilters] = useState<Filter[]>([]);
   const [menuOpen, setMenuOpen] = useState(false);
   const [step, setStep] = useState<FilterKey | null>(null);
   const [active, setActive] = useState(0);

   const options = useMemo(() => {
      const byKey = new Map<FilterKey, Option[]>();
      for (const t of templates) {
         const counts = new Map<string, number>();
         for (const c of chats) {
            for (const v of new Set(t.valuesOf(c))) {
               counts.set(v, (counts.get(v) ?? 0) + 1);
            }
         }
         byKey.set(
            t.key,
            [...counts]
               .sort(([a], [b]) => a.localeCompare(b))
               .map(([value, count]) => ({
                  filter: { key: t.key, value },
                  count,
               })),
         );
      }
      return byKey;
   }, [chats]);

   const menu = useMemo((): MenuItem[] => {
      const q = query.trim().toLowerCase();
      const isApplied = (f: Filter) =>
         filters.some((a) => a.key === f.key && a.value === f.value);
      if (step) {
         return (options.get(step) ?? [])
            .filter((o) => !isApplied(o.filter))
            .map((option) => ({ kind: "option", option, showTemplate: false }));
      }
      if (q) {
         return templates.flatMap((t) =>
            (options.get(t.key) ?? [])
               .filter(
                  (o) =>
                     !isApplied(o.filter) &&
                     o.filter.value.toLowerCase().includes(q),
               )
               .map(
                  (option): MenuItem => ({
                     kind: "option",
                     option,
                     showTemplate: true,
                  }),
               ),
         );
      }
      return templates
         .map((template) => ({
            kind: "template" as const,
            template,
            count: (options.get(template.key) ?? []).filter(
               (o) => !isApplied(o.filter),
            ).length,
         }))
         .filter((item) => item.count > 0);
   }, [query, step, options, filters]);

   const visible = useMemo(() => {
      const q = query.trim().toLowerCase();
      return [...chats]
         .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
         .filter((c) => !q || c.title.toLowerCase().includes(q))
         .filter((c) =>
            filters.every((f) =>
               templateOf(f.key).valuesOf(c).includes(f.value),
            ),
         );
   }, [chats, query, filters]);

   const openStep = (key: FilterKey | null) => {
      setStep(key);
      setActive(0);
   };

   const apply = (filter: Filter) => {
      setFilters((prev) => [
         ...prev.filter((f) => f.key !== filter.key),
         filter,
      ]);
      setQuery("");
      openStep(null);
      setMenuOpen(false);
   };

   const remove = (filter: Filter) =>
      setFilters((prev) =>
         prev.filter(
            (f) => !(f.key === filter.key && f.value === filter.value),
         ),
      );

   const choose = (item: MenuItem) =>
      item.kind === "template"
         ? openStep(item.template.key)
         : apply(item.option.filter);

   const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
         if (step) openStep(null);
         else setMenuOpen(false);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
         e.preventDefault();
         setMenuOpen(true);
         const delta = e.key === "ArrowDown" ? 1 : -1;
         if (menu.length)
            setActive((i) => (i + delta + menu.length) % menu.length);
      } else if (e.key === "Enter" && menuOpen && menu[active]) {
         e.preventDefault();
         choose(menu[active]);
      } else if (e.key === "ArrowLeft" && step && !query) {
         openStep(null);
      } else if (e.key === "Backspace" && !query) {
         if (step) openStep(null);
         else setFilters((prev) => prev.slice(0, -1));
      }
   };

   const showMenu = menuOpen && (menu.length > 0 || step !== null);

   return (
      <div className="ui-zoom flex h-full">
         <aside className="flex w-56 shrink-0 flex-col border-r border-line">
            <div className="flex items-center px-3 pt-3">
               <h2 className="flex-1 text-[15px] font-medium">Chats</h2>
               <Link
                  to="/chats/new"
                  className="btn-raised flex items-center gap-1 rounded-md px-2 py-1 text-[11px] leading-none font-medium"
               >
                  <Plus className="size-3" /> New
               </Link>
            </div>

            <div className="relative border-b border-line p-2.5">
               <label className="flex items-center gap-1.5 rounded-md bg-hover px-2 py-1.5">
                  <Search className="size-3 text-muted" />
                  <input
                     value={query}
                     onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                        setMenuOpen(true);
                     }}
                     onFocus={() => setMenuOpen(true)}
                     onBlur={() => {
                        setMenuOpen(false);
                        openStep(null);
                     }}
                     onKeyDown={onKeyDown}
                     placeholder="Search or filter chats"
                     role="combobox"
                     aria-expanded={showMenu}
                     aria-controls="chat-filter-menu"
                     className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted"
                  />
               </label>

               {showMenu && (
                  <div
                     id="chat-filter-menu"
                     role="listbox"
                     // Keep focus in the input so a click doesn't blur and close the menu.
                     onMouseDown={(e) => e.preventDefault()}
                     className="absolute inset-x-2.5 top-full z-10 -mt-1 rounded-md border border-line bg-surface p-1 text-[11px] shadow-md"
                  >
                     <MenuHeader
                        step={step}
                        query={query}
                        onBack={() => openStep(null)}
                     />
                     {menu.map((item, i) => (
                        <MenuRow
                           key={
                              item.kind === "template"
                                 ? item.template.key
                                 : `${item.option.filter.key}:${item.option.filter.value}`
                           }
                           item={item}
                           active={i === active}
                           onHover={() => setActive(i)}
                           onChoose={() => choose(item)}
                        />
                     ))}
                     {step && menu.length === 0 && (
                        <p className="px-2 py-1.5 text-muted">
                           Nothing left to filter by.
                        </p>
                     )}
                  </div>
               )}
            </div>

            {filters.length > 0 && (
               <div className="flex flex-wrap items-center gap-1 border-b border-line px-2.5 py-2 text-[9px]">
                  {filters.map((f) => (
                     <FilterChip
                        key={f.key}
                        filter={f}
                        onRemove={() => remove(f)}
                     />
                  ))}
                  {filters.length > 1 && (
                     <button
                        type="button"
                        onClick={() => setFilters([])}
                        className="ml-auto text-muted hover:text-ink"
                     >
                        Clear
                     </button>
                  )}
               </div>
            )}

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
               {visible.map((c) => (
                  <NavLink
                     key={c.id}
                     to={`/chats/${c.id}`}
                     className={({ isActive }) => itemClass(isActive)}
                  >
                     <ItemHeader
                        title={c.title}
                        meta={timeAgo(c.updatedAt, true)}
                     />
                     <p className="mt-0.5 truncate text-[10px] text-muted">
                        {previewOf(messages[c.id])}
                     </p>
                  </NavLink>
               ))}
               {visible.length === 0 && (
                  <p className="px-2 py-4 text-center text-[11px] text-muted">
                     No chats match.
                  </p>
               )}
            </nav>
         </aside>

         <div className="flex min-w-0 flex-1 flex-col">
            <Outlet />
         </div>
      </div>
   );
}

function MenuHeader({
   step,
   query,
   onBack,
}: {
   step: FilterKey | null;
   query: string;
   onBack: () => void;
}) {
   if (step) {
      return (
         <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center gap-1 px-1.5 pt-0.5 pb-1 text-[9px] text-muted hover:text-ink"
         >
            <ChevronLeft className="size-2.5" />
            {templateOf(step).label}
         </button>
      );
   }
   return (
      <p className="px-2 pt-0.5 pb-1 text-[9px] text-muted">
         {query.trim() ? "Filter to" : "Filter by"}
      </p>
   );
}

function MenuRow({
   item,
   active,
   onHover,
   onChoose,
}: {
   item: MenuItem;
   active: boolean;
   onHover: () => void;
   onChoose: () => void;
}) {
   const template =
      item.kind === "template"
         ? item.template
         : templateOf(item.option.filter.key);
   const Icon = template.icon;
   return (
      <button
         type="button"
         role="option"
         aria-selected={active}
         onMouseEnter={onHover}
         onClick={onChoose}
         className={clsx(
            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left",
            active && "bg-hover",
         )}
      >
         <Icon className="size-3 shrink-0 text-muted" />
         {item.kind === "template" ? (
            <>
               <span className="flex-1">{template.label}</span>
               <ChevronRight className="size-3 text-muted" />
            </>
         ) : (
            <>
               {item.showTemplate && (
                  <span className="text-muted">{template.label}:</span>
               )}
               <span className="min-w-0 flex-1 truncate">
                  {item.option.filter.value}
               </span>
               <span className="text-[9px] text-muted">
                  {item.option.count}
               </span>
            </>
         )}
      </button>
   );
}

function FilterChip({
   filter,
   onRemove,
}: {
   filter: Filter;
   onRemove: () => void;
}) {
   const template = templateOf(filter.key);
   const Icon = template.icon;
   return (
      <span
         className="flex min-w-0 items-center gap-1 rounded border border-line bg-surface py-0.5 pr-0.5 pl-1.5 text-ink"
         title={`${template.label}: ${filter.value}`}
      >
         <Icon className="size-2.5 shrink-0 text-muted" />
         <span className="text-muted">{template.label}</span>
         <span className="truncate font-mono">{filter.value}</span>
         <button
            type="button"
            aria-label={`Remove ${template.label} filter`}
            onClick={onRemove}
            className="ml-0.5 flex size-3 shrink-0 items-center justify-center rounded-full bg-ink text-surface"
         >
            <X className="size-2" strokeWidth={3} />
         </button>
      </span>
   );
}

function ItemHeader({ title, meta }: { title: string; meta: string }) {
   return (
      <div className="flex items-baseline gap-2">
         <span className="flex-1 truncate text-[11px] font-medium">
            {title}
         </span>
         <span className="text-[9px] text-muted">{meta}</span>
      </div>
   );
}
