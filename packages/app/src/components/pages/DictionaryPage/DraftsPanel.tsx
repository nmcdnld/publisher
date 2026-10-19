// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useServer } from "@malloy-publisher/sdk";
import { useQuery } from "@tanstack/react-query";
import {
   AlertTriangleIcon,
   ArrowLeftIcon,
   CheckIcon,
   ChevronRightIcon,
   CircleDashedIcon,
   ClockIcon,
   CopyIcon,
   DownloadIcon,
   FileCodeIcon,
   GitPullRequestArrowIcon,
   Loader2Icon,
   LocateFixedIcon,
   PencilIcon,
   RotateCcwIcon,
   SparklesIcon,
   SquareIcon,
   TrashIcon,
   XCircleIcon,
   XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAiHealth } from "../../../ai/consoleAi";
import { cn } from "../../../lib/utils";
import type { Entity, Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Progress } from "../../ui/misc";
import {
   clearDraftRun,
   draftingOrder,
   liveDrafts,
   startDraftRun,
   stopDraftRun,
   undocumented,
   useDraftOne,
   useDraftRun,
   useDrafts,
   type Draft,
   type DraftRun,
} from "./drafts";
import { useDictionaryPanel } from "./panel";
import {
   checkPromotion,
   planPromotion,
   promotionTarget,
   writeBack,
   type FileChange,
   type Promotion,
} from "./promotion";
import { dictionaryHref, displayName, KindIcon } from "./shared";

type RowStatus =
   | "queued"
   | "drafting"
   | "draft"
   | "accepted"
   | "failed"
   | "missing";

const STATUS: Record<
   RowStatus,
   { label: string; icon: typeof CheckIcon; className: string }
> = {
   queued: {
      label: "Queued",
      icon: ClockIcon,
      className: "text-muted-foreground",
   },
   drafting: {
      label: "Drafting",
      icon: Loader2Icon,
      className: "text-draft [&>svg]:animate-spin",
   },
   draft: { label: "To review", icon: SparklesIcon, className: "text-draft" },
   accepted: {
      label: "Accepted",
      icon: CheckIcon,
      className: "text-answerable",
   },
   failed: {
      label: "Failed",
      icon: XCircleIcon,
      className: "text-destructive",
   },
   missing: {
      label: "Not drafted",
      icon: CircleDashedIcon,
      className: "text-muted-foreground",
   },
};

function rowStatus(
   id: string,
   drafts: Record<string, Draft>,
   run: DraftRun | undefined,
): RowStatus {
   if (run?.active.includes(id)) return "drafting";
   const draft = drafts[id];
   if (draft) return draft.status === "accepted" ? "accepted" : "draft";
   if (run?.failed.includes(id)) return "failed";
   if (
      run?.running &&
      !run.stopping &&
      run.targets.includes(id) &&
      !run.finished.includes(id)
   ) {
      return "queued";
   }
   return "missing";
}

