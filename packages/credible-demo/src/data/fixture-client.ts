// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   INSIGHT_MODEL,
   MAX_RUN_INSIGHTS,
   type GeneratedInsight,
   type InsightContext,
} from "@/analyst/insights";
import type { ScenarioFinding } from "@/analyst/scenario";
import { prevOccurrence } from "@/lib/schedule";
import { activeWorkspace, showsPackage, workspaceKey } from "@/lib/workspaces";
import type { DestinationClient } from "./client";
import {
   ScenarioUnavailable,
   resumeFrom,
   trendingFrom,
   writeScenario,
} from "./demo-scenario";
import * as fx from "./fixtures";
import { draftEvidence } from "./handoff";
import { GeneratorUnavailable, generateInsights } from "./insight-generator";
import { findInPool, focusMatch, insightPool } from "./insight-pool";
import { RUN_DURATION_MS, runSteps } from "./insight-runs";
import {
   compileModel,
   deleteDataApp,
   getDataAppManifest,
   getModelSource,
   getPackageGraph,
   listWorkspacePackages,
   reloadPackage,
   workspaceRoute,
   writeDashboardFile,
   writeDataApp,
} from "./publisher";
import type {
   Analysis,
   AnalysisComment,
   Collection,
   DemoRefreshStep,
   DemoScenario,
   FeedPost,
   InsightRecipe,
   InsightRun,
   InsightSchedule,
   LibraryItem,
   PageMeta,
   PublishOutcome,
   ResumeItem,
   StudioInsight,
   Thread,
   ThreadMessage,
   Topic,
   TrendingItem,
   Viewer,
   WhatChanged,
} from "./types";
import { responseAnalysis } from "./responses";

interface State {
   /** Whether the hand-written storefront content is seeded in. */
   samples: boolean;
   scenario: DemoScenario | null;
   whatChanged: WhatChanged | null;
   suggestions: string[];
   topics: Topic[];
   trending: TrendingItem[];
   resume: ResumeItem[];
   viewer: Viewer;
   analyses: Analysis[];
   feed: FeedPost[];
   library: LibraryItem[];
   collections: Collection[];
   threads: Thread[];
   pageMeta: Record<string, PageMeta>;
   comments: AnalysisComment[];
   studioInsights: StudioInsight[];
   insightRuns: InsightRun[];
   insightSchedule: InsightSchedule;
   /** Pool keys a running run will turn into insights when it finishes. */
   runFindings: Record<string, string[]>;
   /** Pool keys any run has already claimed, so no finding is found twice. */
   foundKeys: string[];
}

export const FIXTURES_STORAGE_KEY = "destination.fixtures.v1";

/** Generate adds one insight at a time; a scheduled run refreshes a batch. */
const runCount = (run: InsightRun) =>
   run.trigger === "manual" ? 1 : MAX_RUN_INSIGHTS;
const storageKey = () => workspaceKey(FIXTURES_STORAGE_KEY);

/** The storefront content is only seeded where storefront is shown. */
const samplesFit = () => showsPackage(activeWorkspace(), "storefront");

/** A page nobody has set properties on: a draft, owned by its package's owner. */
function unsetMeta(key: string): PageMeta {
   const ownerId = fx.packageOwners[key.split("/")[1]];
   return { status: "draft", tags: [], ...(ownerId && { ownerId }) };
}

function seed(samples = samplesFit()): State {
   const common = {
      samples,
      scenario: null,
      viewer: fx.initialViewer(),
      insightSchedule: fx.insightSchedule,
      runFindings: {},
      foundKeys: [],
   };
   if (!samples) {
      return structuredClone({
         ...common,
         viewer: { ...common.viewer, followedTopicIds: [] },
         // With no past run to date it from, the schedule would read as overdue.
         insightSchedule: {
            ...common.insightSchedule,
            updatedAt: new Date().toISOString(),
         },
         whatChanged: null,
         suggestions: [],
         topics: [],
         trending: [],
         resume: [],
         analyses: [],
         feed: [],
         library: [],
         collections: [],
         threads: [],
         pageMeta: {},
         comments: [],
         studioInsights: [],
         insightRuns: [],
      });
   }
   return structuredClone({
      ...common,
      whatChanged: fx.whatChanged,
      suggestions: fx.suggestedQuestions,
      topics: fx.topics,
      trending: fx.trending,
      resume: fx.resume,
      analyses: fx.analyses,
      feed: fx.feed,
      library: fx.library,
      collections: fx.collections,
      threads: fx.threads,
      pageMeta: fx.pageMeta,
      comments: fx.comments,
      studioInsights: fx.studioInsights,
      insightRuns: fx.insightRuns,
   });
}

