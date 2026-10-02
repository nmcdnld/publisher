// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { AnalysisMenu } from "@/components/analysis-actions";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { contentKinds } from "@/components/content-kind";
import { EvidenceChart } from "@/components/evidence-chart";
import { Masonry } from "@/components/masonry";
import { Byline, useAuthorName } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { PublisherMenu } from "@/components/publisher-menu";
import { SaveMenuItems, useFindingSave } from "@/components/save-menu";
import { ReportPreview, SavedFindingPreview } from "@/components/saved-finding";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from "@/components/ui/dialog";
import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import {
   useAnalyses,
   useCollections,
   useCreateCollection,
   useFeed,
   useLibrary,
   useLinkLibraryItem,
   useRemoveLibraryItem,
   useSetInCollection,
   useTopics,
   useViewer,
   useWorkspacePackages,
} from "@/data/hooks";
import {
   embedRoute,
   libraryPackageRoute,
   packageFileHref,
   WORKSPACE_ENVIRONMENT,
} from "@/data/publisher";
import {
   inPackage,
   libraryEntries,
   needsPromotion,
   promotableOf,
   type LibraryEntry,
   type Promotable,
   type SyncState,
} from "@/data/sync";
import type {
   Analysis,
   Collection,
   ContentKind,
   FeedPost,
   LibraryItem,
   WorkspaceItem,
   WorkspacePackage,
} from "@/data/types";
import {
   BriefingDialog,
   ChannelHeader,
   ChannelPicker,
   FOLLOWING,
   type Channel,
} from "@/features/library/channels";
import { PromoteWizard } from "@/features/library/promote-wizard";
import { relativeTime } from "@/lib/format";
import { parseRun } from "@/lib/promote";
import { dataAppRef } from "@/lib/save-app";
import { useDataAppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { slugOfAppPath } from "@malloy-publisher/app-manifest";
import { useDataAppThemeBridge } from "@malloy-publisher/sdk";
import {
   ArrowUpRight,
   Check,
   CircleAlert,
   ExternalLink,
   FileCode2,
   FolderPlus,
   Heart,
   Layers,
   LayoutGrid,
   Link2,
   MessageCircle,
   MoreHorizontal,
   Package,
   PenLine,
   RefreshCw,
   Rows3,
   Search,
   SquareFunction,
   Trash2,
   Users,
   type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
   Link,
   Navigate,
   useNavigate,
   useParams,
   useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";

type Scope = "personal" | "workspace";
type SyncFilter = "all" | "in_package" | "not_in_package";
type Layout = "feed" | "grid";

const LAYOUT_KEY = "destination.library-layout";

/** Feed or grid, remembered across visits; feed until someone picks grid. */
function useLayout() {
   const [layout, setLayout] = useState<Layout>(() =>
      localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "feed",
   );
   const set = (next: Layout) => {
      localStorage.setItem(LAYOUT_KEY, next);
      setLayout(next);
   };
   return [layout, set] as const;
}

/**
 * A Library entry with the analysis it stands for and the post that shared
 * it. A post no single item stands for is an entry of its own.
 */
interface Row extends LibraryEntry {
   analysis?: Analysis;
   post?: FeedPost;
}

const analysisIdOf = (href: string) =>
   href.match(/^\/analysis\/([^/?#]+)/)?.[1];

function withPosts(
   entries: LibraryEntry[],
   posts: FeedPost[],
   analyses: Map<string, Analysis>,
   standalone: (post: FeedPost, analysis: Analysis) => boolean,
): Row[] {
   const rows: Row[] = entries.map((e) => {
      const id = e.item && analysisIdOf(e.item.href);
      return { ...e, analysis: id ? analyses.get(id) : undefined };
   });
   for (const post of posts) {
      const analysis = analyses.get(post.analysisId);
      if (!analysis) continue;
      const matches = rows.filter((r) => r.analysis?.id === analysis.id);
      if (matches.length === 1 && !matches[0].post) matches[0].post = post;
      else if (standalone(post, analysis))
         rows.push({
            key: `post:${post.id}`,
            pkg: analysis.provenance.package,
            sync: { kind: "unknown" },
            analysis,
            post,
         });
   }
   return rows;
}

/** When a row last moved: its post, or its item's last edit. */
const dateOf = (r: Row) => {
   const dates = [r.post?.publishedAt, r.item?.updatedAt].filter(
      (d): d is string => Boolean(d),
   );
   return dates.length ? Math.max(...dates.map((d) => Date.parse(d))) : 0;
};

/**
 * A package's model file is a model, not a saved query, so it gets its own
 * facet. Notebooks are filed with insights.
 */
type Facet = Exclude<ContentKind, "notebook"> | "model";
const { notebook: _notebook, ...libraryKinds } = contentKinds;
const facets: Record<
   Facet,
   { label: string; plural: string; icon: LucideIcon }
> = {
   ...libraryKinds,
   model: { label: "Model", plural: "Models", icon: FileCode2 },
};

const facetOfKind = (kind: ContentKind): Facet =>
   kind === "notebook" ? "insight" : kind;

/** A saved finding, an analysis or an analyst's report, is filed as an insight. */
const fileFacet = (item: WorkspaceItem): Facet =>
   item.manifest
      ? "insight"
      : item.kind === "query"
         ? "model"
         : facetOfKind(item.kind);

const facetOf = (e: Row): Facet =>
   e.item
      ? facetOfKind(e.item.kind)
      : e.post
         ? "insight"
         : e.sync.kind === "package"
            ? fileFacet(e.sync.target)
            : "query";

function FacetIcon({ facet, className }: { facet: Facet; className?: string }) {
   const Icon = facets[facet].icon;
   return <Icon className={cn("size-4", className)} />;
}

const searchText = (e: Row) =>
   [
      e.item
         ? `${e.item.title} ${e.item.description} ${e.item.provenance.source} ${e.item.provenance.view ?? ""} ${e.pkg ?? ""}`
         : e.sync.kind === "package"
            ? `${e.sync.target.title} ${e.sync.target.description ?? ""} ${e.sync.target.path} ${e.pkg}`
            : "",
      e.analysis
         ? `${e.analysis.title} ${e.analysis.narrative} ${e.analysis.provenance.source} ${e.analysis.provenance.view ?? ""}`
         : "",
   ].join(" ");

/** The old package routes, which the Library now covers. */
export function PackageRedirect() {
   const { packageName = "" } = useParams();
   return <Navigate to={libraryPackageRoute(packageName)} replace />;
}

/** The old Feed, which the Library's channels and feed layout now cover. */
export function FeedRedirect() {
   const [params] = useSearchParams();
   return (
      <Navigate
         to={`/library?scope=workspace&channel=${encodeURIComponent(params.get("topic") ?? FOLLOWING)}`}
         replace
      />
   );
}

export function LibraryPage() {
   const [params, setParams] = useSearchParams();
   const library = useLibrary().data;
   const collections = useCollections().data ?? [];
   const packages = useWorkspacePackages();
   const analyses = useAnalyses().byId;
   const feed = useFeed().data;
   const topics = useTopics().data ?? [];
   const viewer = useViewer().data;
   const viewerId = viewer?.person.id;
   const followed = new Set(viewer?.followedTopicIds);
   const highlight = params.get("item");
   const collectionId = params.get("collection");
   const packageName = params.get("package");
   const channel: Channel = params.get("channel");
   const scope: Scope =
      params.get("scope") === "workspace" || packageName
         ? "workspace"
         : "personal";
   const [query, setQuery] = useState("");
   const [kind, setKind] = useState<Facet | null>(null);
   const [sync, setSync] = useState<SyncFilter>("all");
   const [layout, setLayout] = useLayout();
   const [promoting, setPromoting] = useState<{
      item: LibraryItem;
      promotable: Promotable;
   } | null>(null);

   const navigate = (next: {
      scope?: Scope;
      collection?: string | null;
      package?: string | null;
      channel?: Channel;
   }) => {
      const p: Record<string, string> = {};
      const s = next.scope ?? scope;
      if (s === "workspace") p.scope = s;
      if (next.collection) p.collection = next.collection;
      if (next.package) p.package = next.package;
      const c = next.channel === undefined ? channel : next.channel;
      if (c) p.channel = c;
      setParams(p);
   };
   const pickChannel = (c: Channel) =>
      navigate({ collection: collectionId, package: packageName, channel: c });

   useEffect(() => {
      const item = library?.find((i) => i.id === highlight);
      if (!item) return;
      if (item.scope !== scope) navigate({ scope: item.scope });
      document
         .getElementById(`item-${item.id}`)
         ?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Only a newly highlighted item should move the page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [highlight, library]);

   const collection = collections.find((c) => c.id === collectionId);
   const pkg = packages.data?.find((p) => p.name === packageName);
   const inScope = (i: LibraryItem) =>
      scope === "personal" ? i.ownerId === viewerId : i.scope === "workspace";

   const all = withPosts(
      libraryEntries(
         (library ?? []).filter((i) =>
            collection ? i.collectionIds.includes(collection.id) : inScope(i),
         ),
         packages.data,
         (p) =>
            !collection &&
            scope === "workspace" &&
            (!packageName || p.name === packageName),
      ),
      feed ?? [],
      analyses,
      (_post, analysis) =>
         !collection &&
         (scope === "workspace" || analysis.authorId === viewerId),
   );
   const base = packageName ? all.filter((e) => e.pkg === packageName) : all;

   const needle = query.trim().toLowerCase();
   const matched = base.filter(
      (e) => !needle || searchText(e).toLowerCase().includes(needle),
   );
   const channelCounts = new Map<string, number>();
   for (const e of matched)
      for (const t of e.analysis?.topics ?? [])
         channelCounts.set(t, (channelCounts.get(t) ?? 0) + 1);
   const searched = matched.filter((e) => {
      const ts = e.analysis?.topics ?? [];
      if (!channel) return true;
      if (channel === FOLLOWING) return ts.some((t) => followed.has(t));
      return ts.includes(channel);
   });
   const syncCounts = {
      all: searched.length,
      in_package: searched.filter((e) => inPackage(e.sync)).length,
      not_in_package: searched.filter((e) => needsPromotion(e.sync)).length,
   };
   const synced = searched.filter(
      (e) =>
         sync === "all" ||
         (sync === "in_package" ? inPackage(e.sync) : needsPromotion(e.sync)),
   );
   const kinded = synced.filter((e) => !kind || facetOf(e) === kind);
   const entries =
      layout === "feed"
         ? [...kinded].sort((a, b) => dateOf(b) - dateOf(a))
         : kinded;
   const kindCounts = new Map<Facet, number>();
   for (const e of synced)
      kindCounts.set(facetOf(e), (kindCounts.get(facetOf(e)) ?? 0) + 1);

   const loading =
      !library || !feed || (scope === "workspace" && packages.isPending);

   const renderRow = (e: Row) => {
      const onPromote = (promotable: Promotable) =>
         setPromoting({ item: e.item!, promotable });
      const promotable = e.item && promotableOf(e.item, analyses);
      if (!e.item && !e.post)
         return (
            e.sync.kind === "package" && (
               <PackageFileCard
                  key={e.key}
                  pkg={e.sync.pkg}
                  item={e.sync.target}
                  showPackage={!packageName}
                  preview={layout === "feed"}
               />
            )
         );
      if (layout === "feed")
         return (
            <FeedCard
               key={e.key}
               row={e}
               collections={collections}
               highlighted={e.item?.id === highlight}
               promotable={promotable}
               onPromote={onPromote}
               onChannel={(t) => pickChannel(t)}
            />
         );
      return e.item ? (
         <LibraryCard
            key={e.key}
            item={e.item}
            sync={e.sync}
            collections={collections}
            highlighted={e.item.id === highlight}
            promotable={promotable}
            onPromote={onPromote}
         />
      ) : (
         <PostTile key={e.key} post={e.post!} analysis={e.analysis!} />
      );
   };

   return (
      <PageContainer className="max-w-7xl">
         <PageHeader
            title="Library"
            description={
               scope === "personal"
                  ? "Everything you've kept and posted: insights, models, dashboards, and data apps."
                  : `Everything saved to your team workspace or published to packages: insights, models, dashboards, and data apps.`
            }
            actions={
               <div className="flex items-center gap-2">
                  <BriefingDialog />
                  {scope === "workspace" && (
                     <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={packages.isFetching}
                        onClick={() => void packages.refetch()}
                        aria-label="Refresh packages"
                        title="Refresh packages"
                     >
                        <RefreshCw
                           className={packages.isFetching ? "animate-spin" : ""}
                        />
                     </Button>
                  )}
                  <Tabs
                     value={scope}
                     onValueChange={(v) => navigate({ scope: v as Scope })}
                  >
                     <TabsList>
                        <TabsTrigger value="personal">Personal</TabsTrigger>
                        <TabsTrigger value="workspace">Workspace</TabsTrigger>
                     </TabsList>
                  </Tabs>
               </div>
            }
         />

         <div className="grid gap-8 @3xl:grid-cols-[220px_minmax(0,1fr)]">
            <LibraryNav
               collections={collections.filter((c) =>
                  scope === "personal"
                     ? c.ownerId === viewerId
                     : c.scope === "workspace",
               )}
               library={library ?? []}
               packages={scope === "workspace" ? packages : undefined}
               selectedCollection={collection?.id ?? null}
               selectedPackage={packageName}
               onSelect={(to) => navigate(to)}
               scope={scope}
            />

            <div className="min-w-0 space-y-4">
               {channel && (
                  <ChannelHeader
                     channel={channel}
                     topics={topics}
                     followed={followed}
                     count={loading ? undefined : searched.length}
                     onChange={pickChannel}
                  />
               )}
               {collection && (
                  <CollectionHeader
                     collection={collection}
                     count={base.length}
                  />
               )}
               {packageName && (
                  <PackageHeader
                     name={packageName}
                     pkg={pkg}
                     loading={packages.isPending}
                     entries={base}
                  />
               )}
               {scope === "workspace" && packages.error && (
                  <PublisherDown message={packages.error.message} />
               )}
               <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                     <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                     <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by title, description, source, view, or file"
                        className="pl-9"
                     />
                  </div>
                  {packages.data && (
                     <Tabs
                        value={sync}
                        onValueChange={(v) => setSync(v as SyncFilter)}
                     >
                        <TabsList>
                           <TabsTrigger value="all">
                              All <Count>{syncCounts.all}</Count>
                           </TabsTrigger>
                           <TabsTrigger value="in_package">
                              In a package{" "}
                              <Count>{syncCounts.in_package}</Count>
                           </TabsTrigger>
                           <TabsTrigger value="not_in_package">
                              Not in one{" "}
                              <Count>{syncCounts.not_in_package}</Count>
                           </TabsTrigger>
                        </TabsList>
                     </Tabs>
                  )}
               </div>
               <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                     <FacetChip active={!kind} onClick={() => setKind(null)}>
                        All <Count>{synced.length}</Count>
                     </FacetChip>
                     {(Object.keys(facets) as Facet[])
                        .filter((k) => kindCounts.has(k))
                        .map((k) => (
                           <FacetChip
                              key={k}
                              active={kind === k}
                              onClick={() => setKind(kind === k ? null : k)}
                           >
                              <FacetIcon facet={k} className="size-3.5" />
                              {facets[k].plural}
                              <Count>{kindCounts.get(k)}</Count>
                           </FacetChip>
                        ))}
                  </div>
                  <div className="flex items-center gap-2">
                     <ChannelPicker
                        topics={topics}
                        followed={followed}
                        counts={channelCounts}
                        value={channel}
                        onChange={pickChannel}
                     />
                     <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={layout}
                        onValueChange={(v) => v && setLayout(v as Layout)}
                     >
                        <ToggleGroupItem
                           value="feed"
                           aria-label="Feed layout"
                           title="Feed"
                        >
                           <Rows3 />
                        </ToggleGroupItem>
                        <ToggleGroupItem
                           value="grid"
                           aria-label="Grid layout"
                           title="Grid"
                        >
                           <LayoutGrid />
                        </ToggleGroupItem>
                     </ToggleGroup>
                  </div>
               </div>

               {loading ? (
                  layout === "feed" ? (
                     <div className="grid gap-4 @5xl:grid-cols-2">
                        {[0, 1, 2, 3].map((i) => (
                           <Skeleton key={i} className="h-72 rounded-xl" />
                        ))}
                     </div>
                  ) : (
                     <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                           <Skeleton key={i} className="h-48 rounded-xl" />
                        ))}
                     </div>
                  )
               ) : entries.length === 0 ? (
                  <Card className="items-center p-10 text-center text-sm text-muted-foreground">
                     {base.length === 0
                        ? packageName
                           ? `Nothing in ${packageName} yet.`
                           : "Nothing saved here yet. Use Save on any card to keep it."
                        : channel === FOLLOWING && followed.size === 0
                           ? "Follow a channel to fill this view."
                           : "No matches. Try a different search, type, channel, or filter."}
                  </Card>
               ) : layout === "feed" ? (
                  <Masonry className="@5xl:grid-cols-2">
                     {entries.map(renderRow)}
                  </Masonry>
               ) : (
                  <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
                     {entries.map(renderRow)}
                  </div>
               )}
            </div>
         </div>
         {promoting && (
            <PromoteWizard
               item={promoting.item}
               promotable={promoting.promotable}
               open
               onOpenChange={(open) => !open && setPromoting(null)}
            />
         )}
      </PageContainer>
   );
}

const Count = ({ children }: { children: React.ReactNode }) => (
   <span className="text-muted-foreground tabular-nums">{children}</span>
);

function PublisherDown({ message }: { message: string }) {
   return (
      <Card className="gap-2 p-4 text-sm">
         <p className="font-medium">
            Publisher didn't answer, so packages are missing below.
         </p>
         <p className="text-muted-foreground">
            {message}. Start it with{" "}
            <code className="font-mono">bun run start:dev</code> from the repo
            root; this page reads it through the dev server's{" "}
            <code className="font-mono">/api/v0</code> proxy.
         </p>
      </Card>
   );
}

function FacetChip({
   active,
   onClick,
   children,
}: {
   active: boolean;
   onClick: () => void;
   children: React.ReactNode;
}) {
   return (
      <button
         onClick={onClick}
         className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
            active
               ? "border-primary bg-primary/10 text-foreground"
               : "bg-card text-muted-foreground hover:bg-muted",
         )}
      >
         {children}
      </button>
   );
}

function LibraryNav({
   collections,
   library,
   packages,
   selectedCollection,
   selectedPackage,
   onSelect,
   scope,
}: {
   collections: Collection[];
   library: LibraryItem[];
   packages?: ReturnType<typeof useWorkspacePackages>;
   selectedCollection: string | null;
   selectedPackage: string | null;
   onSelect: (to: { collection?: string; package?: string }) => void;
   scope: Scope;
}) {
   const count = (id: string) =>
      library.filter((i) => i.collectionIds.includes(id)).length;
   const row = (active: boolean) =>
      cn(
         "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
         active && "bg-muted font-medium",
      );
   const heading = (label: string, action?: React.ReactNode) => (
      <div className="flex h-10 items-end justify-between px-2.5 pb-1">
         <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
         </span>
         {action}
      </div>
   );
   return (
      <nav className="space-y-1">
         <button
            className={row(!selectedCollection && !selectedPackage)}
            onClick={() => onSelect({})}
         >
            <Layers className="size-4 text-muted-foreground" />
            <span className="flex-1">
               {scope === "personal" ? "All my items" : "All workspace items"}
            </span>
         </button>
         {packages && (
            <>
               {heading("Packages")}
               {packages.isPending ? (
                  <Skeleton className="mx-2.5 h-6" />
               ) : (
                  (packages.data ?? []).map((p) => (
                     <button
                        key={p.name}
                        className={row(selectedPackage === p.name)}
                        onClick={() => onSelect({ package: p.name })}
                        title={p.description}
                     >
                        <Package className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                           {p.name}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                           {p.items.length}
                        </span>
                     </button>
                  ))
               )}
               {packages.data?.length === 0 && (
                  <p className="px-2.5 text-xs text-muted-foreground">
                     {WORKSPACE_ENVIRONMENT} serves no packages.
                  </p>
               )}
            </>
         )}
         {heading(
            "Collections",
            <NewCollectionDialog
               scope={scope}
               onCreated={(id) => onSelect({ collection: id })}
            />,
         )}
         {collections.map((c) => (
            <button
               key={c.id}
               className={row(selectedCollection === c.id)}
               onClick={() => onSelect({ collection: c.id })}
            >
               <span className="size-2 rounded-full bg-primary/60" />
               <span className="min-w-0 flex-1 truncate">{c.name}</span>
               <span className="text-xs text-muted-foreground tabular-nums">
                  {count(c.id)}
               </span>
            </button>
         ))}
         {collections.length === 0 && (
            <p className="px-2.5 text-xs text-muted-foreground">
               No collections yet.
            </p>
         )}
      </nav>
   );
}

function CollectionHeader({
   collection,
   count,
}: {
   collection: Collection;
   count: number;
}) {
   const authorName = useAuthorName();
   return (
      <div className="rounded-xl border bg-gradient-to-br from-accent to-card p-5">
         <h2 className="text-xl font-semibold tracking-tight">
            {collection.name}
         </h2>
         <p className="mt-1 text-sm text-muted-foreground">
            {collection.description}
         </p>
         <p className="mt-3 text-xs text-muted-foreground">
            Curated by {authorName(collection.ownerId)} · {count} items
         </p>
      </div>
   );
}

function PackageHeader({
   name,
   pkg,
   loading,
   entries,
}: {
   name: string;
   pkg?: WorkspacePackage;
   loading: boolean;
   entries: LibraryEntry[];
}) {
   const pending = entries.filter((e) => needsPromotion(e.sync)).length;
   return (
      <div className="rounded-xl border bg-gradient-to-br from-accent to-card p-5">
         <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 font-mono text-xl font-semibold tracking-tight">
               <Package className="size-5 text-muted-foreground" />
               {name}
            </h2>
            {pkg && (
               <div className="-my-1 -mr-2">
                  <PublisherMenu publisherUrl={pkg.publisherUrl} />
               </div>
            )}
         </div>
         {pkg?.description && (
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
               {pkg.description}
            </p>
         )}
         <p className="mt-3 text-xs text-muted-foreground">
            {pkg
               ? `${pkg.items.length} files served by Publisher`
               : loading
                  ? "Reading from Publisher…"
                  : `Publisher serves no package named ${name} in ${WORKSPACE_ENVIRONMENT}`}
            {pending > 0 &&
               ` · ${pending} workspace item${pending === 1 ? "" : "s"} built on it not saved to it yet`}
         </p>
      </div>
   );
}

function NewCollectionDialog({
   scope,
   onCreated,
}: {
   scope: Scope;
   onCreated: (id: string) => void;
}) {
   const create = useCreateCollection();
   const [open, setOpen] = useState(false);
   const [name, setName] = useState("");
   const [description, setDescription] = useState("");
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
            <Button
               size="icon"
               variant="ghost"
               className="size-6"
               aria-label="New collection"
            >
               <FolderPlus className="size-3.5" />
            </Button>
         </DialogTrigger>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New {scope} collection</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
               <div className="space-y-1.5">
                  <Label htmlFor="col-name">Name</Label>
                  <Input
                     id="col-name"
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     placeholder="Board prep"
                  />
               </div>
               <div className="space-y-1.5">
                  <Label htmlFor="col-desc">What's it for?</Label>
                  <Textarea
                     id="col-desc"
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                  />
               </div>
            </div>
            <DialogFooter>
               <Button
                  disabled={!name.trim() || create.isPending}
                  onClick={() =>
                     create.mutate(
                        [{ name: name.trim(), description, scope }],
                        {
                           onSuccess: (c) => {
                              setOpen(false);
                              setName("");
                              setDescription("");
                              onCreated(c.id);
                           },
                        },
                     )
                  }
               >
                  Create
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Where a Library entry stands against its package, on its card. */
function SyncBadge({ sync, itemId }: { sync: SyncState; itemId?: string }) {
   const link = useLinkLibraryItem();
   const tip = (trigger: React.ReactElement, content: React.ReactNode) => (
      <Tooltip>
         <TooltipTrigger asChild>{trigger}</TooltipTrigger>
         <TooltipContent className="font-mono text-xs">
            {content}
         </TooltipContent>
      </Tooltip>
   );
   switch (sync.kind) {
      case "synced":
      case "package":
         return tip(
            <Link
               to={sync.target.href}
               className={cn(
                  chip,
                  "relative z-10 max-w-36 text-foreground hover:bg-muted",
               )}
            >
               <Check className="size-3 shrink-0 text-primary" />
               <span className="truncate">
                  In <span className="font-mono">{sync.pkg}</span>
               </span>
            </Link>,
            `${sync.pkg}/${sync.target.path}`,
         );
      case "linkable":
         return tip(
            <button
               disabled={!itemId || link.isPending}
               onClick={() =>
                  itemId &&
                  link.mutate([itemId, linkRef(sync.pkg, sync.target)])
               }
               className={cn(
                  chip,
                  "relative z-10 max-w-40 border-primary/40 text-foreground hover:bg-muted",
               )}
            >
               <Link2 className="size-3 shrink-0 text-primary" />
               <span className="truncate">
                  In <span className="font-mono">{sync.pkg}</span>, link it
               </span>
            </button>,
            `${sync.pkg}/${sync.target.path} was saved from this. Link them so they show as one.`,
         );
      case "unpromoted":
         return (
            <span
               className={cn(
                  chip,
                  "shrink-0 border-dashed text-muted-foreground",
               )}
            >
               Not in a package
            </span>
         );
      case "missing":
         return tip(
            <span
               className={cn(
                  chip,
                  "max-w-36 border-destructive/40 text-destructive",
               )}
            >
               <CircleAlert className="size-3 shrink-0" />
               <span className="truncate">
                  Gone from{" "}
                  <span className="font-mono">{sync.ref.package}</span>
               </span>
            </span>,
            `${sync.ref.package}/${sync.ref.path} no longer serves it`,
         );
      case "unknown":
         return null;
   }
}

/**
 * Drawn at this fraction of its size, so the card shows the desktop layout.
 * Dashboards and models open on their filter controls, so they're drawn
 * smaller to reach what's under them.
 */
const PREVIEW_SCALE: Record<WorkspaceItem["kind"], number> = {
   data_app: 0.6,
   dashboard: 0.4,
   notebook: 0.6,
   query: 0.45,
};

/** Where a package item can be shown live, when it can be. */
function previewSrc(pkg: string, item: WorkspaceItem): string | undefined {
   if (item.kind === "data_app") return packageFileHref(pkg, item.path);
   if (item.kind === "dashboard" || item.kind === "query")
      return embedRoute(pkg, item.kind, item.id);
   return undefined;
}

/** The top of a data app, dashboard, or model, live but inert, clipped to the card with a fade. */
function LivePreview({
   pkg,
   item,
   title,
}: {
   pkg: string;
   item: WorkspaceItem;
   title: string;
}) {
   const src = previewSrc(pkg, item);
   const frameRef = useRef<HTMLIFrameElement | null>(null);
   useDataAppThemeBridge(frameRef, useDataAppTheme());
   if (!src) return null;
   const scale = PREVIEW_SCALE[item.kind];
   return (
      <div className="pointer-events-none relative h-80 overflow-hidden rounded-lg border bg-background">
         <iframe
            ref={frameRef}
            src={src}
            title={`${title} preview`}
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            className="absolute top-0 left-0 origin-top-left border-0"
            style={{
               width: `${100 / scale}%`,
               height: `${100 / scale}%`,
               transform: `scale(${scale})`,
            }}
         />
         <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
      </div>
   );
}

function KindLabel({ facet }: { facet: Facet }) {
   return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
         <FacetIcon facet={facet} className="size-3.5" />
         {facets[facet].label}
      </span>
   );
}

/** An in-app route as a Link, or an absolute URL in a new tab. */
function ItemLink({
   href,
   className,
   children,
}: {
   href: string;
   className?: string;
   children: React.ReactNode;
}) {
   return /^https?:/.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
         {children}
      </a>
   ) : (
      <Link to={href} className={className}>
         {children}
      </Link>
   );
}

