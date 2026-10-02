// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The insight generator's contract, shared by the Worker that runs it and the
// Studio that shows it. The model drafts; the Worker grounds every number and
// compiles every chart before a draft becomes a GeneratedInsight.

import { z } from "zod";
import type {
   Analysis,
   Delta,
   Insight,
   InsightCheck,
   InsightDetector,
   InsightRecipe,
   InsightStatus,
} from "../data/types";
import type { RunMode } from "./events";

/** Every generation run is written by this model, with no fallbacks. */
export const INSIGHT_MODEL = "anthropic/claude-opus-5.5";

export const MODEL_LABELS: Record<string, string> = {
   [INSIGHT_MODEL]: "Claude Opus 5.5",
   scripted: "Scripted planner",
   sample: "Sample findings",
};

export const modelLabel = (id: string | undefined) =>
   id ? (MODEL_LABELS[id] ?? id) : "Sample findings";

const DETECTOR_IDS = ["change", "anomaly", "mix", "driver"] as const;
export const INSIGHT_TOPICS = [
   "revenue",
   "refunds",
   "margins",
   "regions",
   "brands",
   "customers",
] as const;

const tokens = "Numbers only as {{metric:ID}} tokens, never as digits.";

/**
 * A glance variant as the model writes it. Strict structured output takes no
 * `oneOf`, so the variants are a plain union (`anyOf`), and null-widening is
 * only undone outside unions, so an absent field is an explicit `null`,
 * dropped here.
 */
type NullKeys<O> = { [K in keyof O]: null extends O[K] ? K : never }[keyof O];
type DropNulls<O> = Omit<O, NullKeys<O>> & {
   [K in NullKeys<O>]?: Exclude<O[K], null>;
};

const glanceVariant = <T extends z.ZodRawShape>(shape: T) =>
   z
      .object(shape)
      .transform(
         (value) =>
            Object.fromEntries(
               Object.entries(value).filter(([, v]) => v !== null),
            ) as DropNulls<z.output<z.ZodObject<T>>>,
      );

export const InsightDraft = z.object({
   detector: z.enum(DETECTOR_IDS),
   headline: z
      .string()
      .describe(`The takeaway in at most ten words. ${tokens}`),
   title: z.string().describe("A plain title for the saved analysis"),
   narrative: z
      .string()
      .describe(`One or two sentences on what moved and why. ${tokens}`),
   details: z
      .array(z.string())
      .describe(`Up to 3 supporting points, one line each. ${tokens}`),
   reasons: z
      .array(z.string())
      .min(1)
      .describe(
         `Up to 4 reasons this deserves a place in the feed, strongest first. ${tokens}`,
      ),
   topics: z
      .array(z.string())
      .describe(
         `Up to 3 topic tags: lowercase, one or two words joined by a hyphen, about the business rather than the field names. For the storefront package use ${INSIGHT_TOPICS.join(", ")}.`,
      ),
   score: z
      .number()
      .min(0)
      .max(1)
      .describe(
         "How far outside normal the move is, weighted by how much of the business it touches",
      ),
   metric: z.object({
      label: z
         .string()
         .describe("What the headline number is, e.g. 'Refund rate'"),
      metricId: z.string().describe("compute_metric id of the headline number"),
      deltaMetricId: z
         .string()
         .describe(
            "compute_metric id of its change: pct_change or yoy, or diff on a percent column",
         ),
      period: z.enum(["DoD", "WoW", "MoM", "QoQ", "YoY"]),
      polarity: z.enum(["up_is_good", "down_is_good"]),
   }),
   glance: z
      .union([
         glanceVariant({
            kind: z.enum(["sparkline"]),
            datasetId: z.string(),
            column: z.string().describe("A numeric column, in time order"),
         }),
         glanceVariant({
            kind: z.enum(["bars", "donut"]),
            datasetId: z.string(),
            labelColumn: z.string(),
            valueColumn: z
               .string()
               .describe("A numeric column; donut needs non-negative parts"),
            highlight: z
               .string()
               .nullable()
               .describe("The label of the row the insight is about, or null"),
         }),
         glanceVariant({
            kind: z.enum(["gauge"]),
            metricId: z.string(),
            maxMetricId: z
               .string()
               .nullable()
               .describe(
                  "The gauge's full scale; null for a percent metric, which fills to 100%",
               ),
         }),
         glanceVariant({
            kind: z.enum(["compare"]),
            metricId: z.string().describe("The current value"),
            baselineMetricId: z
               .string()
               .describe("What it is measured against: prior period, typical"),
            baselineLabel: z.string().describe("e.g. 'Typical', 'Last year'"),
            currentLabel: z.string().describe("e.g. 'Peak', 'This year'"),
         }),
      ])
      .describe(
         "The small visual beside the headline number. It must not repeat the evidence chart's form: when the chart is a line or area over time, choose bars, donut, gauge or compare instead of a sparkline.",
      ),
   evidence: z.object({
      datasetId: z
         .string()
         .describe("The dataset whose rows back the chart, shown as its table"),
      caption: z.string().describe(`One line under the chart. ${tokens}`),
      highlight: z
         .string()
         .optional()
         .describe("The row label the insight is about, if one"),
      chart: z
         .string()
         .describe(
            'A chart program, as JSON text, designed for this insight: {"library": "tanstack", ...} or {"library": "chartjs", ...}. Data only by datasetId.',
         ),
   }),
});
export type InsightDraft = z.infer<typeof InsightDraft>;

