// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Publisher's own views, shown in place. Loaded on demand: they bring MUI and
// the Malloy renderer, which nothing else in this app needs.

import { contentKinds, KindIcon } from "@/components/content-kind";
import { EvidenceChart } from "@/components/evidence-chart";
import { MalloyBlock } from "@/components/malloy-block";
import { Byline } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { PublisherMenu } from "@/components/publisher-menu";
import { useLiveFinding } from "@/components/saved-finding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyses, usePageMeta, useWorkspacePackages } from "@/data/hooks";
import {
   CONSOLE_URL,
   libraryPackageRoute,
   modelQueryRoute,
   OPEN_QUERY_PARAM,
   pageKey,
   routeForConsolePath,
   WORKSPACE_ENVIRONMENT,
   workspaceConsoleUrl,
   workspaceRoute,
   type WorkspaceKind,
} from "@/data/publisher";
import type { ContentKind, PageStatus, WorkspaceItem } from "@/data/types";
import { AnalystMessage } from "@/features/analyst/analyst-message";
import { CommentSection } from "@/features/comments/comment-section";
import { PageSidebar, useDetailsOpen } from "@/features/publisher/page-sidebar";
import { PublisherHost } from "@/features/publisher/publisher-host";
import { useThreadUi } from "@/features/threads/thread-context";
import { relativeTime } from "@/lib/format";
import { useDataAppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { manifestOrigin } from "@malloy-publisher/app-manifest";
import {
   Dashboard,
   DataAppViewer,
   encodeResourceUri,
   Model,
   Notebook,
   packageFileUrl,
   useGivenUrlParams,
   usePublish,
   useServer,
   type DrillNavigation,
} from "@malloy-publisher/sdk";
import {
   AppWindow,
   ArrowLeft,
   ArrowUpRight,
   Boxes,
   MessagesSquare,
   Package,
   PanelRightOpen,
   PenLine,
   Send,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

const environmentName = WORKSPACE_ENVIRONMENT;

const STATUS_LABEL: Record<PageStatus, string> = {
   draft: "Draft",
   in_review: "In review",
   production: "Production",
   archived: "Archived",
};

function useWorkspaceItem(pkg: string, kind: WorkspaceKind, id: string) {
   const { data } = useWorkspacePackages();
   const found = data?.find((p) => p.name === pkg);
   return found?.items.find((i) => i.kind === kind && i.id === id);
}

/** A route's `*` segment: the file's path within the package. */
function useSplat(): string {
   return useParams()["*"] ?? "";
}

/** Follows a link a Publisher view hands back, in this app when it can be. */
function useFollow() {
   const navigate = useNavigate();
   return (to: string, event?: { metaKey?: boolean; ctrlKey?: boolean }) => {
      if (/^[a-z]+:/i.test(to)) {
         window.open(to, "_blank", "noopener");
         return;
      }
      const route = routeForConsolePath(to);
      const target =
         route ?? `${CONSOLE_URL}${to.startsWith("/") ? "" : "/"}${to}`;
      if (!route || event?.metaKey || event?.ctrlKey) {
         window.open(target, "_blank", "noopener");
      } else {
         navigate(route);
      }
   };
}

/**
 * A Publisher page laid out like an analysis: back above, a header with its
 * owner and actions, the view itself, and the discussion under it.
 */
function ContentFrame({
   pkg,
   kind,
   id,
   title,
   description,
   givens,
   menuItems,
   shownAs,
   byline,
   formerly,
   className,
   children,
}: {
   pkg: string;
   kind: WorkspaceKind;
   id: string;
   title: string;
   description?: string;
   givens?: Record<string, string>;
   menuItems?: React.ReactNode;
   /** What to call it, when that isn't its kind: a saved finding is an insight or a report. */
   shownAs?: ContentKind;
   /** Who it is by, when the page knows better than its properties. */
   byline?: React.ReactNode;
   /** What its discussion was filed under before it was in the package. */
   formerly?: string[];
   className?: string;
   children: React.ReactNode;
}) {
   const [details, setDetails] = useDetailsOpen();
   const navigate = useNavigate();
   const location = useLocation();
   const key = pageKey(pkg, kind, id);
   const meta = usePageMeta(key).data;
   const status = meta && STATUS_LABEL[meta.status];
   return (
      <div className="flex min-h-full">
         <div
            className={cn(
               "mx-auto w-full min-w-0 max-w-[1600px] flex-1 space-y-6 px-6 py-8 lg:px-10",
               className,
            )}
         >
            <Button
               variant="ghost"
               size="sm"
               className="-ml-2"
               onClick={() =>
                  // A page opened from a link has no history in this app to go back to.
                  location.key === "default"
                     ? navigate(libraryPackageRoute(pkg))
                     : navigate(-1)
               }
            >
               <ArrowLeft />
               Back
            </Button>

            <header className="space-y-3">
               <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="gap-1">
                     <KindIcon kind={shownAs ?? kind} className="size-3" />
                     {shownAs
                        ? contentKinds[shownAs].label
                        : kind === "query"
                           ? "Model"
                           : contentKinds[kind].label}
                  </Badge>
                  <Link to={libraryPackageRoute(pkg)}>
                     <Badge variant="secondary" className="gap-1 font-mono">
                        <Package className="size-3" />
                        {pkg}
                     </Badge>
                  </Link>
                  {status && meta.status !== "draft" && (
                     <Badge variant="secondary">{status}</Badge>
                  )}
                  {meta?.tags.map((t) => (
                     <Badge key={t} variant="secondary">
                        #{t}
                     </Badge>
                  ))}
               </div>
               <h1
                  className={cn(
                     "text-3xl font-semibold tracking-tight",
                     kind === "query" && "font-mono text-2xl",
                  )}
               >
                  {title}
               </h1>
               <div className="flex flex-wrap items-center justify-between gap-2">
                  {byline ? (
                     byline
                  ) : meta?.ownerId ? (
                     <Byline
                        authorId={meta.ownerId}
                        suffix={
                           meta.updatedAt &&
                           `updated ${relativeTime(meta.updatedAt)}`
                        }
                     />
                  ) : null}
                  <div className="flex items-center gap-1">
                     {!details && (
                        <Button
                           variant="ghost"
                           size="icon-sm"
                           className="hidden @4xl:inline-flex"
                           onClick={() => setDetails(true)}
                           aria-label="Show details"
                           title="Show details"
                        >
                           <PanelRightOpen />
                        </Button>
                     )}
                     <PublisherMenu
                        publisherUrl={workspaceConsoleUrl(
                           pkg,
                           kind,
                           id,
                           givens,
                        )}
                     >
                        {menuItems}
                     </PublisherMenu>
                  </div>
               </div>
            </header>

            {description && (
               <p className="max-w-3xl text-lg leading-relaxed">
                  {description}
               </p>
            )}
            {children}

            <div className="max-w-3xl">
               <CommentSection subject={key} formerly={formerly} />
            </div>
         </div>
         {details && (
            <PageSidebar
               packageName={pkg}
               kind={kind}
               id={id}
               onClose={() => setDetails(false)}
            />
         )}
      </div>
   );
}

export function WorkspaceDashboardPage() {
   return (
      <PublisherHost>
         <DashboardView />
      </PublisherHost>
   );
}

function DashboardView() {
   const { packageName = "", slug = "" } = useParams();
   const item = useWorkspaceItem(packageName, "dashboard", slug);
   const { params: givens, onGivensChange } = useGivenUrlParams();
   const navigate = useNavigate();
   const publisher = usePublish();

   const onNavigate = (target: DrillNavigation, event?: MouseEvent) => {
      const route = workspaceRoute(
         packageName,
         "dashboard",
         target.dashboard,
         target.givens,
      );
      if (event?.metaKey || event?.ctrlKey) window.open(route, "_blank");
      else navigate(route);
   };

   return (
      <ContentFrame
         pkg={packageName}
         kind="dashboard"
         id={slug}
         title={item?.title ?? slug}
         givens={givens}
         menuItems={
            publisher && (
               <DropdownMenuItem
                  onSelect={() =>
                     publisher.publish({
                        kind: "dashboard",
                        environmentName,
                        packageName,
                        modelPath: item?.path ?? `dashboards/${slug}.malloy`,
                        dashboardName: slug,
                        title: item?.title,
                        description: item?.description,
                        givens,
                     })
                  }
               >
                  <Send />
                  Post or save to the Library
               </DropdownMenuItem>
            )
         }
      >
         <Dashboard
            // A new dashboard is a new document: drop the last one's state.
            key={slug}
            resourceUri={encodeResourceUri({ environmentName, packageName })}
            dashboard={slug}
            givens={givens}
            onGivensChange={onGivensChange}
            onNavigate={onNavigate}
            maxResultSize={1024 * 1024}
            hideTitle
         />
      </ContentFrame>
   );
}

/** A dashboard on its own, for a Library card's preview frame. */
export function WorkspaceDashboardEmbed() {
   return (
      <PublisherHost>
         <DashboardEmbed />
      </PublisherHost>
   );
}

function DashboardEmbed() {
   const { packageName = "", slug = "" } = useParams();
   return (
      <div className="min-h-screen bg-background p-6">
         <Dashboard
            key={slug}
            resourceUri={encodeResourceUri({ environmentName, packageName })}
            dashboard={slug}
            maxResultSize={1024 * 1024}
            hideTitle
         />
      </div>
   );
}

/** A model's Publisher view on its own, for a Library card's preview frame. */
export function WorkspaceModelEmbed() {
   return (
      <PublisherHost>
         <ModelEmbed />
      </PublisherHost>
   );
}

function ModelEmbed() {
   const { packageName = "" } = useParams();
   const modelPath = useSplat();
   return (
      <div className="min-h-screen bg-background p-6">
         <Model
            key={modelPath}
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath,
            })}
            runOnDemand
            maxResultSize={512 * 1024}
         />
      </div>
   );
}

