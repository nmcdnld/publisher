// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type {
   Analysis,
   AnalysisComment,
   BriefingSubscription,
   Collection,
   CompileProblem,
   DemoRefreshOptions,
   DemoRefreshStep,
   DemoScenario,
   FeedPost,
   FindingRef,
   InsightRecipe,
   InsightRun,
   InsightSchedule,
   InsightStatus,
   LibraryItem,
   MessageStatus,
   NewMessage,
   PackageGraph,
   PackageRef,
   PageMeta,
   Person,
   PublishOutcome,
   PublishTargets,
   ResumeItem,
   StudioInsight,
   Thread,
   Topic,
   TrendingItem,
   Viewer,
   WhatChanged,
   WorkspacePackage,
} from "./types";
import type { DestinationDraft } from "./handoff";
import type { AppManifest } from "@malloy-publisher/app-manifest";
import type { DataAppRead, DataAppWrite, ModelSource } from "./publisher";

/**
 * Everything the pages read and write. The fixture client implements it today;
 * the Publisher-backed client replaces it without the pages changing.
 *
 * Reads that come from the engine (analyses, evidence, answers) will go to
 * Publisher. Writes are the destination's own memory (saves, follows,
 * collections, threads), which Publisher does not keep.
 */
export interface DestinationClient {
   getViewer(): Promise<Viewer>;
   getPeople(): Promise<Person[]>;

   /** Null when nothing has been found for this workspace yet. */
   getWhatChanged(): Promise<WhatChanged | null>;
   getSuggestedQuestions(): Promise<string[]>;
   /** The featured insights, newest first: what For you shows. */
   getInsights(): Promise<StudioInsight[]>;
   getTrending(): Promise<TrendingItem[]>;

   /** Every insight any run kept, whatever its status. */
   getStudioInsights(): Promise<StudioInsight[]>;
   setInsightStatus(id: string, status: InsightStatus): Promise<StudioInsight>;
   /** Newest first. A due scheduled run is started by reading this. */
   getInsightRuns(): Promise<InsightRun[]>;
   /** Starts a manual run; its findings land as candidates when it finishes. */
   startInsightRun(recipe: InsightRecipe): Promise<InsightRun>;
   /** Starts a run with the schedule's recipe and featuring policy, now. */
   runScheduleNow(): Promise<InsightRun>;
   getInsightSchedule(): Promise<InsightSchedule>;
   setInsightSchedule(
      schedule: Omit<InsightSchedule, "updatedAt">,
   ): Promise<InsightSchedule>;
   getResume(): Promise<ResumeItem[]>;

   getAnalysis(id: string): Promise<Analysis | undefined>;
   getAnalyses(): Promise<Analysis[]>;
   /** Adopt an AI draft as the viewer's own, optionally with edited Malloy. */
   remixAnalysis(id: string, malloy: string): Promise<Analysis>;
   /** Oldest first. */
   getComments(analysisId: string): Promise<AnalysisComment[]>;
   addComment(analysisId: string, text: string): Promise<AnalysisComment>;
   /** Files every comment under `from` under `to`, so a discussion follows its finding. */
   moveComments(from: string, to: string): Promise<void>;

   getFeed(): Promise<FeedPost[]>;
   getTopics(): Promise<Topic[]>;
   setTopicFollowed(topicId: string, followed: boolean): Promise<Viewer>;
   setBriefing(briefing: BriefingSubscription): Promise<Viewer>;

   getLibrary(): Promise<LibraryItem[]>;
   getCollections(): Promise<Collection[]>;
   saveAnalysis(analysisId: string): Promise<LibraryItem>;
   /**
    * The workspace's Library item for a finding, created or updated: tied to
    * the data app it was saved as, or with `ref` null, kept in this app only.
    */
   keepInWorkspace(
      finding: FindingRef,
      ref: PackageRef | null,
      entry: { title: string; description: string },
   ): Promise<LibraryItem>;
   removeLibraryItem(itemId: string): Promise<void>;
   createCollection(
      input: Pick<Collection, "name" | "description" | "scope">,
   ): Promise<Collection>;
   setInCollection(
      itemId: string,
      collectionId: string,
      member: boolean,
   ): Promise<LibraryItem>;

