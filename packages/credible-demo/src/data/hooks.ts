// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   useMutation,
   useQueries,
   useQuery,
   useQueryClient,
   type QueryKey,
} from "@tanstack/react-query";
import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
} from "react";
import { showsPackage, useWorkspaces } from "@/lib/workspaces";
import type { DestinationClient } from "./client";
import { buildEntities } from "./entities";
import type {
   BriefingSubscription,
   Collection,
   InsightSchedule,
   MessageStatus,
   PageMeta,
   Person,
   PublishTargets,
   WorkspacePackage,
} from "./types";
import type { DestinationDraft } from "./handoff";

export const ClientContext = createContext<DestinationClient | null>(null);

export function useClient(): DestinationClient {
   const client = useContext(ClientContext);
   if (!client) throw new Error("useClient must be used inside ClientContext");
   return client;
}

export const keys = {
   viewer: ["viewer"],
   people: ["people"],
   whatChanged: ["what-changed"],
   suggestions: ["suggestions"],
   insights: ["insights"],
   studioInsights: ["studio", "insights"],
   insightRuns: ["studio", "runs"],
   insightSchedule: ["studio", "schedule"],
   trending: ["trending"],
   resume: ["resume"],
   analyses: ["analyses"],
   analysis: (id: string) => ["analyses", id],
   comments: (analysisId: string) => ["comments", analysisId],
   feed: ["feed"],
   topics: ["topics"],
   library: ["library"],
   collections: ["collections"],
   threads: ["threads"],
   thread: (id: string) => ["threads", id],
   workspace: ["workspace"],
   demoScenario: ["demo-scenario"],
} satisfies Record<string, QueryKey | ((id: string) => QueryKey)>;

export const useViewer = () =>
   useQuery({ queryKey: keys.viewer, queryFn: useClient().getViewer });

export function usePeople() {
   const q = useQuery({
      queryKey: keys.people,
      queryFn: useClient().getPeople,
   });
   const byId = new Map<string, Person>(q.data?.map((p) => [p.id, p]));
   return { ...q, byId };
}

export const useWhatChanged = () =>
   useQuery({
      queryKey: keys.whatChanged,
      queryFn: useClient().getWhatChanged,
   });

export const useDemoScenario = () =>
   useQuery({
      queryKey: keys.demoScenario,
      queryFn: useClient().getDemoScenario,
   });

export const useSuggestedQuestions = () =>
   useQuery({
      queryKey: keys.suggestions,
      queryFn: useClient().getSuggestedQuestions,
   });

export const useInsights = () =>
   useQuery({ queryKey: keys.insights, queryFn: useClient().getInsights });

export const useStudioInsights = () =>
   useQuery({
      queryKey: keys.studioInsights,
      queryFn: useClient().getStudioInsights,
   });

/**
 * Every generator run, newest first. Polls while one is in flight, and slowly
 * otherwise so a scheduled run that comes due shows up; when a run finishes,
 * the insights and analyses it made are refetched.
 */
export function useInsightRuns() {
   const client = useClient();
   const qc = useQueryClient();
   const q = useQuery({
      queryKey: keys.insightRuns,
      queryFn: client.getInsightRuns,
      refetchInterval: (query) =>
         query.state.data?.some((r) => r.status === "running") ? 500 : 60_000,
   });
   const running = (q.data ?? [])
      .filter((r) => r.status === "running")
      .map((r) => r.id)
      .join();
   const previous = useRef(running);
   useEffect(() => {
      if (previous.current && previous.current !== running) {
         for (const queryKey of [
            keys.studioInsights,
            keys.insights,
            keys.analyses,
         ]) {
            qc.invalidateQueries({ queryKey });
         }
      }
      previous.current = running;
   }, [running, qc]);
   return q;
}

export const useInsightSchedule = () =>
   useQuery({
      queryKey: keys.insightSchedule,
      queryFn: useClient().getInsightSchedule,
   });

export const useTrending = () =>
   useQuery({ queryKey: keys.trending, queryFn: useClient().getTrending });

export const useResume = () =>
   useQuery({ queryKey: keys.resume, queryFn: useClient().getResume });

