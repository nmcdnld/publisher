// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { appPaths, isSlug, slugOf } from "@malloy-publisher/app-manifest";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, LayoutDashboard, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { EvidenceChart } from "@/components/evidence-chart";
import { MalloyBlock } from "@/components/malloy-block";
import { Provenance } from "@/components/provenance";
import { PublisherMenu } from "@/components/publisher-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
   draftEvidence,
   readDraft,
   type DestinationDraft,
} from "@/data/handoff";
import {
   keys,
   useClient,
   usePublishDraft,
   useTopics,
   useViewer,
   useWorkspacePackages,
} from "@/data/hooks";
import { WORKSPACE_ENVIRONMENT, workspaceRoute } from "@/data/publisher";
import { analysisPromotable } from "@/data/sync";
import type { PublishTargets } from "@/data/types";
import { dataAppRef, findingManifest } from "@/lib/save-app";
import { cn } from "@/lib/utils";

/** The landing page for the Publisher Console's Publish button. */
export function PublishPage() {
   const { hash } = useLocation();
   const read = useMemo(() => readDraft(hash), [hash]);

   if (!read.ok) {
      return (
         <PageContainer className="max-w-3xl">
            <PageHeader title="Publish from Publisher" />
            <Card className="gap-2 p-6 text-sm">
               {read.reason === "missing" ? (
                  <>
                     <p className="font-medium">Nothing to publish yet.</p>
                     <p className="text-muted-foreground">
                        Run a query or open a dashboard in the Publisher Console
                        and choose Publish. It opens here with the content ready
                        to review.
                     </p>
                  </>
               ) : (
                  <p className="text-muted-foreground">{read.reason}</p>
               )}
               <Link
                  to="/library?scope=workspace"
                  className="mt-2 text-primary hover:underline"
               >
                  Browse the Library
               </Link>
            </Card>
         </PageContainer>
      );
   }
   return <Review key={read.draft.preparedAt} draft={read.draft} />;
}

/** Where "Keep" puts it: a package, the workspace Library only, the viewer's, or nowhere. */
type Keep = "package" | "workspace" | "personal" | "none";

