// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ChevronRightIcon, Loader2Icon, SearchIcon } from "lucide-react";
import {
   Children,
   type ReactNode,
   useEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type {
   ContentItem,
   Entity,
   EntityKind,
   Ontology,
} from "../../../ontology/types";
import { errorMessage, useOntology } from "../../../ontology/useOntology";
import { Input } from "../../ui/input";
import { Kbd, Skeleton } from "../../ui/misc";
import { TailwindScope } from "../../ui/scope";
import { DictionaryIndex } from "./DictionaryIndex";
import { DictionaryPanel } from "./DictionaryPanel";
import { CONTENT_META, useOpenContent } from "./content";
import { useDrafts } from "./drafts";
import { EntityPage } from "./EntityPage";
import { FieldFeed } from "./FieldFeed";
import { useKeepPanelAcrossPages } from "./panel";
import {
   dictionaryHref,
   displayName,
   FIELD_KINDS,
   KIND_META,
   KindIcon,
} from "./shared";

export default function DictionaryPage({
   environmentName,
   packageName,
   entityId,
}: {
   environmentName: string;
   packageName: string;
   entityId?: string;
}) {
   const ontology = useOntology(environmentName, packageName);
   useKeepPanelAcrossPages();

   return (
      <TailwindScope className="flex min-h-full">
         {ontology.data ? (
            <>
               <DictionaryNav ontology={ontology.data} selectedId={entityId} />
               <main className="@container min-w-0 flex-1">
                  {ontology.isFetching && (
                     <div className="fixed bottom-4 right-4 z-10 flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow-sm">
                        <Loader2Icon className="size-3 animate-spin" />
                        Reading the model
                     </div>
                  )}
                  <DictionaryMain
                     ontology={ontology.data}
                     entityId={entityId}
                  />
               </main>
               <DictionaryPanel ontology={ontology.data} />
            </>
         ) : ontology.error ? (
            <div className="p-6 text-sm text-destructive">
               {errorMessage(ontology.error)}
            </div>
         ) : (
            <div className="flex w-full gap-6 p-6">
               <Skeleton className="h-[70vh] w-64" />
               <div className="flex-1 space-y-4">
                  <Skeleton className="h-10 w-1/3" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-64 w-full" />
               </div>
            </div>
         )}
      </TailwindScope>
   );
}

function DictionaryMain({
   ontology,
   entityId,
}: {
   ontology: Ontology;
   entityId?: string;
}) {
   if (!entityId) return <DictionaryIndex ontology={ontology} />;
   const entity = ontology.entities.get(entityId);
   if (!entity) {
      return (
         <div className="mx-auto max-w-3xl space-y-2 px-6 py-10">
            <h1 className="text-lg font-semibold">No page for {entityId}</h1>
            <p className="text-sm text-muted-foreground">
               The model may have changed since this link was made.{" "}
               <Link
                  to={dictionaryHref(ontology)}
                  className="text-primary underline"
               >
                  Back to the dictionary
               </Link>
            </p>
         </div>
      );
   }
   const source = entity.sourceId
      ? ontology.entities.get(entity.sourceId)
      : undefined;
   if (source?.fieldIds?.includes(entity.id)) {
      return (
         <FieldFeed
            key={source.id}
            ontology={ontology}
            source={source}
            selectedId={entity.id}
         />
      );
   }
   return <EntityPage key={entity.id} ontology={ontology} entity={entity} />;
}

function DictionaryNav({
   ontology,
   selectedId,
}: {
   ontology: Ontology;
   selectedId?: string;
}) {
   const [search, setSearch] = useState("");
   const inputRef = useRef<HTMLInputElement>(null);
   const { drafts } = useDrafts(ontology);
   const selected = selectedId ? ontology.entities.get(selectedId) : undefined;
   const selectedSource =
      selected?.kind === "source" ? selected.id : selected?.sourceId;

   useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
         const target = e.target as HTMLElement | null;
         if (
            e.key === "/" &&
            !["INPUT", "TEXTAREA"].includes(target?.tagName ?? "")
         ) {
            e.preventDefault();
            inputRef.current?.focus();
         }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
   }, []);

   const contentMatches = useMemo(() => {
      const term = search.trim().toLowerCase();
      if (!term) return undefined;
      return ontology.content.filter(
         (c) =>
            c.title.toLowerCase().includes(term) ||
            c.file.toLowerCase().includes(term),
      );
   }, [ontology, search]);

   const matches = useMemo(() => {
      const term = search.trim().toLowerCase();
      if (!term) return undefined;
      return [...ontology.entities.values()]
         .map((e) => ({
            e,
            score:
               (e.name.toLowerCase() === term ? 4 : 0) +
               (e.name.toLowerCase().includes(term) ? 2 : 0) +
               (e.label?.toLowerCase().includes(term) ? 1 : 0) +
               (e.doc?.toLowerCase().includes(term) ? 1 : 0),
         }))
         .filter((m) => m.score > 0)
         .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
         .slice(0, 60)
         .map((m) => m.e);
   }, [ontology, search]);

   return (
      <nav className="sticky top-0 flex max-h-[calc(100dvh-56px)] w-72 shrink-0 flex-col border-r">
         <div className="p-3">
            <div className="relative">
               <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
               <Input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search the model"
                  className="pl-8 pr-8"
               />
               <Kbd className="absolute right-2 top-2">/</Kbd>
            </div>
         </div>
         <div className="flex-1 overflow-y-auto px-2 pb-6 text-sm">
            <NavLink
               ontology={ontology}
               to={dictionaryHref(ontology)}
               active={!selectedId}
               label="Overview"
            />
            {matches ? (
               <div className="mt-2 space-y-px">
                  {matches.length === 0 && !contentMatches?.length && (
                     <p className="px-2 py-4 text-xs text-muted-foreground">
                        Nothing matches “{search}”.
                     </p>
                  )}
                  {matches.map((e) => (
                     <EntityRow
                        key={e.id}
                        ontology={ontology}
                        entity={e}
                        active={e.id === selectedId}
                        drafted={Boolean(drafts[e.id])}
                        qualified
                     />
                  ))}
                  {contentMatches?.map((item) => (
                     <ContentRow
                        key={item.id}
                        ontology={ontology}
                        item={item}
                     />
                  ))}
               </div>
            ) : (
               <div className="mt-2 space-y-px">
                  {ontology.sources.map((source) => (
                     <SourceGroup
                        key={source.id}
                        ontology={ontology}
                        source={source}
                        selectedId={selectedId}
                        defaultOpen={source.id === selectedSource}
                        drafts={drafts}
                     />
                  ))}
                  {[...ontology.givens, ...ontology.queries].map((e) => (
                     <EntityRow
                        key={e.id}
                        ontology={ontology}
                        entity={e}
                        active={e.id === selectedId}
                        drafted={Boolean(drafts[e.id])}
                        qualified
                     />
                  ))}
                  {ontology.content.length > 0 && (
                     <div className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Content
                     </div>
                  )}
                  {ontology.content.map((item) => (
                     <ContentRow
                        key={item.id}
                        ontology={ontology}
                        item={item}
                     />
                  ))}
               </div>
            )}
         </div>
      </nav>
   );
}