export function WorkspaceModelPage() {
   return (
      <PublisherHost>
         <ModelView />
      </PublisherHost>
   );
}

function ModelView() {
   const { packageName = "" } = useParams();
   const modelPath = useSplat();
   const item = useWorkspaceItem(packageName, "query", modelPath);
   const { params, onGivensChange } = useGivenUrlParams();
   const [query, givens] = useMemo(() => {
      const { [OPEN_QUERY_PARAM]: open, ...rest } = params;
      return [open, rest] as const;
   }, [params]);
   return (
      <ContentFrame
         pkg={packageName}
         kind="query"
         id={modelPath}
         title={modelPath}
         description={item?.description}
         givens={params}
      >
         <Model
            key={modelPath}
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath,
            })}
            runOnDemand
            maxResultSize={512 * 1024}
            givens={givens}
            onGivensChange={onGivensChange}
            query={query}
         />
      </ContentFrame>
   );
}

export function WorkspaceNotebookPage() {
   return (
      <PublisherHost>
         <NotebookView />
      </PublisherHost>
   );
}

function NotebookView() {
   const { packageName = "" } = useParams();
   const notebookPath = useSplat();
   const item = useWorkspaceItem(packageName, "notebook", notebookPath);
   const { params: givens, onGivensChange } = useGivenUrlParams();
   const follow = useFollow();
   const navigate = useNavigate();
   return (
      <ContentFrame
         pkg={packageName}
         kind="notebook"
         id={notebookPath}
         title={item?.title ?? notebookPath}
         givens={givens}
         className="max-w-5xl"
      >
         <Notebook
            key={notebookPath}
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath: notebookPath,
            })}
            maxResultSize={1024 * 1024}
            givens={givens}
            onGivensChange={onGivensChange}
            onNavigate={follow}
            onDrillNavigate={(target) =>
               navigate(
                  workspaceRoute(
                     packageName,
                     "dashboard",
                     target.dashboard,
                     target.givens,
                  ),
               )
            }
         />
      </ContentFrame>
   );
}

