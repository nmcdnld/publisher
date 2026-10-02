// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowLeft,
   Blocks,
   Boxes,
   ChevronRight,
   Code2,
   Hand,
   MessagesSquare,
   PanelRightOpen,
   PenLine,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
   Link,
   useNavigate,
   useParams,
   useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import { PageContainer } from "@/components/app-shell";
import { EvidenceChart } from "@/components/evidence-chart";
import { MalloyBlock } from "@/components/malloy-block";
import { Byline } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { SaveButton, useFindingSave } from "@/components/save-menu";
import { PublisherMenu } from "@/components/publisher-menu";
import { QueryPills } from "@/components/query-pills";
import { ResultsGrid } from "@/components/results-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnalysis, useRemixAnalysis } from "@/data/hooks";
import {
   modelQueryConsoleUrl,
   modelQueryRoute,
   pageKey,
} from "@/data/publisher";
import { analysisPromotable } from "@/data/sync";
import { AnalystMessage } from "@/features/analyst/analyst-message";
import { CommentSection } from "@/features/comments/comment-section";
import {
   AnalysisSidebar,
   useDetailsOpen,
} from "@/features/publisher/page-sidebar";
import { useMarkSeen } from "@/features/recommendations/for-you-panel";
import { useThreadUi } from "@/features/threads/thread-context";
import { relativeTime } from "@/lib/format";
import { parseMalloyQuery } from "@/lib/malloy-query";
import { cn } from "@/lib/utils";

type QueryView = "pills" | "code";

export function AnalysisPage() {
   const { analysisId = "" } = useParams();
   return <AnalysisView key={analysisId} analysisId={analysisId} />;
}

