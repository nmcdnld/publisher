// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The run without a model key. A fixed planner picks a plan from the question
// and calls the same tools against the same Publisher, then lays the findings
// out with the same registry and grounding. Everything but the model is real,
// so the renderer, the trace, and the checks can be worked on offline.

import type { Block, BlockType, ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import type { ComputeMetricInput } from "@malloy-publisher/app-manifest/analyst/compute";
import { groundingContext, groundReport } from "../../src/analyst/grounding";
import type { ToolName } from "../../src/analyst/config";
import type { Finding, Findings } from "@malloy-publisher/app-manifest/analyst/schema";
import { finish } from "./agent";
import { errorText, phrase } from "./middleware";
import type { RunState } from "./run";
import { toolImpls } from "./tools";

type Kpi = Extract<Block, { type: "kpi" }>;
type Chart = Extract<Block, { type: "chart" }>;

interface Plan {
   findings: Findings;
   kpis: Omit<Kpi, "type">[];
   chart?: Omit<Chart, "type">;
   table?: { datasetId: string; title: string; columns?: string[] };
   followUps: string[];
}

interface Helpers {
   source: string;
   q: (query: string, title: string, grain: string) => Promise<string>;
   m: (
      args: ComputeMetricInput,
   ) => Promise<{ id: string; token: string; value: unknown }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const tok = (id: string) => `{{metric:${id}}}`;
const ev = (datasetId: string, ...metricIds: string[]) => [
   { datasetId, metricIds },
];

async function trendPlan({ source, q, m }: Helpers): Promise<Plan> {
   const ds = await q("sales_by_month", "Revenue by month", "month");
   const peak = await m({
      datasetId: ds,
      op: "max_by",
      column: "total_sales",
      by: "order_month",
      label: "Peak month",
   });
   const peakVal = await m({
      datasetId: ds,
      op: "max",
      column: "total_sales",
      label: "Revenue in the peak month",
   });
   const last = await m({
      datasetId: ds,
      op: "last",
      column: "total_sales",
      label: "Latest month's revenue",
   });
   const yoy = await m({
      datasetId: ds,
      op: "yoy",
      column: "total_sales",
      by: "order_month",
      label: "Latest month vs a year earlier",
   });
   const total = await m({
      datasetId: ds,
      op: "sum",
      column: "total_sales",
      label: "Revenue, all months",
   });
   const years = await q("sales_by_year", "Revenue by year", "year");
   const growth = await m({
      datasetId: years,
      op: "pct_change",
      column: "total_sales",
      label: "Growth, first year to latest",
   });
   void source;
   return {
      findings: {
         question: "How has revenue trended month over month?",
         answer: `Revenue totals ${total.token} and peaked in ${peak.token}; the latest month moved ${yoy.token} against a year earlier.`,
         findings: [
            {
               id: "f1",
               kind: "trend",
               importance: 5,
               headline: `Revenue peaked in ${peak.token} at ${peakVal.token}.`,
               evidence: ev(ds, peak.id, peakVal.id),
            },
            {
               id: "f2",
               kind: "comparison",
               importance: 4,
               headline: `The latest month brought in ${last.token}, ${yoy.token} against the same month a year earlier.`,
               evidence: ev(ds, last.id, yoy.id),
            },
            {
               id: "f3",
               kind: "trend",
               importance: 3,
               headline: `Annual revenue moved ${growth.token} from the first year in the data to the latest.`,
               evidence: ev(years, growth.id),
            },
         ],
         datasets: [
            { id: ds, title: "Revenue by month", grain: "month" },
            { id: years, title: "Revenue by year", grain: "year" },
         ],
         openQuestions: ["Is the latest month complete?"],
      },
      kpis: [
         { label: "Revenue", metric: { metricId: total.id } },
         {
            label: "Latest month",
            metric: { metricId: last.id },
            compare: { metricId: yoy.id },
         },
         { label: "Peak month", metric: { metricId: peak.id } },
      ],
      chart: {
         title: "Revenue by month",
         mark: "area",
         data: { datasetId: ds },
         x: "order_month",
         y: ["total_sales"],
         highlight: [{ metricId: peak.id }],
      },
      table: { datasetId: years, title: "Revenue by year" },
      followUps: [
         "Which categories drove the peak?",
         "How does seasonality differ by year?",
         "Compare revenue across regions",
      ],
   };
}

async function breakdownPlan(
   { q, m }: Helpers,
   o: {
      query: string;
      title: string;
      by: string;
      noun: string;
      rate?: { column: string; label: string };
      followUps: string[];
   },
): Promise<Plan> {
   const ds = await q(o.query, o.title, o.by);
   const lead = await m({
      datasetId: ds,
      op: "max_by",
      column: "total_sales",
      by: o.by,
      label: `Top ${o.noun} by revenue`,
   });
   const leadVal = await m({
      datasetId: ds,
      op: "max",
      column: "total_sales",
      label: `Top ${o.noun}'s revenue`,
   });
   const leadShare = await m({
      datasetId: ds,
      op: "share",
      column: "total_sales",
      where: [{ column: o.by, equals: String(lead.value) }],
      label: `Top ${o.noun}'s share of revenue`,
   });
   const trail = await m({
      datasetId: ds,
      op: "min_by",
      column: "total_sales",
      by: o.by,
      label: `Smallest ${o.noun} by revenue`,
   });
   const total = await m({
      datasetId: ds,
      op: "sum",
      column: "total_sales",
      label: "Revenue",
   });
   const findings: Finding[] = [
      {
         id: "f1",
         kind: "composition",
         importance: 5,
         headline: `${lead.token} leads with ${leadVal.token}, ${leadShare.token} of revenue.`,
         evidence: ev(ds, lead.id, leadVal.id, leadShare.id),
      },
      {
         id: "f2",
         kind: "comparison",
         importance: 3,
         headline: `${trail.token} is the smallest ${o.noun}.`,
         evidence: ev(ds, trail.id),
      },
   ];
   const kpis: Plan["kpis"] = [
      { label: "Revenue", metric: { metricId: total.id } },
      { label: `Top ${o.noun}`, metric: { metricId: lead.id } },
      { label: "Its share", metric: { metricId: leadShare.id } },
   ];
   let chartY = ["total_sales"];
   if (o.rate) {
      const best = await m({
         datasetId: ds,
         op: "max_by",
         column: o.rate.column,
         by: o.by,
         label: `Best ${o.rate.label}`,
      });
      const bestVal = await m({
         datasetId: ds,
         op: "max",
         column: o.rate.column,
         label: `Highest ${o.rate.label}`,
      });
      const worst = await m({
         datasetId: ds,
         op: "min_by",
         column: o.rate.column,
         by: o.by,
         label: `Worst ${o.rate.label}`,
      });
      const worstVal = await m({
         datasetId: ds,
         op: "min",
         column: o.rate.column,
         label: `Lowest ${o.rate.label}`,
      });
      findings.unshift({
         id: "f0",
         kind: "outlier",
         importance: 5,
         headline: `${best.token} earns the best ${o.rate.label} at ${bestVal.token}; ${worst.token} the worst at ${worstVal.token}.`,
         evidence: ev(ds, best.id, bestVal.id, worst.id, worstVal.id),
      });
      kpis.push({
         label: `Best ${o.rate.label}`,
         metric: { metricId: bestVal.id },
         tone: "good",
      });
      chartY = [o.rate.column];
      return {
         findings: {
            question: o.title,
            answer: `${best.token} earns the best ${o.rate.label} (${bestVal.token}) and ${worst.token} the worst (${worstVal.token}); ${lead.token} brings in the most revenue.`,
            findings,
            datasets: [{ id: ds, title: o.title, grain: o.by }],
            openQuestions: [],
         },
         kpis,
         chart: {
            title: o.title,
            mark: "bar",
            data: { datasetId: ds },
            x: o.by,
            y: chartY,
            highlight: [{ metricId: best.id }],
         },
         table: { datasetId: ds, title: o.title },
         followUps: o.followUps,
      };
   }
   return {
      findings: {
         question: o.title,
         answer: `${lead.token} leads with ${leadVal.token}, ${leadShare.token} of the ${total.token} total.`,
         findings,
         datasets: [{ id: ds, title: o.title, grain: o.by }],
         openQuestions: [],
      },
      kpis,
      chart: {
         title: o.title,
         mark: "bar",
         data: { datasetId: ds },
         x: o.by,
         y: chartY,
         highlight: [{ metricId: lead.id }],
      },
      table: { datasetId: ds, title: o.title },
      followUps: o.followUps,
   };
}

async function returnsPlan({ q, m }: Helpers): Promise<Plan> {
   const all = await q(
      "{ aggregate: return_rate, order_item_count }",
      "Return rate overall",
      "total",
   );
   const rate = await m({
      datasetId: all,
      op: "first",
      column: "return_rate",
      label: "Return rate",
   });
   const items = await m({
      datasetId: all,
      op: "first",
      column: "order_item_count",
      label: "Line items",
   });
   const ds = await q(
      "{ group_by: category; aggregate: return_rate, order_item_count; order_by: return_rate desc }",
      "Return rate by category",
      "category",
   );
   const worst = await m({
      datasetId: ds,
      op: "max_by",
      column: "return_rate",
      by: "category",
      label: "Most-returned category",
   });
   const worstVal = await m({
      datasetId: ds,
      op: "max",
      column: "return_rate",
      label: "Highest category return rate",
   });
   const best = await m({
      datasetId: ds,
      op: "min_by",
      column: "return_rate",
      by: "category",
      label: "Least-returned category",
   });
   const bestVal = await m({
      datasetId: ds,
      op: "min",
      column: "return_rate",
      label: "Lowest category return rate",
   });
   return {
      findings: {
         question: "What share of line items get returned?",
         answer: `${rate.token} of line items are returned; ${worst.token} is returned most often at ${worstVal.token}.`,
         findings: [
            {
               id: "f1",
               kind: "outlier",
               importance: 5,
               headline: `${worst.token} has the highest return rate, ${worstVal.token}.`,
               evidence: ev(ds, worst.id, worstVal.id),
            },
            {
               id: "f2",
               kind: "comparison",
               importance: 3,
               headline: `${best.token} is returned least, at ${bestVal.token}.`,
               evidence: ev(ds, best.id, bestVal.id),
            },
            {
               id: "f3",
               kind: "caveat",
               importance: 2,
               headline: `The rate counts line items with status Returned across ${items.token} lines; it is not weighted by value.`,
               evidence: ev(all, items.id),
            },
         ],
         datasets: [
            { id: ds, title: "Return rate by category", grain: "category" },
         ],
         openQuestions: ["Do returns cluster in particular months?"],
      },
      kpis: [
         { label: "Return rate", metric: { metricId: rate.id } },
         {
            label: "Most returned",
            metric: { metricId: worst.id },
            tone: "bad",
         },
         { label: "Its rate", metric: { metricId: worstVal.id }, tone: "bad" },
      ],
      chart: {
         title: "Return rate by category",
         mark: "bar",
         data: { datasetId: ds },
         x: "category",
         y: ["return_rate"],
         highlight: [{ metricId: worst.id }],
      },
      table: { datasetId: ds, title: "Return rate by category" },
      followUps: [
         "Which brands are returned most?",
         "How has the return rate moved month to month?",
      ],
   };
}

async function customersPlan({ q, m }: Helpers): Promise<Plan> {
   const ds = await q("top_customers", "Top customers by spend", "customer");
   const top = await m({
      datasetId: ds,
      op: "max_by",
      column: "total_sales",
      by: "full_name",
      label: "Top customer",
   });
   const topVal = await m({
      datasetId: ds,
      op: "max",
      column: "total_sales",
      label: "Top customer's spend",
   });
   const three = await m({
      datasetId: ds,
      op: "top_n",
      column: "total_sales",
      by: "full_name",
      n: 3,
      label: "Top three customers",
   });
   const kf = await q("key_figures", "Key figures", "total");
   const customers = await m({
      datasetId: kf,
      op: "first",
      column: "customer_count",
      label: "Customers",
   });
   const aov = await m({
      datasetId: kf,
      op: "first",
      column: "avg_order_value",
      label: "Average order value",
   });
   return {
      findings: {
         question: "Who are our top customers?",
         answer: `${top.token} is the top customer with ${topVal.token} in spend, out of ${customers.token} customers.`,
         findings: [
            {
               id: "f1",
               kind: "outlier",
               importance: 5,
               headline: `The top three customers are ${three.token}.`,
               evidence: ev(ds, three.id),
            },
            {
               id: "f2",
               kind: "comparison",
               importance: 3,
               headline: `Across all ${customers.token} customers, an order averages ${aov.token}.`,
               evidence: ev(kf, customers.id, aov.id),
            },
         ],
         datasets: [
            { id: ds, title: "Top customers by spend", grain: "customer" },
         ],
         openQuestions: [],
      },
      kpis: [
         { label: "Customers", metric: { metricId: customers.id } },
         { label: "Top customer", metric: { metricId: top.id } },
         { label: "Their spend", metric: { metricId: topVal.id } },
         { label: "Avg order value", metric: { metricId: aov.id } },
      ],
      chart: {
         title: "Top customers by spend",
         mark: "bar",
         data: { datasetId: ds },
         x: "full_name",
         y: ["total_sales"],
         highlight: [{ metricId: top.id }],
      },
      table: {
         datasetId: ds,
         title: "Top customers",
         columns: ["full_name", "total_sales", "order_count"],
      },
      followUps: [
         "What do top customers buy?",
         "How many orders does a typical customer place?",
      ],
   };
}

async function aovPlan({ q, m }: Helpers): Promise<Plan> {
   const ds = await q(
      "{ group_by: order_month is created_at.month; aggregate: avg_order_value; order_by: order_month }",
      "Average order value by month",
      "month",
   );
   const change = await m({
      datasetId: ds,
      op: "pct_change",
      column: "avg_order_value",
      label: "Change, first month to latest",
   });
   const last = await m({
      datasetId: ds,
      op: "last",
      column: "avg_order_value",
      label: "Latest month's AOV",
   });
   const peak = await m({
      datasetId: ds,
      op: "max_by",
      column: "avg_order_value",
      by: "order_month",
      label: "Month with the highest AOV",
   });
   const kf = await q("key_figures", "Key figures", "total");
   const aov = await m({
      datasetId: kf,
      op: "first",
      column: "avg_order_value",
      label: "Average order value",
   });
   return {
      findings: {
         question: "What's driving average order value?",
         answer: `An order averages ${aov.token}; the latest month is ${last.token}, ${change.token} since the first month in the data.`,
         findings: [
            {
               id: "f1",
               kind: "trend",
               importance: 4,
               headline: `Average order value moved ${change.token} from the first month to the latest.`,
               evidence: ev(ds, change.id),
            },
            {
               id: "f2",
               kind: "outlier",
               importance: 3,
               headline: `It was highest in ${peak.token}.`,
               evidence: ev(ds, peak.id),
            },
         ],
         datasets: [
            { id: ds, title: "Average order value by month", grain: "month" },
         ],
         openQuestions: ["Is the change from basket size or price per item?"],
      },
      kpis: [
         { label: "Avg order value", metric: { metricId: aov.id } },
         {
            label: "Latest month",
            metric: { metricId: last.id },
            compare: { metricId: change.id },
         },
      ],
      chart: {
         title: "Average order value by month",
         mark: "line",
         data: { datasetId: ds },
         x: "order_month",
         y: ["avg_order_value"],
         highlight: [{ metricId: peak.id }],
      },
      followUps: [
         "Which categories have the largest baskets?",
         "How has revenue trended month over month?",
      ],
   };
}

async function overviewPlan({ q, m }: Helpers): Promise<Plan> {
   const kf = await q("key_figures", "Key figures", "total");
   const revenue = await m({
      datasetId: kf,
      op: "first",
      column: "total_sales",
      label: "Revenue",
   });
   const margin = await m({
      datasetId: kf,
      op: "first",
      column: "total_margin",
      label: "Gross margin",
   });
   const orders = await m({
      datasetId: kf,
      op: "first",
      column: "order_count",
      label: "Orders",
   });
   const aov = await m({
      datasetId: kf,
      op: "first",
      column: "avg_order_value",
      label: "Average order value",
   });
   const years = await q("sales_by_year", "Revenue by year", "year");
   const growth = await m({
      datasetId: years,
      op: "pct_change",
      column: "total_sales",
      label: "Growth, first year to latest",
   });
   const best = await m({
      datasetId: years,
      op: "max_by",
      column: "total_sales",
      by: "order_year",
      label: "Best year",
   });
   return {
      findings: {
         question: "How is the business doing?",
         answer: `The business has booked ${revenue.token} across ${orders.token} orders, and annual revenue moved ${growth.token} from the first year to the latest.`,
         findings: [
            {
               id: "f1",
               kind: "trend",
               importance: 5,
               headline: `Annual revenue moved ${growth.token} from the first year in the data to the latest; ${best.token} was the best year.`,
               evidence: ev(years, growth.id, best.id),
            },
            {
               id: "f2",
               kind: "composition",
               importance: 3,
               headline: `Gross margin is ${margin.token} and an order averages ${aov.token}.`,
               evidence: ev(kf, margin.id, aov.id),
            },
         ],
         datasets: [{ id: years, title: "Revenue by year", grain: "year" }],
         openQuestions: [],
      },
      kpis: [
         {
            label: "Revenue",
            metric: { metricId: revenue.id },
            compare: { metricId: growth.id },
         },
         { label: "Gross margin", metric: { metricId: margin.id } },
         { label: "Orders", metric: { metricId: orders.id } },
         { label: "Avg order value", metric: { metricId: aov.id } },
      ],
      chart: {
         title: "Revenue by year",
         mark: "bar",
         data: { datasetId: years },
         x: "order_year",
         y: ["total_sales"],
         highlight: [{ metricId: best.id }],
      },
      followUps: [
         "How has revenue trended month over month?",
         "Which categories earn the best margin?",
         "Compare revenue across regions",
      ],
   };
}

function pickPlan(question: string): (h: Helpers) => Promise<Plan> {
   const t = question.toLowerCase();
   if (/return|refund/.test(t)) return returnsPlan;
   if (/customer|buyer|client/.test(t)) return customersPlan;
   if (/order value|aov|basket/.test(t)) return aovPlan;
   if (/region|west|south|east|midwest|geograph|state/.test(t))
      return (h) =>
         breakdownPlan(h, {
            query: "sales_by_region",
            title: "Revenue by region",
            by: "region",
            noun: "region",
            followUps: [
               "Which categories sell best in the top region?",
               "How has each region trended?",
            ],
         });
   if (/brand/.test(t))
      return (h) =>
         breakdownPlan(h, {
            query: "brand_performance",
            title: "Margin by brand",
            by: "brand",
            noun: "brand",
            rate: { column: "margin_rate", label: "margin rate" },
            followUps: [
               "Which categories earn the best margin?",
               "Which brands are returned most?",
            ],
         });
   if (/margin|categor|profit/.test(t))
      return (h) =>
         breakdownPlan(h, {
            query: "category_performance",
            title: "Margin by category",
            by: "category",
            noun: "category",
            rate: { column: "margin_rate", label: "margin rate" },
            followUps: [
               "Which brands earn the best margin?",
               "What share of line items get returned?",
            ],
         });
   if (/trend|month|over time|growth|season|peak|week/.test(t))
      return trendPlan;
   return overviewPlan;
}

/** The deterministic presenter: the same registry, laid out by the analyst's rules. */
function layout(
   plan: Plan,
   allowed: ReadonlySet<BlockType>,
   maxBlocks: number,
): ReportSpec {
   const { findings } = plan;
   const sections: ReportSpec["sections"] = [];
   let budget = maxBlocks;
   const take = <T>(xs: T[]) => {
      const kept = xs.slice(0, Math.max(0, budget));
      budget -= kept.length;
      return kept;
   };
   if (allowed.has("kpi") && plan.kpis.length) {
      sections.push({
         layout: "row",
         blocks: take(plan.kpis.map((k) => ({ type: "kpi" as const, ...k }))),
      });
   }
   if (allowed.has("chart") && plan.chart) {
      sections.push({
         layout: "stack",
         blocks: take([{ type: "chart" as const, ...plan.chart }]),
      });
   }
   if (allowed.has("insight")) {
      const insights = [...findings.findings]
         .sort((a, b) => b.importance - a.importance)
         .map((f) => ({
            type: "insight" as const,
            findingId: f.id,
            text: f.headline,
            severity:
               f.kind === "caveat"
                  ? ("warning" as const)
                  : f.importance >= 5
                    ? ("positive" as const)
                    : ("info" as const),
         }));
      sections.push({
         heading: "What stands out",
         layout: "stack",
         blocks: take(insights),
      });
   } else if (allowed.has("summary")) {
      sections.push({
         layout: "stack",
         blocks: take([
            {
               type: "summary" as const,
               text: findings.findings.map((f) => f.headline).join(" "),
            },
         ]),
      });
   }
   if (allowed.has("table") && plan.table) {
      sections.push({
         layout: "stack",
         blocks: take([
            {
               type: "table" as const,
               title: plan.table.title,
               data: { datasetId: plan.table.datasetId },
               columns: plan.table.columns,
            },
         ]),
      });
   }
   if (allowed.has("followUps") && plan.followUps.length) {
      sections.push({
         layout: "stack",
         blocks: take([
            {
               type: "followUps" as const,
               questions: plan.followUps.slice(0, 4),
            },
         ]),
      });
   }
   return {
      title: findings.question,
      answer: findings.answer,
      sections: sections.filter((s) => s.blocks.length),
   };
}

export async function scriptedRun(run: RunState, signal: AbortSignal) {
   const { config } = run;
   run.trace({
      kind: "note",
      level: "info",
      text: "No OPENROUTER_API_KEY is set, so a scripted planner called the tools in place of the explorer model. Set the key to run the analyst's models.",
   });
   run.emit("analyst:status", {
      phase: "explore",
      text: "Reading the question",
   });
   run.iterations++;
   run.trace({
      kind: "iteration",
      phase: "explore",
      index: 0,
      model: "scripted",
      tools: config.tools,
   });

   const call = async <T>(name: ToolName, args: unknown): Promise<T> => {
      if (signal.aborted) throw new Error("cancelled");
      if (!config.tools.includes(name))
         throw new Error(`${name} is not in the analyst's tools`);
      if (run.toolCalls >= config.budget.maxToolCalls)
         throw new Error("Tool budget reached");
      if (run.elapsedMs > config.budget.timeoutMs)
         throw new Error("Time limit reached");
      run.toolCalls++;
      run.emit("analyst:status", {
         phase: "explore",
         text: phrase(name, args),
      });
      const t0 = Date.now();
      const id = `t-${run.stepId()}`;
      try {
         const result = (await toolImpls[name](
            run,
            args as never,
            signal,
         )) as T;
         const r = result as { datasetId?: string; metricId?: string };
         run.trace({
            kind: "tool",
            id,
            toolName: name,
            args,
            ok: true,
            durationMs: Date.now() - t0,
            resultPreview: JSON.stringify(result).slice(0, 600),
            datasetId: r.datasetId,
            metricId: r.metricId,
         });
         await sleep(120);
         return result;
      } catch (e) {
         run.trace({
            kind: "tool",
            id,
            toolName: name,
            args,
            ok: false,
            durationMs: Date.now() - t0,
            resultPreview: "",
            error: errorText(e),
         });
         throw e;
      }
   };

   const { sources } = await call<{
      sources: { id: string; views: string[]; measures: string[] }[];
   }>("list_sources", {});
   const src = sources.find(
      (s) =>
         s.id.endsWith("#order_items") && s.measures.includes("total_sales"),
   );
   if (!src) {
      throw new Error(
         "The scripted planner only knows the storefront order_items source; set OPENROUTER_API_KEY to explore other models.",
      );
   }
   await call("describe_source", { source: src.id });
   const helpers: Helpers = {
      source: src.id,
      q: async (query, title, grain) =>
         (
            await call<{ datasetId: string }>("run_query", {
               source: src.id,
               query,
               title,
               grain,
            })
         ).datasetId,
      m: async (args) => {
         const r = await call<{ metricId: string; value: unknown }>(
            "compute_metric",
            args,
         );
         return { id: r.metricId, token: tok(r.metricId), value: r.value };
      },
   };
   const plan = await pickPlan(run.question)(helpers);
   const findings = { ...plan.findings, question: run.question };
   run.findings = findings;
   run.emit("analyst:status", {
      phase: "explore",
      text: "Writing up what it found",
   });
   run.emit("analyst:findings", findings);

   run.iterations++;
   run.trace({
      kind: "iteration",
      phase: "present",
      index: 0,
      model: "scripted",
      tools: [],
   });
   run.emit("analyst:status", {
      phase: "present",
      text: "Laying out the report",
   });
   const report = layout(plan, new Set(config.components), 12);
   const json = JSON.stringify(report);
   for (let i = 0; i < json.length; i += 48) {
      if (signal.aborted) throw new Error("cancelled");
      run.emit("analyst:report-delta", { delta: json.slice(i, i + 48) });
      await sleep(18);
   }
   finish(
      run,
      groundReport(
         report,
         groundingContext(
            run.question,
            run.datasets.values(),
            run.metrics.values(),
         ),
      ),
      undefined,
   );
}