function Review({ draft }: { draft: DestinationDraft }) {
   const evidence = useMemo(() => draftEvidence(draft), [draft]);
   const topics = useTopics().data ?? [];
   const publish = usePublishDraft();
   const client = useClient();
   const qc = useQueryClient();
   const viewer = useViewer().data?.person;
   const packages = useWorkspacePackages().data;
   const navigate = useNavigate();
   const [title, setTitle] = useState(draft.title);
   const [narrative, setNarrative] = useState(draft.description);
   // A chartable result becomes an analysis, which its own package can hold.
   const pkgName = draft.provenance.package;
   const canSaveToPackage =
      draft.kind === "query" &&
      Boolean(evidence) &&
      draft.provenance.environment === WORKSPACE_ENVIRONMENT;
   const [keep, setKeep] = useState<Keep>(
      canSaveToPackage ? "package" : "workspace",
   );
   const [slug, setSlug] = useState(() => slugOf(draft.title));
   const [slugEdited, setSlugEdited] = useState(false);
   const shownSlug = slugEdited ? slug : slugOf(title);
   const pkg = packages?.find((p) => p.name === pkgName);
   const slugProblem =
      keep !== "package"
         ? undefined
         : !isSlug(shownSlug)
           ? "Use lowercase letters, digits and dashes, starting with a letter or digit."
           : pkg?.items.some(
                  (i) =>
                     i.kind === "data_app" &&
                     i.id === appPaths(shownSlug).index,
               )
             ? `${pkgName} already has an app at apps/${shownSlug}/.`
             : undefined;
   const [targets, setTargets] = useState<Omit<PublishTargets, "library">>({
      feed: Boolean(evidence),
      topics: [],
   });
   const nothingChosen = !(targets.feed && evidence) && keep === "none";
   const [savingApp, setSavingApp] = useState(false);

   /** Saves the analysis the post made into its package, as the Save menu would. */
   const saveToPackage = async (analysisId: string) => {
      const analysis = await client.getAnalysis(analysisId);
      const promotable = analysis && analysisPromotable(analysis);
      const entry = { title: title.trim(), description: narrative.trim() };
      const manifest =
         promotable && viewer && findingManifest(promotable, entry, viewer);
      if (!manifest) throw new Error("There was no query to save.");
      await client.writeDataApp(pkgName, shownSlug, manifest);
      await client.keepInWorkspace(
         { kind: "analysis", id: analysisId },
         dataAppRef(pkgName, shownSlug),
         entry,
      );
      await Promise.all(
         [keys.library, keys.workspace].map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
         ),
      );
   };

   const post = () =>
      publish.mutate(
         [
            { ...draft, title: title.trim(), description: narrative.trim() },
            {
               ...targets,
               library:
                  keep === "workspace" || keep === "personal" ? keep : null,
            },
         ],
         {
            onSuccess: async (outcome) => {
               if (keep === "package" && outcome.analysisId) {
                  setSavingApp(true);
                  try {
                     await saveToPackage(outcome.analysisId);
                     toast.success(
                        outcome.feedPostId
                           ? `Posted, and saved to ${pkgName}`
                           : `Saved to ${pkgName}`,
                     );
                  } catch (e) {
                     toast.error(`Not saved to ${pkgName}`, {
                        description: `${e instanceof Error ? e.message : String(e)} Use Save on the analysis to try again.`,
                     });
                  } finally {
                     setSavingApp(false);
                  }
               } else {
                  toast.success(
                     outcome.feedPostId
                        ? "Posted to the workspace"
                        : "Saved to the Library",
                  );
               }
               if (outcome.analysisId) {
                  navigate(`/analysis/${outcome.analysisId}`, {
                     replace: true,
                  });
               } else {
                  navigate(`/library?item=${outcome.libraryItemId}`, {
                     replace: true,
                  });
               }
            },
            onError: (e) => toast.error(e.message),
         },
      );

   return (
      <PageContainer className="max-w-6xl">
         <PageHeader
            title="Review before posting"
            description="Prepared in Publisher. Nothing is shared until you post it."
            actions={<PublisherMenu publisherUrl={draft.publisherUrl} />}
         />
         <div className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
               <div className="space-y-1.5">
                  <Label htmlFor="pub-title">Title</Label>
                  <Input
                     id="pub-title"
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     className="text-base"
                  />
               </div>
               <div className="space-y-1.5">
                  <Label htmlFor="pub-narrative">What it says</Label>
                  <Textarea
                     id="pub-narrative"
                     value={narrative}
                     onChange={(e) => setNarrative(e.target.value)}
                     placeholder="Lead with the sentence a reader should take away."
                     rows={3}
                  />
               </div>

               <Card>
                  <CardHeader className="flex-row items-center justify-between gap-2">
                     <CardTitle className="text-sm font-medium text-muted-foreground">
                        {draft.kind === "dashboard"
                           ? "Dashboard"
                           : (evidence?.caption ?? "Evidence")}
                     </CardTitle>
                     <Provenance provenance={draft.provenance} />
                  </CardHeader>
                  <CardContent>
                     {draft.kind === "dashboard" ? (
                        <DashboardPreview draft={draft} />
                     ) : evidence ? (
                        <EvidenceChart evidence={evidence} />
                     ) : (
                        <RowsPreview draft={draft} />
                     )}
                  </CardContent>
               </Card>

               {draft.malloy && (
                  <Card>
                     <CardHeader>
                        <CardTitle className="text-sm font-medium">
                           Malloy
                        </CardTitle>
                     </CardHeader>
                     <CardContent>
                        <MalloyBlock value={draft.malloy} />
                     </CardContent>
                  </Card>
               )}
            </div>

            <aside className="space-y-4">
               <Card className="gap-4 p-4">
                  <h3 className="text-sm font-semibold">Where it goes</h3>
                  <div className="flex items-start justify-between gap-3">
                     <div>
                        <Label htmlFor="pub-feed">Post to its channels</Label>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                           {evidence
                              ? "Followers of its channels see it in the Library and their briefing."
                              : draft.kind === "dashboard"
                                ? "Dashboards are kept in the Library; posts carry charts."
                                : "This result has nothing to chart, so it can only be kept."}
                        </p>
                     </div>
                     <Switch
                        id="pub-feed"
                        checked={targets.feed && Boolean(evidence)}
                        disabled={!evidence}
                        onCheckedChange={(feed) =>
                           setTargets({ ...targets, feed })
                        }
                     />
                  </div>
                  <div className="space-y-1.5">
                     <Label>Keep it</Label>
                     <Select
                        value={keep}
                        onValueChange={(v) => setKeep(v as Keep)}
                     >
                        <SelectTrigger className="w-full">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {canSaveToPackage ? (
                              <SelectItem value="package">
                                 In {pkgName}, for everyone
                              </SelectItem>
                           ) : (
                              <SelectItem value="workspace">
                                 Workspace Library, for everyone
                              </SelectItem>
                           )}
                           <SelectItem value="personal">Just for me</SelectItem>
                           <SelectItem value="none">Don't keep it</SelectItem>
                        </SelectContent>
                     </Select>
                     <p className="text-xs text-muted-foreground">
                        {keep === "package"
                           ? `Saved into ${pkgName} as a data app, which the Publisher Console shows too.`
                           : keep === "workspace"
                             ? draft.kind === "dashboard"
                                ? `The dashboard is already in ${pkgName}; this keeps it in the Library.`
                                : "Only this app keeps it: a result with nothing to chart can't be saved into a package."
                             : keep === "personal"
                               ? "In your Library, where only you see it."
                               : "Posted to its channels only."}
                     </p>
                  </div>
                  {keep === "package" && (
                     <div className="space-y-1.5">
                        <Label htmlFor="pub-slug">Address</Label>
                        <Input
                           id="pub-slug"
                           value={shownSlug}
                           onChange={(e) => {
                              setSlug(e.target.value);
                              setSlugEdited(true);
                           }}
                           className="font-mono text-xs"
                           aria-invalid={Boolean(slugProblem)}
                        />
                        <p
                           className={cn(
                              "font-mono text-xs",
                              slugProblem
                                 ? "text-destructive"
                                 : "text-muted-foreground",
                           )}
                        >
                           {slugProblem ??
                              `${pkgName}/public/apps/${shownSlug}/`}
                        </p>
                     </div>
                  )}
                  {evidence && (
                     <div className="space-y-1.5">
                        <Label>Channels</Label>
                        <div className="flex flex-wrap gap-1.5">
                           {topics.map((t) => {
                              const on = targets.topics.includes(t.id);
                              return (
                                 <button
                                    key={t.id}
                                    onClick={() =>
                                       setTargets({
                                          ...targets,
                                          topics: on
                                             ? targets.topics.filter(
                                                  (x) => x !== t.id,
                                               )
                                             : [...targets.topics, t.id],
                                       })
                                    }
                                    className={cn(
                                       "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                                       on
                                          ? "border-primary bg-primary/10"
                                          : "text-muted-foreground hover:bg-muted",
                                    )}
                                 >
                                    {on && <Check className="size-3" />}#
                                    {t.label}
                                 </button>
                              );
                           })}
                        </div>
                     </div>
                  )}
                  <Button
                     className="w-full"
                     disabled={
                        !title.trim() ||
                        nothingChosen ||
                        Boolean(slugProblem) ||
                        publish.isPending ||
                        savingApp
                     }
                     onClick={post}
                  >
                     <Send />
                     {targets.feed && evidence ? "Post" : "Save"}
                  </Button>
               </Card>
            </aside>
         </div>
      </PageContainer>
   );
}