/** Follows an in-app route, or opens an absolute URL in a new tab. */
function useOpen() {
   const navigate = useNavigate();
   return (href: string) =>
      /^https?:/.test(href)
         ? window.open(href, "_blank", "noreferrer")
         : navigate(href);
}

function ItemMenu({
   item,
   sync,
   analysisId,
   collections,
   promotable,
   onPromote,
}: {
   item: LibraryItem;
   sync: SyncState;
   /** The analysis the item stands for, which adds Remix. */
   analysisId?: string;
   collections: Collection[];
   /** The finding behind the item, when it has a query, which adds Save. */
   promotable?: Promotable;
   /** Opens the wizard that adds its query to the model. */
   onPromote: (promotable: Promotable) => void;
}) {
   const open = useOpen();
   const navigate = useNavigate();
   const setIn = useSetInCollection();
   const remove = useRemoveLibraryItem();
   const link = useLinkLibraryItem();
   const save = useFindingSave(promotable);
   const viewerId = useViewer().data?.person.id;
   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                  aria-label="More actions"
               >
                  <MoreHorizontal className="size-4" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
               <DropdownMenuItem onSelect={() => open(item.href)}>
                  <ArrowUpRight />
                  Open
               </DropdownMenuItem>
               {promotable && <SaveMenuItems save={save} />}
               {sync.kind === "linkable" && (
                  <DropdownMenuItem
                     onSelect={() =>
                        link.mutate([item.id, linkRef(sync.pkg, sync.target)])
                     }
                  >
                     <Link2 />
                     Link to its app in {sync.pkg}
                  </DropdownMenuItem>
               )}
               {analysisId && (
                  <DropdownMenuItem
                     onSelect={() =>
                        navigate(`/analysis/${analysisId}?remix=1`)
                     }
                  >
                     <PenLine />
                     Remix
                  </DropdownMenuItem>
               )}
               {promotable && parseRun(promotable.malloy) && (
                  <DropdownMenuItem onSelect={() => onPromote(promotable)}>
                     <SquareFunction />
                     Add its query to the model…
                  </DropdownMenuItem>
               )}
               <DropdownMenuSeparator />
               <DropdownMenuLabel>Add to collection</DropdownMenuLabel>
               {collections.map((c) => (
                  <DropdownMenuCheckboxItem
                     key={c.id}
                     checked={item.collectionIds.includes(c.id)}
                     onSelect={(e) => e.preventDefault()}
                     onCheckedChange={(checked) =>
                        setIn.mutate([item.id, c.id, checked])
                     }
                  >
                     {c.name}
                  </DropdownMenuCheckboxItem>
               ))}
               {item.publisherUrl && (
                  <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem asChild>
                        <a
                           href={item.publisherUrl}
                           target="_blank"
                           rel="noreferrer"
                        >
                           <ExternalLink />
                           Open in Publisher
                        </a>
                     </DropdownMenuItem>
                  </>
               )}
               {item.ownerId === viewerId && (
                  <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem
                        variant="destructive"
                        onSelect={() =>
                           remove.mutate([item.id], {
                              onSuccess: () =>
                                 toast("Removed from your Library"),
                           })
                        }
                     >
                        <Trash2 />
                        Remove
                     </DropdownMenuItem>
                  </>
               )}
            </DropdownMenuContent>
         </DropdownMenu>
         {save.dialog}
      </>
   );
}