export function WorkspaceDataAppPage() {
   return (
      <PublisherHost>
         <DataAppView />
      </PublisherHost>
   );
}

function DataAppView() {
   const { packageName = "" } = useParams();
   const appPath = useSplat();
   const item = useWorkspaceItem(packageName, "data_app", appPath);
   const { server } = useServer();
   const dataAppTheme = useDataAppTheme();
   const standalone = (
      <DropdownMenuItem asChild>
         <a
            href={packageFileUrl({
               server,
               environmentName,
               packageName,
               path: appPath,
            })}
            target="_blank"
            rel="noreferrer"
         >
            <AppWindow />
            Open standalone
         </a>
      </DropdownMenuItem>
   );
   if (item?.manifest) {
      return (
         <SavedFindingPage
            pkg={packageName}
            item={item}
            standalone={standalone}
         />
      );
   }
   return (
      <ContentFrame
         pkg={packageName}
         kind="data_app"
         id={appPath}
         title={item?.title ?? appPath}
         description={item?.description}
         menuItems={standalone}
      >
         <DataAppViewer
            key={appPath}
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath: appPath,
            })}
            hideHeader
            theme={dataAppTheme}
         />
      </ContentFrame>
   );
}

/**
 * A data app that is a saved finding, drawn as this app draws an analysis or
 * a report, so it reads and acts like the one it was saved from. The prose is
 * as written; the charts are live, or the saved rows with a note saying why.
 */
