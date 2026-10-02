// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowDownLeft,
   ArrowUpRight,
   Calendar,
   CircleDot,
   Clock,
   Database,
   Eye,
   FileCode2,
   Filter,
   Hash,
   LayoutGrid,
   Link2,
   Package,
   PanelRightClose,
   PenLine,
   Plus,
   Shapes,
   Tag,
   User,
   X,
   type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { contentKinds, KindIcon } from "@/components/content-kind";
import { AiAvatar, PersonAvatar, useAuthorName } from "@/components/people";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
   useAnalyses,
   useLibrary,
   usePackageGraph,
   usePageMeta,
   usePeople,
   useSetPageMeta,
   useWorkspacePackages,
} from "@/data/hooks";
import {
   analysisPageKey,
   libraryPackageRoute,
   pageKey,
   workspaceRoute,
   type WorkspaceKind,
} from "@/data/publisher";
import {
   analysisRelations,
   relationsFor,
   type RelationEntry,
} from "@/data/relations";
import type {
   Analysis,
   JoinFacts,
   PageStatus,
   SourceFacts,
   WorkspaceItem,
} from "@/data/types";
import { ForYouPanel } from "@/features/recommendations/for-you-panel";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES: { id: PageStatus; label: string; className: string }[] = [
   {
      id: "draft",
      label: "Draft",
      className: "bg-muted text-muted-foreground",
   },
   {
      id: "in_review",
      label: "In review",
      className:
         "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
   },
   {
      id: "production",
      label: "Production",
      className:
         "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
   },
   {
      id: "archived",
      label: "Archived",
      className: "bg-muted text-muted-foreground line-through",
   },
];

const JOIN_LABEL: Record<JoinFacts["relationship"], [string, string]> = {
   one: ["N:1", "Many rows here match one row there"],
   many: ["1:N", "One row here matches many rows there"],
   cross: ["N:N", "Every row here pairs with every row there"],
};

/**
 * The details panel beside a Publisher page opened from the Packages
 * browser: this app's own properties for it (owner, status, tags), what
 * Publisher says it is, and every page it links to or is linked from.
 */
export function PageSidebar({
   packageName,
   kind,
   id,
   onClose,
}: {
   packageName: string;
   kind: WorkspaceKind;
   id: string;
   onClose: () => void;
}) {
   const pkg = useWorkspacePackages().data?.find((p) => p.name === packageName);
   const item = pkg?.items.find((i) => i.kind === kind && i.id === id);
   const graph = usePackageGraph(packageName);
   const analyses = useAnalyses().data;
   const library = useLibrary().data;

   const relations = useMemo(
      () =>
         pkg && item && graph.data
            ? relationsFor(pkg, graph.data, item, analyses ?? [], library ?? [])
            : undefined,
      [pkg, item, graph.data, analyses, library],
   );

   return (
      <SidebarShell onClose={onClose}>
         {/* A dashboard prints its own description above its controls. */}
         {item?.description && kind !== "dashboard" && (
            <About text={item.description} />
         )}
         <Properties
            packageName={packageName}
            kind={kind}
            id={id}
            item={item}
            graph={graph.data}
         />
         {graph.isPending ? (
            <RelationsSkeleton />
         ) : graph.error ? (
            <p className="px-2 text-xs text-muted-foreground">
               Couldn't read this package's relationships: {graph.error.message}
            </p>
         ) : relations ? (
            <div className="space-y-4">
               {relations.sources.length > 0 && (
                  <Group icon={Database} title="Sources">
                     <div className="space-y-2 px-2">
                        {relations.sources.map(({ facts }) => (
                           <SourceCard
                              key={facts.name}
                              source={facts}
                              pageItem={item}
                              sourceHome={relations.sourceHome}
                           />
                        ))}
                     </div>
                  </Group>
               )}
               <RelationGroup
                  icon={ArrowUpRight}
                  title="Depends on"
                  entries={relations.dependsOn}
               />
               <RelationGroup
                  icon={ArrowDownLeft}
                  title="Used by"
                  entries={relations.usedBy}
               />
               <RelationGroup
                  icon={Link2}
                  title="Referenced in"
                  entries={relations.referencedIn}
               />
            </div>
         ) : null}
      </SidebarShell>
   );
}

