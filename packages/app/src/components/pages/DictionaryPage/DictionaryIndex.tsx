// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   AlertTriangleIcon,
   ChevronRightIcon,
   GitPullRequestArrowIcon,
   LayoutDashboardIcon,
   Loader2Icon,
   SparklesIcon,
   ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAiHealth } from "../../../ai/consoleAi";
import { cn } from "../../../lib/utils";
import { usePrototypeFeature } from "../../../prototypeFeatures";
import type {
   ContentKind,
   Entity,
   EntityKind,
   Ontology,
} from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
} from "../../ui/card";
import { Progress } from "../../ui/misc";
import { useRunHistory } from "../CoveragePage/model";
import { ScoreGradeChip } from "../CoveragePage/ScoreGradeChip";
import { AskSheet } from "./AskSheet";
import {
   CONTENT_META,
   ContentGrid,
   relatedContent,
   useOpenContent,
} from "./content";
import {
   liveDrafts,
   startDraftRun,
   undocumented,
   useDraftRun,
   useDrafts,
} from "./drafts";
import { useDictionaryPanel } from "./panel";
import { dictionaryHref, EntityChip, KIND_META, KindIcon } from "./shared";

export function DictionaryIndex({ ontology }: { ontology: Ontology }) {
   const { stats } = ontology;
   const coverage = stats.documentable
      ? stats.documented / stats.documentable
      : 0;
   const base = `/${ontology.environmentName}/${ontology.packageName}`;
   const failed = ontology.models.filter((m) => m.error);
   const { openId } = useOpenContent();
   const opened = ontology.content.some((c) => c.id === openId);
   const questionCoverage = usePrototypeFeature("questionCoverage");

   const sources = [...ontology.sources].sort(
      (a, b) =>
         Number(Boolean(a.extendsId)) - Number(Boolean(b.extendsId)) ||
         (b.fieldIds?.length ?? 0) - (a.fieldIds?.length ?? 0),
   );

   if (opened) {
      return (
         <div className="mx-auto max-w-6xl px-6 py-6">
            <ContentGrid ontology={ontology} items={ontology.content} />
         </div>
      );
   }

   return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-6">
         <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
               <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Data Dictionary
               </div>
               <h1 className="text-3xl font-semibold tracking-tight">
                  {ontology.packageName}
               </h1>
               {ontology.description && (
                  <p className="text-base leading-relaxed text-muted-foreground">
                     {ontology.description}
                  </p>
               )}
            </div>
            <div className="flex gap-2">
               <AskSheet ontology={ontology} />
            </div>
         </header>

         {failed.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-partial/40 bg-partial/10 px-4 py-3 text-sm">
               <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-partial" />
               <div>
                  {failed.length} model{failed.length > 1 ? "s" : ""} did not
                  compile and {failed.length > 1 ? "are" : "is"} missing here:{" "}
                  {failed.map((m) => (
                     <code key={m.path} className="font-mono">
                        {m.path}{" "}
                     </code>
                  ))}
               </div>
            </div>
         )}

         <div className="flex flex-wrap gap-3 [&>*]:min-w-24 [&>*]:flex-1">
            {(
               [
                  [["source", stats.sources]],
                  [
                     ["measure", stats.measures],
                     ["dimension", stats.dimensions],
                  ],
                  [["view", stats.views]],
                  [["join", stats.joins]],
               ] as Array<Array<[EntityKind, number]>>
            ).map((group) => (
               <Card
                  key={group[0][0]}
                  className={cn(
                     "py-4",
                     group.length > 1 && "flex-[2]! min-w-48!",
                  )}
               >
                  <CardContent className="flex divide-x px-0">
                     {group.map(([kind, count]) => (
                        <div key={kind} className="flex-1 space-y-1 px-4">
                           <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <KindIcon kind={kind} />
                              {KIND_META[kind].plural}
                           </div>
                           <div className="text-2xl font-semibold tabular-nums">
                              {count}
                           </div>
                        </div>
                     ))}
                  </CardContent>
               </Card>
            ))}
            <DocCoverage ontology={ontology} coverage={coverage} />
            {questionCoverage && (
               <QuestionCoverage ontology={ontology} to={`${base}/coverage`} />
            )}
         </div>

         {ontology.content.length > 0 && <ContentSection ontology={ontology} />}

         <section className="space-y-3">
            <h2 className="text-sm font-semibold">Sources</h2>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))]">
               {sources.map((source) => (
                  <SourceCard
                     key={source.id}
                     ontology={ontology}
                     source={source}
                  />
               ))}
            </div>
         </section>

         {ontology.givens.length > 0 && (
            <section className="space-y-3">
               <h2 className="text-sm font-semibold">Givens</h2>
               <div className="flex flex-wrap gap-2">
                  {ontology.givens.map((g) => (
                     <EntityChip
                        key={g.id}
                        ontology={ontology}
                        id={g.id}
                        qualified
                     />
                  ))}
               </div>
            </section>
         )}
         {ontology.queries.length > 0 && (
            <section className="space-y-3">
               <h2 className="text-sm font-semibold">Named queries</h2>
               <div className="flex flex-wrap gap-2">
                  {ontology.queries.map((query) => (
                     <EntityChip
                        key={query.id}
                        ontology={ontology}
                        id={query.id}
                     />
                  ))}
               </div>
            </section>
         )}
      </div>
   );
}

