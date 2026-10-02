// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Insight generation without a model key. A fixed planner calls the same tools
// against the same Publisher and writes each chart as a chart program, then
// hands the drafts to the same grounding and chart checks the model's go
// through. Only the judgement is canned; every number and row is real.

import type { ChartProgram } from "@malloy-publisher/app-manifest/analyst/chart-program";
import type { ComputeMetricInput } from "@malloy-publisher/app-manifest/analyst/compute";
import { resolveText } from "@malloy-publisher/app-manifest/analyst/format";
import {
   headlineKey,
   type InsightBatch,
   type InsightDraft,
   type InsightRunRequest,
} from "../../src/analyst/insights";
import type { ToolName } from "../../src/analyst/config";
import type { InsightDetector } from "../../src/data/types";
import { phrase } from "./middleware";
import type { RunState } from "./run";
import { toolImpls } from "./tools";

interface QueryResult {
   datasetId: string;
   rows: Record<string, unknown>[];
}

interface Tools {
   source: string;
   q: (query: string, title: string, grain: string) => Promise<QueryResult>;
   m: (args: ComputeMetricInput) => Promise<{ id: string; value: unknown }>;
}

const tok = (id: string) => `{{metric:${id}}}`;
const program = (p: ChartProgram) => JSON.stringify(p);

interface Plan {
   detector: InsightDetector;
   /** Words in a steer that should rank this plan first. */
   matches: RegExp;
   draft: (t: Tools) => Promise<InsightDraft | undefined>;
}

async function latestYears(t: Tools) {
   const years = await t.q("sales_by_year", "Revenue by year", "year");
   const ys = years.rows
      .map((r) => Number(String(r.order_year).slice(0, 4)))
      .filter(Number.isFinite)
      .sort();
   const latest = ys.at(-1);
   return latest && ys.length > 1 ? { latest, prior: latest - 1 } : undefined;
}