const FILTERS = [
   { id: "all", label: "All", has: () => true },
   {
      id: "working",
      label: "In progress",
      has: (s: RowStatus) => s === "queued" || s === "drafting",
   },
   { id: "review", label: "To review", has: (s: RowStatus) => s === "draft" },
   {
      id: "accepted",
      label: "Accepted",
      has: (s: RowStatus) => s === "accepted",
   },
   {
      id: "missing",
      label: "Not drafted",
      has: (s: RowStatus) => s === "missing" || s === "failed",
   },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

/**
 * Every undocumented entity, what is happening to it, and its draft: the one
 * place drafting is started, watched, reviewed and handed to promotion.
 */
export function DraftsPanel({
   ontology,
   focus,
   onClose,
}: {
   ontology: Ontology;
   focus?: string;
   onClose: () => void;
}) {
   const health = useAiHealth();
   const { drafts, setStatus } = useDrafts(ontology);
   const run = useDraftRun(ontology);
   const { open } = useDictionaryPanel();
   const entities = useMemo(
      () => draftingOrder(undocumented(ontology)),
      [ontology],
   );
   const rows = entities.map((entity) => ({
      entity,
      status: rowStatus(entity.id, drafts, run),
   }));
   const count = (status: RowStatus) =>
      rows.filter((r) => r.status === status).length;
   const missing = rows.filter(
      (r) => r.status === "missing" || r.status === "failed",
   );
   const accepted = count("accepted");
   const toReview = count("draft");

   const [filter, setFilter] = useState<FilterId>(() =>
      run?.running || !toReview ? "all" : "review",
   );
   const shown = rows.filter((r) =>
      FILTERS.find((f) => f.id === filter)!.has(r.status),
   );

   const listRef = useRef<HTMLDivElement>(null);
   const [follow, setFollow] = useState(true);
   const firstActive = run?.active[0];
   useEffect(() => {
      if (!follow || !firstActive) return;
      listRef.current
         ?.querySelector(`[data-row="${CSS.escape(firstActive)}"]`)
         ?.scrollIntoView({ block: "center", behavior: "smooth" });
   }, [follow, firstActive]);
   useEffect(() => {
      if (!focus) return;
      setFilter("all");
      requestAnimationFrame(() =>
         listRef.current
            ?.querySelector(`[data-row="${CSS.escape(focus)}"]`)
            ?.scrollIntoView({ block: "center" }),
      );
   }, [focus]);

   const groups = groupBySource(shown);
   const done = run ? run.finished.length + run.failed.length : 0;
   const current = run?.active[0]
      ? ontology.entities.get(run.active[0])
      : undefined;

   return (
      <div className="flex h-full min-h-0 flex-col">
         <PanelHeader
            icon={<SparklesIcon className="size-4" />}
            iconClassName="bg-draft/10 text-draft"
            title="Describe the model"
            onClose={onClose}
         >
            Opus drafts a <code className="font-mono">#(doc)</code> for each
            undocumented field from its definition and what it touches. Drafts
            stay in this browser until you promote them.
         </PanelHeader>

         <div className="space-y-3 border-b px-5 py-3">
            {run?.running ? (
               <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                     <span className="flex min-w-0 items-center gap-2">
                        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-draft" />
                        <span className="truncate">
                           {run.stopping
                              ? "Stopping after the batches in flight…"
                              : `Drafting ${done} of ${run.targets.length}`}
                           {current && !run.stopping && (
                              <span className="text-muted-foreground">
                                 {" "}
                                 · {current.sourceName ?? current.name}
                              </span>
                           )}
                        </span>
                     </span>
                     <span className="flex shrink-0 items-center gap-1">
                        {!follow && (
                           <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setFollow(true)}
                           >
                              <LocateFixedIcon /> Follow
                           </Button>
                        )}
                        <Button
                           size="xs"
                           variant="outline"
                           disabled={run.stopping}
                           onClick={() => stopDraftRun(ontology)}
                        >
                           <SquareIcon /> Stop
                        </Button>
                     </span>
                  </div>
                  <Progress
                     value={(done / run.targets.length) * 100}
                     className="h-1.5 bg-draft/15"
                     indicatorClassName="bg-draft"
                  />
               </div>
            ) : (
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                     {entities.length} undocumented · {toReview} to review ·{" "}
                     {accepted} accepted
                  </span>
                  {health.data?.chat && missing.length > 0 && (
                     <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                           setFollow(true);
                           setFilter("all");
                           startDraftRun(
                              ontology,
                              missing.map((r) => r.entity),
                           );
                        }}
                     >
                        <SparklesIcon /> Draft {missing.length}{" "}
                        {missing.length === entities.length ? "" : "remaining"}
                     </Button>
                  )}
               </div>
            )}
            {run?.error && (
               <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                  <span>
                     {run.failed.length} could not be drafted: {run.error}
                  </span>
               </p>
            )}
            {run && !run.running && !run.error && run.finished.length > 0 && (
               <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Drafted {run.finished.length} of {run.targets.length}.
                  <button
                     className="underline-offset-2 hover:underline"
                     onClick={() => clearDraftRun(ontology)}
                  >
                     Dismiss
                  </button>
               </p>
            )}
            <div className="flex flex-wrap gap-1">
               {FILTERS.map((f) => {
                  const n = rows.filter((r) => f.has(r.status)).length;
                  if (f.id !== "all" && n === 0 && filter !== f.id) return null;
                  return (
                     <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={cn(
                           "rounded-md px-2 py-1 text-xs",
                           filter === f.id
                              ? "bg-secondary font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent",
                        )}
                     >
                        {f.label} <span className="tabular-nums">{n}</span>
                     </button>
                  );
               })}
            </div>
         </div>

         <div
            ref={listRef}
            onWheel={() => run?.running && setFollow(false)}
            onTouchMove={() => run?.running && setFollow(false)}
            className="min-h-0 flex-1 overflow-y-auto"
         >
            {groups.length === 0 && (
               <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {entities.length === 0
                     ? "Everything in this package is documented."
                     : "Nothing here."}
               </p>
            )}
            {groups.map(([label, items]) => (
               <section key={label}>
                  <h3 className="sticky top-0 z-[1] border-b bg-background/95 px-5 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur">
                     {label}
                  </h3>
                  {items.map(({ entity, status }) => (
                     <DraftRow
                        key={entity.id}
                        ontology={ontology}
                        entity={entity}
                        status={status}
                        draft={drafts[entity.id]}
                        focused={entity.id === focus}
                     />
                  ))}
               </section>
            ))}
         </div>

         <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
            <span className="text-sm text-muted-foreground">
               {accepted} accepted
            </span>
            <div className="flex gap-2">
               {toReview > 0 && (
                  <Button
                     size="sm"
                     variant="outline"
                     onClick={() =>
                        setStatus(
                           rows
                              .filter((r) => r.status === "draft")
                              .map((r) => r.entity.id),
                           "accepted",
                        )
                     }
                  >
                     <CheckIcon /> Accept all {toReview}
                  </Button>
               )}
               <Button
                  size="sm"
                  disabled={accepted === 0}
                  onClick={() => open({ type: "promote" })}
               >
                  <GitPullRequestArrowIcon /> Review and promote
               </Button>
            </div>
         </div>
      </div>
   );
}