export const InsightBatch = z.object({
   insights: z.array(InsightDraft).describe("Up to 5, best first"),
   skipped: z
      .array(z.string())
      .describe(
         "Up to 6 leads you checked and dropped, one line each, with why",
      ),
});
export type InsightBatch = z.infer<typeof InsightBatch>;

/**
 * The list limits above are asked for, not enforced: an overlong list is
 * trimmed rather than failing a batch whose drafts are fine.
 */
export function trimBatch(batch: InsightBatch): InsightBatch {
   return {
      insights: batch.insights.slice(0, 5).map((d) => ({
         ...d,
         details: d.details.slice(0, 3),
         reasons: d.reasons.slice(0, 4),
         topics: d.topics
            .map((t) => topicId(t))
            .filter(Boolean)
            .slice(0, 3),
      })),
      skipped: batch.skipped.slice(0, 6),
   };
}

/** One insight the Studio already has, described so a run can look elsewhere. */
export interface InsightContext {
   headline: string;
   detector: InsightDetector;
   status: InsightStatus;
   topics: string[];
   /** Where it was read from, e.g. "order_items → sales_by_month". */
   source?: string;
}

/** A Generate press keeps one finding; a scheduled run keeps up to this many. */
export const MAX_RUN_INSIGHTS = 5;

export interface InsightRunRequest {
   recipe: InsightRecipe;
   /** The most findings the run keeps, 1 to MAX_RUN_INSIGHTS. */
   count: number;
   /** What the Studio already has, newest first, so a run finds something new. */
   existing: InsightContext[];
   /** The workspace's packages; absent when it shows every package. */
   packages?: string[];
}

/** A topic tag in the one form topic ids take. */
export const topicId = (s: string) =>
   s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);

/** Two headlines that differ only in case or spacing are the same finding. */
export const headlineKey = (s: string) =>
   s.toLowerCase().replace(/\s+/g, " ").trim();

/** A draft that passed grounding, ready to store as an Analysis and a StudioInsight. */
export interface GeneratedInsight {
   detector: InsightDetector;
   score: number;
   headline: string;
   reasons: string[];
   checks: InsightCheck[];
   delta: Delta;
   metric: Insight["metric"];
   analysis: Omit<Analysis, "id" | "authorId" | "createdAt">;
}

export interface InsightRunResult {
   model: string;
   mode: RunMode;
   insights: GeneratedInsight[];
   /** Drafts that failed grounding or the chart check, with why. */
   dropped: { headline: string; issues: string[] }[];
   skipped: string[];
   queries: number;
   costUsd: number;
}

export const INSIGHT_EVENTS = {
   /** { model, mode }: who is writing this run. */
   run: "insights:run",
   step: "insights:step",
   result: "insights:result",
} as const;

export interface InsightStep {
   label: string;
   detail?: string;
}