const plans: Plan[] = [
   {
      detector: "change",
      matches: /revenue|sales|growth|month|season/i,
      async draft({ q, m }) {
         const ds = await q("sales_by_month", "Revenue by month", "month");
         const last = await m({
            datasetId: ds.datasetId,
            op: "last",
            column: "total_sales",
            label: "Latest month's revenue",
         });
         const yoy = await m({
            datasetId: ds.datasetId,
            op: "yoy",
            column: "total_sales",
            by: "order_month",
            label: "Latest month vs a year earlier",
         });
         const peak = await m({
            datasetId: ds.datasetId,
            op: "max_by",
            column: "total_sales",
            by: "order_month",
            label: "Peak month",
         });
         const yearly = await q("sales_by_year", "Revenue by year", "year");
         return {
            detector: "change",
            headline: `Monthly revenue ${tok(yoy.id)} on a year ago`,
            title: "Revenue by month, this year against last",
            narrative: `The latest month booked ${tok(last.id)}, ${tok(yoy.id)} against the same month a year earlier; the peak so far was ${tok(peak.id)}.`,
            details: [
               "Each month sits above its counterpart from the year before.",
            ],
            reasons: [
               `A ${tok(yoy.id)} year-over-year move in the business's top line`,
               "Holds across the whole year, not one month",
            ],
            topics: ["revenue"],
            score: 0.74,
            metric: {
               label: "Latest month's revenue",
               metricId: last.id,
               deltaMetricId: yoy.id,
               period: "YoY",
               polarity: "up_is_good",
            },
            glance: {
               kind: "bars",
               datasetId: yearly.datasetId,
               labelColumn: "order_year",
               valueColumn: "total_sales",
            },
            evidence: {
               datasetId: ds.datasetId,
               caption: "This year's months drawn over last year's.",
               chart: program({
                  library: "tanstack",
                  tables: {
                     years: {
                        from: ds.datasetId,
                        steps: [
                           { derive: { year: ["year", "order_month"] } },
                           {
                              summarize: {
                                 latest: { value: "year", reduce: "max" },
                              },
                           },
                           { filter: [">=", "year", ["-", "latest", 1]] },
                           {
                              derive: {
                                 series: [
                                    "if",
                                    ["==", "year", "latest"],
                                    { lit: "This year" },
                                    { lit: "Last year" },
                                 ],
                                 month: [
                                    "date",
                                    2000,
                                    ["month", "order_month"],
                                    1,
                                 ],
                              },
                           },
                        ],
                     },
                  },
                  marks: [
                     {
                        mark: "areaY",
                        data: "years",
                        filter: ["==", "series", { lit: "This year" }],
                        x: "month",
                        y: "total_sales",
                        fill: "@series1",
                        fillOpacity: 0.08,
                     },
                     {
                        mark: "lineY",
                        data: "years",
                        x: "month",
                        y: "total_sales",
                        color: "series",
                        curve: "monotoneX",
                        points: true,
                     },
                  ],
                  scales: {
                     x: { type: "utc", format: "month" },
                     y: { format: "currency" },
                  },
                  color: {
                     domain: ["Last year", "This year"],
                     range: ["@muted", "@series1"],
                     legend: true,
                  },
                  focus: "group-x",
                  tooltip: [
                     { channel: "x", label: "Month", format: "month" },
                     {
                        channel: "y",
                        label: "Revenue",
                        format: "currency_full",
                     },
                  ],
               }),
            },
         };
      },
   },
   {
      detector: "mix",
      matches: /categor|mix|share|product/i,
      async draft(t) {
         const years = await latestYears(t);
         if (!years) return undefined;
         const { latest, prior } = years;
         const growth = await t.q(
            `{ group_by: category; aggregate: growth is total_sales { where: created_at.year = @${latest} } / total_sales { where: created_at.year = @${prior} } - 1; order_by: growth desc }`,
            `Category growth, ${prior} to ${latest}`,
            "category",
         );
         const leader = await t.m({
            datasetId: growth.datasetId,
            op: "max_by",
            column: "growth",
            by: "category",
            label: "Fastest-growing category",
         });
         const long = await t.q(
            `{ where: created_at.year >= @${prior}; group_by: category, order_year is created_at.year; aggregate: total_sales; order_by: category, order_year }`,
            `Category revenue, ${prior} and ${latest}`,
            "category and year",
         );
         const at = (y: number) => [
            { column: "category", equals: String(leader.value) },
            { column: "order_year", equals: String(y) },
         ];
         const change = await t.m({
            datasetId: long.datasetId,
            op: "pct_change",
            column: "total_sales",
            where: at(latest),
            from: at(prior),
            label: `${leader.value} revenue, ${latest} vs ${prior}`,
         });
         const now = await t.m({
            datasetId: long.datasetId,
            op: "lookup",
            column: "total_sales",
            where: at(latest),
            label: `${leader.value} revenue in ${latest}`,
         });
         const mix = await t.q(
            `{ where: created_at.year = @${latest}; group_by: category; aggregate: total_sales; order_by: total_sales desc }`,
            `Category revenue, ${latest}`,
            "category",
         );
         const share = await t.m({
            datasetId: mix.datasetId,
            op: "share",
            column: "total_sales",
            where: [{ column: "category", equals: String(leader.value) }],
            label: `${leader.value}'s share of ${latest} revenue`,
         });
         const name = String(leader.value);
         const isLeader = ["==", "category", { lit: name }];
         const others = ["not", isLeader];
         return {
            detector: "mix",
            headline: `${tok(leader.id)} is outgrowing every other category`,
            title: `${name} revenue, ${prior} against ${latest}`,
            narrative: `${tok(leader.id)} grew ${tok(change.id)} from ${prior} to ${latest}, faster than any other category, and now brings in ${tok(share.id)} of revenue.`,
            details: [`${latest} revenue: ${tok(now.id)}.`],
            reasons: [
               "Fastest growth of any category",
               `Now ${tok(share.id)} of revenue, so the shift moves the total`,
            ],
            topics: ["revenue"],
            score: 0.68,
            metric: {
               label: `${name} revenue`,
               metricId: now.id,
               deltaMetricId: change.id,
               period: "YoY",
               polarity: "up_is_good",
            },
            glance: {
               kind: "donut",
               datasetId: mix.datasetId,
               labelColumn: "category",
               valueColumn: "total_sales",
               highlight: name,
            },
            evidence: {
               datasetId: long.datasetId,
               caption: `Every category, ${prior} to ${latest}; ${name} highlighted.`,
               highlight: name,
               chart: program({
                  library: "tanstack",
                  tables: {
                     slope: {
                        from: long.datasetId,
                        steps: [
                           {
                              derive: {
                                 year: ["str", ["year", "order_year"]],
                                 y: ["year", "order_year"],
                              },
                           },
                           {
                              summarize: {
                                 last: { value: "y", reduce: "max" },
                              },
                           },
                        ],
                     },
                  },
                  marks: [
                     {
                        mark: "lineY",
                        data: "slope",
                        filter: others,
                        x: "year",
                        y: "total_sales",
                        z: "category",
                        stroke: "@muted",
                        strokeOpacity: 0.45,
                        strokeWidth: 1.5,
                     },
                     {
                        mark: "dot",
                        data: "slope",
                        filter: others,
                        x: "year",
                        y: "total_sales",
                        fill: "@muted",
                        r: 3,
                     },
                     {
                        mark: "lineY",
                        data: "slope",
                        filter: isLeader,
                        x: "year",
                        y: "total_sales",
                        stroke: "@series1",
                        strokeWidth: 2.5,
                     },
                     {
                        mark: "dot",
                        data: "slope",
                        filter: isLeader,
                        x: "year",
                        y: "total_sales",
                        fill: "@series1",
                        r: 4,
                     },
                     {
                        mark: "text",
                        data: "slope",
                        filter: ["==", "y", "last"],
                        x: "year",
                        y: "total_sales",
                        text: "category",
                        anchor: "start",
                        dx: 8,
                        fontSize: 10,
                        fill: {
                           if: isLeader,
                           then: "@foreground",
                           else: "@muted",
                        },
                     },
                  ],
                  scales: {
                     x: { type: "point", padding: 0.15 },
                     y: { format: "currency" },
                  },
                  tooltip: [
                     { field: "category", label: "Category" },
                     { channel: "x", label: "Year" },
                     {
                        channel: "y",
                        label: "Revenue",
                        format: "currency_full",
                     },
                  ],
               }),
            },
         };
      },
   },
   {
      detector: "anomaly",
      matches: /return|refund|cancel|unusual|anomal|spike/i,
      async draft({ q, m }) {
         const ds = await q(
            "{ group_by: order_month is created_at.month; aggregate: return_rate; order_by: order_month }",
            "Return rate by month",
            "month",
         );
         const peak = await m({
            datasetId: ds.datasetId,
            op: "max_by",
            column: "return_rate",
            by: "order_month",
            label: "Month with the highest return rate",
         });
         const peakRate = await m({
            datasetId: ds.datasetId,
            op: "max",
            column: "return_rate",
            label: "Highest monthly return rate",
         });
         const avg = await m({
            datasetId: ds.datasetId,
            op: "avg",
            column: "return_rate",
            label: "Average monthly return rate",
         });
         const peakMonth = String(peak.value).slice(0, 7);
         const d = new Date(`${peakMonth}-01T00:00:00Z`);
         d.setUTCMonth(d.getUTCMonth() - 1);
         const before = d.toISOString().slice(0, 7);
         const jump = await m({
            datasetId: ds.datasetId,
            op: "diff",
            column: "return_rate",
            where: [{ column: "order_month", equals: peakMonth }],
            from: [{ column: "order_month", equals: before }],
            label: "Return rate, peak month vs the month before",
         });
         return {
            detector: "anomaly",
            headline: `Returns jumped to ${tok(peakRate.id)} in ${tok(peak.id)}`,
            title: "Return rate by month against its normal range",
            narrative: `Return rate hit ${tok(peakRate.id)} in ${tok(peak.id)}, ${tok(jump.id)} on the month before, against a typical ${tok(avg.id)}.`,
            details: [
               "The latest months show almost no returns yet; they likely haven't been processed, so read them as incomplete.",
            ],
            reasons: [
               "The highest return rate in the data",
               `${tok(jump.id)} in a single month`,
            ],
            topics: ["refunds"],
            score: 0.63,
            metric: {
               label: "Return rate",
               metricId: peakRate.id,
               deltaMetricId: jump.id,
               period: "MoM",
               polarity: "down_is_good",
            },
            glance: {
               kind: "compare",
               metricId: peakRate.id,
               baselineMetricId: avg.id,
               baselineLabel: "Typical",
               currentLabel: "Peak",
            },
            evidence: {
               datasetId: ds.datasetId,
               caption:
                  "Shaded: the mean plus or minus two standard deviations. Red points sit outside it.",
               highlight: String(peak.value),
               chart: program({
                  library: "tanstack",
                  tables: {
                     band: {
                        from: ds.datasetId,
                        steps: [
                           {
                              summarize: {
                                 mean: { value: "return_rate", reduce: "mean" },
                                 sd: {
                                    value: "return_rate",
                                    reduce: "deviation",
                                 },
                              },
                           },
                           {
                              derive: {
                                 upper: ["+", "mean", ["*", 2, "sd"]],
                                 lower: [
                                    "max",
                                    0,
                                    ["-", "mean", ["*", 2, "sd"]],
                                 ],
                              },
                           },
                        ],
                     },
                  },
                  marks: [
                     {
                        mark: "areaY",
                        data: "band",
                        x: "order_month",
                        y1: "lower",
                        y2: "upper",
                        fill: "@muted",
                        fillOpacity: 0.15,
                     },
                     {
                        mark: "lineY",
                        data: "band",
                        x: "order_month",
                        y: "mean",
                        stroke: "@muted",
                        strokeWidth: 1,
                        strokeDasharray: "4 3",
                     },
                     {
                        mark: "lineY",
                        data: "band",
                        x: "order_month",
                        y: "return_rate",
                        stroke: "@series1",
                     },
                     {
                        mark: "dot",
                        data: "band",
                        filter: [
                           "or",
                           [">", "return_rate", "upper"],
                           ["<", "return_rate", "lower"],
                        ],
                        x: "order_month",
                        y: "return_rate",
                        fill: "@negative",
                        r: 4,
                     },
                  ],
                  scales: {
                     x: { type: "utc", format: "month_year" },
                     y: { format: "percent" },
                  },
                  tooltip: [
                     {
                        channel: "x",
                        label: "Month",
                        format: "month_year_long",
                     },
                     {
                        field: "return_rate",
                        label: "Return rate",
                        format: "percent1",
                     },
                     {
                        field: "upper",
                        label: "Top of normal",
                        format: "percent1",
                     },
                  ],
               }),
            },
         };
      },
   },
   {
      detector: "driver",
      matches: /margin|brand|profit|driv/i,
      async draft(t) {
         const years = await latestYears(t);
         if (!years) return undefined;
         const { latest, prior } = years;
         const moves = await t.q(
            `{ group_by: brand; aggregate: margin_change is margin_rate { where: created_at.year = @${latest} } - margin_rate { where: created_at.year = @${prior} }; order_by: margin_change asc }`,
            `Margin rate change by brand, ${prior} to ${latest}`,
            "brand",
         );
         const mover = await t.m({
            datasetId: moves.datasetId,
            op: "min_by",
            column: "margin_change",
            by: "brand",
            label: "Brand whose margin fell most",
         });
         const brand = String(mover.value);
         const yearly = await t.q(
            `{ where: brand = '${brand.replace(/'/g, "\\'")}' and created_at.year >= @${prior}; group_by: order_year is created_at.year; aggregate: margin_rate, total_sales; order_by: order_year }`,
            `${brand} margin by year`,
            "year",
         );
         const diff = await t.m({
            datasetId: yearly.datasetId,
            op: "diff",
            column: "margin_rate",
            where: [{ column: "order_year", equals: String(latest) }],
            from: [{ column: "order_year", equals: String(prior) }],
            label: `${brand} margin rate, ${latest} vs ${prior}`,
         });
         const rate = await t.m({
            datasetId: yearly.datasetId,
            op: "lookup",
            column: "margin_rate",
            where: [{ column: "order_year", equals: String(latest) }],
            label: `${brand} margin rate in ${latest}`,
         });
         const monthly = await t.q(
            `{ where: brand = '${brand.replace(/'/g, "\\'")}'; group_by: order_month is created_at.month; aggregate: margin_rate; order_by: order_month }`,
            `${brand} margin rate by month`,
            "month",
         );
         const isMover = ["==", "brand", { lit: brand }];
         return {
            detector: "driver",
            headline: `${tok(mover.id)} margin moved ${tok(diff.id)} on last year`,
            title: `Margin rate change by brand, ${prior} to ${latest}`,
            narrative: `${tok(mover.id)} had the weakest margin trend of any brand: its margin rate moved ${tok(diff.id)} from ${prior} to ${latest}, to ${tok(rate.id)}.`,
            details: [
               "Bars show each brand's change in margin rate, in points.",
            ],
            reasons: [
               "The largest margin decline across brands",
               `Now at ${tok(rate.id)}`,
            ],
            topics: ["margins", "brands"],
            score: 0.57,
            metric: {
               label: `${brand} margin rate`,
               metricId: rate.id,
               deltaMetricId: diff.id,
               period: "YoY",
               polarity: "up_is_good",
            },
            glance: {
               kind: "sparkline",
               datasetId: monthly.datasetId,
               column: "margin_rate",
            },
            evidence: {
               datasetId: moves.datasetId,
               caption: `Change in margin rate by brand, ${prior} to ${latest}.`,
               highlight: brand,
               chart: program({
                  library: "chartjs",
                  type: "bar",
                  tables: {
                     moves: {
                        from: moves.datasetId,
                        steps: [
                           { derive: { points: ["*", "margin_change", 100] } },
                           { sort: [{ field: "margin_change", order: "asc" }] },
                        ],
                     },
                  },
                  data: {
                     datasets: [
                        {
                           rows: "moves",
                           label: "Change in margin rate",
                           parsing: { xAxisKey: "points", yAxisKey: "brand" },
                           backgroundColor: {
                              if: ["<", "margin_change", 0],
                              then: "@negative",
                              else: "@positive",
                           },
                           borderColor: "@foreground",
                           borderWidth: { if: isMover, then: 2, else: 0 },
                           borderSkipped: false,
                           barPercentage: 0.8,
                        },
                     ],
                  },
                  options: {
                     indexAxis: "y",
                     scales: {
                        x: {
                           title: { display: true, text: "Change (pts)" },
                           ticks: { format: "points" },
                           grid: { display: true },
                        },
                        y: { grid: { display: false } },
                     },
                  },
               }),
            },
         };
      },
   },
];