function groupBySource<T extends { entity: Entity }>(
   rows: T[],
): Array<[string, T[]]> {
   const groups = new Map<string, T[]>();
   for (const row of rows) {
      const label =
         row.entity.kind === "source"
            ? row.entity.name
            : (row.entity.sourceName ??
              (row.entity.kind === "query" ? "Named queries" : "Model"));
      groups.set(label, [...(groups.get(label) ?? []), row]);
   }
   return [...groups];
}

function DraftRow({
   ontology,
   entity,
   status,
   draft,
   focused,
}: {
   ontology: Ontology;
   entity: Entity;
   status: RowStatus;
   draft?: Draft;
   focused: boolean;
}) {
   const meta = STATUS[status];
   const StatusIcon = meta.icon;
   const target = promotionTarget(ontology, entity);
   return (
      <div
         data-row={entity.id}
         className={cn(
            "space-y-1.5 border-b px-5 py-3 transition-colors",
            status === "drafting" && "bg-draft/5",
            focused && "bg-primary/5 ring-1 ring-inset ring-primary/40",
         )}
      >
         <div className="flex items-center gap-2">
            <KindIcon kind={entity.kind} className="size-3.5 shrink-0" />
            <Link
               to={dictionaryHref(ontology, entity.id)}
               className="min-w-0 truncate font-mono text-sm hover:underline"
            >
               {entity.name}
            </Link>
            {entity.dataType && (
               <span className="font-mono text-[11px] text-muted-foreground">
                  {entity.dataType}
               </span>
            )}
            <span
               className={cn(
                  "ml-auto flex shrink-0 items-center gap-1 text-xs [&>svg]:size-3",
                  meta.className,
               )}
            >
               <StatusIcon /> {meta.label}
            </span>
         </div>
         {draft ? (
            <DraftEditor ontology={ontology} entity={entity} draft={draft} />
         ) : status === "drafting" ? (
            <div className="space-y-1.5 py-0.5">
               <div className="h-3 w-11/12 animate-pulse rounded bg-draft/15" />
               <div className="h-3 w-2/3 animate-pulse rounded bg-draft/15" />
            </div>
         ) : status === "missing" || status === "failed" ? (
            <DraftOneButton ontology={ontology} entity={entity} />
         ) : null}
         {"reason" in target && draft && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
               <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-partial" />
               <span>Won’t be written in place: {target.reason}</span>
            </p>
         )}
      </div>
   );
}