/**
 * A store saved by an older build: fields it predates get their seed, seeded
 * Library items pick up the Publisher page they were later linked to, saved
 * notebooks become insights, and seeded analyses pick up the chart layer they
 * were later given.
 */
function upgrade(saved: Partial<State>): State {
   // A store from before scoping always held the storefront samples.
   const fresh = seed(saved.samples ?? true);
   const state = { ...fresh, ...saved };
   const seeded = new Map(fresh.library.map((i) => [i.id, i]));
   for (const item of state.library) {
      if (item.kind === "notebook") item.kind = "insight";
      const s = seeded.get(item.id);
      if (s?.publisherUrl && !item.publisherUrl) {
         item.href = s.href;
         item.publisherUrl = s.publisherUrl;
      }
   }
   const seededAnalyses = new Map(fresh.analyses.map((a) => [a.id, a]));
   for (const analysis of state.analyses) {
      const s = seededAnalyses.get(analysis.id)?.evidence;
      if (s?.visual && !analysis.evidence.visual) {
         analysis.evidence.visual = s.visual;
         analysis.evidence.highlight = s.highlight;
      }
      seededAnalyses.delete(analysis.id);
   }
   state.analyses.push(...seededAnalyses.values());
   // A thread is no longer Library content: a saved one becomes its last
   // answer, kept as an insight, or is dropped when that ran no query.
   state.library = state.library.flatMap((item) => {
      if ((item.kind as string) !== "thread") return [item];
      const id = item.href.match(/^\/(?:chat|threads)\/([^/?#]+)/)?.[1];
      const t = state.threads.find((t) => t.id === id);
      const answer = [...(t?.messages ?? [])]
         .reverse()
         .find((m) => m.role === "assistant" && m.evidence && m.malloy);
      const kept =
         t &&
         answer &&
         (state.analyses.find((a) => a.id === answer.analysisId) ??
            keepAnswer(state, t, answer, item.ownerId));
      return kept
         ? [{ ...item, kind: "insight", href: `/analysis/${kept.id}` }]
         : [];
   });
   return state;
}

/** Keeps a chat answer as an analysis, filed under the topics of one on the same view. */
function keepAnswer(
   state: State,
   t: Thread,
   m: ThreadMessage,
   authorId: string,
) {
   const view = m.provenance?.view;
   const analysis = responseAnalysis(t, m, {
      id: newId("an"),
      authorId,
      createdAt: new Date().toISOString(),
      topics:
         (view &&
            state.analyses.find((a) => a.provenance.view === view)?.topics) ||
         [],
   });
   if (analysis) {
      state.analyses.push(analysis);
      m.analysisId = analysis.id;
   }
   return analysis;
}

/** Roughly how long Opus takes to scan the model; only the progress bar reads it. */
const LIVE_RUN_ESTIMATE_MS = 150_000;

/** A live run streams into the page that started it; a reload ends it. */
function interrupt(state: State) {
   for (const run of state.insightRuns) {
      if (run.engine === "live" && run.status === "running") {
         run.status = "failed";
         run.error =
            "Interrupted: the page was closed before the run finished.";
         const last = run.steps.at(-1)?.at ?? 0;
         run.durationMs = last;
      }
   }
   return state;
}

function load(): State {
   try {
      const raw = localStorage.getItem(storageKey());
      if (raw) return interrupt(upgrade(JSON.parse(raw) as Partial<State>));
   } catch {
      // A corrupt or unavailable store falls back to fresh fixtures.
   }
   return seed();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let counter = 0;
const newId = (prefix: string) =>
   `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function resetFixtures() {
   localStorage.removeItem(storageKey());
   window.location.reload();
}

export function createFixtureClient({
   latencyMs = 180,
}: { latencyMs?: number } = {}): DestinationClient {
   const state = load();
   const persist = () => {
      try {
         localStorage.setItem(storageKey(), JSON.stringify(state));
      } catch {
         // Memory still works for the session when storage is full or blocked.
      }
   };

   /** Runs a demo refresh started, whose best findings are featured whatever they score. */
   const featureAnyway = new Set<string>();
   /** Each live run in flight, for a refresh to wait on. */
   const inFlight = new Map<string, Promise<void>>();

   /** Stores a run's findings as analyses and candidate insights, then closes it. */
   const keep = (run: InsightRun, findings: GeneratedInsight[], at: string) => {
      const made = findings.map((f) => {
         const analysis: Analysis = {
            ...structuredClone(f.analysis),
            id: newId("an"),
            authorId: "ai",
            createdAt: at,
         };
         state.analyses.push(analysis);
         const insight: StudioInsight = {
            id: newId("in"),
            analysisId: analysis.id,
            status: "candidate",
            headline: f.headline,
            delta: structuredClone(f.delta),
            metric: structuredClone(f.metric),
            detector: f.detector,
            score: f.score,
            reasons: [...f.reasons],
            checks: structuredClone(f.checks),
            runId: run.id,
            generatedAt: at,
         };
         state.studioInsights.push(insight);
         return insight;
      });
      if (run.trigger === "schedule") {
         const { autoFeature } = state.insightSchedule;
         const minScore = featureAnyway.has(run.id)
            ? 0
            : state.insightSchedule.minScore;
         const featured = made
            .filter((i) => i.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, autoFeature);
         for (const i of featured) i.status = "featured";
         run.featuredIds = featured.map((i) => i.id);
      }
      run.insightIds = made.map((i) => i.id);
      run.status = "done";
   };

   /** Replays canned findings, for a build with no generator behind it. */
   const sampleRun = (run: InsightRun, offsetMs = 0) => {
      const found = findInPool(
         run.recipe,
         new Set(state.foundKeys),
         state.studioInsights,
         run.trigger === "manual" ? 1 : undefined,
      );
      run.engine = "sample";
      run.model = "sample";
      run.durationMs = offsetMs + RUN_DURATION_MS;
      run.steps.push(
         ...runSteps(run.recipe, found.length).map((s) => ({
            ...s,
            at: s.at + offsetMs,
         })),
      );
      const keys = found.map((f) => f.key);
      state.runFindings[run.id] = keys;
      state.foundKeys.push(...keys);
   };

   const finishSampleRun = (run: InsightRun) => {
      const at = new Date(
         Date.parse(run.startedAt) + run.durationMs,
      ).toISOString();
      const steer = run.recipe.focus.trim();
      const findings = (state.runFindings[run.id] ?? []).flatMap(
         (key): GeneratedInsight[] => {
            const f = insightPool.find((p) => p.key === key);
            if (!f) return [];
            return [
               {
                  ...structuredClone(f.insight),
                  detector: f.detector,
                  score: f.score,
                  reasons:
                     steer && focusMatch(f, steer) > 0
                        ? [...f.reasons, `Matched your steer: “${steer}”`]
                        : [...f.reasons],
                  checks: structuredClone(f.checks),
                  analysis: structuredClone(f.analysis),
               },
            ];
         },
      );
      delete state.runFindings[run.id];
      keep(run, findings, at);
   };

   /** What the Studio already has, newest first, for a run to build on. */
   const insightContext = (): InsightContext[] =>
      [...state.studioInsights]
         .sort(byRecency)
         .slice(0, 40)
         .map((i) => {
            const a = state.analyses.find((a) => a.id === i.analysisId);
            const p = a?.provenance;
            return {
               headline: i.headline,
               detector: i.detector,
               status: i.status,
               topics: a?.topics ?? [],
               ...(p
                  ? { source: p.view ? `${p.source} → ${p.view}` : p.source }
                  : {}),
            };
         });

   /** Streams a run from the Worker, writing each step onto the run as it lands. */
   const liveRun = async (run: InsightRun) => {
      const t0 = Date.parse(run.startedAt);
      try {
         const result = await generateInsights(
            {
               recipe: run.recipe,
               count: runCount(run),
               existing: insightContext(),
               packages: activeWorkspace().packages,
            },
            {
               onModel: (model) => {
                  run.model = model;
                  if (model !== INSIGHT_MODEL) run.durationMs = 8_000;
                  persist();
               },
               onStep: (step) => {
                  run.steps.push({ ...step, at: Date.now() - t0 });
                  persist();
               },
            },
         );
         run.model = result.model;
         run.queries = result.queries;
         run.costUsd = result.costUsd;
         run.dropped = result.dropped;
         run.durationMs = Date.now() - t0;
         keep(run, result.insights, new Date().toISOString());
      } catch (e) {
         if (e instanceof GeneratorUnavailable && state.samples) {
            run.steps.push({
               label: "No generator is deployed here",
               detail: "Replaying sample findings instead",
               at: Date.now() - t0,
            });
            sampleRun(run, Date.now() - t0);
         } else if (e instanceof GeneratorUnavailable) {
            run.status = "failed";
            run.error =
               "No insight generator is deployed here, and the sample findings are storefront's. Run the Worker with OPENROUTER_API_KEY to generate for these packages.";
            run.durationMs = Date.now() - t0;
         } else {
            run.status = "failed";
            run.error = e instanceof Error ? e.message : String(e);
            run.durationMs = Date.now() - t0;
         }
      }
      persist();
   };

   const startRun = (
      trigger: InsightRun["trigger"],
      recipe: InsightRecipe,
      startedBy: InsightRun["startedBy"],
   ) => {
      const run: InsightRun = {
         id: newId("run"),
         trigger,
         startedBy,
         recipe: structuredClone(recipe),
         startedAt: new Date().toISOString(),
         durationMs: LIVE_RUN_ESTIMATE_MS,
         status: "running",
         engine: "live",
         steps: [{ label: "Starting the generator", at: 0 }],
         insightIds: [],
         featuredIds: [],
      };
      state.insightRuns.push(run);
      inFlight.set(
         run.id,
         liveRun(run).finally(() => inFlight.delete(run.id)),
      );
      return run;
   };

   /** Starts a scheduled run that came due and finishes any run whose time is up. */
   const settle = () => {
      let changed = false;
      const schedule = state.insightSchedule;
      if (schedule.enabled) {
         const due = prevOccurrence(schedule).getTime();
         const last = Math.max(
            Date.parse(schedule.updatedAt),
            ...state.insightRuns
               .filter((r) => r.trigger === "schedule")
               .map((r) => Date.parse(r.startedAt)),
         );
         if (due > last) {
            startRun("schedule", schedule.recipe, "ai");
            changed = true;
         }
      }
      const now = Date.now();
      for (const run of state.insightRuns) {
         if (
            run.status === "running" &&
            run.engine !== "live" &&
            now >= Date.parse(run.startedAt) + run.durationMs
         ) {
            finishSampleRun(run);
            changed = true;
         }
      }
      if (changed) persist();
   };

   /** A live run whose best findings go straight to For you and the feed. */
   const generateFeatured = async (
      steer: string,
      onStep: (step: DemoRefreshStep) => void,
   ) => {
      onStep({
         label: "Generating insights with Claude Opus 5.5",
         detail:
            "It queries the packages and every number is checked. This takes a few minutes.",
      });
      const run = startRun(
         "schedule",
         { ...state.insightSchedule.recipe, focus: steer },
         viewerId(),
      );
      featureAnyway.add(run.id);
      persist();
      await inFlight.get(run.id);

      const made = run.insightIds
         .map((id) => state.studioInsights.find((i) => i.id === id))
         .filter((i): i is StudioInsight => !!i)
         .sort((a, b) => b.score - a.score);
      onStep(
         run.status === "failed"
            ? {
                 label: "The insight run failed",
                 detail: run.error,
                 tone: "warning",
              }
            : made.length
              ? {
                   label: `Kept ${made.length} ${made.length === 1 ? "finding" : "findings"}, featured ${run.featuredIds.length} in For you`,
                   tone: "done",
                }
              : {
                   label: "Nothing the run found cleared its checks",
                   tone: "warning",
                },
      );
      for (const [n, id] of run.featuredIds.entries()) {
         const insight = state.studioInsights.find((i) => i.id === id);
         if (!insight) continue;
         state.feed.push({
            id: newId("fp"),
            analysisId: insight.analysisId,
            publishedAt: insight.generatedAt,
            reactions: 4 + ((n * 7) % 13),
            comments: n % 3,
         });
      }
      persist();
      return { made, featured: run.featuredIds.length };
   };

   /** The insights a briefing is written from: featured first, then the best candidates. */
   const keptInsights = () =>
      state.studioInsights
         .filter((i) => i.status !== "dismissed")
         .sort(
            (a, b) =>
               Number(b.status === "featured") -
                  Number(a.status === "featured") || b.score - a.score,
         )
         .slice(0, MAX_RUN_INSIGHTS);

   const findingsOf = (insights: StudioInsight[]): ScenarioFinding[] =>
      insights.map((i) => {
         const a = state.analyses.find((a) => a.id === i.analysisId);
         return {
            headline: i.headline,
            narrative: a?.narrative ?? "",
            label: i.metric.label,
            delta: i.delta,
            topics: a?.topics ?? [],
         };
      });

   /** The scenario writer, with everything the workspace knows about itself. */
   const askWriter = (findings: ScenarioFinding[], steer: string) => {
      const workspace = activeWorkspace();
      return writeScenario({
         packages: workspace.packages,
         workspace: workspace.name?.trim() || undefined,
         focus: steer,
         findings,
         topics: state.topics.map((t) => t.label),
      });
   };

   /**
    * The home page briefing, suggested questions and topics, written by Opus
    * 5.5 from `insights`, the workspace's packages and its scenario. Without
    * the writer, the briefing restates the insights' own headlines.
    */
   const brief = async (
      insights: StudioInsight[],
      steer: string,
      onStep: (step: DemoRefreshStep) => void,
   ) => {
      const { samples } = state;
      const findings = findingsOf(insights);
      onStep({
         label: "Writing the briefing, questions and topics",
         detail: `Claude Opus 5.5, from ${findings.length} ${findings.length === 1 ? "finding" : "findings"} and the packages' models`,
      });
      try {
         const s = await askWriter(findings, steer);
         if (s.whatChanged || !samples) state.whatChanged = s.whatChanged;
         if (s.suggestedQuestions.length)
            state.suggestions = s.suggestedQuestions;
         if (s.topics.length) {
            const ids = new Set(state.topics.map((t) => t.id));
            state.topics = samples
               ? [...state.topics, ...s.topics.filter((t) => !ids.has(t.id))]
               : s.topics;
         }
         if (!samples && !state.viewer.followedTopicIds.length)
            state.viewer.followedTopicIds = s.topics
               .slice(0, 2)
               .map((t) => t.id);
         onStep({
            label: "Wrote the briefing, questions and topics",
            detail: s.costUsd ? `$${s.costUsd.toFixed(2)}` : undefined,
            tone: "done",
         });
      } catch (e) {
         if (!samples && findings.length) {
            state.whatChanged = {
               summary: findings
                  .slice(0, 2)
                  .map((f) => f.headline.replace(/\.?$/, "."))
                  .join(" "),
               highlights: findings
                  .slice(0, 3)
                  .map((f) => ({ label: f.label, delta: f.delta })),
               asOf: new Date().toISOString(),
            };
            const tags = [...new Set(findings.flatMap((f) => f.topics))];
            if (!state.topics.length)
               state.topics = tags.map((id) => ({
                  id,
                  label: id.replace(/-/g, " "),
                  description: "",
               }));
         }
         onStep({
            label:
               e instanceof ScenarioUnavailable
                  ? "No scenario writer here, so the briefing restates the findings"
                  : "Couldn't write the briefing",
            detail: e instanceof Error ? e.message : String(e),
            tone: "warning",
         });
      }
      persist();
   };

   const byRecency = (a: StudioInsight, b: StudioInsight) =>
      b.generatedAt.localeCompare(a.generatedAt) || b.score - a.score;

   async function read<T>(value: () => T): Promise<T> {
      await sleep(latencyMs);
      settle();
      return structuredClone(value());
   }

   async function write<T>(mutate: () => T, ms = latencyMs): Promise<T> {
      await sleep(ms);
      const result = mutate();
      persist();
      return structuredClone(result);
   }

   const viewerId = () => state.viewer.person.id;

   const thread = (id: string) => {
      const t = state.threads.find((t) => t.id === id);
      if (!t) throw new Error(`No thread ${id}`);
      return t;
   };

   const touch = (t: Thread) => {
      t.updatedAt = new Date().toISOString();
      return t;
   };

   const threadFor = (threadId: string | null, text: string, now: string) => {
      if (threadId) return thread(threadId);
      const t: Thread = {
         id: newId("th"),
         title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
         createdAt: now,
         updatedAt: now,
         messages: [],
      };
      state.threads.push(t);
      return t;
   };

   return {
      getViewer: () => read(() => state.viewer),
      getPeople: () => read(() => fx.people),

      getWhatChanged: () => read(() => state.whatChanged),
      getSuggestedQuestions: () => read(() => state.suggestions),
      getInsights: () =>
         read(() =>
            state.studioInsights
               .filter((i) => i.status === "featured")
               .sort(byRecency),
         ),
      getTrending: () => read(() => state.trending),

      getStudioInsights: () =>
         read(() => [...state.studioInsights].sort(byRecency)),
      setInsightStatus: (id, status) =>
         write(() => {
            const insight = state.studioInsights.find((i) => i.id === id);
            if (!insight) throw new Error(`No insight ${id}`);
            insight.status = status;
            return insight;
         }),
      getInsightRuns: () =>
         read(() =>
            [...state.insightRuns].sort((a, b) =>
               b.startedAt.localeCompare(a.startedAt),
            ),
         ),
      startInsightRun: (recipe) =>
         write(() => startRun("manual", recipe, viewerId())),
      runScheduleNow: () =>
         write(() =>
            startRun("schedule", state.insightSchedule.recipe, viewerId()),
         ),
      getInsightSchedule: () => read(() => state.insightSchedule),
      setInsightSchedule: (schedule) =>
         write(() => {
            state.insightSchedule = {
               ...structuredClone(schedule),
               updatedAt: new Date().toISOString(),
            };
            return state.insightSchedule;
         }),
      getResume: () => read(() => state.resume),

      getAnalysis: (id) => read(() => state.analyses.find((a) => a.id === id)),
      getAnalyses: () => read(() => state.analyses),
      remixAnalysis: (id, malloy) =>
         write(() => {
            const original = state.analyses.find((a) => a.id === id);
            if (!original) throw new Error(`No analysis ${id}`);
            // A remix runs one edited query, so the report it came from no longer describes it.
            const { report: _report, ...rest } = structuredClone(original);
            const remix: Analysis = {
               ...rest,
               id: newId("an"),
               title: `${original.title} (remix)`,
               malloy,
               authorId: viewerId(),
               createdAt: new Date().toISOString(),
            };
            state.analyses.push(remix);
            return remix;
         }),
      getComments: (analysisId) =>
         read(() =>
            state.comments
               .filter((c) => c.analysisId === analysisId)
               .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
         ),
      addComment: (analysisId, text) =>
         write(() => {
            const comment: AnalysisComment = {
               id: newId("cm"),
               analysisId,
               authorId: viewerId(),
               text,
               createdAt: new Date().toISOString(),
            };
            state.comments.push(comment);
            return comment;
         }),
      moveComments: (from, to) =>
         write(() => {
            for (const c of state.comments) {
               if (c.analysisId === from) c.analysisId = to;
            }
         }),

      getFeed: () =>
         read(() =>
            [...state.feed].sort((a, b) =>
               b.publishedAt.localeCompare(a.publishedAt),
            ),
         ),
      getTopics: () => read(() => state.topics),
      setTopicFollowed: (topicId, followed) =>
         write(() => {
            const ids = new Set(state.viewer.followedTopicIds);
            if (followed) ids.add(topicId);
            else ids.delete(topicId);
            state.viewer.followedTopicIds = [...ids];
            return state.viewer;
         }),
      setBriefing: (briefing) =>
         write(() => {
            state.viewer.briefing = briefing;
            return state.viewer;
         }),

      getLibrary: () =>
         read(() =>
            [...state.library].sort((a, b) =>
               b.updatedAt.localeCompare(a.updatedAt),
            ),
         ),
      getCollections: () => read(() => state.collections),
      saveAnalysis: (analysisId) =>
         write(() => {
            const href = `/analysis/${analysisId}`;
            const existing = state.library.find(
               (i) => i.href === href && i.ownerId === viewerId(),
            );
            if (existing) return existing;
            const analysis = state.analyses.find((a) => a.id === analysisId);
            if (!analysis) throw new Error(`No analysis ${analysisId}`);
            const item: LibraryItem = {
               id: newId("li"),
               title: analysis.title,
               description: analysis.narrative,
               kind: "insight",
               ownerId: viewerId(),
               scope: "personal",
               updatedAt: new Date().toISOString(),
               reliedOnBy: 1,
               provenance: analysis.provenance,
               collectionIds: [],
               href,
            };
            state.library.push(item);
            return item;
         }),
      keepInWorkspace: (finding, ref, entry) =>
         write(() => {
            const href = `/analysis/${finding.id}`;
            const now = new Date().toISOString();
            const existing = state.library.find(
               (i) => i.scope === "workspace" && i.href === href,
            );
            if (existing) {
               Object.assign(existing, entry, { updatedAt: now });
               if (ref) existing.packageRef = ref;
               return existing;
            }
            const provenance = state.analyses.find(
               (a) => a.id === finding.id,
            )?.provenance;
            const item: LibraryItem = {
               id: newId("li"),
               ...entry,
               kind: "insight",
               ownerId: viewerId(),
               scope: "workspace",
               updatedAt: now,
               reliedOnBy: 1,
               provenance: provenance ?? fx.storefront("order_items"),
               collectionIds: [],
               href,
               ...(ref ? { packageRef: ref } : {}),
            };
            state.library.push(item);
            return item;
         }),
      removeLibraryItem: (itemId) =>
         write(() => {
            state.library = state.library.filter((i) => i.id !== itemId);
         }),
      createCollection: (input) =>
         write(() => {
            const collection: Collection = {
               ...input,
               id: newId("co"),
               ownerId: viewerId(),
            };
            state.collections.push(collection);
            return collection;
         }),
      setInCollection: (itemId, collectionId, member) =>
         write(() => {
            const item = state.library.find((i) => i.id === itemId);
            if (!item) throw new Error(`No library item ${itemId}`);
            const ids = new Set(item.collectionIds);
            if (member) ids.add(collectionId);
            else ids.delete(collectionId);
            item.collectionIds = [...ids];
            return item;
         }),

      getThreads: () =>
         read(() =>
            [...state.threads].sort((a, b) =>
               b.updatedAt.localeCompare(a.updatedAt),
            ),
         ),
      getThread: (id) => read(() => state.threads.find((t) => t.id === id)),
      appendExchange: (threadId, question, reply) =>
         write(() => {
            const now = new Date().toISOString();
            const t = threadFor(threadId, question.text, now);
            t.messages.push(
               { ...question, id: newId("m"), role: "user", createdAt: now },
               { ...reply, id: newId("m"), role: "assistant", createdAt: now },
            );
            return touch(t);
         }),
      setMessageStatus: (threadId, messageId, status, malloy) =>
         write(() => {
            const t = thread(threadId);
            const m = t.messages.find((m) => m.id === messageId);
            if (!m) throw new Error(`No message ${messageId}`);
            m.status = status;
            if (malloy !== undefined) m.malloy = malloy;
            if (status === "remixed" && !m.evidence) {
               const ran = state.analyses.find(
                  (a) => a.provenance.view === m.provenance?.view,
               );
               if (ran) {
                  m.evidence = ran.evidence;
                  m.text = `Ran your query. ${ran.narrative}`;
               }
            }
            return touch(t);
         }),
      keepResponse: (threadId, messageId) =>
         write(() => {
            const t = thread(threadId);
            const m = t.messages.find((m) => m.id === messageId);
            if (!m) throw new Error(`No message ${messageId}`);
            const kept = state.analyses.find((a) => a.id === m.analysisId);
            if (kept) return kept;
            const analysis = keepAnswer(state, t, m, viewerId());
            if (!analysis) {
               throw new Error(
                  "Nothing to save yet: this answer ran no query.",
               );
            }
            return analysis;
         }),

      // An engine read, so it goes to Publisher even while the rest is fixtures.
      getWorkspacePackages: listWorkspacePackages,
      getPackageGraph,
      getModelSource,
      compileModel,
      writeDashboardFile,
      reloadPackage,
      getDataAppManifest,
      writeDataApp,
      deleteDataApp,
      linkLibraryItem: (itemId, ref) =>
         write(() => {
            const item = state.library.find((i) => i.id === itemId);
            if (!item) throw new Error(`No library item ${itemId}`);
            if (ref) item.packageRef = ref;
            else delete item.packageRef;
            item.updatedAt = new Date().toISOString();
            return item;
         }),
      getPageMeta: (key) => read(() => state.pageMeta[key] ?? unsetMeta(key)),
      setPageMeta: (key, patch) =>
         write(() => {
            const next: PageMeta = {
               ...(state.pageMeta[key] ?? unsetMeta(key)),
               ...patch,
               updatedAt: new Date().toISOString(),
            };
            state.pageMeta[key] = next;
            return next;
         }, 0),
      publishDraft: (draft, targets) =>
         write(() => {
            const now = new Date().toISOString();
            const outcome: PublishOutcome = {};
            const evidence = draftEvidence(draft);
            let analysis: Analysis | undefined;
            if (draft.kind === "query" && evidence) {
               analysis = {
                  id: newId("an"),
                  title: draft.title,
                  narrative: draft.description,
                  details: [],
                  evidence,
                  malloy: draft.malloy ?? "",
                  provenance: draft.provenance,
                  authorId: viewerId(),
                  createdAt: now,
                  topics: targets.topics,
                  publisherUrl: draft.publisherUrl,
               };
               state.analyses.push(analysis);
               outcome.analysisId = analysis.id;
            }
            if (targets.feed && analysis) {
               const post: FeedPost = {
                  id: newId("fp"),
                  analysisId: analysis.id,
                  publishedAt: now,
                  reactions: 0,
                  comments: 0,
               };
               state.feed.push(post);
               outcome.feedPostId = post.id;
            }
            if (targets.library) {
               const item: LibraryItem = {
                  id: newId("li"),
                  title: draft.title,
                  description: draft.description,
                  kind: draft.kind === "dashboard" ? "dashboard" : "query",
                  ownerId: viewerId(),
                  scope: targets.library,
                  updatedAt: now,
                  reliedOnBy: 1,
                  provenance: draft.provenance,
                  collectionIds: [],
                  href: analysis
                     ? `/analysis/${analysis.id}`
                     : workspaceRoute(
                          draft.provenance.package,
                          draft.kind === "dashboard" ? "dashboard" : "query",
                          draft.kind === "dashboard"
                             ? draft.provenance.source
                             : draft.provenance.model,
                          draft.kind === "dashboard" ? draft.givens : undefined,
                       ),
                  publisherUrl: draft.publisherUrl,
               };
               state.library.push(item);
               outcome.libraryItemId = item.id;
            }
            return outcome;
         }),

      getDemoScenario: () => read(() => state.scenario),
      refreshDemo: async ({ focus, samples: wanted }, onStep) => {
         const workspace = activeWorkspace();
         const packages = workspace.packages;
         const samples = wanted && showsPackage(workspace, "storefront");
         const steer = focus.trim();
         if (inFlight.size) {
            throw new Error(
               "An insight run is still going. Let it finish, then refresh.",
            );
         }
         const shown = (await listWorkspacePackages()).filter((p) =>
            showsPackage(workspace, p.name),
         );
         if (!shown.length) {
            throw new Error(
               "This workspace shows no packages. Turn some on in Workspace settings first.",
            );
         }

         Object.assign(state, seed(samples));
         if (!samples) {
            state.trending = trendingFrom(shown);
            state.resume = resumeFrom(shown);
         }
         persist();
         onStep({
            label: samples
               ? "Reset to the storefront samples"
               : "Cleared the old demo content",
            detail: samples
               ? undefined
               : `Trending and Resume now read ${shown.map((p) => p.name).join(", ")}`,
            tone: "done",
         });

         const { made, featured } = await generateFeatured(steer, onStep);
         await brief(made, steer, onStep);

         state.scenario = {
            focus: steer,
            samples,
            ...(packages ? { packages: [...packages] } : {}),
            refreshedAt: new Date().toISOString(),
            featured,
         };
         persist();
         return structuredClone(state.scenario);
      },
      writeBriefing: async (onStep) => {
         if (inFlight.size) {
            throw new Error(
               "An insight run is still going. Let it finish, then write the briefing.",
            );
         }
         const steer = state.scenario?.focus ?? "";
         const kept = keptInsights();
         let featured = kept.filter((i) => i.status === "featured").length;
         let made = kept;
         if (kept.length) {
            onStep({
               label: `Briefing from ${kept.length} ${kept.length === 1 ? "insight" : "insights"} already in Studio`,
               detail: steer ? `Scenario: ${steer}` : undefined,
               tone: "done",
            });
            if (!featured) {
               for (const i of kept.slice(0, state.insightSchedule.autoFeature))
                  i.status = "featured";
               featured = Math.min(
                  kept.length,
                  state.insightSchedule.autoFeature,
               );
               onStep({
                  label: `Featured the best ${featured} in For you`,
                  tone: "done",
               });
            }
            persist();
         } else {
            onStep({
               label: "No insights yet, so Opus 5.5 finds some first",
               tone: "done",
            });
            ({ made, featured } = await generateFeatured(steer, onStep));
         }
         await brief(made, steer, onStep);
         persist();
         return { featured };
      },
      writeSuggestions: async () => {
         const s = await askWriter(
            findingsOf(keptInsights()),
            state.scenario?.focus ?? "",
         );
         if (!s.suggestedQuestions.length)
            throw new Error("The writer didn't suggest any questions");
         state.suggestions = s.suggestedQuestions;
         if (!state.topics.length) state.topics = s.topics;
         persist();
         return state.suggestions.length;
      },
   };
}
