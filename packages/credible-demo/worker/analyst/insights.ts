// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Insight generation for the Studio. Claude Opus 5.5 scans the model with the
// analyst's tools and drafts For you cards, each with a chart it designs as a
// TanStack Charts or Chart.js program. Nothing it drafts is kept on trust:
// every number must be a computed metric, and every chart must read only this
// run's datasets and build headless. Drafts that fail get one repair turn,
// then drop.

import {
   chat,
   maxIterations,
   type ModelMessage,
   type StreamChunk,
} from "@tanstack/ai";
import {
   createOpenRouterText,
   type OpenRouterTextModelOptions,
} from "@tanstack/ai-openrouter";
import {
   bindChartProgram,
   parseChartProgram,
   programDatasets,
   type BoundProgram,
   type ChartProgram,
} from "@malloy-publisher/app-manifest/analyst/chart-program";
import { resolveText } from "@malloy-publisher/app-manifest/analyst/format";
import { groundingContext, textIssues } from "../../src/analyst/grounding";
import {
   INSIGHT_MODEL,
   InsightBatch,
   trimBatch,
   type GeneratedInsight,
   type InsightDraft,
   type InsightRunRequest,
} from "../../src/analyst/insights";
import {
   analystConfig,
   scopedConfig,
   type AnalystConfig,
} from "../../src/analyst/config";
import type {
   Dataset,
   Row,
} from "@malloy-publisher/app-manifest/analyst/schema";
import { DETECTORS } from "../../src/data/insight-runs";
import type {
   Delta,
   Evidence,
   Glance,
   GlanceItem,
   InsightCheck,
   InsightRecipe,
   ValueFormat,
} from "../../src/data/types";
import { captureMessages, drain, model } from "./agent";
import { chartRunIssues } from "./chart-check";
import {
   budget,
   redactForAudience,
   statusEmitter,
   traceRecorder,
} from "./middleware";
import { insightBasePrompt, insightRequest, sourceCatalog } from "./prompts";
import type { AnalystContext, RunState } from "./run";
import { allowedTools } from "./tools";

const EVIDENCE_ROWS = 200;

/** The analyst config a generation run uses: Opus 5.5 and nothing else. */
export function insightConfig(
   recipe: InsightRecipe,
   packages?: string[],
): AnalystConfig {
   const base = scopedConfig(analystConfig, packages);
   return {
      ...base,
      explorer: { model: INSIGHT_MODEL, fallbacks: [], effort: "high" },
      presenter: { model: INSIGHT_MODEL },
      sourceNames: recipe.sources.length ? recipe.sources : undefined,
      budget: {
         maxToolCalls: 40,
         maxIterations: 28,
         maxUsd: 6,
         timeoutMs: 300_000,
      },
   };
}

export const recipeQuestion = (recipe: InsightRecipe) =>
   recipe.focus.trim() || "What should the team know about right now?";

const formatOf = (unit: string): ValueFormat =>
   unit === "currency" ? "currency" : unit === "percent" ? "percent" : "number";