function DraftOneButton({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const health = useAiHealth();
   const draftOne = useDraftOne(ontology);
   const run = useDraftRun(ontology);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   if (!health.data?.chat) return null;
   return (
      <div className="flex items-center gap-2">
         <Button
            size="xs"
            variant="ghost"
            className="-ml-1.5 text-muted-foreground"
            disabled={busy || run?.running}
            onClick={async () => {
               setBusy(true);
               setError(undefined);
               try {
                  await draftOne(entity);
               } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
               } finally {
                  setBusy(false);
               }
            }}
         >
            {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {busy ? "Drafting…" : "Draft this one"}
         </Button>
         {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
   );
}

/**
 * A draft's text with what can be done to it: edit, accept or un-accept,
 * revert an edit, discard. The same controls on the entity page and in the panel.
 */
export function DraftEditor({
   ontology,
   entity,
   draft,
   large = false,
}: {
   ontology: Ontology;
   entity: Entity;
   draft: Draft;
   large?: boolean;
}) {
   const { edit, setStatus, discard } = useDrafts(ontology);
   const [editing, setEditing] = useState(false);
   const [text, setText] = useState(draft.doc);
   const accepted = draft.status === "accepted";
   const edited = draft.doc !== draft.drafted;

   if (editing) {
      return (
         <div className="space-y-2">
            <textarea
               autoFocus
               value={text}
               onChange={(e) => setText(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                     edit(entity.id, text);
                     setEditing(false);
                  }
                  if (e.key === "Escape") setEditing(false);
               }}
               rows={Math.max(2, Math.ceil(text.length / 70))}
               className={cn(
                  "w-full resize-y rounded-md border bg-background px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  large ? "text-base" : "text-sm",
               )}
            />
            <div className="flex items-center gap-1.5">
               <Button
                  size="xs"
                  onClick={() => {
                     edit(entity.id, text);
                     setEditing(false);
                  }}
               >
                  Save
               </Button>
               <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setEditing(false)}
               >
                  Cancel
               </Button>
               <span className="text-[11px] text-muted-foreground">
                  ⌘↵ to save · one line, as a #(doc) is
               </span>
            </div>
         </div>
      );
   }

   return (
      <div className="space-y-1.5">
         <p
            className={cn(
               "leading-relaxed",
               large ? "text-base" : "text-sm",
               !accepted && "text-foreground/90",
            )}
         >
            {draft.doc}
         </p>
         <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
            <Button
               size="xs"
               variant={accepted ? "secondary" : "ghost"}
               className={cn(accepted && "text-answerable")}
               onClick={() =>
                  setStatus(entity.id, accepted ? "draft" : "accepted")
               }
               title={accepted ? "Move back to review" : undefined}
            >
               <CheckIcon /> {accepted ? "Accepted" : "Accept"}
            </Button>
            <Button
               size="xs"
               variant="ghost"
               onClick={() => {
                  setText(draft.doc);
                  setEditing(true);
               }}
            >
               <PencilIcon /> Edit
            </Button>
            {edited && (
               <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => edit(entity.id, draft.drafted)}
                  title={draft.drafted}
               >
                  <RotateCcwIcon /> Revert to Opus
               </Button>
            )}
            <Button
               size="xs"
               variant="ghost"
               className="text-muted-foreground"
               onClick={() => discard(entity.id)}
            >
               <TrashIcon /> Discard
            </Button>
            {edited && (
               <span className="ml-1 text-[11px] text-muted-foreground">
                  edited
               </span>
            )}
         </div>
      </div>
   );
}

/**
 * The accepted drafts as an edit to the model: what changes in which file,
 * whether each file still compiles, and the write itself.
 */