/**
 * The same details panel beside an analysis: this app's properties for it,
 * the Publisher resource it runs against, and what else reads that source.
 */
export function AnalysisSidebar({
   analysis,
   onClose,
}: {
   analysis: Analysis;
   onClose: () => void;
}) {
   const { provenance } = analysis;
   const packages = useWorkspacePackages();
   const pkg = packages.data?.find((p) => p.name === provenance.package);
   const graph = usePackageGraph(provenance.package);
   const analyses = useAnalyses().data;
   const library = useLibrary().data;
   const authorName = useAuthorName()(analysis.authorId);
   const { byId } = usePeople();
   const author =
      analysis.authorId === "ai" ? undefined : byId.get(analysis.authorId);
   const metaKey = analysisPageKey(analysis.id);
   const meta = usePageMeta(metaKey).data;

   const relations = useMemo(
      () =>
         pkg && graph.data
            ? analysisRelations(
                 pkg,
                 graph.data,
                 analysis,
                 analyses ?? [],
                 library ?? [],
              )
            : undefined,
      [pkg, graph.data, analysis, analyses, library],
   );
   const unserved =
      packages.error !== null || (packages.data !== undefined && !pkg);

   return (
      <SidebarShell onClose={onClose}>
         <div className="space-y-px">
            <Property icon={Shapes} label="Type">
               <span className="inline-flex items-center gap-1.5">
                  <KindIcon kind="insight" className="size-3.5" />
                  Analysis
               </span>
            </Property>
            <Property icon={PenLine} label="Author">
               <span className="inline-flex min-w-0 items-center gap-1.5">
                  {author ? (
                     <PersonAvatar person={author} className="size-5" />
                  ) : (
                     <AiAvatar className="size-5" />
                  )}
                  <span className="truncate">{authorName}</span>
               </span>
            </Property>
            <PageMetaProperties metaKey={metaKey} />
            <Property icon={Package} label="Package">
               <Link
                  to={libraryPackageRoute(provenance.package)}
                  className="font-mono text-xs hover:underline"
               >
                  {provenance.package}
               </Link>
            </Property>
            <Property icon={FileCode2} label="Model">
               <Link
                  to={workspaceRoute(
                     provenance.package,
                     "query",
                     provenance.model,
                  )}
                  className="truncate font-mono text-xs hover:underline"
                  title={provenance.model}
               >
                  {provenance.model}
               </Link>
            </Property>
            <Property icon={Database} label="Source">
               <span className="truncate font-mono text-xs">
                  {provenance.source}
               </span>
            </Property>
            {provenance.view && (
               <Property icon={Eye} label="View">
                  <span className="truncate font-mono text-xs">
                     {provenance.view}
                  </span>
               </Property>
            )}
            <Property icon={Calendar} label="Published">
               {relativeTime(analysis.createdAt)}
            </Property>
            {meta?.updatedAt && (
               <Property icon={Clock} label="Edited">
                  {relativeTime(meta.updatedAt)}
               </Property>
            )}
         </div>
         {unserved ? (
            <p className="px-2 text-xs text-muted-foreground">
               Publisher isn't serving{" "}
               <span className="font-mono">{provenance.package}</span> right
               now, so its relationships can't be read.
            </p>
         ) : graph.error ? (
            <p className="px-2 text-xs text-muted-foreground">
               Couldn't read this package's relationships: {graph.error.message}
            </p>
         ) : relations ? (
            <div className="space-y-4">
               {relations.source && (
                  <Group icon={Database} title="Source">
                     <div className="px-2">
                        <SourceCard
                           source={relations.source.facts}
                           pageItem={relations.model}
                           sourceHome={relations.sourceHome}
                        />
                     </div>
                  </Group>
               )}
               <RelationGroup
                  icon={ArrowUpRight}
                  title="Depends on"
                  entries={relations.dependsOn}
               />
               <RelationGroup
                  icon={Database}
                  title={`Also reads ${provenance.source}`}
                  entries={relations.sameSource}
               />
               <RelationGroup
                  icon={Link2}
                  title="Referenced in"
                  entries={relations.referencedIn}
               />
            </div>
         ) : (
            <RelationsSkeleton />
         )}
         <ForYouPanel analysis={analysis} />
      </SidebarShell>
   );
}