/** How an item is tied to a data app saved from the same finding. */
const linkRef = (pkg: string, target: WorkspaceItem) =>
   dataAppRef(pkg, slugOfAppPath(target.id) ?? target.id);

/** A count with an icon, named in full on hover. */
function Stat({
   icon: Icon,
   value,
   label,
}: {
   icon: LucideIcon;
   value: number;
   label: string;
}) {
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
               <Icon className="size-3.5" />
               {value}
            </span>
         </TooltipTrigger>
         <TooltipContent>{label}</TooltipContent>
      </Tooltip>
   );
}

function Engagement({ post }: { post: FeedPost }) {
   return (
      <span className="inline-flex shrink-0 items-center gap-2.5">
         <Stat
            icon={Heart}
            value={post.reactions}
            label={`${post.reactions} reaction${post.reactions === 1 ? "" : "s"}`}
         />
         <Stat
            icon={MessageCircle}
            value={post.comments}
            label={`${post.comments} comment${post.comments === 1 ? "" : "s"}`}
         />
      </span>
   );
}

const ReliedOn = ({ item }: { item: LibraryItem }) => (
   <Stat
      icon={Users}
      value={item.reliedOnBy}
      label={`${item.reliedOnBy} ${item.reliedOnBy === 1 ? "person relies" : "people rely"} on this`}
   />
);