export function PromotePanel({
   ontology,
   onClose,
}: {
   ontology: Ontology;
   onClose: () => void;
}) {
   const { server } = useServer();
   const { drafts } = useDrafts(ontology);
   const { open } = useDictionaryPanel();
   const entries = liveDrafts(ontology, drafts)
      .filter((d) => d.draft.status === "accepted")
      .map((d) => ({ entity: d.entity, doc: d.draft.doc }));
   const promotion = useMemo(
      () => planPromotion(ontology, entries),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [ontology, JSON.stringify(entries.map((e) => [e.entity.id, e.doc]))],
   );
   const check = useQuery({
      queryKey: [
         "promotion-check",
         ontology.environmentName,
         ontology.packageName,
         promotion.patch,
      ],
      enabled: promotion.files.length > 0,
      retry: false,
      staleTime: Infinity,
      queryFn: () => checkPromotion(server, ontology, promotion),
   });
   const compiles =
      check.data && promotion.files.every((f) => check.data[f.path]?.ok);
   const writable = promotion.files.reduce((n, f) => n + f.entries.length, 0);

   return (
      <div className="flex h-full min-h-0 flex-col">
         <PanelHeader
            icon={<GitPullRequestArrowIcon className="size-4" />}
            iconClassName="bg-primary/10 text-primary"
            title={`Promote ${entries.length} ${entries.length === 1 ? "description" : "descriptions"}`}
            onClose={onClose}
            back={() => open({ type: "drafts" })}
         >
            Each accepted draft becomes a{" "}
            <code className="font-mono">#(doc)</code> in the model file that
            defines it. Check the change, then write it.
         </PanelHeader>

         <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
            {entries.length === 0 && (
               <p className="py-10 text-center text-sm text-muted-foreground">
                  Nothing accepted yet.{" "}
                  <button
                     className="text-primary underline-offset-2 hover:underline"
                     onClick={() => open({ type: "drafts" })}
                  >
                     Review drafts
                  </button>
               </p>
            )}

            {promotion.files.length > 0 && (
               <Step n={1} title="What changes">
                  <p className="text-sm text-muted-foreground">
                     {writable} {writable === 1 ? "line" : "lines"} of
                     description across {promotion.files.length}{" "}
                     {promotion.files.length === 1 ? "file" : "files"}.
                  </p>
                  <div className="space-y-2">
                     {promotion.files.map((file) => (
                        <FileDiff key={file.path} file={file} />
                     ))}
                  </div>
               </Step>
            )}

            {promotion.files.length > 0 && (
               <Step n={2} title="Check it compiles">
                  <p className="text-sm text-muted-foreground">
                     Each file is compiled as it would be after the change, by
                     this package’s compiler. Nothing is written.
                  </p>
                  <div className="divide-y rounded-lg border">
                     {promotion.files.map((file) => {
                        const result = check.data?.[file.path];
                        return (
                           <div key={file.path} className="space-y-1 px-3 py-2">
                              <div className="flex items-center gap-2 text-sm">
                                 {check.isFetching ? (
                                    <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                                 ) : result?.ok ? (
                                    <CheckIcon className="size-3.5 text-answerable" />
                                 ) : (
                                    <XCircleIcon className="size-3.5 text-destructive" />
                                 )}
                                 <span className="font-mono text-xs">
                                    {file.path}
                                 </span>
                                 <span className="ml-auto text-xs text-muted-foreground">
                                    {check.isFetching
                                       ? "Compiling…"
                                       : result?.ok
                                         ? "Compiles"
                                         : "Does not compile"}
                                 </span>
                              </div>
                              {!check.isFetching &&
                                 result?.problems
                                    .filter((p) => p.severity === "error")
                                    .slice(0, 4)
                                    .map((p, i) => (
                                       <p
                                          key={i}
                                          className="pl-5 font-mono text-xs text-destructive"
                                       >
                                          {p.line !== undefined &&
                                             `line ${p.line}: `}
                                          {p.message}
                                       </p>
                                    ))}
                           </div>
                        );
                     })}
                  </div>
                  {check.error && (
                     <p className="text-xs text-destructive">
                        {String(check.error)}
                     </p>
                  )}
               </Step>
            )}

            {promotion.skipped.length > 0 && (
               <details className="group rounded-lg border px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                     <ChevronRightIcon className="size-3.5 transition group-open:rotate-90" />
                     <AlertTriangleIcon className="size-3.5 text-partial" />
                     {promotion.skipped.length} accepted{" "}
                     {promotion.skipped.length === 1 ? "draft" : "drafts"} can’t
                     be written in place
                  </summary>
                  <ul className="mt-2 space-y-1.5 pl-5">
                     {promotion.skipped.map((s) => (
                        <li key={s.entity.id} className="text-xs">
                           <span className="font-mono">
                              {displayName(s.entity)}
                           </span>
                           <span className="text-muted-foreground">
                              {" "}
                              — {s.reason}
                           </span>
                        </li>
                     ))}
                  </ul>
               </details>
            )}

            {promotion.files.length > 0 && (
               <Step n={3} title="Write it to the model">
                  <WriteStep
                     promotion={promotion}
                     compiles={Boolean(compiles)}
                  />
               </Step>
            )}
         </div>
      </div>
   );
}

