// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { AppManifest } from "@malloy-publisher/app-manifest";
import type { AnalystRecord } from "@/analyst/record";

/** "ai" is the author of anything the system drafted and no human has taken over yet. */
export type AuthorId = string | "ai";

export interface Person {
   id: string;
   name: string;
   initials: string;
   title: string;
   /** A chart token (1-5) so a person's avatar keeps one color everywhere. */
   hue: 1 | 2 | 3 | 4 | 5;
}

/** The exact Publisher resource a number came from; maps 1:1 onto execute_query's arguments. */
export interface Provenance {
   environment: string;
   package: string;
   model: string;
   source: string;
   view?: string;
}

export type Period = "DoD" | "WoW" | "MoM" | "QoQ" | "YoY";

export interface Delta {
   /** Fractional change: 0.12 is +12%. For "pp" it is percentage points. */
   value: number;
   unit: "percent" | "pp";
   period: Period;
   /** Whether a rise is good news, so a refund spike renders red rather than green. */
   polarity: "up_is_good" | "down_is_good";
}

export type ValueFormat = "currency" | "percent" | "number";

/**
 * A second layer drawn over the rows, so the chart argues the same point the
 * sentence does instead of restating the table.
 */
export type EvidenceVisual =
   | {
        /** Each x as a from → to dumbbell, under a strip splitting the total change by x. */
        kind: "contribution";
        from: string;
        to: string;
     }
   | {
        /** One series against its normal range, with the excess shaded and events marked. */
        kind: "anomaly";
        series: string;
        normal: [number, number];
        normalLabel: string;
        /** Whether landing above the range is bad news, so the excess renders red. */
        polarity: Delta["polarity"];
        events?: { x: string; label: string }[];
     }
   | {
        /** The from → to change per x, diverging from zero, against a band of normal movement. */
        kind: "divergence";
        from: string;
        to: string;
        /** Half-width of the band, in the rows' own units. */
        noise: number;
        polarity: Delta["polarity"];
     }
   | {
        /** Signed contributions of one series walking from zero to their total. */
        kind: "waterfall";
        series: string;
        totalLabel: string;
     };

export interface Evidence {
   kind: "line" | "bar" | "area";
   xKey: string;
   series: { key: string; label: string }[];
   rows: Record<string, string | number>[];
   format: ValueFormat;
   caption?: string;
   visual?: EvidenceVisual;
   /**
    * A chart program (TanStack Charts or Chart.js) written for this analysis,
    * with its rows bound in. When set it replaces the templated chart; `rows`
    * still back the table.
    */
   spec?: Record<string, unknown>;
   /** The x value the narrative is about. */
   highlight?: string;
}

/**
 * The shared shape behind every card in the app: a narrative sentence first, the
 * evidence under it, and the Malloy that produced it.
 */
export interface Analysis {
   id: string;
   title: string;
   narrative: string;
   details: string[];
   evidence: Evidence;
   malloy: string;
   provenance: Provenance;
   authorId: AuthorId;
   createdAt: string;
   topics: string[];
   /** The Publisher Console page this was published from. */
   publisherUrl?: string;
   /**
    * The analyst's whole report, when this was saved from a chat answer that
    * had one. `evidence` and `malloy` are its lead chart and query.
    */
   report?: AnalystRecord;
}

/** A remark someone left under an analysis or a Publisher page; the destination keeps these, not Publisher. */
export interface AnalysisComment {
   id: string;
   /** The analysis's id, or the page's `pageKey` for a Publisher page. */
   analysisId: string;
   authorId: string;
   text: string;
   createdAt: string;
}

export interface WhatChanged {
   summary: string;
   highlights: { label: string; delta: Delta }[];
   asOf: string;
}

export interface Insight {
   id: string;
   analysisId: string;
   delta: Delta;
   /** The takeaway in a few words, above the chart. */
   headline: string;
   /** The number the delta is about, with its recent trend. */
   metric: {
      label: string;
      value: number;
      format: ValueFormat;
      trend: number[];
      /** The small visual beside the number; a sparkline of `trend` when absent. */
      glance?: Glance;
   };
}

export interface GlanceItem {
   label: string;
   value: number;
}

/** The card's small visual, chosen so it doesn't repeat the main chart's form. */
export type Glance =
   | { kind: "sparkline"; values: number[] }
   | { kind: "bars"; items: GlanceItem[]; highlight?: string }
   | { kind: "donut"; items: GlanceItem[]; highlight?: string }
   | { kind: "gauge"; value: number; max: number }
   | { kind: "compare"; baseline: GlanceItem; current: GlanceItem };

/** The kind of pattern a generator run looked for. */
export type InsightDetector = "change" | "anomaly" | "mix" | "driver";

/** Featured insights are the ones Discover shows under For you. */
export type InsightStatus = "featured" | "candidate" | "dismissed";

/** One thing a run verified before it kept a finding. */
export interface InsightCheck {
   label: string;
   passed: boolean;
   detail?: string;
}