function DashboardPreview({ draft }: { draft: DestinationDraft }) {
   return (
      <Link
         to={workspaceRoute(
            draft.provenance.package,
            "dashboard",
            draft.provenance.source,
            draft.givens,
         )}
         className="flex items-center gap-4 rounded-lg border bg-muted/30 p-5 hover:bg-muted/60"
      >
         <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LayoutDashboard className="size-5" />
         </div>
         <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-medium">Live from Publisher</p>
            <p className="text-sm text-muted-foreground">
               Readers open the dashboard itself, right here, so its numbers are
               always current.
            </p>
            {draft.givens && (
               <div className="flex flex-wrap gap-1">
                  {Object.entries(draft.givens).map(([k, v]) => (
                     <Badge key={k} variant="secondary" className="font-mono">
                        {k} = {typeof v === "string" ? v : JSON.stringify(v)}
                     </Badge>
                  ))}
               </div>
            )}
         </div>
         <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
   );
}

function RowsPreview({ draft }: { draft: DestinationDraft }) {
   const result = draft.result;
   if (!result || result.rows.length === 0) {
      return (
         <p className="text-sm text-muted-foreground">
            The query returned no rows.
         </p>
      );
   }
   return (
      <div className="overflow-x-auto">
         <table className="w-full text-sm">
            <thead>
               <tr className="border-b text-left text-xs text-muted-foreground">
                  {result.columns.map((c) => (
                     <th key={c.name} className="px-2 py-1.5 font-medium">
                        {c.label ?? c.name}
                     </th>
                  ))}
               </tr>
            </thead>
            <tbody>
               {result.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                     {result.columns.map((c) => (
                        <td key={c.name} className="px-2 py-1.5 tabular-nums">
                           {String(r[c.name] ?? "∅")}
                        </td>
                     ))}
                  </tr>
               ))}
            </tbody>
         </table>
      </div>
   );
}