function SidebarShell({
   onClose,
   children,
}: {
   onClose: () => void;
   children: React.ReactNode;
}) {
   return (
      <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col overflow-y-auto border-l bg-sidebar/40 @4xl:flex">
         <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <span className="text-sm font-medium">Details</span>
            <Button
               variant="ghost"
               size="icon-sm"
               onClick={onClose}
               aria-label="Hide details"
            >
               <PanelRightClose />
            </Button>
         </div>
         <div className="space-y-6 px-2 pb-10">{children}</div>
      </aside>
   );
}

function RelationsSkeleton() {
   return (
      <div className="space-y-2 px-2">
         <Skeleton className="h-4 w-24" />
         <Skeleton className="h-16" />
         <Skeleton className="h-16" />
      </div>
   );
}

const DETAILS_KEY = "destination.page-details";

/** Whether the details sidebar is open, remembered across pages and visits. */
export function useDetailsOpen() {
   const [open, setOpen] = useState(
      () => localStorage.getItem(DETAILS_KEY) !== "closed",
   );
   const set = (next: boolean) => {
      localStorage.setItem(DETAILS_KEY, next ? "open" : "closed");
      setOpen(next);
   };
   return [open, set] as const;
}

// ── About ──────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) =>
   `${n} ${n === 1 ? one : many}`;

const plain = (md: string) =>
   md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");

function About({ text }: { text: string }) {
   const [open, setOpen] = useState(false);
   const long = text.length > 180;
   return (
      <div className="px-2">
         <p
            className={cn(
               "text-[13px] leading-relaxed text-muted-foreground",
               !open && long && "line-clamp-4",
            )}
         >
            {plain(text)}
         </p>
         {long && (
            <button
               onClick={() => setOpen((o) => !o)}
               className="mt-1 text-xs font-medium text-primary hover:underline"
            >
               {open ? "Show less" : "Show more"}
            </button>
         )}
      </div>
   );
}

// ── Properties ─────────────────────────────────────────────────────────