const viewOf = (malloy: string) => /^run: \w+ -> (\w+) \+ \{/.exec(malloy)?.[1];

const cell = (v: Row[string]): string | number =>
   typeof v === "number" || typeof v === "string"
      ? v
      : v === null
        ? ""
        : String(v);

const LINE_MARKS = new Set(["lineY", "lineX", "areaY", "areaX"]);

/** Whether a chart program draws a line or area, the form a sparkline repeats. */
function drawsLine(program: ChartProgram): boolean {
   if (program.library === "tanstack") {
      const marks = Array.isArray(program.marks) ? program.marks : [];
      return marks.some((m) => LINE_MARKS.has((m as { mark?: string }).mark!));
   }
   const datasets = (program.data as { datasets?: { type?: string }[] })
      ?.datasets;
   return (
      program.type === "line" ||
      (Array.isArray(datasets) && datasets.some((s) => s.type === "line"))
   );
}

const GLANCE_ITEMS = { bars: 8, donut: 6 };

/** The draft's glance read from the run's datasets and metrics, or undefined with issues pushed. */
function groundGlance(
   run: RunState,
   g: InsightDraft["glance"],
   issues: string[],
): Glance | undefined {
   const number = (id: string, what: string) => {
      const m = run.metrics.get(id);
      if (!m) issues.push(`glance.${what} ${id} is not a metric of this run`);
      else if (typeof m.value !== "number")
         issues.push(`glance.${what} ${id} is a ${m.unit}, not a number`);
      else return { value: m.value, unit: m.unit, label: m.label };
   };
   const dataset = (id: string) => {
      const ds = run.datasets.get(id);
      if (!ds)
         issues.push(`glance.datasetId ${id} is not a dataset of this run`);
      return ds;
   };
   const numericColumn = (ds: Dataset, name: string, what: string) => {
      const col = ds.columns.find((c) => c.name === name);
      if (col?.type === "number") return col;
      issues.push(`glance.${what} ${name} is not a numeric column of ${ds.id}`);
   };

   switch (g.kind) {
      case "sparkline": {
         const ds = dataset(g.datasetId);
         const col = ds && numericColumn(ds, g.column, "column");
         if (!ds || !col) return;
         const values = ds.rows
            .map((r) => r[col.name])
            .filter((v): v is number => typeof v === "number")
            .slice(-16);
         if (values.length < 2)
            return void issues.push(
               `glance ${ds.id}.${col.name} has fewer than two values`,
            );
         return { kind: "sparkline", values };
      }
      case "bars":
      case "donut": {
         const ds = dataset(g.datasetId);
         if (!ds) return;
         const col = numericColumn(ds, g.valueColumn, "valueColumn");
         const hasLabel = ds.columns.some((c) => c.name === g.labelColumn);
         if (!hasLabel)
            issues.push(
               `glance.labelColumn ${g.labelColumn} is not a column of ${ds.id}`,
            );
         if (!col || !hasLabel) return;
         const rows = ds.rows
            .map((r) => ({
               label: String(cell(r[g.labelColumn])),
               value: r[col.name],
            }))
            .filter((r): r is GlanceItem => typeof r.value === "number");
         if (rows.length < 2)
            return void issues.push(`glance ${ds.id} has fewer than two rows`);
         if (g.kind === "donut" && rows.some((r) => r.value < 0))
            return void issues.push(
               `glance: a donut needs non-negative parts; ${col.name} has negatives, use bars`,
            );
         const fold = g.kind === "donut" && rows.length > GLANCE_ITEMS.donut;
         const room = GLANCE_ITEMS[g.kind] - (fold ? 1 : 0);
         const subject = rows.find((r) => r.label === g.highlight);
         let items = rows.slice(0, room);
         if (subject && !items.includes(subject))
            items = [...items.slice(0, room - 1), subject];
         if (fold)
            items.push({
               label: "Other",
               value: rows
                  .filter((r) => !items.includes(r))
                  .reduce((s, r) => s + r.value, 0),
            });
         return { kind: g.kind, items, highlight: g.highlight };
      }
      case "gauge": {
         const v = number(g.metricId, "metricId");
         const max = g.maxMetricId
            ? number(g.maxMetricId, "maxMetricId")?.value
            : v?.unit === "percent"
              ? 1
              : void issues.push(
                   `glance: gauge ${g.metricId} is not a percent; give maxMetricId for its full scale`,
                );
         if (!v || max === undefined) return;
         if (!(max > 0) || v.value < 0 || v.value > max)
            return void issues.push(
               "glance: a gauge needs a value between zero and a positive max",
            );
         return { kind: "gauge", value: v.value, max };
      }
      case "compare": {
         const current = number(g.metricId, "metricId");
         const baseline = number(g.baselineMetricId, "baselineMetricId");
         if (!current || !baseline) return;
         return {
            kind: "compare",
            baseline: { label: g.baselineLabel, value: baseline.value },
            current: { label: g.currentLabel, value: current.value },
         };
      }
   }
}

/** A draft checked against the run: its GeneratedInsight, or why it can't be kept. */
export async function groundDraft(
   run: RunState,
   d: InsightDraft,
): Promise<{ insight?: GeneratedInsight; issues: string[] }> {
   const ctx = groundingContext(
      run.question,
      run.datasets.values(),
      run.metrics.values(),
   );
   const issues: string[] = [];
   const text = (t: string, what: string) =>
      issues.push(...textIssues(t, ctx, what));
   text(d.headline, "headline");
   text(d.title, "title");
   text(d.narrative, "narrative");
   text(d.evidence.caption, "caption");
   d.details.forEach((t, i) => text(t, `details[${i}]`));
   d.reasons.forEach((t, i) => text(t, `reasons[${i}]`));

   const value = run.metrics.get(d.metric.metricId);
   if (!value)
      issues.push(
         `metric.metricId ${d.metric.metricId} is not a metric of this run`,
      );
   else if (typeof value.value !== "number")
      issues.push(
         `metric.metricId ${value.id} is a ${value.unit}, not a number to headline`,
      );

   const change = run.metrics.get(d.metric.deltaMetricId);
   let delta: Delta | undefined;
   if (!change) {
      issues.push(
         `metric.deltaMetricId ${d.metric.deltaMetricId} is not a metric of this run`,
      );
   } else if (typeof change.value !== "number") {
      issues.push(`metric.deltaMetricId ${change.id} is not a number`);
   } else if (change.unit === "points" || change.unit === "percent") {
      delta = {
         value: change.value,
         unit: change.unit === "points" ? "pp" : "percent",
         period: d.metric.period,
         polarity: d.metric.polarity,
      };
   } else {
      issues.push(
         `metric.deltaMetricId ${change.id} is a ${change.op} in ${change.unit}; use pct_change or yoy, or diff on a percent column`,
      );
   }

   if (d.glance.kind === "compare") {
      text(d.glance.baselineLabel, "glance.baselineLabel");
      text(d.glance.currentLabel, "glance.currentLabel");
   }
   const glance = groundGlance(run, d.glance, issues);

   const ds = run.datasets.get(d.evidence.datasetId);
   if (!ds)
      issues.push(
         `evidence.datasetId ${d.evidence.datasetId} is not a dataset of this run`,
      );

   const parsed = parseChartProgram(d.evidence.chart);
   issues.push(...parsed.issues.map((i) => `evidence.chart: ${i}`));
   let bound: BoundProgram | undefined;
   if (parsed.program) {
      const reads = programDatasets(
         parsed.program,
         new Set(run.datasets.keys()),
      );
      if (!reads.length)
         issues.push(
            `evidence.chart reads no dataset of this run; name one (${[...run.datasets.keys()].join(", ")}) in a mark's "data", a dataset's "rows", or a table's "from"`,
         );
      else {
         bound = bindChartProgram(
            parsed.program,
            Object.fromEntries(
               reads.map((id) => {
                  const x = run.datasets.get(id)!;
                  return [
                     id,
                     {
                        columns: x.columns.map((c) => ({
                           name: c.name,
                           type: c.type,
                        })),
                        rows: x.rows,
                     },
                  ];
               }),
            ),
         );
         const problems = chartRunIssues(bound);
         issues.push(...problems.map((p) => `evidence.chart: ${p}`));
      }
      if (d.glance.kind === "sparkline" && drawsLine(parsed.program))
         issues.push(
            "glance: a sparkline beside a line or area chart repeats it; pick bars, donut, gauge or compare",
         );
   }

   if (issues.length || !value || !delta || !ds || !bound || !glance)
      return { issues };

   const resolve = (t: string) => resolveText(t, run.metrics);
   const numeric = ds.columns.filter((c) => c.type === "number");
   const xCol = ds.columns.find((c) => c.type !== "number") ?? ds.columns[0];
   const evidence: Evidence = {
      kind: "bar",
      xKey: xCol.name,
      series: numeric.map((c) => ({
         key: c.name,
         label: c.label ?? c.name.replace(/_/g, " "),
      })),
      rows: ds.rows
         .slice(0, EVIDENCE_ROWS)
         .map((r) =>
            Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cell(v)])),
         ),
      format: formatOf(numeric[0]?.unit ?? "number"),
      caption: resolve(d.evidence.caption),
      highlight: d.evidence.highlight,
      spec: bound,
   };
   const view = viewOf(ds.query);
   const cited = new Set(
      [d.headline, d.narrative, d.evidence.caption, ...d.details, ...d.reasons]
         .flatMap((t) => [...t.matchAll(/\{\{metric:([\w.-]+)\}\}/g)])
         .map((m) => m[1]),
   )
      .add(value.id)
      .add(change!.id);
   const checks: InsightCheck[] = [
      {
         label: "Compiles and runs against the published model",
         passed: true,
         detail: `${run.queries} ${run.queries === 1 ? "query" : "queries"} this run`,
      },
      {
         label: "Answered from a governed view",
         passed: !!view,
         detail: view
            ? `${ds.source.source} → ${view}`
            : `An ad-hoc query over ${ds.source.source}'s measures`,
      },
      {
         label: "Every number traces to a computed metric",
         passed: true,
         detail: `${cited.size} ${cited.size === 1 ? "metric" : "metrics"}, none typed by the model`,
      },
      {
         label: "Chart builds and reads only query results",
         passed: true,
         detail: `${bound.library === "chartjs" ? "Chart.js" : "TanStack Charts"}, designed for this insight`,
      },
   ];
   return {
      issues: [],
      insight: {
         detector: d.detector,
         score: Math.round(d.score * 100) / 100,
         headline: resolve(d.headline),
         reasons: d.reasons.map(resolve),
         checks,
         delta,
         metric: {
            label: d.metric.label,
            value: value.value as number,
            format: formatOf(value.unit),
            trend: glance.kind === "sparkline" ? glance.values : [],
            glance,
         },
         analysis: {
            title: resolve(d.title),
            narrative: resolve(d.narrative),
            details: d.details.map(resolve),
            evidence,
            malloy: ds.query,
            provenance: {
               environment: ds.source.environment,
               package: ds.source.package,
               model: ds.source.model,
               source: ds.source.source,
               ...(view ? { view } : {}),
            },
            topics: d.topics,
         },
      },
   };
}

