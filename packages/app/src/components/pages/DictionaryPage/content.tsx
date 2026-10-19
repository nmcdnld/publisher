// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Dashboard,
   DataAppViewer,
   encodeResourceUri,
   Notebook,
   packageFileUrl,
   useRouterClickHandler,
   useServer,
   type DrillNavigation,
} from "@malloy-publisher/sdk";
import {
   AppWindowIcon,
   ArrowLeftIcon,
   LayoutDashboardIcon,
   NotebookTextIcon,
} from "lucide-react";
import {
   useCallback,
   useEffect,
   useLayoutEffect,
   useRef,
   useState,
   type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type {
   ContentItem,
   ContentKind,
   Entity,
   Ontology,
} from "../../../ontology/types";
import { useDrillNavigate } from "../../common/useDrillNavigate";
import { Button } from "../../ui/button";
import { Markdown } from "../../chat/Markdown";
import { EntityChip } from "./shared";

export const CONTENT_META: Record<
   ContentKind,
   { label: string; plural: string; icon: typeof AppWindowIcon; tint: string }
> = {
   dashboard: {
      label: "Dashboard",
      plural: "Dashboards",
      icon: LayoutDashboardIcon,
      tint: "text-sky-600 bg-sky-500/10 dark:text-sky-400",
   },
   notebook: {
      label: "Notebook",
      plural: "Notebooks",
      icon: NotebookTextIcon,
      tint: "text-violet-600 bg-violet-500/10 dark:text-violet-400",
   },
   "data app": {
      label: "Data app",
      plural: "Data apps",
      icon: AppWindowIcon,
      tint: "text-rose-600 bg-rose-500/10 dark:text-rose-400",
   },
};

/**
 * The content that uses an entity: for a source, anything that touches it or a
 * source built on it; for anything else, anything that names it.
 */
export function relatedContent(
   ontology: Ontology,
   entity: Entity,
): ContentItem[] {
   if (entity.kind === "source") {
      const family = new Set([entity.id]);
      let grew = true;
      while (grew) {
         grew = false;
         for (const s of ontology.sources) {
            if (s.extendsId && family.has(s.extendsId) && !family.has(s.id)) {
               family.add(s.id);
               grew = true;
            }
         }
      }
      return ontology.content.filter((c) =>
         c.sourceIds.some((id) => family.has(id)),
      );
   }
   return ontology.content.filter((c) => c.entityIds.includes(entity.id));
}

/** The search parameter naming the content item open in its module. */
const PARAM = "content";

/** The content item open in place, by id, kept in the URL so it can be linked. */
export function useOpenContent() {
   const [params, setParams] = useSearchParams();
   const openId = params.get(PARAM) ?? undefined;
   const setOpenId = useCallback(
      (id: string | undefined) =>
         setParams(
            (prev) => {
               const next = new URLSearchParams(prev);
               if (id) next.set(PARAM, id);
               else next.delete(PARAM);
               return next;
            },
            // Opening pushes, so Back returns to the tiles.
            { replace: !id || params.has(PARAM) },
         ),
      [params, setParams],
   );
   return { openId, setOpenId };
}

/**
 * Tiles of content, each a live preview. Opening one swaps the tiles for the
 * content itself, live and interactive, in the same place on the page.
 */
export function ContentGrid({
   ontology,
   items,
}: {
   ontology: Ontology;
   items: ContentItem[];
}) {
   const { openId, setOpenId } = useOpenContent();
   const ref = useRef<HTMLDivElement>(null);
   const open = items.find((item) => item.id === openId);
   useEffect(() => {
      if (!open || !ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      if (top < 56 || top > window.innerHeight * 0.6) {
         ref.current.scrollIntoView({ block: "start", behavior: "smooth" });
      }
   }, [open]);

   return (
      <div ref={ref} className="scroll-mt-16">
         {open ? (
            <ContentView
               ontology={ontology}
               item={open}
               siblings={items}
               onBack={() => setOpenId(undefined)}
               onOpen={setOpenId}
            />
         ) : (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
               {items.map((item) => (
                  <ContentTile
                     key={item.id}
                     ontology={ontology}
                     item={item}
                     onOpen={() => setOpenId(item.id)}
                  />
               ))}
            </div>
         )}
      </div>
   );
}

function ContentTile({
   ontology,
   item,
   onOpen,
}: {
   ontology: Ontology;
   item: ContentItem;
   onOpen: () => void;
}) {
   const meta = CONTENT_META[item.kind];
   const Icon = meta.icon;
   const sources = item.sourceIds
      .map((id) => ontology.entities.get(id)?.name)
      .filter(Boolean)
      .slice(0, 3);
   return (
      <button
         onClick={onOpen}
         className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
      >
         <LivePreview ontology={ontology} item={item} />
         <div className="flex flex-1 flex-col gap-1.5 border-t p-3">
            <div className="flex items-center gap-2">
               <span
                  className={cn(
                     "flex size-6 shrink-0 items-center justify-center rounded-md",
                     meta.tint,
                  )}
               >
                  <Icon className="size-3.5" />
               </span>
               <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {item.title}
               </span>
            </div>
            <div className="mt-auto truncate text-xs text-muted-foreground">
               {meta.label}
               {sources.length > 0 && <> · {sources.join(", ")}</>}
               {item.sourceIds.length > 3 && ` +${item.sourceIds.length - 3}`}
            </div>
         </div>
      </button>
   );
}

/** Width the previewed content lays itself out at, before scaling down. */
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 168;

/**
 * The real thing, rendered at desktop width and scaled into the tile. Mounted
 * only once the tile scrolls near the viewport, since each one runs queries.
 */
function LivePreview({
   ontology,
   item,
}: {
   ontology: Ontology;
   item: ContentItem;
}) {
   const ref = useRef<HTMLDivElement>(null);
   const [scale, setScale] = useState(0.2);
   const visible = useInView(ref);
   useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const observer = new ResizeObserver(([entry]) =>
         setScale(entry.contentRect.width / PREVIEW_WIDTH),
      );
      observer.observe(el);
      return () => observer.disconnect();
   }, []);
   return (
      <div
         ref={ref}
         className="relative overflow-hidden bg-background"
         style={{ height: PREVIEW_HEIGHT }}
      >
         {visible && (
            <div
               inert
               aria-hidden
               className="tw-host pointer-events-none absolute left-0 top-0 origin-top-left"
               style={{
                  width: PREVIEW_WIDTH,
                  height: PREVIEW_HEIGHT / scale,
                  transform: `scale(${scale})`,
               }}
            >
               <PreviewBody ontology={ontology} item={item} />
            </div>
         )}
         <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
      </div>
   );
}

