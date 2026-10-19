// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowRightIcon,
   ArrowUpRightIcon,
   CheckIcon,
   ChevronDownIcon,
   CodeIcon,
   FileTextIcon,
   Loader2Icon,
   LockIcon,
   SparklesIcon,
   ZapIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAiHealth } from "../../../ai/consoleAi";
import type { Entity, Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
} from "../../ui/card";
import { AskSheet } from "./AskSheet";
import { ContentGrid, relatedContent } from "./content";
import { useDraftOne, useDraftRun, useDrafts } from "./drafts";
import { DraftEditor } from "./DraftsPanel";
import { ContentGraph } from "./Lineage";
import { useDictionaryPanel } from "./panel";
import { promotionTarget } from "./promotion";
import { SampleValues } from "./SampleValues";
import {
   dictionaryHref,
   EntityChip,
   KIND_META,
   KindIcon,
   TypeLabel,
} from "./shared";

export function EntityPage({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const { drafts } = useDrafts(ontology);
   const draft = entity.doc ? undefined : drafts[entity.id];
   const source = entity.sourceId
      ? ontology.entities.get(entity.sourceId)
      : undefined;

   return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
         <header className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
               <Link
                  to={dictionaryHref(ontology)}
                  className="hover:text-foreground"
               >
                  {ontology.packageName}
               </Link>
               <span>/</span>
               <span className="font-mono">{entity.modelPath}</span>
               {source && (
                  <>
                     <span>/</span>
                     <Link
                        to={dictionaryHref(ontology, source.id)}
                        className="font-mono hover:text-foreground"
                     >
                        {source.name}
                     </Link>
                  </>
               )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
               <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                     <span className="flex size-8 items-center justify-center rounded-lg border bg-card">
                        <KindIcon kind={entity.kind} className="size-4" />
                     </span>
                     <h1 className="font-mono text-2xl font-semibold tracking-tight">
                        {entity.kind === "given"
                           ? `$${entity.name}`
                           : entity.name}
                     </h1>
                     <Badge variant="secondary">
                        {KIND_META[entity.kind].label}
                     </Badge>
                     <TypeLabel entity={entity} />
                     {entity.persisted && (
                        <Badge variant="outline" className="gap-1">
                           <ZapIcon /> persisted
                        </Badge>
                     )}
                     {entity.authorized && (
                        <Badge variant="outline" className="gap-1">
                           <LockIcon /> authorize
                        </Badge>
                     )}
                  </div>
                  {entity.label && entity.label !== entity.name && (
                     <p className="text-sm text-muted-foreground">
                        Shown as{" "}
                        <span className="font-medium text-foreground">
                           {entity.label}
                        </span>
                     </p>
                  )}
               </div>
               <AskSheet
                  ontology={ontology}
                  entity={entity}
                  draftDoc={draft?.doc}
               />
            </div>
            <Description ontology={ontology} entity={entity} />
            {entity.kind !== "join" && (
               <Definition entity={entity} ontology={ontology} />
            )}
         </header>

         <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-6">
               {entity.kind === "join" && (
                  <Definition entity={entity} ontology={ontology} />
               )}
               {entity.kind !== "given" && entity.kind !== "join" && (
                  <Card>
                     <CardHeader>
                        <CardTitle>Live data</CardTitle>
                     </CardHeader>
                     <CardContent>
                        <SampleValues ontology={ontology} entity={entity} />
                     </CardContent>
                  </Card>
               )}
               {entity.kind === "source" && (
                  <SourceFields ontology={ontology} source={entity} />
               )}
               {entity.kind === "given" && entity.given && (
                  <Card>
                     <CardHeader>
                        <CardTitle>Runtime parameter</CardTitle>
                     </CardHeader>
                     <CardContent className="grid grid-cols-2 gap-3 text-sm">
                        <Fact label="Type" value={entity.given.type} />
                        <Fact label="Control" value={entity.given.control} />
                        <Fact label="Default" value={entity.given.default} />
                        <Fact label="Label" value={entity.given.label} />
                     </CardContent>
                  </Card>
               )}
               <RelatedContent ontology={ontology} entity={entity} />
            </div>
            <aside className="space-y-4">
               <ContentGraph ontology={ontology} entity={entity} />
               {entity.tags.length > 0 && (
                  <Card className="gap-2 py-4">
                     <CardHeader className="px-4">
                        <CardTitle>Annotations</CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-1 px-4">
                        {entity.tags.map((tag) => (
                           <code
                              key={tag}
                              className="block truncate font-mono text-xs text-muted-foreground"
                              title={tag}
                           >
                              {tag}
                           </code>
                        ))}
                     </CardContent>
                  </Card>
               )}
            </aside>
         </div>
      </div>
   );
}

function RelatedContent({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const items = relatedContent(ontology, entity);
   if (!items.length) return null;
   return (
      <Card>
         <CardHeader>
            <CardTitle>
               Related content
               <span className="ml-1.5 font-normal text-muted-foreground">
                  {items.length}
               </span>
            </CardTitle>
            <CardDescription className="text-xs">
               Dashboards, notebooks and data apps that{" "}
               {entity.kind === "source" ? "query this source" : "use this"}.
            </CardDescription>
         </CardHeader>
         <CardContent>
            <ContentGrid ontology={ontology} items={items} />
         </CardContent>
      </Card>
   );
}

function Description({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const { drafts } = useDrafts(ontology);
   const run = useDraftRun(ontology);
   const health = useAiHealth();
   const draftOne = useDraftOne(ontology);
   const { open } = useDictionaryPanel();
   const [drafting, setDrafting] = useState(false);
   const [draftError, setDraftError] = useState<string>();
   const draft = drafts[entity.id];

   if (entity.doc) {
      return (
         <p className="max-w-3xl text-base leading-relaxed">{entity.doc}</p>
      );
   }
   if (draft) {
      const target = promotionTarget(ontology, entity);
      const accepted = draft.status === "accepted";
      return (
         <div className="max-w-3xl space-y-2 rounded-lg border border-dashed border-draft/40 bg-draft/5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
               <Badge variant={accepted ? "answerable" : "draft"}>
                  {accepted ? <CheckIcon /> : <SparklesIcon />}
                  {accepted ? "Accepted draft" : "Draft"}
               </Badge>
               <span className="text-xs text-muted-foreground">
                  {accepted
                     ? "Will be written as a #(doc) when you promote."
                     : "Written by Opus from the definition; not in the model yet."}
               </span>
               <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                     open(
                        accepted
                           ? { type: "promote" }
                           : { type: "drafts", focus: entity.id },
                     )
                  }
               >
                  {accepted ? "Promote" : "All drafts"} <ArrowRightIcon />
               </Button>
            </div>
            <DraftEditor
               ontology={ontology}
               entity={entity}
               draft={draft}
               large
            />
            {"reason" in target && (
               <p className="text-xs text-muted-foreground">
                  Won’t be written in place: {target.reason}
               </p>
            )}
         </div>
      );
   }
   if (run?.active.includes(entity.id)) {
      return (
         <button
            onClick={() => open({ type: "drafts", focus: entity.id })}
            className="flex items-center gap-2 text-sm text-draft"
         >
            <Loader2Icon className="size-3.5 animate-spin" /> Being drafted with
            the rest of the package…
         </button>
      );
   }
   return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
         <span>No #(doc) description.</span>
         {health.data?.chat && (
            <Button
               variant="outline"
               size="xs"
               disabled={drafting}
               onClick={async () => {
                  setDrafting(true);
                  setDraftError(undefined);
                  try {
                     await draftOne(entity);
                  } catch (e) {
                     setDraftError(e instanceof Error ? e.message : String(e));
                  } finally {
                     setDrafting(false);
                  }
               }}
            >
               <SparklesIcon /> {drafting ? "Drafting…" : "Draft one with Opus"}
            </Button>
         )}
         {draftError && <span className="text-destructive">{draftError}</span>}
      </div>
   );
}

function Definition({
   entity,
   ontology,
}: {
   entity: Entity;
   ontology: Ontology;
}) {
   if (entity.kind === "join") {
      return (
         <Card>
            <CardHeader>
               <CardTitle>Join</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
               <div className="flex flex-wrap items-center gap-2">
                  {entity.sourceId && (
                     <EntityChip ontology={ontology} id={entity.sourceId} />
                  )}
                  <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                     join_{entity.relationship}
                     <ArrowRightIcon className="size-3" />
                  </span>
                  {entity.joinTargetId && (
                     <EntityChip ontology={ontology} id={entity.joinTargetId} />
                  )}
               </div>
               <p className="text-muted-foreground">
                  {entity.relationship === "many"
                     ? "Each row can match many rows here, so aggregating through this join fans out: count and sum measures defined on the joined source stay correct, ad-hoc sums of its columns do not."
                     : "Each row matches at most one row here, so the join never multiplies rows."}
               </p>
               {entity.excerpt && (
                  <CodeExcerpt entity={entity} ontology={ontology} />
               )}
            </CardContent>
         </Card>
      );
   }
   if (!entity.excerpt && !entity.formula) {
      if (entity.kind === "dimension") {
         return (
            <p className="text-sm text-muted-foreground">
               A column read straight from the table behind{" "}
               <span className="font-mono">{entity.sourceName}</span>.
            </p>
         );
      }
      return null;
   }
   return <DefinitionShortcut entity={entity} ontology={ontology} />;
}

function DefinitionShortcut({
   entity,
   ontology,
}: {
   entity: Entity;
   ontology: Ontology;
}) {
   const [open, setOpen] = useState(false);
   const excerpt = entity.excerpt;
   return (
      <div className="space-y-2">
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {entity.formula && (
               <code className="min-w-0 break-words font-mono text-sm text-foreground">
                  <span className="text-muted-foreground">
                     {entity.name} is{" "}
                  </span>
                  {entity.formula}
               </code>
            )}
            {excerpt && (
               <>
                  <button
                     type="button"
                     onClick={() => setOpen((o) => !o)}
                     aria-expanded={open}
                     className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono transition-colors hover:bg-accent hover:text-foreground"
                  >
                     <CodeIcon className="size-3.5" />
                     {excerpt.modelPath}:{excerpt.startLine + 1}
                     <ChevronDownIcon
                        className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
                     />
                  </button>
                  <Link
                     to={`/${ontology.environmentName}/${ontology.packageName}/${excerpt.modelPath}`}
                     className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline"
                  >
                     Open model <ArrowUpRightIcon className="size-3" />
                  </Link>
               </>
            )}
         </div>
         {open && excerpt && (
            <CodeExcerpt entity={entity} ontology={ontology} />
         )}
      </div>
   );
}

const EXAMPLES_BLOB =
   "https://github.com/malloydata/publisher/blob/main/examples";
const EXAMPLES_RAW =
   "https://raw.githubusercontent.com/malloydata/publisher/main/examples";

type Excerpt = NonNullable<Entity["excerpt"]>;

/**
 * Where the excerpt sits in the GitHub copy, which can be ahead of or behind
 * the served one: the whole block if it is there, else its last line, taking
 * the match nearest the served position either way. 0-based, inclusive.
 */
function locateInRemote(
   excerpt: Excerpt,
   remote: string,
): { start: number; end: number } | undefined {
   const want = excerpt.text.split("\n").map((l) => l.trim());
   const have = remote.split("\n").map((l) => l.trim());
   const n = want.length;
   const nearest = (starts: number[]) =>
      starts.length
         ? starts.reduce((a, b) =>
              Math.abs(b - excerpt.startLine) < Math.abs(a - excerpt.startLine)
                 ? b
                 : a,
           )
         : undefined;
   const blocks: number[] = [];
   for (let i = 0; i + n <= have.length; i++) {
      if (want.every((l, k) => have[i + k] === l)) blocks.push(i);
   }
   let start = nearest(blocks);
   if (start === undefined) {
      const last = want[n - 1];
      start = nearest(
         have.flatMap((l, j) => (l === last ? [Math.max(0, j - n + 1)] : [])),
      );
   }
   return start === undefined ? undefined : { start, end: start + n - 1 };
}

/** Only the bundled `examples` packages have a known home on GitHub. */
function useGithubHref(
   ontology: Ontology,
   excerpt: Excerpt,
): string | undefined {
   const path = `${ontology.packageName}/${excerpt.modelPath}`;
   const enabled = ontology.environmentName === "examples";
   const { data: remote } = useQuery({
      queryKey: ["dictionary-github-raw", path],
      queryFn: async () => {
         const res = await fetch(`${EXAMPLES_RAW}/${path}`);
         if (!res.ok) throw new Error(`${res.status}`);
         return res.text();
      },
      enabled,
      staleTime: 5 * 60_000,
      retry: false,
   });
   if (!enabled) return undefined;
   const at = (remote !== undefined && locateInRemote(excerpt, remote)) || {
      start: excerpt.startLine,
      end: excerpt.startLine + excerpt.text.split("\n").length - 1,
   };
   return `${EXAMPLES_BLOB}/${path}#L${at.start + 1}-L${at.end + 1}`;
}

function CodeExcerpt({
   entity,
   ontology,
}: {
   entity: Entity;
   ontology: Ontology;
}) {
   const excerpt = entity.excerpt!;
   const github = useGithubHref(ontology, excerpt);
   return (
      <div className="overflow-hidden rounded-md border">
         <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            <FileTextIcon className="size-3" />
            {excerpt.modelPath}:{excerpt.startLine + 1}
            {github && (
               <a
                  href={github}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-0.5 font-sans hover:text-foreground hover:underline"
               >
                  Open in GitHub <ArrowUpRightIcon className="size-3" />
               </a>
            )}
         </div>
         <pre className="overflow-x-auto py-2 font-mono text-xs leading-relaxed">
            {excerpt.text.split("\n").map((line, i) => (
               <div key={i} className="flex">
                  <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/60">
                     {excerpt.startLine + i + 1}
                  </span>
                  <span
                     className={
                        line.trim().startsWith("#")
                           ? "text-emerald-700 dark:text-emerald-400"
                           : ""
                     }
                  >
                     {line || " "}
                  </span>
               </div>
            ))}
         </pre>
      </div>
   );
}

function SourceFields({
   ontology,
   source,
}: {
   ontology: Ontology;
   source: Entity;
}) {
   const fields = (source.fieldIds ?? [])
      .map((id) => ontology.entities.get(id))
      .filter(Boolean) as Entity[];
   const groups = (["measure", "dimension", "join", "view"] as const)
      .map((kind) => ({ kind, items: fields.filter((f) => f.kind === kind) }))
      .filter((g) => g.items.length);
   const base = source.extendsId
      ? ontology.entities.get(source.extendsId)
      : undefined;
   return (
      <Card>
         <CardHeader>
            <CardTitle>Fields</CardTitle>
         </CardHeader>
         <CardContent className="space-y-4">
            {base && (
               <p className="text-sm text-muted-foreground">
                  Builds on <EntityChip ontology={ontology} id={base.id} /> and
                  inherits its {source.inheritedFieldCount} fields; the ones
                  below are declared here.
               </p>
            )}
            {groups.map((group) => (
               <div key={group.kind} className="space-y-1.5">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                     {KIND_META[group.kind].plural} · {group.items.length}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                     {group.items.map((f) => (
                        <EntityChip
                           key={f.id}
                           ontology={ontology}
                           id={f.id}
                           preview
                           className={
                              f.doc
                                 ? undefined
                                 : "border-dashed text-muted-foreground"
                           }
                        />
                     ))}
                  </div>
               </div>
            ))}
         </CardContent>
      </Card>
   );
}

function Fact({ label, value }: { label: string; value?: string }) {
   return (
      <div>
         <div className="text-xs text-muted-foreground">{label}</div>
         <div className="font-mono text-sm">{value ?? "—"}</div>
      </div>
   );
}