function ContentRow({
   ontology,
   item,
}: {
   ontology: Ontology;
   item: ContentItem;
}) {
   const { openId } = useOpenContent();
   const navigate = useNavigate();
   const meta = CONTENT_META[item.kind];
   const Icon = meta.icon;
   return (
      <button
         onClick={() =>
            navigate(
               `${dictionaryHref(ontology)}?${new URLSearchParams({ content: item.id })}`,
            )
         }
         title={item.file}
         className={cn(
            "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent",
            item.id === openId && "bg-accent font-medium",
         )}
      >
         <Icon className={cn("size-3.5 shrink-0 bg-transparent", meta.tint)} />
         <span className="truncate text-xs">{item.title}</span>
      </button>
   );
}

function SourceGroup({
   ontology,
   source,
   selectedId,
   defaultOpen,
   drafts,
}: {
   ontology: Ontology;
   source: Entity;
   selectedId?: string;
   defaultOpen: boolean;
   drafts: Record<string, unknown>;
}) {
   const [open, setOpen] = useState(defaultOpen);
   useEffect(() => {
      if (defaultOpen) setOpen(true);
   }, [defaultOpen]);
   const fields = (source.fieldIds ?? [])
      .map((id) => ontology.entities.get(id))
      .filter(Boolean) as Entity[];
   return (
      <div>
         <div className="flex items-center">
            <button
               onClick={() => setOpen(!open)}
               className="rounded p-1 text-muted-foreground hover:bg-accent"
               aria-label={open ? "Collapse" : "Expand"}
            >
               <ChevronRightIcon
                  className={cn(
                     "size-3.5 transition-transform",
                     open && "rotate-90",
                  )}
               />
            </button>
            <EntityRow
               ontology={ontology}
               entity={source}
               active={source.id === selectedId}
               drafted={Boolean(drafts[source.id])}
               className="flex-1"
               suffix={fields.length || undefined}
            />
         </div>
         {open && (
            <div className="ml-4 border-l pl-1">
               {FIELD_KINDS.map((kind) => {
                  const ofKind = fields.filter((f) => f.kind === kind);
                  if (ofKind.length === 0) return null;
                  return (
                     <KindGroup
                        key={kind}
                        kind={kind}
                        defaultOpen={!COLLAPSED_KINDS.has(kind)}
                        containsSelected={ofKind.some(
                           (f) => f.id === selectedId,
                        )}
                     >
                        {ofKind.map((f) => (
                           <EntityRow
                              key={f.id}
                              ontology={ontology}
                              entity={f}
                              active={f.id === selectedId}
                              drafted={Boolean(drafts[f.id])}
                           />
                        ))}
                     </KindGroup>
                  );
               })}
            </div>
         )}
      </div>
   );
}