function PreviewBody({
   ontology,
   item,
}: {
   ontology: Ontology;
   item: ContentItem;
}) {
   const { server } = useServer();
   const { environmentName, packageName } = ontology;
   if (item.kind === "data app") {
      return (
         <iframe
            title={item.title}
            src={packageFileUrl({
               server,
               environmentName,
               packageName,
               path: item.file,
            })}
            loading="lazy"
            tabIndex={-1}
            className="size-full border-0 bg-white"
         />
      );
   }
   if (item.kind === "dashboard") {
      return (
         <div style={{ padding: 24 }}>
            <Dashboard
               resourceUri={encodeResourceUri({ environmentName, packageName })}
               dashboard={item.name!}
               maxResultSize={256 * 1024}
            />
         </div>
      );
   }
   return (
      <div style={{ padding: "24px 48px" }}>
         <Notebook
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath: item.file,
            })}
            maxResultSize={256 * 1024}
         />
      </div>
   );
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
   const [seen, setSeen] = useState(false);
   useEffect(() => {
      const el = ref.current;
      if (!el || seen) return;
      const observer = new IntersectionObserver(
         ([entry]) => entry.isIntersecting && setSeen(true),
         { rootMargin: "200px" },
      );
      observer.observe(el);
      return () => observer.disconnect();
   }, [ref, seen]);
   return seen;
}

/**
 * One content item, live and interactive, in place of its module's tiles. A
 * drill to a dashboard in the same module opens it here, carrying the drill's
 * givens; any other drill goes to that dashboard's own page.
 */