/** A small one-line chip; what doesn't fit is cut and named in full on hover. */
const chip =
   "inline-flex h-5 min-w-0 shrink items-center gap-1 rounded-full border px-1.5 text-[11px] leading-none whitespace-nowrap";

/** The first few channels as chips, the rest folded into "+N". */
function ChannelChips({
   topics,
   onChannel,
   max = 2,
}: {
   topics: string[];
   onChannel: (topic: string) => void;
   max?: number;
}) {
   const labels = new Map((useTopics().data ?? []).map((t) => [t.id, t.label]));
   const label = (t: string) => `#${labels.get(t) ?? t}`;
   const shown = topics.slice(0, max);
   const rest = topics.slice(max);
   return (
      <>
         {shown.map((t) => (
            <Tooltip key={t}>
               <TooltipTrigger asChild>
                  <button
                     onClick={() => onChannel(t)}
                     className={cn(
                        chip,
                        "max-w-28 border-transparent bg-secondary text-secondary-foreground hover:bg-accent",
                     )}
                  >
                     <span className="truncate">{label(t)}</span>
                  </button>
               </TooltipTrigger>
               <TooltipContent>Show {label(t)}</TooltipContent>
            </Tooltip>
         ))}
         {rest.length > 0 && (
            <Tooltip>
               <TooltipTrigger asChild>
                  <span
                     className={cn(
                        chip,
                        "shrink-0 border-transparent bg-secondary text-muted-foreground",
                     )}
                  >
                     +{rest.length}
                  </span>
               </TooltipTrigger>
               <TooltipContent>{rest.map(label).join(", ")}</TooltipContent>
            </Tooltip>
         )}
      </>
   );
}