export function useAnalyses() {
   const q = useQuery({
      queryKey: keys.analyses,
      queryFn: useClient().getAnalyses,
   });
   const byId = new Map(q.data?.map((a) => [a.id, a]));
   return { ...q, byId };
}

export function useAnalysis(id: string) {
   const client = useClient();
   return useQuery({
      queryKey: keys.analysis(id),
      queryFn: () => client.getAnalysis(id).then((a) => a ?? null),
   });
}

/**
 * The comments under `subject`, and under any key it was filed by before
 * (an analysis saved into a package keeps the discussion it had), oldest first.
 */
export function useComments(subject: string, formerly: string[] = []) {
   const client = useClient();
   const subjects = [subject, ...formerly.filter((s) => s !== subject)];
   return useQuery({
      queryKey: [...keys.comments(subject), ...subjects.slice(1)],
      queryFn: async () =>
         (await Promise.all(subjects.map((s) => client.getComments(s))))
            .flat()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
   });
}

export function useAddComment(analysisId: string) {
   const client = useClient();
   const qc = useQueryClient();
   return useMutation({
      mutationFn: (text: string) => client.addComment(analysisId, text),
      onSettled: () =>
         qc.invalidateQueries({ queryKey: keys.comments(analysisId) }),
   });
}

export const useFeed = () =>
   useQuery({ queryKey: keys.feed, queryFn: useClient().getFeed });

export const useTopics = () =>
   useQuery({ queryKey: keys.topics, queryFn: useClient().getTopics });

export const useLibrary = () =>
   useQuery({ queryKey: keys.library, queryFn: useClient().getLibrary });

export const useCollections = () =>
   useQuery({
      queryKey: keys.collections,
      queryFn: useClient().getCollections,
   });

export const useThreads = () =>
   useQuery({ queryKey: keys.threads, queryFn: useClient().getThreads });

export function useThread(id: string | null) {
   const client = useClient();
   return useQuery({
      queryKey: keys.thread(id ?? "none"),
      queryFn: () => client.getThread(id!).then((t) => t ?? null),
      enabled: id !== null,
   });
}

/** Wraps a client write so the listed caches refetch when it settles. */
function useWrite<A extends unknown[], R>(
   fn: (client: DestinationClient) => (...args: A) => Promise<R>,
   invalidate: QueryKey[],
) {
   const client = useClient();
   const qc = useQueryClient();
   return useMutation({
      mutationFn: (args: A) => fn(client)(...args),
      onSettled: () =>
         Promise.all(
            invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })),
         ),
   });
}

export const useSetInsightStatus = () =>
   useWrite((c) => c.setInsightStatus, [keys.studioInsights, keys.insights]);

export const useStartInsightRun = () =>
   useWrite((c) => c.startInsightRun, [keys.insightRuns]);

export const useRunScheduleNow = () =>
   useWrite((c) => c.runScheduleNow, [keys.insightRuns]);

export const useSetInsightSchedule = () =>
   useWrite(
      (c) => (s: Omit<InsightSchedule, "updatedAt">) => c.setInsightSchedule(s),
      [keys.insightSchedule, keys.insightRuns],
   );

export const useSaveAnalysis = () =>
   useWrite((c) => c.saveAnalysis, [keys.library]);

export const useKeepInWorkspace = () =>
   useWrite((c) => c.keepInWorkspace, [keys.library, keys.workspace]);

export const useRemixAnalysis = () =>
   useWrite((c) => c.remixAnalysis, [keys.analyses]);

export const useRemoveLibraryItem = () =>
   useWrite((c) => c.removeLibraryItem, [keys.library]);

export const useCreateCollection = () =>
   useWrite(
      (c) => (input: Pick<Collection, "name" | "description" | "scope">) =>
         c.createCollection(input),
      [keys.collections],
   );

export const useSetInCollection = () =>
   useWrite((c) => c.setInCollection, [keys.library]);

export const useLinkLibraryItem = () =>
   useWrite((c) => c.linkLibraryItem, [keys.library, keys.workspace]);

/** A model file as saved; refetched whenever the package list is. */
export function useModelSource(pkg: string, path: string) {
   const client = useClient();
   return useQuery({
      queryKey: [...keys.workspace, pkg, "source", path],
      queryFn: () => client.getModelSource(pkg, path),
      enabled: Boolean(pkg && path),
      retry: false,
   });
}