/** An insight as the Studio sees it: how it was found, and whether it is featured. */
export interface StudioInsight extends Insight {
   status: InsightStatus;
   detector: InsightDetector;
   /** 0-1: how far outside normal the move is, weighted by how much of the business it touches. */
   score: number;
   /** Why the run kept it, strongest first. */
   reasons: string[];
   checks: InsightCheck[];
   runId: string;
   generatedAt: string;
}

/** What a generator run looks at. */
export interface InsightRecipe {
   /** An optional steer in plain English; findings that match it rank higher. */
   focus: string;
   /** Source names in the package; empty means every source. */
   sources: string[];
   detectors: InsightDetector[];
}

export interface InsightRunStep {
   label: string;
   detail?: string;
   /** Milliseconds after the run started that this step began. */
   at: number;
}

export interface InsightRun {
   id: string;
   trigger: "manual" | "schedule";
   startedBy: AuthorId;
   recipe: InsightRecipe;
   startedAt: string;
   durationMs: number;
   status: "running" | "done" | "failed";
   /**
    * "live" runs are generated by the Worker against Publisher; "sample" runs
    * replay canned findings when it can't be reached. Absent means sample.
    */
   engine?: "live" | "sample";
   /** The model that wrote the findings, e.g. anthropic/claude-opus-5.5. */
   model?: string;
   queries?: number;
   costUsd?: number;
   /** Drafts the run threw out, with why. */
   dropped?: { headline: string; issues: string[] }[];
   steps: InsightRunStep[];
   error?: string;
   insightIds: string[];
   /** The subset of insightIds the run put straight into For you. */
   featuredIds: string[];
}

export type InsightCadence = "hourly" | "daily" | "weekdays" | "weekly";

export interface InsightSchedule {
   enabled: boolean;
   cadence: InsightCadence;
   /** "HH:MM" local time; for hourly only the minutes count. */
   time: string;
   /** 0 is Sunday; only read when cadence is weekly. */
   weekday: number;
   recipe: InsightRecipe;
   /** How many of a scheduled run's best findings go straight to For you. */
   autoFeature: number;
   /** Findings scoring below this are kept as candidates but never auto-featured. */
   minScore: number;
   /** Post a note to the viewer's briefing channel when a run features something. */
   notify: boolean;
   updatedAt: string;
}

export type ContentKind =
   | "insight"
   | "query"
   | "dashboard"
   | "notebook"
   | "data_app";

export interface TrendingItem {
   id: string;
   title: string;
   kind: ContentKind;
   views: number;
   viewerIds: string[];
   href: string;
}

export interface ResumeItem {
   id: string;
   title: string;
   kind: "query" | "exploration" | "thread";
   context: string;
   lastOpenedAt: string;
   href: string;
}

export interface Topic {
   id: string;
   label: string;
   description: string;
}

export interface FeedPost {
   id: string;
   analysisId: string;
   publishedAt: string;
   reactions: number;
   comments: number;
}

export interface LibraryItem {
   id: string;
   title: string;
   description: string;
   kind: ContentKind;
   ownerId: AuthorId;
   scope: "personal" | "workspace";
   updatedAt: string;
   /** How many people have this pinned, subscribed, or embedded somewhere. */
   reliedOnBy: number;
   provenance: Provenance;
   collectionIds: string[];
   /** An in-app route, or an absolute URL for something Publisher serves. */
   href: string;
   /** Its page in the Publisher Console, when it came from one. */
   publisherUrl?: string;
   /** The package file this item was promoted into, which keeps it in sync. */
   packageRef?: PackageRef;
}

/** A finding this app keeps: an analysis, including one saved from a chat answer. */
export interface FindingRef {
   kind: "analysis";
   id: string;
}

/** Where in a package a Library item lives once it has been promoted. */
export interface PackageRef {
   package: string;
   kind: WorkspaceItem["kind"];
   /** The package item's id: a dashboard's name, otherwise its path. */
   id: string;
   path: string;
   /** What the promotion declared in that file: `source.view` or a query name. */
   member?: string;
}

/** A compiler diagnostic from Publisher's compile endpoint. */
export interface CompileProblem {
   severity: "error" | "warning" | "debug";
   message: string;
   line?: number;
   column?: number;
}

/** One thing a Publisher package serves. */
export interface WorkspaceItem {
   kind: Extract<ContentKind, "dashboard" | "notebook" | "data_app" | "query">;
   /** What its route names it by: the dashboard's name, otherwise its path. */
   id: string;
   title: string;
   description?: string;
   /** The file in the package that defines it. */
   path: string;
   /** Where this app shows it. */
   href: string;
   /** The same thing in the Publisher Console. */
   publisherUrl: string;
   /** A data app's `app.json`, when it is a saved finding (`apps/<slug>/`). */
   manifest?: AppManifest;
}

/** A package from the workspace's Publisher environment. */
export interface WorkspacePackage {
   environment: string;
   name: string;
   description: string;
   href: string;
   publisherUrl: string;
   items: WorkspaceItem[];
}