function Properties({
   packageName,
   kind,
   id,
   item,
   graph,
}: {
   packageName: string;
   kind: WorkspaceKind;
   id: string;
   item: WorkspaceItem | undefined;
   graph: ReturnType<typeof usePackageGraph>["data"];
}) {
   const key = pageKey(packageName, kind, id);
   const meta = usePageMeta(key).data;
   const file =
      item && kind !== "data_app" ? graph?.files[item.path] : undefined;
   const dashboard = kind === "dashboard" ? graph?.dashboards[id] : undefined;
   const app =
      item && kind === "data_app" ? graph?.dataApps[item.path] : undefined;
   const appViews = app?.queries.filter((q) => q.view) ?? [];
   const views = file?.sources.reduce((n, s) => n + s.views, 0) ?? 0;

   return (
      <div className="space-y-px">
         <Property icon={Shapes} label="Type">
            <span className="inline-flex items-center gap-1.5">
               <KindIcon kind={kind} className="size-3.5" />
               {kind === "query" ? "Model" : contentKinds[kind].label}
            </span>
         </Property>
         <PageMetaProperties metaKey={key} />
         <Property icon={Package} label="Package">
            <Link
               to={libraryPackageRoute(packageName)}
               className="font-mono text-xs hover:underline"
            >
               {packageName}
            </Link>
         </Property>
         {item && (
            <Property icon={FileCode2} label="File">
               <span className="truncate font-mono text-xs" title={item.path}>
                  {item.path}
               </span>
            </Property>
         )}
         {app && app.models.length > 0 && (
            <Property
               icon={FileCode2}
               label={app.models.length === 1 ? "Model" : "Models"}
               align="start"
            >
               <div className="flex min-w-0 flex-col gap-0.5">
                  {app.models.map((path) => (
                     <Link
                        key={path}
                        to={workspaceRoute(packageName, "query", path)}
                        className="truncate font-mono text-xs hover:underline"
                        title={path}
                     >
                        {path}
                     </Link>
                  ))}
               </div>
            </Property>
         )}
         {appViews.length > 0 && (
            <Property icon={Eye} label="Views" align="start">
               <div className="flex flex-wrap gap-1">
                  {appViews.map((q) => (
                     <span
                        key={`${q.model ?? ""}:${q.source}.${q.view}`}
                        title={`${q.source} -> ${q.view}${q.model ? ` in ${q.model}` : ""}`}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                     >
                        {q.view}
                     </span>
                  ))}
               </div>
            </Property>
         )}
         {dashboard && (
            <>
               <Property icon={LayoutGrid} label="Layout">
                  {plural(dashboard.tiles.length, "tile")} · {dashboard.columns}{" "}
                  columns
               </Property>
               {dashboard.filters.length > 0 && (
                  <Property icon={Filter} label="Filters" align="start">
                     <div className="flex flex-wrap gap-1">
                        {dashboard.filters.map((f) => (
                           <span
                              key={f.name}
                              title={f.type}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                           >
                              {f.name}
                           </span>
                        ))}
                     </div>
                  </Property>
               )}
            </>
         )}
         {kind === "query" && file && (
            <Property icon={Hash} label="Contents">
               {[
                  plural(file.sources.length, "source"),
                  plural(views, "view"),
                  file.queries.length > 0 &&
                     plural(file.queries.length, "query", "queries"),
               ]
                  .filter(Boolean)
                  .join(" · ")}
            </Property>
         )}
         {file?.malloyVersion && (
            <Property icon={Calendar} label="Malloy">
               <span className="font-mono text-xs">{file.malloyVersion}</span>
            </Property>
         )}
         {meta?.updatedAt && (
            <Property icon={Clock} label="Edited">
               {relativeTime(meta.updatedAt)}
            </Property>
         )}
      </div>
   );
}

/** Owner, status and tags: this app's own properties, saved as they change. */
function PageMetaProperties({ metaKey }: { metaKey: string }) {
   const meta = usePageMeta(metaKey).data;
   const setMeta = useSetPageMeta(metaKey);
   if (!meta) {
      return [User, CircleDot, Tag].map((icon, i) => (
         <Property key={i} icon={icon} label={["Owner", "Status", "Tags"][i]}>
            <Skeleton className="h-4 w-24" />
         </Property>
      ));
   }
   return (
      <>
         <OwnerProperty
            ownerId={meta.ownerId}
            onChange={(ownerId) => setMeta.mutate({ ownerId })}
         />
         <Property icon={CircleDot} label="Status">
            <StatusPicker
               status={meta.status}
               onChange={(status) => setMeta.mutate({ status })}
            />
         </Property>
         <Property icon={Tag} label="Tags" align="start">
            <TagsEditor
               tags={meta.tags}
               onChange={(tags) => setMeta.mutate({ tags })}
            />
         </Property>
      </>
   );
}