function ContentSection({ ontology }: { ontology: Ontology }) {
   const [kind, setKind] = useState<ContentKind | "all">("all");
   const kinds = (Object.keys(CONTENT_META) as ContentKind[]).filter((k) =>
      ontology.content.some((c) => c.kind === k),
   );
   const items = ontology.content.filter(
      (c) => kind === "all" || c.kind === kind,
   );
   return (
      <section className="space-y-3">
         <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Content</h2>
            {kinds.length > 1 && (
               <div className="flex items-center gap-1 rounded-md border p-0.5">
                  {(["all", ...kinds] as const).map((k) => (
                     <button
                        key={k}
                        onClick={() => setKind(k)}
                        className={cn(
                           "rounded px-2.5 py-1 text-xs",
                           k === kind
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent",
                        )}
                     >
                        {k === "all" ? "All" : CONTENT_META[k].plural}{" "}
                        <span className="tabular-nums opacity-70">
                           {k === "all"
                              ? ontology.content.length
                              : ontology.content.filter((c) => c.kind === k)
                                   .length}
                        </span>
                     </button>
                  ))}
               </div>
            )}
         </div>
         <ContentGrid ontology={ontology} items={items} />
      </section>
   );
}

function DocCoverage({
   ontology,
   coverage,
}: {
   ontology: Ontology;
   coverage: number;
}) {
   const health = useAiHealth();
   const { drafts } = useDrafts(ontology);
   const run = useDraftRun(ontology);
   const { open } = useDictionaryPanel();
   const live = liveDrafts(ontology, drafts);
   const drafted = new Set(live.map((d) => d.entity.id));
   const missing = undocumented(ontology).filter((e) => !drafted.has(e.id));
   const toReview = live.filter((d) => d.draft.status === "draft").length;
   const accepted = live.length - toReview;
   const done = run ? run.finished.length + run.failed.length : 0;

   return (
      <Card className="min-w-40! flex-[1.5]! gap-2 py-4">
         <CardContent className="space-y-2 px-4">
            <div className="flex items-baseline justify-between">
               <span className="text-xs text-muted-foreground">Documented</span>
               <span className="text-2xl font-semibold tabular-nums">
                  {Math.round(coverage * 100)}%
               </span>
            </div>
            <Progress value={coverage * 100} className="h-1.5" />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
               {run?.running ? (
                  <Button
                     size="xs"
                     variant="outline"
                     onClick={() => open({ type: "drafts" })}
                  >
                     <Loader2Icon className="animate-spin" />
                     Drafting {done}/{run.targets.length}
                  </Button>
               ) : (
                  health.data?.chat &&
                  missing.length > 0 && (
                     <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                           startDraftRun(ontology, missing);
                           open({ type: "drafts" });
                        }}
                     >
                        <SparklesIcon /> Draft {missing.length} missing
                     </Button>
                  )
               )}
               {toReview > 0 && (
                  <Button
                     size="xs"
                     variant="outline"
                     onClick={() => open({ type: "drafts" })}
                  >
                     Review {toReview} {toReview === 1 ? "draft" : "drafts"}
                  </Button>
               )}
               {accepted > 0 && (
                  <Button size="xs" onClick={() => open({ type: "promote" })}>
                     <GitPullRequestArrowIcon /> Promote {accepted}
                  </Button>
               )}
            </div>
         </CardContent>
      </Card>
   );
}