/** A join a source declares: the foreign relationship to another source. */
export interface JoinFacts {
   name: string;
   relationship: "one" | "many" | "cross";
   doc?: string;
}

export interface SourceFacts {
   name: string;
   doc?: string;
   /** `connection · table`, when the source reads a table directly. */
   table?: string;
   /** The source it extends, when it is built on another one. */
   base?: string;
   joins: JoinFacts[];
   dimensions: number;
   measures: number;
   views: number;
}

/** What one Malloy file (model, dashboard, or notebook) declares. */
export interface FileFacts {
   path: string;
   /** Sources this file defines itself, not ones it imports. */
   sources: SourceFacts[];
   queries: string[];
   /** Package paths of the files it imports. */
   imports: string[];
   malloyVersion?: string;
   error?: string;
}

export interface DashboardFacts {
   name: string;
   path: string;
   columns: number;
   autorun: boolean;
   filters: { name: string; type: string }[];
   tiles: { label: string; source: string; view: string }[];
}

/** One `source -> view` a data app runs. */
export interface DataAppQuery {
   source: string;
   view?: string;
   /** The model the call names, when it can be read off the call. */
   model?: string;
}

/** What a data app's manifest, page, and scripts say it queries. */
export interface DataAppFacts {
   /** Package paths of the models it queries. */
   models: string[];
   queries: DataAppQuery[];
}

/** How everything in one package refers to everything else. */
export interface PackageGraph {
   files: Record<string, FileFacts>;
   dashboards: Record<string, DashboardFacts>;
   /** A data app's path to what it queries. */
   dataApps: Record<string, DataAppFacts>;
}

export type PageStatus = "draft" | "in_review" | "production" | "archived";

/** The destination's own properties for a Publisher page, which Publisher does not keep. */
export interface PageMeta {
   ownerId?: string;
   status: PageStatus;
   tags: string[];
   updatedAt?: string;
}

/** Where a draft from Publisher lands when it is posted. */
export interface PublishTargets {
   feed: boolean;
   library: "workspace" | "personal" | null;
   topics: string[];
}

export interface PublishOutcome {
   analysisId?: string;
   libraryItemId?: string;
   feedPostId?: string;
}

export interface Collection {
   id: string;
   name: string;
   description: string;
   ownerId: string;
   scope: "personal" | "workspace";
}

export type Confidence = {
   level: "high" | "medium" | "low";
   score: number;
   reason: string;
};

export type MessageStatus = "proposed" | "accepted" | "remixed" | "taken_over";

export type EntityKind =
   | "source"
   | "dashboard"
   | "notebook"
   | "data_app"
   | "model"
   | "package"
   | "analysis"
   | "thread";

/** Something in the workspace a message can @-mention, which the answer is grounded on. */
export interface EntityRef {
   kind: EntityKind;
   /** Unique across the workspace: `kind:package/name`. */
   id: string;
   /** What follows the `@` in the message text; no spaces. */
   handle: string;
   label: string;
   /** Where it lives, e.g. `storefront · storefront.malloy`. */
   detail?: string;
   description?: string;
   /** Estimated tokens of context it adds when mentioned. */
   tokens: number;
   href?: string;
}

/** A file sent with a message; the bytes go to the model, only this is kept. */
export interface AttachmentMeta {
   name: string;
   type: string;
   size: number;
   tokens: number;
}

/** Everything a message carries besides its text. */
export interface MessageContext {
   model?: string;
   references?: EntityRef[];
   attachments?: AttachmentMeta[];
}

export interface ThreadMessage extends MessageContext {
   id: string;
   role: "user" | "assistant";
   text: string;
   createdAt: string;
   confidence?: Confidence;
   evidence?: Evidence;
   malloy?: string;
   provenance?: Provenance;
   status?: MessageStatus;
   /** The analyst run behind this answer, its report and data. */
   analyst?: AnalystRecord;
   /** The analysis this answer was saved as, once it has been. */
   analysisId?: string;
}

/** A message as the caller writes it; the client assigns the id and time. */
export type NewMessage = Omit<ThreadMessage, "id" | "createdAt" | "role">;

export interface Thread {
   id: string;
   title: string;
   createdAt: string;
   updatedAt: string;
   messages: ThreadMessage[];
}

export interface BriefingSubscription {
   enabled: boolean;
   channel: "slack" | "email";
   destination: string;
   time: string;
}

/** What a demo refresh is asked to build. */
export interface DemoRefreshOptions {
   /** Who the demo is for and what they care about; steers every generated piece. */
   focus: string;
   /** Keep the hand-written storefront content; only read when storefront is in scope. */
   samples: boolean;
}

export interface DemoRefreshStep {
   label: string;
   detail?: string;
   tone?: "done" | "warning";
}

/** The scenario a workspace's demo content was last built for. */
export interface DemoScenario {
   focus: string;
   samples: boolean;
   /** The packages it was built from; absent when it was every package. */
   packages?: string[];
   refreshedAt: string;
   featured: number;
}

export interface Viewer {
   person: Person;
   followedTopicIds: string[];
   briefing: BriefingSubscription;
}