function SavedFindingPage({
   pkg,
   item,
   standalone,
}: {
   pkg: string;
   item: WorkspaceItem;
   standalone: React.ReactNode;
}) {
   const live = useLiveFinding(pkg, item)!;
   const { manifest: m, finding } = live;
   const { ask } = useThreadUi();
   const origin = manifestOrigin(m);
   const analyses = useAnalyses().byId;
   const original =
      origin?.kind === "analysis" &&
      analyses.has(origin.id) &&
      `/analysis/${origin.id}`;
   const analysis = finding.kind === "analysis" ? finding.analysis : undefined;

   return (
      <ContentFrame
         pkg={pkg}
         kind="data_app"
         id={item.id}
         title={m.title}
         description={m.description}
         shownAs="insight"
         formerly={origin?.kind === "analysis" ? [origin.id] : undefined}
         className="max-w-5xl"
         byline={
            <Byline
               authorId={m.author?.id ?? "ai"}
               authorName={m.author?.name}
               suffix={`saved ${relativeTime(m.updatedAt)}`}
            />
         }
         menuItems={
            <>
               {original && (
                  <DropdownMenuItem asChild>
                     <Link to={original}>
                        <ArrowUpRight />
                        Open the original
                     </Link>
                  </DropdownMenuItem>
               )}
               {analysis && (
                  <DropdownMenuItem asChild>
                     <Link
                        to={modelQueryRoute(
                           pkg,
                           analysis.provenance.model,
                           analysis.malloy,
                        )}
                     >
                        <Boxes />
                        Explore the model
                     </Link>
                  </DropdownMenuItem>
               )}
               <DropdownMenuItem
                  onSelect={() =>
                     ask(`Tell me more about: ${m.title}`, { fresh: true })
                  }
               >
                  <MessagesSquare />
                  Ask a follow-up
               </DropdownMenuItem>
               {standalone}
            </>
         }
      >
         {analysis ? (
            <div className="max-w-3xl space-y-6">
               {analysis.details.length > 0 && (
                  <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
                     {analysis.details.map((d) => (
                        <li key={d}>{d}</li>
                     ))}
                  </ul>
               )}
               <Card>
                  <CardHeader className="flex-row items-center justify-between">
                     <CardTitle className="text-sm font-medium text-muted-foreground">
                        {analysis.evidence.caption ?? "Evidence"}
                     </CardTitle>
                     <Provenance provenance={analysis.provenance} />
                  </CardHeader>
                  <CardContent>
                     {live.loading ? (
                        <Skeleton className="h-64" />
                     ) : (
                        <EvidenceChart evidence={analysis.evidence} />
                     )}
                  </CardContent>
               </Card>
               <Card className="gap-3 py-4">
                  <div className="flex items-center justify-between gap-2 px-4">
                     <h3 className="text-sm font-medium">Query</h3>
                     {original && (
                        <Button
                           size="sm"
                           variant="outline"
                           className="h-7 text-xs"
                           asChild
                        >
                           <Link to={`${original}?remix=1`}>
                              <PenLine className="size-3.5" />
                              Remix
                           </Link>
                        </Button>
                     )}
                  </div>
                  <CardContent className="px-4">
                     <MalloyBlock value={analysis.malloy} />
                  </CardContent>
               </Card>
            </div>
         ) : (
            finding.kind === "report" && (
               <div className="max-w-3xl">
                  {live.loading ? (
                     <Skeleton className="h-80" />
                  ) : (
                     <AnalystMessage record={finding.record} />
                  )}
               </div>
            )
         )}
         <p className="max-w-3xl text-xs text-muted-foreground">
            {live.loading
               ? "Running its queries in Publisher…"
               : live.failed.length
                  ? `Showing the rows as of ${new Date(m.snapshot.asOf).toLocaleDateString()}: ${live.failed.length === 1 ? "a query" : `${live.failed.length} queries`} could not be shown live (${live.failed[0][1]}).`
                  : `Charts are live. The text was written against the data as of ${new Date(m.snapshot.asOf).toLocaleDateString()}.`}
         </p>
      </ContentFrame>
   );
}