/** An entry at full width: the story and its chart, with the rest in its ⋯ menu. */
function FeedCard({
   row,
   collections,
   highlighted,
   promotable,
   onPromote,
   onChannel,
}: {
   row: Row;
   collections: Collection[];
   highlighted: boolean;
   promotable?: Promotable;
   onPromote: (promotable: Promotable) => void;
   onChannel: (topic: string) => void;
}) {
   const { item, post, analysis, sync } = row;
   const href = item?.href ?? `/analysis/${analysis!.id}`;
   const saved =
      (sync.kind === "synced" || sync.kind === "linkable") &&
         sync.target.manifest
         ? {
            pkg: sync.pkg,
            item: { ...sync.target, manifest: sync.target.manifest },
         }
         : undefined;
   const title = item?.title ?? analysis!.title;
   const provenance = item?.provenance ?? analysis!.provenance;

   return (
      <Card
         id={item ? `item-${item.id}` : undefined}
         className={cn(
            "group gap-4 p-5 transition-colors hover:border-primary/40",
            highlighted && "ring-2 ring-primary/40",
         )}
      >
         <div className="flex items-center justify-between gap-2">
            {post && analysis ? (
               <Byline
                  authorId={analysis.authorId}
                  suffix={`posted ${relativeTime(post.publishedAt)}`}
               />
            ) : (
               item && (
                  <Byline
                     authorId={item.ownerId}
                     suffix={`updated ${relativeTime(item.updatedAt)}`}
                  />
               )
            )}
            <div className="flex shrink-0 items-center gap-2">
               <KindLabel facet={facetOf(row)} />
               {item ? (
                  <ItemMenu
                     item={item}
                     sync={sync}
                     analysisId={analysis?.id}
                     collections={collections}
                     promotable={promotable}
                     onPromote={onPromote}
                  />
               ) : (
                  <AnalysisMenu analysis={analysis!} />
               )}
            </div>
         </div>

         <div className="space-y-2">
            <ItemLink href={href} className="block">
               <h3 className="text-lg font-semibold tracking-tight group-hover:underline">
                  {title}
               </h3>
            </ItemLink>
            <p className="leading-relaxed">
               {item?.description ?? analysis!.narrative}
            </p>
            {!item && analysis && analysis.details.length > 0 && (
               <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {analysis.details.slice(0, 2).map((d) => (
                     <li key={d}>{d}</li>
                  ))}
               </ul>
            )}
         </div>

         {saved && !analysis ? (
            <ItemLink href={href} className="block">
               <SavedFindingPreview pkg={saved.pkg} item={saved.item} />
            </ItemLink>
         ) : sync.kind === "synced" &&
            !sync.target.manifest &&
            previewSrc(sync.pkg, sync.target) ? (
            <ItemLink href={href} className="block">
               <LivePreview pkg={sync.pkg} item={sync.target} title={title} />
            </ItemLink>
         ) : analysis?.report ? (
            <ItemLink href={href} className="block">
               <ReportPreview record={analysis.report} />
            </ItemLink>
         ) : (
            analysis && (
               <div className="rounded-lg border bg-muted/20 p-3">
                  <EvidenceChart
                     evidence={analysis.evidence}
                     compact
                     className="h-36"
                  />
               </div>
            )
         )}

         <div className="flex min-w-0 items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            {analysis && (
               <ChannelChips topics={analysis.topics} onChannel={onChannel} />
            )}
            {item && <SyncBadge sync={sync} itemId={item.id} />}
            <Provenance provenance={provenance} className="ml-1 flex-1" />
            {post && <Engagement post={post} />}
            {item && <ReliedOn item={item} />}
         </div>
      </Card>
   );
}