function Property({
   icon: Icon,
   label,
   align = "center",
   children,
}: {
   icon: LucideIcon;
   label: string;
   align?: "center" | "start";
   children: React.ReactNode;
}) {
   return (
      <div
         className={cn(
            "grid min-h-8 grid-cols-[104px_minmax(0,1fr)] gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-muted/50",
            align === "center" ? "items-center" : "items-start",
         )}
      >
         <span
            className={cn(
               "flex items-center gap-2 text-muted-foreground",
               align === "start" && "pt-0.5",
            )}
         >
            <Icon className="size-3.5 shrink-0" />
            {label}
         </span>
         <div className="flex min-w-0 items-center">{children}</div>
      </div>
   );
}

function OwnerProperty({
   ownerId,
   onChange,
}: {
   ownerId: string | undefined;
   onChange: (ownerId: string | undefined) => void;
}) {
   const { data: people, byId } = usePeople();
   const owner = ownerId ? byId.get(ownerId) : undefined;
   return (
      <Property icon={User} label="Owner">
         <DropdownMenu>
            <DropdownMenuTrigger className="-mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-muted">
               {owner ? (
                  <>
                     <PersonAvatar person={owner} className="size-5" />
                     <span className="truncate">{owner.name}</span>
                  </>
               ) : (
                  <span className="text-muted-foreground">Empty</span>
               )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
               {people?.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => onChange(p.id)}>
                     <PersonAvatar person={p} className="size-5" />
                     <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
               ))}
               {owner && (
                  <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onSelect={() => onChange(undefined)}>
                        <X />
                        Remove owner
                     </DropdownMenuItem>
                  </>
               )}
            </DropdownMenuContent>
         </DropdownMenu>
      </Property>
   );
}

