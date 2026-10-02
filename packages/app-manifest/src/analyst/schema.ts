// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The analyst's data contract, shared by the Worker that runs it and the app
// that renders it. Nothing here imports React or a server-only module.

import { z } from "zod";

export const MetricRef = z.object({
   metricId: z.string().describe("A metricId returned by compute_metric"),
});
export type MetricRef = z.infer<typeof MetricRef>;

export const DatasetRef = z.object({
   datasetId: z.string().describe("A datasetId returned by run_query"),
});
export type DatasetRef = z.infer<typeof DatasetRef>;

/** How a metric's value is written; the renderer formats it, the model never does. */
export const MetricUnit = z.enum([
   "currency",
   "percent",
   /** A difference between two rates, written "+2.1 pts". */
   "points",
   "number",
   /** A dimension value, like the month revenue peaked in. */
   "label",
   "date",
]);
export type MetricUnit = z.infer<typeof MetricUnit>;

/** What a numeric column holds, read from the model's `# currency` / `# percent` tags. */
export type ColumnUnit = "currency" | "percent" | "number";

export interface DatasetColumn {
   name: string;
   type: "number" | "string" | "date" | "boolean";
   unit?: ColumnUnit;
   label?: string;
}

export type Row = Record<string, string | number | boolean | null>;

/** The Publisher resource a dataset was read from; maps onto execute_query's arguments. */
export interface SourceRef {
   environment: string;
   package: string;
   model: string;
   source: string;
}

/** One query result, stored for the run and cited by id. */
export interface Dataset {
   id: string;
   title: string;
   grain: string;
   source: SourceRef;
   /** The Malloy that produced it. */
   query: string;
   columns: DatasetColumn[];
   rows: Row[];
   rowCount: number;
   /** Rows past the cap were dropped. */
   truncated: boolean;
   stepId?: string;
}

/** A number (or label) computed deterministically from a dataset. */
export interface Metric {
   id: string;
   datasetId: string;
   op: string;
   column?: string;
   label: string;
   value: number | string | null;
   unit: MetricUnit;
   /** What the value was computed over, e.g. "Mar 2026 vs Feb 2026". */
   detail?: string;
   stepId?: string;
}

// ── Findings: the explorer's output ─────────────────────────────────────

export const Finding = z.object({
   id: z.string(),
   headline: z
      .string()
      .describe(
         "One sentence. Write every number as a {{metric:ID}} token, never as digits.",
      ),
   detail: z.string().optional(),
   kind: z.enum(["trend", "outlier", "comparison", "composition", "caveat"]),
   importance: z.number().min(1).max(5),
   evidence: z.array(
      z.object({ datasetId: z.string(), metricIds: z.array(z.string()) }),
   ),
});
export type Finding = z.infer<typeof Finding>;

export const FindingsSchema = z.object({
   question: z.string().describe("The question, restated and disambiguated"),
   answer: z
      .string()
      .describe(
         "A one-line direct answer. Numbers only as {{metric:ID}} tokens.",
      ),
   findings: z.array(Finding).max(8),
   datasets: z.array(
      z.object({ id: z.string(), title: z.string(), grain: z.string() }),
   ),
   openQuestions: z.array(z.string()),
});
export type Findings = z.infer<typeof FindingsSchema>;
