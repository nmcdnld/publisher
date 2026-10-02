// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The analyst's tools, defined once with toolDefinition(). The explorer binds
// them directly; worker/analyst/mcp.ts serves the same definitions over MCP.

import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
   columnStats,
   computeMetric,
   ComputeMetricInput,
   inferColumns,
} from "@malloy-publisher/app-manifest/analyst/compute";
import type { ToolName } from "../../src/analyst/config";
import type { ColumnUnit, Dataset } from "@malloy-publisher/app-manifest/analyst/schema";
import { parseSourceId, type SourceInfo } from "./publisher";
import type { AnalystContext, RunState } from "./run";

const MAX_ROWS = 2_000;
const PREVIEW_ROWS = 20;
const QUERY_TIMEOUT_MS = 30_000;

export const listSourcesDef = toolDefinition({
   name: "list_sources",
   description:
      "List the sources (semantic models) you may query, with their measures and named views.",
   inputSchema: z.object({}),
});

export const describeSourceDef = toolDefinition({
   name: "describe_source",
   description:
      "Describe one source: every dimension, measure and view with its type, unit and doc, its joins, its row count, and a few sample rows.",
   inputSchema: z.object({
      source: z.string().describe("A source id from list_sources"),
   }),
});

export const runQueryDef = toolDefinition({
   name: "run_query",
   description: [
      "Run a read-only Malloy query against one source and store the result as a dataset.",
      "`query` is either a named view (`sales_by_month`) or a query body in braces",
      "(`{ group_by: category; aggregate: total_sales; order_by: total_sales desc }`).",
      "Returns a datasetId, the columns, the first rows, and per-column stats.",
      "Cite the datasetId in your findings; compute numbers with compute_metric.",
   ].join(" "),
   inputSchema: z.object({
      source: z.string().describe("A source id from list_sources"),
      query: z.string(),
      title: z
         .string()
         .describe("What the dataset shows, e.g. 'Revenue by month'"),
      grain: z.string().describe("One row per …, e.g. 'month'"),
      limit: z.number().int().min(1).max(MAX_ROWS).optional(),
   }),
});

export const computeMetricDef = toolDefinition({
   name: "compute_metric",
   description:
      "Compute one number (or label) from a stored dataset. The only source of numbers you may cite; returns a metricId to write as {{metric:ID}}.",
   inputSchema: ComputeMetricInput,
});

export const toolDefinitions = [
   listSourcesDef,
   describeSourceDef,
   runQueryDef,
   computeMetricDef,
] as const;

// ── Implementations ────────────────────────────────────────────────────