function WriteStep({
   promotion,
   compiles,
}: {
   promotion: Promotion;
   compiles: boolean;
}) {
   const [copied, setCopied] = useState(false);
   const [writing, setWriting] = useState(false);
   const [error, setError] = useState<string>();
   return (
      <div className="space-y-3">
         <div className="flex flex-wrap items-center gap-2">
            <Button
               disabled={!writeBack.available || !compiles || writing}
               onClick={async () => {
                  setWriting(true);
                  setError(undefined);
                  try {
                     await writeBack.write(promotion);
                  } catch (e) {
                     setError(e instanceof Error ? e.message : String(e));
                  } finally {
                     setWriting(false);
                  }
               }}
            >
               <FileCodeIcon /> Write to model
            </Button>
            {!writeBack.available && (
               <Badge variant="outline">Coming soon</Badge>
            )}
         </div>
         {!writeBack.available && (
            <p className="text-sm text-muted-foreground">
               Writing from the Console isn’t wired up yet. When it is, this
               writes the files above and reloads the package, and the promoted
               fields show as documented. Until then, apply the patch with{" "}
               <code className="font-mono">git apply</code> in the package
               directory, or hand it to an agent.
            </p>
         )}
         {error && <p className="text-sm text-destructive">{error}</p>}
         <div className="flex flex-wrap gap-2">
            <Button
               size="sm"
               variant="outline"
               onClick={async () => {
                  await navigator.clipboard.writeText(promotion.patch);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
               }}
            >
               {copied ? <CheckIcon /> : <CopyIcon />}
               {copied ? "Copied" : "Copy patch"}
            </Button>
            <Button size="sm" variant="outline" asChild>
               <a
                  href={`data:text/x-diff;charset=utf-8,${encodeURIComponent(promotion.patch)}`}
                  download="dictionary-docs.patch"
               >
                  <DownloadIcon /> Download .patch
               </a>
            </Button>
         </div>
      </div>
   );
}

function FileDiff({ file }: { file: FileChange }) {
   const lines = file.patch.split("\n").slice(2);
   return (
      <details
         open={lines.length <= 80}
         className="group overflow-hidden rounded-lg border"
      >
         <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/40 px-3 py-2 text-sm">
            <ChevronRightIcon className="size-3.5 transition group-open:rotate-90" />
            <span className="font-mono text-xs">{file.path}</span>
            <span className="text-xs text-answerable">
               +{file.entries.length}{" "}
               {file.entries.length === 1 ? "description" : "descriptions"}
            </span>
            {file.addsFlag && (
               <span
                  className="ml-auto text-[11px] text-muted-foreground"
                  title="Annotating table columns in an include block needs this experiment on."
               >
                  turns on access_modifiers
               </span>
            )}
         </summary>
         <pre className="max-h-96 overflow-auto border-t font-mono text-xs leading-relaxed">
            {lines.map((line, i) => (
               <div
                  key={i}
                  className={cn(
                     "px-3",
                     line.startsWith("+") && "bg-answerable/10 text-answerable",
                     line.startsWith("-") &&
                        "bg-destructive/10 text-destructive",
                     line.startsWith("@@") &&
                        "bg-muted/40 text-muted-foreground",
                  )}
               >
                  {line || " "}
               </div>
            ))}
         </pre>
      </details>
   );
}

function Step({
   n,
   title,
   children,
}: {
   n: number;
   title: string;
   children: ReactNode;
}) {
   return (
      <section className="space-y-2">
         <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[11px] tabular-nums">
               {n}
            </span>
            {title}
         </h3>
         {children}
      </section>
   );
}

export function PanelHeader({
   icon,
   iconClassName,
   title,
   onClose,
   back,
   children,
}: {
   icon: ReactNode;
   iconClassName: string;
   title: string;
   onClose: () => void;
   back?: () => void;
   children?: ReactNode;
}) {
   return (
      <div className="flex items-start gap-3 border-b px-5 py-4">
         {back ? (
            <Button
               variant="ghost"
               size="icon-sm"
               className="-ml-2 shrink-0"
               onClick={back}
               aria-label="Back"
            >
               <ArrowLeftIcon />
            </Button>
         ) : (
            <span
               className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                  iconClassName,
               )}
            >
               {icon}
            </span>
         )}
         <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {children && (
               <p className="text-sm text-muted-foreground">{children}</p>
            )}
         </div>
         <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
         >
            <XIcon />
         </Button>
      </div>
   );
}