/** A post nobody has kept in the Library, in the grid. */
function PostTile({ post, analysis }: { post: FeedPost; analysis: Analysis }) {
   return (
      <Card className="group gap-3 p-4 transition-colors hover:border-primary/40">
         <div className="flex items-center justify-between gap-2">
            <KindLabel facet="insight" />
            <AnalysisMenu analysis={analysis} />
         </div>
         <Link to={`/analysis/${analysis.id}`} className="block space-y-1">
            <h3 className="font-medium leading-snug group-hover:underline">
               {analysis.title}
            </h3>
            <p className="line-clamp-2 text-sm text-muted-foreground">
               {analysis.narrative}
            </p>
         </Link>
         <Provenance provenance={analysis.provenance} />
         <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Byline
               authorId={analysis.authorId}
               suffix={relativeTime(post.publishedAt)}
               className="text-xs"
            />
            <Engagement post={post} />
         </div>
      </Card>
   );
}

function LibraryCard({
   item,
   sync,
   collections,
   highlighted,
   promotable,
   onPromote,
}: {
   item: LibraryItem;
   sync: SyncState;
   collections: Collection[];
   highlighted: boolean;
   promotable?: Promotable;
   onPromote: (promotable: Promotable) => void;
}) {
   return (
      <Card
         id={`item-${item.id}`}
         className={cn(
            "group gap-3 p-4 transition-colors hover:border-primary/40",
            highlighted && "ring-2 ring-primary/40",
         )}
      >
         <div className="flex items-center justify-between gap-2">
            <KindLabel facet={facetOfKind(item.kind)} />
            <ItemMenu
               item={item}
               sync={sync}
               analysisId={analysisIdOf(item.href)}
               collections={collections}
               promotable={promotable}
               onPromote={onPromote}
            />
         </div>
         <ItemLink href={item.href} className="block space-y-1">
            <h3 className="font-medium leading-snug group-hover:underline">
               {item.title}
            </h3>
            <p className="line-clamp-2 text-sm text-muted-foreground">
               {item.description}
            </p>
         </ItemLink>
         <div className="flex min-w-0 items-center gap-1.5">
            <SyncBadge sync={sync} itemId={item.id} />
            <Provenance provenance={item.provenance} className="flex-1" />
         </div>
         <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Byline
               authorId={item.ownerId}
               suffix={relativeTime(item.updatedAt)}
               className="text-xs"
            />
            <ReliedOn item={item} />
         </div>
      </Card>
   );
}