/** Malloy that stays inside the declared source: no imports, raw SQL, or tables. */
function checkQuery(query: string) {
   const q = query.trim();
   if (!/^\w+$/.test(q) && !(q.startsWith("{") && q.endsWith("}"))) {
      throw new Error("query must be a view name or a query body in braces");
   }
   if (
      /\b(import|run|query|source)\s*:|\.sql\s*\(|\.table\s*\(|\bconnection\b/.test(
         q,
      )
   ) {
      throw new Error(
         "query may only refine the source: no imports, run/query/source statements, SQL, or tables",
      );
   }
   return q;
}

function malloyFor(source: string, query: string, limit: number) {
   if (/^\w+$/.test(query))
      return `run: ${source} -> ${query} + { limit: ${limit} }`;
   const hasLimit = /\b(limit|top)\s*:/.test(query);
   const body = hasLimit
      ? query
      : `${query.slice(0, -1).trimEnd()}\n  limit: ${limit}\n}`;
   return `run: ${source} -> ${body}`;
}

async function source(run: RunState, id: string): Promise<SourceInfo> {
   if (!run.sourceCache.size) await run.catalog();
   const found = run.sourceCache.get(id);
   if (!found) {
      parseSourceId(id);
      throw new Error(
         `${id} is not one of this analyst's sources; call list_sources`,
      );
   }
   return found;
}

function hints(src: SourceInfo) {
   const out = new Map<string, { unit?: ColumnUnit; label?: string }>();
   for (const f of src.fields)
      out.set(f.name, { unit: f.unit, label: f.label });
   for (const j of src.joins)
      for (const f of j.fields) if (!out.has(f.name)) out.set(f.name, f);
   return out;
}

/** Text in rows is data. Long strings are cut so they can't carry instructions. */
const quoteRows = (rows: Dataset["rows"]) =>
   rows.map((r) =>
      Object.fromEntries(
         Object.entries(r).map(([k, v]) => [
            k,
            typeof v === "string" && v.length > 120 ? `${v.slice(0, 117)}…` : v,
         ]),
      ),
   );

export async function listSources(run: RunState) {
   const sources = await run.catalog();
   return {
      sources: sources.map((s) => ({
         id: s.id,
         doc: s.doc,
         measures: s.fields
            .filter((f) => f.kind === "measure")
            .map((f) => f.name),
         views: s.fields
            .filter((f) => f.kind === "view")
            .map((f) => (f.doc ? `${f.name}: ${f.doc}` : f.name)),
         joins: s.joins.map((j) => j.name),
      })),
   };
}

export async function describeSource(run: RunState, args: { source: string }) {
   const src = await source(run, args.source);
   let rowCount: number | undefined;
   let sample: Dataset["rows"] = [];
   const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
   try {
      const [count] = await run.publisher.query(
         src,
         `run: ${src.source} -> { aggregate: row_count is count() }`,
         { givens: run.givens, signal },
      );
      rowCount = Number(count?.row_count);
      sample = await run.publisher.query(
         src,
         `run: ${src.source} -> { select: * limit: 3 }`,
         { givens: run.givens, signal },
      );
   } catch {
      // Counts and samples are a courtesy; the field list is the answer.
   }
   return {
      id: src.id,
      doc: src.doc,
      rowCount,
      fields: src.fields.map(({ name, kind, type, unit, doc }) => ({
         name,
         kind,
         type,
         unit,
         doc,
      })),
      joins: src.joins.map((j) => ({
         name: j.name,
         doc: j.doc,
         fields: j.fields.map((f) => `${j.name}.${f.name}`),
      })),
      sample: quoteRows(sample),
   };
}

export async function runQuery(
   run: RunState,
   args: z.infer<typeof runQueryDef.inputSchema>,
   signal?: AbortSignal,
) {
   const src = await source(run, args.source);
   const query = checkQuery(args.query);
   const limit = Math.min(args.limit ?? 500, MAX_ROWS);
   const malloy = malloyFor(src.source, query, limit);
   const rows = await run.publisher.query(src, malloy, {
      givens: run.givens,
      signal: signal
         ? AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)])
         : AbortSignal.timeout(QUERY_TIMEOUT_MS),
   });
   run.queries++;
   const kept = rows.slice(0, MAX_ROWS);
   const dataset: Dataset = {
      id: run.datasetId(),
      title: args.title,
      grain: args.grain,
      source: {
         environment: src.environment,
         package: src.package,
         model: src.model,
         source: src.source,
      },
      query: malloy,
      columns: inferColumns(kept, hints(src)),
      rows: kept,
      rowCount: rows.length,
      truncated: rows.length > kept.length,
   };
   run.datasets.set(dataset.id, dataset);
   run.emit("analyst:dataset", dataset);
   return {
      datasetId: dataset.id,
      rowCount: dataset.rowCount,
      columns: dataset.columns.map(({ name, type, unit }) => ({
         name,
         type,
         unit,
      })),
      rows: quoteRows(kept.slice(0, PREVIEW_ROWS)),
      stats: columnStats(dataset),
   };
}

export function runComputeMetric(run: RunState, args: ComputeMetricInput) {
   const ds = run.datasets.get(args.datasetId);
   if (!ds) throw new Error(`No dataset ${args.datasetId} in this run`);
   const metric = { ...computeMetric(ds, args), id: run.metricId() };
   run.metrics.set(metric.id, metric);
   run.emit("analyst:metric", metric);
   return {
      metricId: metric.id,
      value: metric.value,
      unit: metric.unit,
      detail: metric.detail,
      token: `{{metric:${metric.id}}}`,
   };
}

const serverTools = {
   list_sources: listSourcesDef.server<AnalystContext>((_args, ctx) =>
      listSources(ctx.context.run),
   ),
   describe_source: describeSourceDef.server<AnalystContext>((args, ctx) =>
      describeSource(ctx.context.run, args),
   ),
   run_query: runQueryDef.server<AnalystContext>((args, ctx) =>
      runQuery(ctx.context.run, args, ctx.abortSignal),
   ),
   compute_metric: computeMetricDef.server<AnalystContext>((args, ctx) =>
      runComputeMetric(ctx.context.run, args),
   ),
};

export const allServerTools = Object.values(serverTools);

/** The server tools an allowlist grants. */
export const allowedTools = (names: readonly ToolName[]) =>
   names.map((n) => serverTools[n]);

/** Direct calls by name, for the scripted planner and for MCP. */
export const toolImpls: Record<
   ToolName,
   (
      run: RunState,
      args: never,
      signal?: AbortSignal,
   ) => Promise<unknown> | unknown
> = {
   list_sources: (run) => listSources(run),
   describe_source: (run, args: { source: string }) =>
      describeSource(run, args),
   run_query: (run, args: z.infer<typeof runQueryDef.inputSchema>, signal) =>
      runQuery(run, args, signal),
   compute_metric: (run, args: ComputeMetricInput) =>
      runComputeMetric(run, args),
};