function StatusPicker({
   status,
   onChange,
}: {
   status: PageStatus;
   onChange: (status: PageStatus) => void;
}) {
   const current = STATUSES.find((s) => s.id === status) ?? STATUSES[0];
   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            className={cn(
               "rounded px-1.5 py-0.5 text-xs font-medium",
               current.className,
            )}
         >
            {current.label}
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-40">
            {STATUSES.map((s) => (
               <DropdownMenuItem key={s.id} onSelect={() => onChange(s.id)}>
                  <span
                     className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        s.className,
                     )}
                  >
                     {s.label}
                  </span>
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

function TagsEditor({
   tags,
   onChange,
}: {
   tags: string[];
   onChange: (tags: string[]) => void;
}) {
   const [draft, setDraft] = useState("");
   const [adding, setAdding] = useState(false);
   const add = () => {
      const t = draft.trim();
      if (t && !tags.includes(t)) onChange([...tags, t]);
      setDraft("");
   };
   return (
      <div className="flex flex-wrap items-center gap-1">
         {tags.map((t) => (
            <span
               key={t}
               className="group inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
            >
               {t}
               <button
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  className="hidden opacity-70 hover:opacity-100 group-hover:inline"
                  aria-label={`Remove ${t}`}
               >
                  <X className="size-3" />
               </button>
            </span>
         ))}
         {adding ? (
            <input
               autoFocus
               value={draft}
               onChange={(e) => setDraft(e.target.value)}
               onBlur={() => {
                  add();
                  setAdding(false);
               }}
               onKeyDown={(e) => {
                  if (e.key === "Enter") {
                     e.preventDefault();
                     add();
                  } else if (e.key === "Escape") {
                     setDraft("");
                     setAdding(false);
                  }
               }}
               placeholder="Add tag"
               className="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
         ) : (
            <button
               onClick={() => setAdding(true)}
               className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
               <Plus className="size-3" />
               {tags.length === 0 && "Add"}
            </button>
         )}
      </div>
   );
}

// ── Relations ──────────────────────────────────────────────────────────

/** One kind of relation in the flat list, marked by a quiet label. */
function Group({
   icon: Icon,
   title,
   children,
}: {
   icon: LucideIcon;
   title: string;
   children: React.ReactNode;
}) {
   return (
      <section className="space-y-1">
         <h3 className="flex items-center gap-1.5 px-2 text-[11px] font-medium text-muted-foreground">
            <Icon className="size-3" />
            {title}
         </h3>
         {children}
      </section>
   );
}

const PREVIEW = 5;

function RelationGroup({
   icon,
   title,
   entries,
}: {
   icon: LucideIcon;
   title: string;
   entries: RelationEntry[];
}) {
   const [all, setAll] = useState(false);
   if (entries.length === 0) return null;
   const shown = all ? entries : entries.slice(0, PREVIEW);
   return (
      <Group icon={icon} title={title}>
         <ul>
            {shown.map((e) => (
               <li key={e.key}>
                  <RelationRow entry={e} />
               </li>
            ))}
            {entries.length > PREVIEW && (
               <li>
                  <button
                     onClick={() => setAll((a) => !a)}
                     className="px-2 py-1 pl-7 text-xs font-medium text-primary hover:underline"
                  >
                     {all
                        ? "Show fewer"
                        : `Show ${entries.length - PREVIEW} more`}
                  </button>
               </li>
            )}
         </ul>
      </Group>
   );
}

function RelationRow({ entry }: { entry: RelationEntry }) {
   const body = (
      <>
         {entry.kind === "source" ? (
            <Database className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
         ) : (
            <KindIcon
               kind={entry.kind}
               className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            />
         )}
         <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]">{entry.title}</span>
            {entry.subtitle && (
               <span className="block truncate text-xs text-muted-foreground">
                  {entry.subtitle}
               </span>
            )}
         </span>
      </>
   );
   const className = "flex items-start gap-2 rounded-md px-2 py-1.5";
   return entry.href ? (
      <Link to={entry.href} className={cn(className, "hover:bg-muted/60")}>
         {body}
      </Link>
   ) : (
      <div className={className}>{body}</div>
   );
}

function SourceCard({
   source,
   pageItem,
   sourceHome,
}: {
   source: SourceFacts;
   pageItem: WorkspaceItem | undefined;
   sourceHome: Map<string, WorkspaceItem>;
}) {
   const elsewhere = (name: string) => {
      const home = sourceHome.get(name);
      return home && home.path !== pageItem?.path ? home : undefined;
   };
   const SourceLink = ({ name }: { name: string }) => {
      const home = elsewhere(name);
      return home ? (
         <Link
            to={home.href}
            className="font-mono underline decoration-border underline-offset-2 hover:decoration-foreground"
            title={`Defined in ${home.path}`}
         >
            {name}
         </Link>
      ) : (
         <span className="font-mono">{name}</span>
      );
   };

   return (
      <div className="space-y-1.5 rounded-lg border bg-card p-2.5">
         <div className="flex items-center gap-1.5">
            <Database className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-[13px] font-medium">
               {source.name}
            </span>
         </div>
         {source.doc && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
               {plain(source.doc)}
            </p>
         )}
         <p className="truncate font-mono text-[11px] text-muted-foreground">
            {source.table ?? (
               <>
                  extends <SourceLink name={source.base ?? "?"} />
               </>
            )}
         </p>
         <p className="text-[11px] text-muted-foreground tabular-nums">
            {source.dimensions} dimensions · {source.measures} measures
            {source.views > 0 && ` · ${source.views} views`}
         </p>
         {source.joins.length > 0 && (
            <ul className="space-y-0.5 border-t pt-1.5">
               {source.joins.map((j) => {
                  const [badge, meaning] = JOIN_LABEL[j.relationship];
                  return (
                     <li
                        key={j.name}
                        className="flex items-center gap-1.5 text-xs"
                        title={j.doc}
                     >
                        <span className="text-muted-foreground">↳</span>
                        <SourceLink name={j.name} />
                        <span
                           className="ml-auto rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground"
                           title={meaning}
                        >
                           {badge}
                        </span>
                     </li>
                  );
               })}
            </ul>
         )}
      </div>
   );
}