/** A file a package serves that no Library item stands for. */
function PackageFileCard({
   pkg,
   item,
   showPackage,
   preview,
}: {
   pkg: string;
   item: WorkspaceItem;
   showPackage: boolean;
   /** Show a data app's first screen, as the feed layout does. */
   preview?: boolean;
}) {
   const navigate = useNavigate();
   const { manifest } = item;
   return (
      <Card className="group relative gap-3 p-4 transition-colors hover:border-primary/40">
         <div className="flex items-center justify-between gap-2">
            <KindLabel facet={fileFacet(item)} />
            <div className="relative z-10 -my-1.5 -mr-2">
               <PublisherMenu publisherUrl={item.publisherUrl}>
                  <DropdownMenuItem onSelect={() => navigate(item.href)}>
                     <ArrowUpRight />
                     Open
                  </DropdownMenuItem>
               </PublisherMenu>
            </div>
         </div>
         <Link
            to={item.href}
            className="block space-y-1 after:absolute after:inset-0"
         >
            <h3
               className={cn(
                  "leading-snug font-medium group-hover:underline",
                  item.kind === "query" && "font-mono text-sm",
               )}
            >
               {item.title}
            </h3>
            {item.description && (
               <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.description}
               </p>
            )}
         </Link>
         {manifest ? (
            <>
               {manifest.kind === "analysis" &&
                  manifest.analysis.details.length > 0 && (
                     <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {manifest.analysis.details.slice(0, 2).map((d) => (
                           <li key={d}>{d}</li>
                        ))}
                     </ul>
                  )}
               {(preview || manifest.kind === "analysis") && (
                  <SavedFindingPreview pkg={pkg} item={{ ...item, manifest }} />
               )}
            </>
         ) : (
            <>
               {item.path !== item.title && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                     {item.path}
                  </p>
               )}
               {preview && (
                  <LivePreview pkg={pkg} item={item} title={item.title} />
               )}
            </>
         )}
         <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
            {manifest && (
               <Byline
                  authorId={manifest.author?.id ?? "ai"}
                  authorName={manifest.author?.name}
                  suffix={`saved ${relativeTime(manifest.updatedAt)}`}
                  className="text-xs"
               />
            )}
            {showPackage ? (
               <SyncBadge sync={{ kind: "package", pkg, target: item }} />
            ) : (
               <span className="truncate">Served by Publisher</span>
            )}
         </div>
      </Card>
   );
}