   getThreads(): Promise<Thread[]>;
   getThread(id: string): Promise<Thread | undefined>;
   /**
    * Appends a question and an answer produced elsewhere, such as by an
    * analyst run; creates the thread when threadId is null.
    */
   appendExchange(
      threadId: string | null,
      question: NewMessage,
      answer: NewMessage,
   ): Promise<Thread>;
   setMessageStatus(
      threadId: string,
      messageId: string,
      status: MessageStatus,
      malloy?: string,
   ): Promise<Thread>;
   /**
    * A chat answer as an analysis of its own, made the first time it is
    * saved and the same one every time after. Saving it to a Library is a
    * separate step, as for any other analysis.
    */
   keepResponse(threadId: string, messageId: string): Promise<Analysis>;

   /** The packages Publisher serves in the workspace's environment. */
   getWorkspacePackages(): Promise<WorkspacePackage[]>;
   /** How one package's files, sources, dashboards and data apps refer to each other. */
   getPackageGraph(pkg: WorkspacePackage): Promise<PackageGraph>;
   /** One model file's text as saved, and what the package compiled from it. */
   getModelSource(pkg: string, path: string): Promise<ModelSource>;
   /** Compile-checks Malloy against a package without saving anything. */
   compileModel(
      pkg: string,
      path: string,
      source: string,
      scope: "append" | "file",
   ): Promise<CompileProblem[]>;
   /** Writes a `dashboards/<slug>.malloy` file into a package and serves it. */
   writeDashboardFile(
      pkg: string,
      path: string,
      source: string,
      expectedHash?: string,
   ): Promise<{ path: string; contentHash: string; created: boolean }>;
   /** Recompiles a package from its files, so a saved edit is served. */
   reloadPackage(pkg: string): Promise<void>;
   /** A saved finding in a package, or undefined when there is none at `slug`. */
   getDataAppManifest(
      pkg: string,
      slug: string,
   ): Promise<DataAppRead | undefined>;
   /**
    * Writes a saved finding into `pkg` as `public/apps/<slug>/`. Refused unless
    * every query compiles there; with no `expectedHash` it only creates.
    */
   writeDataApp(
      pkg: string,
      slug: string,
      manifest: AppManifest,
      expectedHash?: string,
   ): Promise<DataAppWrite>;
   deleteDataApp(
      pkg: string,
      slug: string,
      expectedHash: string,
   ): Promise<void>;
   /** Ties a Library item to the package file it was promoted into, or unties it. */
   linkLibraryItem(
      itemId: string,
      ref: PackageRef | null,
   ): Promise<LibraryItem>;
   /** This app's properties for a Publisher page, keyed by {@link pageKey}. */
   getPageMeta(key: string): Promise<PageMeta>;
   setPageMeta(key: string, patch: Partial<PageMeta>): Promise<PageMeta>;
   /** Post content prepared by the Publisher Console's Publish button. */
   publishDraft(
      draft: DestinationDraft,
      targets: PublishTargets,
   ): Promise<PublishOutcome>;

   /** What this workspace's demo content was last rebuilt for, if ever. */
   getDemoScenario(): Promise<DemoScenario | null>;
   /**
    * Replaces this workspace's demo content with content built for its
    * packages: insights from a live run, and a briefing, questions and topics
    * written from them. `onStep` narrates as it goes.
    */
   refreshDemo(
      options: DemoRefreshOptions,
      onStep: (step: DemoRefreshStep) => void,
   ): Promise<DemoScenario>;
   /**
    * Writes the home page briefing, questions and topics from the insights
    * already kept, generating some first when there are none. Replaces
    * nothing else.
    */
   writeBriefing(
      onStep: (step: DemoRefreshStep) => void,
   ): Promise<{ featured: number }>;
   /**
    * Writes the suggested questions alone, by the same writer and from the
    * same workspace context, with no insight run. Resolves with how many.
    */
   writeSuggestions(): Promise<number>;
}