export const useFollowTopic = () =>
   useWrite((c) => c.setTopicFollowed, [keys.viewer]);

export const useSetBriefing = () =>
   useWrite(
      (c) => (b: BriefingSubscription) => c.setBriefing(b),
      [keys.viewer],
   );

export const useSetMessageStatus = () =>
   useWrite(
      (c) =>
         (
            threadId: string,
            messageId: string,
            status: MessageStatus,
            malloy?: string,
         ) =>
            c.setMessageStatus(threadId, messageId, status, malloy),
      [keys.threads],
   );

export const useAppendExchange = () =>
   useWrite((c) => c.appendExchange, [keys.threads]);

export const useKeepResponse = () =>
   useWrite((c) => c.keepResponse, [keys.threads, keys.analyses]);

/** Every package the environment serves, whatever the workspace shows. */
export const useAllWorkspacePackages = () =>
   useQuery({
      queryKey: keys.workspace,
      queryFn: useClient().getWorkspacePackages,
      retry: 1,
   });

/** The packages the active workspace shows. */
export function useWorkspacePackages() {
   const { active } = useWorkspaces();
   const select = useCallback(
      (packages: WorkspacePackage[]) =>
         packages.filter((p) => showsPackage(active, p.name)),
      [active],
   );
   return useQuery({
      queryKey: keys.workspace,
      queryFn: useClient().getWorkspacePackages,
      retry: 1,
      select,
   });
}

/** The package's relationship graph, read once the package list has it. */
export function usePackageGraph(packageName: string) {
   const client = useClient();
   const pkg = useWorkspacePackages().data?.find((p) => p.name === packageName);
   return useQuery({
      queryKey: [...keys.workspace, packageName, "graph"],
      queryFn: () => client.getPackageGraph(pkg!),
      enabled: pkg !== undefined,
      staleTime: 60_000,
   });
}

/**
 * Everything a message can @-mention. The package graphs, which name each
 * model's sources, are only read once `withSources` is set, so the menu costs
 * nothing until someone types `@`.
 */
export function useWorkspaceEntities(withSources: boolean) {
   const client = useClient();
   const packages = useWorkspacePackages();
   const analyses = useAnalyses();
   const threads = useThreads();
   const graphs = useQueries({
      queries: (packages.data ?? []).map((pkg) => ({
         queryKey: [...keys.workspace, pkg.name, "graph"],
         queryFn: () => client.getPackageGraph(pkg),
         enabled: withSources,
         staleTime: 60_000,
      })),
   });
   const graphKey = graphs.map((g) => g.dataUpdatedAt).join();
   const entities = useMemo(
      () =>
         buildEntities({
            packages: packages.data ?? [],
            graphs: Object.fromEntries(
               (packages.data ?? []).map((p, i) => [p.name, graphs[i]?.data]),
            ),
            analyses: analyses.data ?? [],
            threads: threads.data ?? [],
         }),
      // graphs is a new array every render; graphKey says when it changed.
      [packages.data, analyses.data, threads.data, graphKey],
   );
   return {
      entities,
      loading:
         packages.isPending || (withSources && graphs.some((g) => g.isPending)),
   };
}

export function usePageMeta(key: string) {
   const client = useClient();
   return useQuery({
      queryKey: ["page-meta", key],
      queryFn: () => client.getPageMeta(key),
   });
}

/** Saves a property the moment it changes; the sidebar shows it before the write settles. */
export function useSetPageMeta(key: string) {
   const client = useClient();
   const qc = useQueryClient();
   const queryKey = ["page-meta", key];
   return useMutation({
      mutationFn: (patch: Partial<PageMeta>) => client.setPageMeta(key, patch),
      onMutate: (patch) => {
         const prev = qc.getQueryData<PageMeta>(queryKey);
         if (prev) qc.setQueryData(queryKey, { ...prev, ...patch });
         return { prev };
      },
      onError: (_e, _patch, ctx) => {
         if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      },
      onSettled: () => qc.invalidateQueries({ queryKey }),
   });
}

export const usePublishDraft = () =>
   useWrite(
      (c) => (draft: DestinationDraft, targets: PublishTargets) =>
         c.publishDraft(draft, targets),
      [keys.feed, keys.analyses, keys.library],
   );