function AnalysisView({ analysisId }: { analysisId: string }) {
   const [params, setParams] = useSearchParams();
   const remixing = params.get("remix") === "1";
   const { data: analysis, isPending } = useAnalysis(analysisId);
   const remix = useRemixAnalysis();
   const navigate = useNavigate();
   const { ask } = useThreadUi();
   const save = useFindingSave(
      analysis ? analysisPromotable(analysis) : undefined,
   );
   const [details, setDetails] = useDetailsOpen();
   const page = useRef<HTMLDivElement>(null);
   const queryCard = useRef<HTMLDivElement>(null);
   const [draft, setDraft] = useState("");
   const [view, setView] = useState<QueryView>(remixing ? "code" : "pills");
   const [queryOpen, setQueryOpen] = useState(remixing);
   const [resultsOpen, setResultsOpen] = useState(false);
   useMarkSeen(analysisId);

   useEffect(() => {
      if (analysis) setDraft(analysis.malloy);
   }, [analysis]);

   useEffect(() => {
      page.current?.closest("main")?.scrollTo({ top: 0 });
   }, [isPending]);

   const query = remixing ? draft : (analysis?.malloy ?? "");
   const parsed = useMemo(() => parseMalloyQuery(query), [query]);

   if (isPending) {
      return (
         <PageContainer className="space-y-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-80" />
         </PageContainer>
      );
   }
   if (!analysis) {
      return (
         <PageContainer>
            <p className="text-muted-foreground">
               This analysis doesn't exist or was removed.
            </p>
         </PageContainer>
      );
   }

   const promotable = analysisPromotable(analysis);
   const exploreRoute = modelQueryRoute(
      analysis.provenance.package,
      analysis.provenance.model,
      query,
   );

   const setRemixing = (on: boolean) => {
      setParams(on ? { remix: "1" } : {}, { replace: true });
      if (on) {
         setView("code");
         setQueryOpen(true);
      }
   };

   return (
      <div ref={page} className="flex min-h-full">
         <PageContainer className="max-w-4xl min-w-0 flex-1 space-y-6">
            <Button
               variant="ghost"
               size="sm"
               className="-ml-2"
               onClick={() => navigate(-1)}
            >
               <ArrowLeft />
               Back
            </Button>

            <header className="space-y-3">
               <div className="flex flex-wrap gap-1.5">
                  {analysis.topics.map((t) => (
                     <Link key={t} to={`/library?scope=workspace&channel=${t}`}>
                        <Badge variant="secondary">#{t}</Badge>
                     </Link>
                  ))}
               </div>
               <h1 className="text-3xl font-semibold tracking-tight">
                  {analysis.title}
               </h1>
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <Byline
                     authorId={analysis.authorId}
                     suffix={`${analysis.authorId === "ai" ? "drafted" : "published"} ${relativeTime(analysis.createdAt)}`}
                  />
                  <div className="flex items-center gap-1">
                     <SaveButton promotable={promotable} />
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
                        publisherUrl={modelQueryConsoleUrl(
                           analysis.provenance.package,
                           analysis.provenance.model,
                           query,
                           analysis.provenance.environment,
                        )}
                     >
                        <DropdownMenuItem asChild>
                           <Link to={exploreRoute}>
                              <Boxes />
                              Explore the model
                           </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           disabled={remixing}
                           onSelect={() => {
                              setRemixing(true);
                              queryCard.current?.scrollIntoView({
                                 behavior: "smooth",
                                 block: "start",
                              });
                           }}
                        >
                           <PenLine />
                           Remix
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onSelect={() =>
                              ask(`Tell me more about: ${analysis.title}`, {
                                 fresh: true,
                              })
                           }
                        >
                           <MessagesSquare />
                           Ask a follow-up
                        </DropdownMenuItem>
                     </PublisherMenu>
                  </div>
               </div>
            </header>

            {analysis.report ? (
               <AnalystMessage record={analysis.report} />
            ) : (
               <>
                  <p className="text-xl leading-relaxed">
                     {analysis.narrative}
                  </p>
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
                        <EvidenceChart evidence={analysis.evidence} />
                     </CardContent>
                  </Card>
               </>
            )}

            <Card
               ref={queryCard}
               className={cn(
                  "scroll-mt-6 gap-0 overflow-hidden py-0",
                  remixing && "border-primary/50 ring-2 ring-primary/15",
               )}
            >
               <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 bg-muted/30 px-4 py-2">
                  <button
                     onClick={() => setQueryOpen(!queryOpen)}
                     aria-expanded={queryOpen}
                     className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                     <ChevronRight
                        className={cn(
                           "size-4 text-muted-foreground transition-transform",
                           queryOpen && "rotate-90",
                        )}
                     />
                     Query
                  </button>
                  <Provenance
                     provenance={analysis.provenance}
                     className="hidden sm:inline-flex"
                  />
                  <div className="ml-auto flex items-center gap-2">
                     {queryOpen && (
                        <ToggleGroup
                           type="single"
                           size="sm"
                           variant="outline"
                           value={view}
                           onValueChange={(v) => v && setView(v as QueryView)}
                           aria-label="Show the query as"
                        >
                           <ToggleGroupItem
                              value="pills"
                              className="h-7 text-xs"
                           >
                              <Blocks className="size-3.5" />
                              Pills
                           </ToggleGroupItem>
                           <ToggleGroupItem
                              value="code"
                              className="h-7 text-xs"
                           >
                              <Code2 className="size-3.5" />
                              Code
                           </ToggleGroupItem>
                        </ToggleGroup>
                     )}
                     {!remixing && (
                        <Button
                           size="sm"
                           variant="outline"
                           className="h-7 text-xs"
                           onClick={() => setRemixing(true)}
                        >
                           <PenLine className="size-3.5" />
                           Remix
                        </Button>
                     )}
                  </div>
               </div>
               <div
                  className={cn(
                     "space-y-3 border-t px-4 py-3",
                     !queryOpen && "hidden",
                  )}
               >
                  {remixing && (
                     <div className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
                        <Hand className="mt-0.5 size-4 shrink-0" />
                        {analysis.authorId === "ai"
                           ? "You're taking over the AI's draft. Edit the query; it becomes yours when you save."
                           : "You're editing a copy. The original stays as its author left it."}
                     </div>
                  )}
                  {view === "pills" && parsed ? (
                     <QueryPills
                        query={parsed}
                        provenance={analysis.provenance}
                     />
                  ) : (
                     <>
                        {view === "pills" && (
                           <p className="text-xs text-muted-foreground">
                              This query uses Malloy the pill view can't draw
                              yet, so here it is as code.
                           </p>
                        )}
                        <MalloyBlock
                           value={query}
                           onChange={remixing ? setDraft : undefined}
                        />
                     </>
                  )}
                  {remixing && (
                     <div className="flex gap-2">
                        <Button
                           disabled={remix.isPending}
                           onClick={() =>
                              remix.mutate([analysis.id, draft], {
                                 onSuccess: (mine) => {
                                    toast.success("Saved as your version");
                                    navigate(`/analysis/${mine.id}`, {
                                       replace: true,
                                    });
                                 },
                              })
                           }
                        >
                           Save as my version
                        </Button>
                        <Button
                           variant="ghost"
                           onClick={() => {
                              setDraft(analysis.malloy);
                              setRemixing(false);
                           }}
                        >
                           Cancel
                        </Button>
                     </div>
                  )}
               </div>
               <div className="border-t">
                  {resultsOpen && remixing && draft !== analysis.malloy && (
                     <p className="border-b bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
                        These rows are from the saved query. Save your version
                        to run the edit.
                     </p>
                  )}
                  <ResultsGrid
                     evidence={analysis.evidence}
                     filename={analysis.title}
                     open={resultsOpen}
                     onOpenChange={setResultsOpen}
                  />
               </div>
            </Card>

            <CommentSection
               subject={
                  save.ref
                     ? pageKey(save.ref.package, "data_app", save.ref.id)
                     : analysis.id
               }
               formerly={[analysis.id]}
            />
         </PageContainer>
         {details && (
            <AnalysisSidebar
               analysis={analysis}
               onClose={() => setDetails(false)}
            />
         )}
      </div>
   );
}