function QuestionCoverage({
   ontology,
   to,
}: {
   ontology: Ontology;
   to: string;
}) {
   const { runs } = useRunHistory(ontology);
   const last = runs.find((r) => r.score !== undefined);
   return (
      <Card className="group min-w-52! flex-[2]! gap-2 py-4 transition-colors hover:border-primary/40">
         <Link to={to} className="block">
            <CardContent className="space-y-2 px-4">
               <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                     Question coverage
                     <ChevronRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="flex items-center gap-2">
                     {last?.score !== undefined && (
                        <ScoreGradeChip score={last.score} />
                     )}
                     <span
                        className={cn(
                           "text-2xl font-semibold tabular-nums",
                           last?.score === undefined && "text-muted-foreground",
                        )}
                     >
                        {last?.score ?? "–"}
                     </span>
                  </span>
               </div>
               <Progress value={last?.score ?? 0} className="h-1.5" />
               <div className="pt-1 text-xs text-muted-foreground">
                  {last
                     ? `${last.questions.length} questions · ${new Date(last.at).toLocaleDateString()}`
                     : "Not measured yet"}
               </div>
            </CardContent>
         </Link>
      </Card>
   );
}

function SourceCard({
   ontology,
   source,
}: {
   ontology: Ontology;
   source: Entity;
}) {
   const fields = (source.fieldIds ?? [])
      .map((id) => ontology.entities.get(id))
      .filter(Boolean) as Entity[];
   const count = (kind: EntityKind) =>
      fields.filter((f) => f.kind === kind).length;
   const joins = fields.filter((f) => f.kind === "join");
   const documented = fields.filter((f) => f.doc).length;
   const related = relatedContent(ontology, source).length;
   return (
      <Card className="group relative gap-3 transition-colors hover:border-primary/30">
         <CardHeader>
            <CardTitle className="flex items-center gap-2">
               <KindIcon kind="source" className="size-4" />
               <Link
                  to={dictionaryHref(ontology, source.id)}
                  className="font-mono text-base after:absolute after:inset-0 after:rounded-[inherit] group-hover:text-primary"
               >
                  {source.name}
               </Link>
               {source.persisted && (
                  <Badge variant="outline" className="gap-1">
                     <ZapIcon /> persisted
                  </Badge>
               )}
               {source.extendsId && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                     on {ontology.entities.get(source.extendsId)?.name}
                  </span>
               )}
            </CardTitle>
            <CardDescription className="line-clamp-2">
               {source.doc ?? (
                  <span className="italic">
                     No description · {source.modelPath}
                  </span>
               )}
            </CardDescription>
         </CardHeader>
         <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
               {(["measure", "dimension", "view"] as const).map((kind) =>
                  count(kind) ? (
                     <span key={kind} className="flex items-center gap-1">
                        <KindIcon kind={kind} />
                        {count(kind)}{" "}
                        {(count(kind) === 1
                           ? kind
                           : KIND_META[kind].plural
                        ).toLowerCase()}
                     </span>
                  ) : null,
               )}
               {fields.length > 0 && (
                  <span>
                     {Math.round((documented / fields.length) * 100)}%
                     documented
                  </span>
               )}
               {related > 0 && (
                  <span className="flex items-center gap-1">
                     <LayoutDashboardIcon className="size-3" />
                     used by {related} {related === 1 ? "item" : "items"}
                  </span>
               )}
            </div>
            {joins.length > 0 && (
               <div className="relative z-10 flex w-fit flex-wrap gap-1.5">
                  {joins.map((j) => (
                     <EntityChip key={j.id} ontology={ontology} id={j.id} />
                  ))}
               </div>
            )}
         </CardContent>
      </Card>
   );
}