export async function groundBatch(run: RunState, batch: InsightBatch) {
   const results = await Promise.all(
      batch.insights.map(async (d) => ({ d, ...(await groundDraft(run, d)) })),
   );
   return {
      kept: results.filter((r) => r.insight).map((r) => r.insight!),
      failed: results.filter((r) => !r.insight),
   };
}

/**
 * Reads the stream to its end before throwing a RUN_ERROR: the terminal
 * onError hooks, which capture the transcript, run after that chunk.
 */
async function* holdError(stream: AsyncIterable<StreamChunk>) {
   let error: string | undefined;
   for await (const chunk of stream) {
      if (chunk.type === "RUN_ERROR") error ??= chunk.message;
      else yield chunk;
   }
   if (error !== undefined) throw new Error(error);
}

/** The model run: explore with tools, return an InsightBatch, one repair turn. */
export async function modelInsights(
   run: RunState,
   ctx: AnalystContext,
   key: string,
   request: InsightRunRequest,
   signal: AbortSignal,
) {
   const { config } = run;
   const catalog = await run.catalog();
   const abort = new AbortController();
   const onAbort = () => abort.abort("cancelled");
   signal.addEventListener("abort", onAbort);
   const timer = setTimeout(
      () =>
         abort.abort(
            `the ${Math.round(config.budget.timeoutMs / 1000)}s time limit`,
         ),
      config.budget.timeoutMs,
   );
   const adapter = createOpenRouterText(model(INSIGHT_MODEL), key, {
      appTitle: "Credible insight studio",
   });
   // No `models` list: OpenRouter falls back to other models only when given one.
   const modelOptions: OpenRouterTextModelOptions = {
      reasoning: { effort: config.explorer.effort },
      sessionId: run.id,
   };
   const systemPrompts = [
      insightBasePrompt,
      config.instructions,
      sourceCatalog(catalog),
   ];
   const messages: ModelMessage[] = [
      {
         role: "user",
         content: insightRequest({
            focus: request.recipe.focus,
            detectors: request.recipe.detectors.map((d) => DETECTORS[d]),
            count: request.count,
            existing: request.existing,
         }),
      },
   ];
   const transcript: ModelMessage[] = [];
   /** One chat run; `writeUp` is a single turn with no tools, to return the batch. */
   const attempt = async (msgs: ModelMessage[], writeUp = false) => {
      let captured: unknown;
      const stream = chat({
         adapter,
         modelOptions,
         systemPrompts,
         messages: msgs,
         tools: writeUp ? [] : allowedTools(config.tools),
         agentLoopStrategy: maxIterations(
            writeUp ? 1 : config.budget.maxIterations,
         ),
         outputSchema: InsightBatch,
         stream: true,
         middleware: [
            traceRecorder("explore", (o) => (captured = o)),
            budget(config.budget),
            statusEmitter("explore"),
            captureMessages(transcript),
            redactForAudience("explore"),
         ],
         context: ctx,
         abortController: abort,
      });
      await drain(run, holdError(stream));
      const parsed = InsightBatch.safeParse(captured);
      return parsed.success
         ? { ...parsed, data: trimBatch(parsed.data) }
         : parsed;
   };
   /**
    * Explore, then return a batch. A loop that stops on its budget mid-tool
    * call has no final answer, and an answer can fail the schema; either way
    * the model gets one turn without tools to write up what it found.
    */
   const explore = async () => {
      let problem: string;
      try {
         const r = await attempt(messages);
         if (r.success) return r.data;
         problem = `Your batch didn't validate: ${r.error.message}`;
      } catch (e) {
         const message = (e as Error).message;
         if (
            abort.signal.aborted ||
            !transcript.length ||
            !/missing structured result|maximum token limit/.test(message)
         )
            throw e;
         problem = "Your tool budget is spent.";
      }
      run.emit("analyst:status", {
         phase: "explore",
         text: "Writing up what it found",
      });
      const r = await attempt(
         [
            ...transcript,
            {
               role: "user",
               content: `${problem} Return the InsightBatch now from the datasets and metrics you already have; drop any draft they can't support.`,
            },
         ],
         true,
      );
      if (!r.success)
         throw new Error(
            `The generator's output didn't validate: ${r.error.message}`,
         );
      return r.data;
   };

   try {
      const first = { data: await explore() };
      run.emit("analyst:status", {
         phase: "ground",
         text: `Checking ${first.data.insights.length} drafts: numbers and charts`,
      });
      let { kept, failed } = await groundBatch(run, first.data);
      let skipped = first.data.skipped;
      if (failed.length && !abort.signal.aborted) {
         run.emit("analyst:status", {
            phase: "repair",
            text: `Repairing ${failed.length} ${failed.length === 1 ? "draft" : "drafts"}`,
         });
         const problems = failed
            .map((f) => `"${f.d.headline}":\n  - ${f.issues.join("\n  - ")}`)
            .join("\n");
         const second = await attempt([
            ...(transcript.length ? transcript : messages),
            {
               role: "user",
               content: `These drafts failed checks:\n${problems}\nReturn a batch with ONLY these drafts, fixed; drop any you can't fix. Cite only ids the tools returned; compute any metric you are missing.`,
            },
         ]).catch((e: unknown) => {
            if (abort.signal.aborted) throw e;
            return { success: false as const };
         });
         if (second.success) {
            const repaired = await groundBatch(run, second.data);
            kept = [...kept, ...repaired.kept];
            failed = repaired.failed;
            skipped = [...skipped, ...second.data.skipped];
         }
      }
      return {
         kept,
         dropped: failed.map((f) => ({
            headline: resolveText(f.d.headline, run.metrics),
            issues: f.issues,
         })),
         skipped,
      };
   } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
   }
}