const COLLAPSED_KINDS = new Set<EntityKind>(["measure", "dimension"]);

function KindGroup({
   kind,
   defaultOpen,
   containsSelected,
   children,
}: {
   kind: EntityKind;
   defaultOpen: boolean;
   containsSelected: boolean;
   children: ReactNode;
}) {
   const [open, setOpen] = useState(defaultOpen || containsSelected);
   useEffect(() => {
      if (containsSelected) setOpen(true);
   }, [containsSelected]);
   const count = Children.count(children);
   return (
      <div>
         <button
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
            aria-expanded={open}
         >
            <ChevronRightIcon
               className={cn(
                  "size-3 transition-transform",
                  open && "rotate-90",
               )}
            />
            <span className="flex-1 text-left">{KIND_META[kind].plural}</span>
            <span className="tabular-nums">{count}</span>
         </button>
         {open && <div className="ml-2">{children}</div>}
      </div>
   );
}

function EntityRow({
   ontology,
   entity,
   active,
   drafted,
   qualified = false,
   className,
   suffix,
}: {
   ontology: Ontology;
   entity: Entity;
   active: boolean;
   drafted: boolean;
   qualified?: boolean;
   className?: string;
   suffix?: number;
}) {
   const ref = useRef<HTMLAnchorElement>(null);
   useEffect(() => {
      if (active) ref.current?.scrollIntoView({ block: "nearest" });
   }, [active]);
   return (
      <Link
         ref={ref}
         to={dictionaryHref(ontology, entity.id)}
         className={cn(
            "flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent",
            active && "bg-accent font-medium text-foreground",
            className,
         )}
         title={entity.doc}
      >
         <KindIcon kind={entity.kind} className="shrink-0" />
         <span className="truncate font-mono text-xs">
            {qualified ? displayName(entity) : entity.name}
         </span>
         <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {suffix !== undefined && (
               <span className="text-[10px] tabular-nums text-muted-foreground">
                  {suffix}
               </span>
            )}
            <span
               className={cn(
                  "size-1.5 rounded-full",
                  entity.doc
                     ? "bg-answerable/70"
                     : drafted
                       ? "border border-dashed border-draft"
                       : "border border-muted-foreground/40",
               )}
               title={
                  entity.doc ? "Documented" : drafted ? "Draft" : "Undocumented"
               }
            />
         </span>
      </Link>
   );
}

function NavLink({
   to,
   active,
   label,
}: {
   ontology: Ontology;
   to: string;
   active: boolean;
   label: string;
}) {
   return (
      <Link
         to={to}
         className={cn(
            "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
            active && "bg-accent font-medium",
         )}
      >
         {label}
      </Link>
   );
}
