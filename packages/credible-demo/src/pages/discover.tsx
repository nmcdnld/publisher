// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { AnalysisMenu } from "@/components/analysis-actions";
import { PageContainer } from "@/components/app-shell";
import { contentKinds, KindIcon } from "@/components/content-kind";
import { DeltaBadge } from "@/components/delta-badge";
import { EvidenceChart } from "@/components/evidence-chart";
import { AvatarStack } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { Glance } from "@/components/glance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoSteps } from "@/components/workspace-panels";
import {
   useAnalyses,
   useClient,
   useInsights,
   useResume,
   useSetInsightStatus,
   useStudioInsights,
   useTrending,
   useViewer,
   useWhatChanged,
} from "@/data/hooks";
import { startBriefing, useDemoRefresh } from "@/lib/demo-refresh";
import { useQueryClient } from "@tanstack/react-query";
import type { Insight, ResumeItem } from "@/data/types";
import { Composer, type ComposerHandle } from "@/features/composer/composer";
import { SuggestedQuestions } from "@/features/composer/suggested-questions";
import {
   deltaTone,
   formatCount,
   formatValue,
   greeting,
   relativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
   Clock,
   Code2,
   Compass,
   Eye,
   FlaskConical,
   LoaderCircle,
   MessagesSquare,
   WandSparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export function DiscoverPage() {
   return (
      <PageContainer className="space-y-10">
         <Greeting />
         <CommandBar />
         <ForYou />
         <Trending />
         <Resume />
      </PageContainer>
   );
}

function Greeting() {
   const viewer = useViewer().data;
   const changed = useWhatChanged().data;
   const firstName = viewer?.person.name.split(" ")[0];
   return (
      <section>
         <h1 className="text-3xl font-semibold tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}.
         </h1>
         {changed ? (
            <div className="mt-3 space-y-2">
               <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
                  {changed.summary}
               </p>
               <div className="flex flex-wrap items-center gap-3 text-sm">
                  {changed.highlights.map((h) => (
                     <span
                        key={h.label}
                        className="inline-flex items-center gap-1.5"
                     >
                        <span className="text-muted-foreground">{h.label}</span>
                        <DeltaBadge delta={h.delta} />
                     </span>
                  ))}
                  <span className="text-xs text-muted-foreground">
                     Updated {relativeTime(changed.asOf)}
                  </span>
               </div>
            </div>
         ) : changed === null ? (
            <EmptyBriefing />
         ) : (
            <div className="mt-3 space-y-2">
               <Skeleton className="h-6 w-3/4" />
               <Skeleton className="h-5 w-1/3" />
            </div>
         )}
      </section>
   );
}

/**
 * In place of the briefing when there is none: Opus 5.5 writes one from the
 * insights the workspace has kept, its packages and its scenario, finding
 * insights first when there are none.
 */
function EmptyBriefing() {
   const client = useClient();
   const qc = useQueryClient();
   const task = useDemoRefresh();
   const running = task.status === "running";
   const kept =
      useStudioInsights().data?.filter((i) => i.status !== "dismissed")
         .length ?? 0;
   return (
      <div className="mt-3 max-w-3xl space-y-3">
         <p className="text-lg leading-relaxed text-muted-foreground">
            Nothing has been briefed for this workspace yet.
         </p>
         <div className="flex flex-wrap items-center gap-3">
            <Button
               size="sm"
               disabled={running}
               onClick={() => void startBriefing(client, qc)}
            >
               {running ? (
                  <LoaderCircle className="animate-spin" />
               ) : (
                  <WandSparkles />
               )}
               {running
                  ? task.task === "briefing"
                     ? "Writing the briefing…"
                     : task.task === "questions"
                       ? "Writing questions…"
                       : "Refreshing demo content…"
                  : "Write a briefing"}
            </Button>
            {!running && (
               <span className="text-xs text-muted-foreground">
                  {kept
                     ? `Claude Opus 5.5 writes it from the ${kept} ${kept === 1 ? "insight" : "insights"} in Studio and this workspace's packages.`
                     : "Claude Opus 5.5 finds insights in this workspace's packages first, which takes a few minutes."}
               </span>
            )}
         </div>
         {task.task === "briefing" && <DemoSteps />}
      </div>
   );
}

function CommandBar() {
   const composer = useRef<ComposerHandle>(null);

   return (
      <section className="space-y-3">
         <Composer
            ref={composer}
            fresh
            size="lg"
            placeholder="What would you like to do next? Type @ to reference a source, dashboard, or thread"
            className="shadow-sm"
         />
         <SuggestedQuestions onPick={(q) => composer.current?.setText(q)} />
      </section>
   );
}

function SectionTitle({
   children,
   hint,
   action,
}: {
   children: React.ReactNode;
   hint?: string;
   action?: React.ReactNode;
}) {
   return (
      <div className="mb-4 flex items-baseline gap-3">
         <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
         {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
         {action && <span className="ml-auto">{action}</span>}
      </div>
   );
}

function ForYou() {
   const insights = useInsights();
   const setStatus = useSetInsightStatus();
   const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
   const setShown = (id: string, shown: boolean) => {
      setHidden((prev) => {
         const next = new Set(prev);
         if (shown) next.delete(id);
         else next.add(id);
         return next;
      });
      setStatus.mutate([id, shown ? "featured" : "dismissed"]);
   };
   const shown = insights.data?.filter((i) => !hidden.has(i.id));
   return (
      <section>
         <SectionTitle
            hint="Drafted by AI from your governed models"
            action={
               <Link
                  to="/studio"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
               >
                  <FlaskConical className="size-3.5" />
                  Open Studio
               </Link>
            }
         >
            For you
         </SectionTitle>
         <div className="grid gap-4 @4xl:grid-cols-3">
            {shown
               ? shown.map((i) => (
                    <InsightCard
                       key={i.id}
                       insight={i}
                       onDismiss={() => {
                          setShown(i.id, false);
                          toast("You'll see fewer insights like this", {
                             action: {
                                label: "Undo",
                                onClick: () => setShown(i.id, true),
                             },
                          });
                       }}
                    />
                 ))
               : [0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[26rem] rounded-xl" />
                 ))}
            {shown?.length === 0 && (
               <Card className="items-center gap-3 p-8 text-center text-sm text-muted-foreground @4xl:col-span-3">
                  Nothing featured right now.
                  <Button variant="outline" size="sm" asChild>
                     <Link to="/studio">
                        <FlaskConical />
                        Generate insights in Studio
                     </Link>
                  </Button>
               </Card>
            )}
         </div>
      </section>
   );
}

const toneText = {
   good: "text-positive",
   bad: "text-negative",
   flat: "text-muted-foreground",
} as const;

/**
 * The number and its trend, the takeaway, and the chart that argues it, in one
 * panel, with where it came from in the footer. The narrative is left to the
 * analysis page.
 */
export function InsightCard({
   insight,
   onDismiss,
   className,
}: {
   insight: Insight;
   onDismiss?: () => void;
   className?: string;
}) {
   const analysis = useAnalyses().byId.get(insight.analysisId);
   if (!analysis) {
      return <Skeleton className={cn("h-[26rem] rounded-xl", className)} />;
   }
   const href = `/analysis/${analysis.id}`;
   const { metric } = insight;

   return (
      <Card
         className={cn(
            "group/card relative row-span-2 grid grid-cols-[minmax(0,1fr)] grid-rows-subgrid gap-0 p-1.5 transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-md has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring/50",
            className,
         )}
      >
         <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3.5">
            <div className="flex items-start justify-between gap-3">
               <div className="min-w-0 space-y-1">
                  <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                     {metric.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                     <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">
                        {formatValue(metric.value, metric.format, {
                           compact: metric.format === "currency",
                        })}
                     </span>
                     <DeltaBadge delta={insight.delta} />
                  </div>
               </div>
               <Glance
                  metric={metric}
                  className={cn(
                     "mt-1 h-9 w-16 shrink-0 @6xl:w-20",
                     toneText[deltaTone(insight.delta)],
                  )}
               />
            </div>
            <h3 className="text-[15px] leading-snug font-semibold tracking-tight">
               <Link
                  to={href}
                  data-card-link
                  className="outline-none after:absolute after:inset-0 after:rounded-xl"
               >
                  {insight.headline}
               </Link>
            </h3>
            <Link
               to={href}
               tabIndex={-1}
               aria-hidden
               className="relative z-10 flex flex-1 flex-col justify-center"
            >
               <EvidenceChart evidence={analysis.evidence} compact />
            </Link>
         </div>
         <footer className="flex items-center gap-1.5 pt-1.5 pr-0.5 pl-2.5 text-[11px] text-muted-foreground">
            <Provenance
               provenance={analysis.provenance}
               className="relative z-10 min-w-0 text-[10.5px]"
            />
            <span aria-hidden>·</span>
            <span className="shrink-0 tabular-nums">
               {relativeTime(analysis.createdAt)}
            </span>
            <AnalysisMenu
               analysis={analysis}
               onDismiss={onDismiss}
               inspectHref={`/studio?view=featured&insight=${insight.id}`}
               className="relative z-10 ml-auto"
            />
         </footer>
      </Card>
   );
}

function Trending() {
   const trending = useTrending().data;
   if (trending?.length === 0) return null;
   return (
      <section>
         <SectionTitle hint="What your team is reading">Trending</SectionTitle>
         <div className="-mx-6 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 lg:-mx-10 lg:scroll-px-10 lg:px-10">
            {(trending ?? []).map((t) => (
               <Link
                  key={t.id}
                  to={t.href}
                  className="group flex w-60 shrink-0 snap-start flex-col justify-between gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
               >
                  <div className="space-y-2">
                     <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <KindIcon kind={t.kind} className="size-3.5" />
                        {contentKinds[t.kind].label}
                     </span>
                     <p className="line-clamp-2 text-sm font-medium group-hover:underline">
                        {t.title}
                     </p>
                  </div>
                  <div className="flex items-center justify-between">
                     <AvatarStack ids={t.viewerIds} max={3} />
                     <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                        <Eye className="size-3.5" />
                        {formatCount(t.views)} views
                     </span>
                  </div>
               </Link>
            ))}
            {!trending &&
               [0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-60 shrink-0 rounded-xl" />
               ))}
         </div>
      </section>
   );
}

const resumeIcon: Record<ResumeItem["kind"], typeof Code2> = {
   query: Code2,
   exploration: Compass,
   thread: MessagesSquare,
};

function Resume() {
   const resume = useResume().data;
   if (resume?.length === 0) return null;
   return (
      <section>
         <SectionTitle hint="Pick up where you left off">Resume</SectionTitle>
         <Card className="gap-0 divide-y p-0">
            {(resume ?? []).map((r) => {
               const Icon = resumeIcon[r.kind];
               return (
                  <Link
                     key={r.id}
                     to={r.href}
                     className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                     <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                     </span>
                     <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                           {r.title}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                           {r.context}
                        </span>
                     </span>
                     <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {relativeTime(r.lastOpenedAt)}
                     </span>
                  </Link>
               );
            })}
            {!resume &&
               [0, 1, 2].map((i) => <Skeleton key={i} className="m-3 h-10" />)}
         </Card>
      </section>
   );
}