function ContentView({
   ontology,
   item,
   siblings,
   onBack,
   onOpen,
}: {
   ontology: Ontology;
   item: ContentItem;
   siblings: ContentItem[];
   onBack: () => void;
   onOpen: (id: string) => void;
}) {
   const [drilled, setDrilled] = useState<{
      id: string;
      givens?: Record<string, string>;
   }>();
   const drill = useDrillNavigate(
      ontology.environmentName,
      ontology.packageName,
   );
   const onDrill = useCallback(
      (target: DrillNavigation, event?: MouseEvent) => {
         const next = siblings.find(
            (c) => c.kind === "dashboard" && c.name === target.dashboard,
         );
         if (!next || event?.metaKey || event?.ctrlKey) {
            drill(target, event);
            return;
         }
         setDrilled({ id: next.id, givens: target.givens });
         onOpen(next.id);
      },
      [siblings, drill, onOpen],
   );
   return (
      <ContentBody
         key={item.id}
         ontology={ontology}
         item={item}
         siblings={siblings}
         initialGivens={drilled?.id === item.id ? drilled.givens : undefined}
         onDrill={onDrill}
         onBack={onBack}
         onOpen={onOpen}
      />
   );
}

function ContentBody({
   ontology,
   item,
   siblings,
   initialGivens,
   onDrill,
   onBack,
   onOpen,
}: {
   ontology: Ontology;
   item: ContentItem;
   siblings: ContentItem[];
   initialGivens?: Record<string, string>;
   onDrill: (target: DrillNavigation, event?: MouseEvent) => void;
   onBack: () => void;
   onOpen: (id: string) => void;
}) {
   const { environmentName, packageName } = ontology;
   const [givens, setGivens] = useState<Record<string, string>>(
      initialGivens ?? {},
   );
   const navigate = useRouterClickHandler();
   const meta = CONTENT_META[item.kind];
   const Icon = meta.icon;
   const fullPage = `/${environmentName}/${packageName}/${item.href}`;
   const uses = item.entityIds.slice(0, 12);
   const others = siblings.filter((c) => c.id !== item.id);

   let body: ReactNode;
   if (item.kind === "dashboard") {
      body = (
         <Dashboard
            resourceUri={encodeResourceUri({ environmentName, packageName })}
            dashboard={item.name!}
            givens={givens}
            onGivensChange={setGivens}
            onNavigate={onDrill}
            maxResultSize={1024 * 1024}
         />
      );
   } else if (item.kind === "notebook") {
      body = (
         <Notebook
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath: item.file,
            })}
            givens={givens}
            onGivensChange={setGivens}
            onNavigate={navigate}
            onDrillNavigate={onDrill}
            maxResultSize={1024 * 1024}
         />
      );
   } else {
      body = (
         <DataAppViewer
            resourceUri={encodeResourceUri({
               environmentName,
               packageName,
               modelPath: item.file,
            })}
         />
      );
   }

   const query = new URLSearchParams(givens).toString();
   return (
      <div className="overflow-hidden rounded-xl border bg-card">
         <div className="space-y-3 border-b px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
               <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={onBack}
               >
                  <ArrowLeftIcon /> Go back
               </Button>
               <h3 className="min-w-0 truncate text-base font-semibold">
                  {item.title}
               </h3>
            </div>
            {item.description && item.kind === "data app" && (
               <div className="line-clamp-2 text-sm text-muted-foreground">
                  <Markdown text={item.description} />
               </div>
            )}
            {uses.length > 0 && (
               <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs text-muted-foreground">
                     Uses
                  </span>
                  {uses.map((id) => (
                     <EntityChip
                        key={id}
                        ontology={ontology}
                        id={id}
                        qualified
                        preview
                     />
                  ))}
                  {item.entityIds.length > uses.length && (
                     <span className="text-xs text-muted-foreground">
                        +{item.entityIds.length - uses.length} more
                     </span>
                  )}
               </div>
            )}
         </div>
         <div className="tw-host bg-background p-4">{body}</div>
      </div>
   );
}