export async function scriptedInsights(
   run: RunState,
   { recipe, count, existing }: InsightRunRequest,
   signal: AbortSignal,
): Promise<InsightBatch> {
   const call = async <T>(name: ToolName, args: unknown): Promise<T> => {
      if (signal.aborted) throw new Error("cancelled");
      run.toolCalls++;
      run.emit("analyst:status", {
         phase: "explore",
         text: phrase(name, args),
      });
      return (await toolImpls[name](run, args as never, signal)) as T;
   };
   run.emit("analyst:status", {
      phase: "explore",
      text: "Reading the model",
   });
   const { sources } = await call<{ sources: { id: string }[] }>(
      "list_sources",
      {},
   );
   const src = sources.find((s) => s.id.endsWith("#order_items"));
   if (!src) {
      return {
         insights: [],
         skipped: [
            "The scripted planner only scans order_items; set OPENROUTER_API_KEY to scan other sources with the model.",
         ],
      };
   }
   const tools: Tools = {
      source: src.id,
      q: (query, title, grain) =>
         call<QueryResult>("run_query", {
            source: src.id,
            query,
            title,
            grain,
         }),
      m: async (args) => {
         const r = await call<{ metricId: string; value: unknown }>(
            "compute_metric",
            args,
         );
         return { id: r.metricId, value: r.value };
      },
   };
   const focus = recipe.focus.trim();
   const covered = (d: InsightDetector) =>
      existing.filter((c) => c.detector === d).length;
   const chosen = plans
      .filter((p) => recipe.detectors.includes(p.detector))
      .sort(
         (a, b) =>
            Number(b.matches.test(focus)) - Number(a.matches.test(focus)) ||
            covered(a.detector) - covered(b.detector),
      );
   const seen = new Set(existing.map((c) => headlineKey(c.headline)));
   const insights: InsightDraft[] = [];
   const skipped: string[] = [];
   for (const plan of chosen) {
      if (insights.length >= count) break;
      try {
         const d = await plan.draft(tools);
         if (!d) continue;
         if (seen.has(headlineKey(resolveText(d.headline, run.metrics))))
            skipped.push(`${plan.detector}: already in the Studio`);
         else insights.push(d);
      } catch (e) {
         skipped.push(`${plan.detector}: ${(e as Error).message}`);
      }
   }
   run.emit("analyst:status", {
      phase: "ground",
      text: `Checking ${insights.length} drafts: numbers and charts`,
   });
   return { insights, skipped };
}
