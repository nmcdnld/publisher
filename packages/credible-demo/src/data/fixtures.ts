// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Stub content until the Publisher connection lands. Every provenance names a
// real resource in the bundled `storefront` package, so each fixture maps onto
// an execute_query call against examples/storefront/storefront.malloy.

import { prevOccurrence } from "@/lib/schedule";
import { runSteps } from "./insight-runs";
import {
   analysisPageKey,
   pageKey,
   workspaceConsoleUrl,
   workspaceRoute,
} from "./publisher";
import type {
   Analysis,
   AnalysisComment,
   Collection,
   FeedPost,
   InsightCheck,
   InsightRun,
   InsightSchedule,
   LibraryItem,
   PageMeta,
   Person,
   Provenance,
   ResumeItem,
   StudioInsight,
   Thread,
   Topic,
   TrendingItem,
   Viewer,
   WhatChanged,
} from "./types";

const HOUR = 60 * 60 * 1000;

export function hoursAgo(hours: number): string {
   return new Date(Date.now() - hours * HOUR).toISOString();
}

export const storefront = (source: string, view?: string): Provenance => ({
   environment: "examples",
   package: "storefront",
   model: "storefront.malloy",
   source,
   view,
});

export const people: Person[] = [
   {
      id: "u-alex",
      name: "Noah Mac",
      initials: "NM",
      title: "Data Analyst",
      hue: 1,
   },
   {
      id: "u-maya",
      name: "Maya Chen",
      initials: "MC",
      title: "Finance Lead",
      hue: 2,
   },
   {
      id: "u-jordan",
      name: "Jordan Blake",
      initials: "JB",
      title: "Operations",
      hue: 3,
   },
   {
      id: "u-sam",
      name: "Sam Okafor",
      initials: "SO",
      title: "Merchandising",
      hue: 4,
   },
   {
      id: "u-lena",
      name: "Noah Mac",
      initials: "NM",
      title: "Data Team",
      hue: 1,
   },
   { id: "u-diego", name: "Diego Ramos", initials: "DR", title: "CEO", hue: 2 },
];

export const VIEWER_ID = "u-alex";

export const initialViewer = (): Viewer => ({
   person: people[0],
   followedTopicIds: ["revenue", "refunds"],
   briefing: {
      enabled: false,
      channel: "slack",
      destination: "#growth-daily",
      time: "08:00",
   },
});

export const topics: Topic[] = [
   {
      id: "revenue",
      label: "revenue",
      description: "Sales, orders, and order value",
   },
   { id: "refunds", label: "refunds", description: "Returns and refund rates" },
   {
      id: "margins",
      label: "margins",
      description: "Gross margin and cost of goods",
   },
   {
      id: "regions",
      label: "regions",
      description: "Performance by sales region",
   },
   { id: "brands", label: "brands", description: "Brand and category mix" },
   {
      id: "customers",
      label: "customers",
      description: "Customer counts and loyalty",
   },
];

export const whatChanged: WhatChanged = {
   summary:
      "Revenue is up 12% week over week, driven by the West region. Return rate crept back up in Outerwear, and margin rate is holding at 51%.",
   highlights: [
      {
         label: "Revenue",
         delta: {
            value: 0.12,
            unit: "percent",
            period: "WoW",
            polarity: "up_is_good",
         },
      },
      {
         label: "Return rate",
         delta: {
            value: 0.006,
            unit: "pp",
            period: "WoW",
            polarity: "down_is_good",
         },
      },
      {
         label: "Margin rate",
         delta: {
            value: -0.001,
            unit: "pp",
            period: "WoW",
            polarity: "up_is_good",
         },
      },
   ],
   asOf: hoursAgo(6),
};

export const suggestedQuestions = [
   "How has revenue trended month over month?",
   "Which categories earn the best margin?",
   "Compare revenue across regions",
   "What share of line items get returned?",
   "Who are our top customers?",
];

const weeks = [
   "Aug 3",
   "Aug 10",
   "Aug 17",
   "Aug 24",
   "Aug 31",
   "Sep 7",
   "Sep 14",
   "Sep 21",
];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];

export const analyses: Analysis[] = [
   {
      id: "an-revenue-west",
      title: "Revenue up 12% week over week",
      narrative:
         "Revenue is up 12% week over week, and the West region accounts for almost two thirds of the gain.",
      details: [
         "West grew 23% on the back of Outerwear & Coats and Jeans; every other region grew between 4% and 9%.",
         "Order count rose 8% while average order value rose 4%, so the gain is mostly more orders, not bigger ones.",
         "The West lift started the week of Sep 14, the same week the fall catalogue went live.",
      ],
      evidence: {
         kind: "bar",
         xKey: "region",
         series: [
            { key: "last_week", label: "Last week" },
            { key: "this_week", label: "This week" },
         ],
         rows: [
            { region: "West", last_week: 182400, this_week: 224300 },
            { region: "South", last_week: 171900, this_week: 187200 },
            { region: "Midwest", last_week: 121300, this_week: 126100 },
            { region: "Northeast", last_week: 98700, this_week: 105600 },
         ],
         format: "currency",
         caption: "total_sales by region, last two full weeks",
         visual: { kind: "contribution", from: "last_week", to: "this_week" },
         highlight: "West",
      },
      malloy: `run: order_items -> {
  where: created_at ? @2026-09-14 for 2 weeks
  group_by: region
  aggregate:
    last_week is total_sales { where: created_at ? @2026-09-14 for 1 week }
    this_week is total_sales { where: created_at ? @2026-09-21 for 1 week }
}`,
      provenance: storefront("order_items", "sales_by_region"),
      authorId: "ai",
      createdAt: hoursAgo(6),
      topics: ["revenue", "regions"],
   },
   {
      id: "an-refunds-march",
      title: "Refunds spiked in March, then settled",
      narrative:
         "Return rate hit 14.2% in March, nearly double the usual 8%, and three quarters of the extra returns were Outerwear & Coats.",
      details: [
         "The spike lines up with the spring clearance promotion, which sold winter stock at 40% off.",
         "Return rate outside Outerwear barely moved (7.9% to 8.4%).",
         "It has been back under 9% since May, but crept up 0.6 points this week.",
      ],
      evidence: {
         kind: "line",
         xKey: "month",
         series: [{ key: "return_rate", label: "Return rate" }],
         rows: months.map((month, i) => ({
            month,
            return_rate: [
               0.081, 0.084, 0.142, 0.103, 0.086, 0.082, 0.079, 0.083, 0.089,
            ][i],
         })),
         format: "percent",
         caption: "return_rate by month, 2026",
         visual: {
            kind: "anomaly",
            series: "return_rate",
            normal: [0.075, 0.087],
            normalLabel: "usual range",
            polarity: "down_is_good",
            events: [{ x: "Mar", label: "Spring clearance" }],
         },
         highlight: "Sep",
      },
      malloy: `run: order_items -> {
  group_by: month is created_at.month
  aggregate: return_rate
  order_by: month
}`,
      provenance: storefront("order_items", "by_status"),
      authorId: "ai",
      createdAt: hoursAgo(9),
      topics: ["refunds"],
   },
   {
      id: "an-outerwear-margin",
      title: "Outerwear margin slipping",
      narrative:
         "Outerwear & Coats margin rate fell 2.1 points this month while every other top category held steady.",
      details: [
         "Cost per unit is flat, so the drop is price: the average Outerwear sale price fell 5%.",
         "Outerwear is 18% of revenue, so it pulls the overall margin rate down by about 0.4 points.",
      ],
      evidence: {
         kind: "bar",
         xKey: "category",
         series: [
            { key: "last_month", label: "August" },
            { key: "this_month", label: "September" },
         ],
         rows: [
            { category: "Outerwear", last_month: 0.548, this_month: 0.527 },
            { category: "Jeans", last_month: 0.512, this_month: 0.515 },
            { category: "Sweaters", last_month: 0.497, this_month: 0.499 },
            { category: "Active", last_month: 0.531, this_month: 0.528 },
            { category: "Accessories", last_month: 0.603, this_month: 0.606 },
         ],
         format: "percent",
         caption: "margin_rate by category, August vs September",
         visual: {
            kind: "divergence",
            from: "last_month",
            to: "this_month",
            noise: 0.005,
            polarity: "up_is_good",
         },
         highlight: "Outerwear",
      },
      malloy: `run: order_items -> category_performance + {
  where: created_at ? @2026-08 to @2026-10
}`,
      provenance: storefront("order_items", "category_performance"),
      authorId: "ai",
      createdAt: hoursAgo(11),
      topics: ["margins", "brands"],
   },
   {
      id: "an-monday-digest",
      title: "Last week was the best since the holidays",
      narrative:
         "Last week closed at $643K, the best week since the holidays. Saturday alone was $118K.",
      details: [
         "Weekend share of revenue rose to 34%, up from 29% a month ago.",
         "New customers placed 41% of orders, in line with the trailing average.",
      ],
      evidence: {
         kind: "area",
         xKey: "week",
         series: [{ key: "total_sales", label: "Revenue" }],
         rows: weeks.map((week, i) => ({
            week,
            total_sales: [
               512000, 534000, 521000, 548000, 559000, 551000, 574000, 643200,
            ][i],
         })),
         format: "currency",
         caption: "total_sales by week",
      },
      malloy: `run: order_items -> {
  group_by: week is created_at.week
  aggregate: total_sales
  order_by: week
  limit: 8
}`,
      provenance: storefront("order_items", "sales_by_month"),
      authorId: "ai",
      createdAt: hoursAgo(30),
      topics: ["revenue"],
   },
   {
      id: "an-q3-margin-bridge",
      title: "Q3 margin bridge",
      narrative:
         "Q3 gross margin grew $212K, but mix, not price, did the work: Accessories grew fastest and carries our best margin.",
      details: [
         "Holding mix constant, margin would have grown $61K.",
         "Accessories went from 9% to 12% of revenue.",
      ],
      evidence: {
         kind: "bar",
         xKey: "driver",
         series: [{ key: "impact", label: "Margin impact" }],
         rows: [
            { driver: "Volume", impact: 104000 },
            { driver: "Mix", impact: 151000 },
            { driver: "Price", impact: -21000 },
            { driver: "Cost", impact: -22000 },
         ],
         format: "currency",
         caption: "Change in total_margin, Q2 to Q3",
         visual: {
            kind: "waterfall",
            series: "impact",
            totalLabel: "Net",
         },
         highlight: "Mix",
      },
      malloy: `run: order_items -> {
  where: created_at ? @2026-Q2 to @2026-Q4
  group_by: quarter is created_at.quarter, category
  aggregate: total_sales, total_margin, margin_rate
}`,
      provenance: storefront("order_items", "margin_by_category"),
      authorId: "u-maya",
      createdAt: hoursAgo(20),
      topics: ["margins"],
   },
   {
      id: "an-midwest-returns",
      title: "Midwest returns and late deliveries",
      narrative:
         "Orders that shipped late in the Midwest were returned at 2.3x the rate of on-time orders.",
      details: [
         "Late shipments are 11% of Midwest orders, against 4% nationally.",
         "Fixing the Chicago carrier handoff would remove most of the gap.",
      ],
      evidence: {
         kind: "bar",
         xKey: "region",
         series: [
            { key: "on_time", label: "On time" },
            { key: "late", label: "Late" },
         ],
         rows: [
            { region: "Midwest", on_time: 0.074, late: 0.171 },
            { region: "South", on_time: 0.081, late: 0.118 },
            { region: "West", on_time: 0.078, late: 0.112 },
            { region: "Northeast", on_time: 0.083, late: 0.109 },
         ],
         format: "percent",
         caption: "return_rate by region and delivery timeliness",
      },
      malloy: `run: order_items -> {
  group_by: region
  aggregate:
    on_time is return_rate { where: delivered_at - shipped_at < 5 days }
    late is return_rate { where: delivered_at - shipped_at >= 5 days }
}`,
      provenance: storefront("order_items", "sales_by_region"),
      authorId: "u-jordan",
      createdAt: hoursAgo(50),
      topics: ["refunds", "regions"],
   },
   {
      id: "an-brand-share",
      title: "Top brands this month",
      narrative:
         "The top five brands hold 22% of sales this month; Calvin Klein passed Levi's for the first time this year.",
      details: [
         "Brand concentration is steady; no brand has more than 6% share.",
      ],
      evidence: {
         kind: "bar",
         xKey: "brand",
         series: [{ key: "percent_of_sales", label: "Share of sales" }],
         rows: [
            { brand: "Calvin Klein", percent_of_sales: 0.058 },
            { brand: "Levi's", percent_of_sales: 0.055 },
            { brand: "Carhartt", percent_of_sales: 0.041 },
            { brand: "Columbia", percent_of_sales: 0.036 },
            { brand: "Nike", percent_of_sales: 0.031 },
         ],
         format: "percent",
         caption: "percent_of_sales by brand, September",
      },
      malloy: `run: order_items -> brand_performance + {
  where: created_at ? @2026-09
  limit: 5
}`,
      provenance: storefront("order_items", "brand_performance"),
      authorId: "ai",
      createdAt: hoursAgo(34),
      topics: ["brands"],
   },
   {
      id: "an-aov",
      title: "Average order value is climbing",
      narrative:
         "Average order value reached $86.40, up 4% in a month, because more orders now include a second item.",
      details: ["Items per order went from 1.41 to 1.49."],
      evidence: {
         kind: "line",
         xKey: "week",
         series: [{ key: "avg_order_value", label: "Avg order value" }],
         rows: weeks.map((week, i) => ({
            week,
            avg_order_value: [82.1, 82.9, 82.4, 83.6, 84.2, 84.9, 85.7, 86.4][
               i
            ],
         })),
         format: "currency",
         caption: "avg_order_value by week",
      },
      malloy: `run: order_items -> {
  group_by: week is created_at.week
  aggregate: avg_order_value, items_per_order is order_item_count / order_count
  order_by: week
}`,
      provenance: storefront("order_items", "key_figures"),
      authorId: "u-lena",
      createdAt: hoursAgo(76),
      topics: ["revenue", "customers"],
   },
];

/** The answer in the "Why is West outperforming?" chat, as the viewer kept it. */
analyses.push({
   id: "an-west",
   title: "Why is West outperforming?",
   narrative:
      "West revenue grew 23% week over week. Outerwear & Coats and Jeans account for 71% of that growth, and the lift began the week the fall catalogue went live.",
   details: [],
   evidence: analyses[0].evidence,
   malloy: analyses[0].malloy,
   provenance: analyses[0].provenance,
   authorId: VIEWER_ID,
   createdAt: hoursAgo(15),
   topics: ["revenue", "regions"],
});

export const insightSchedule: InsightSchedule = {
   enabled: true,
   cadence: "daily",
   time: "06:00",
   weekday: 1,
   recipe: {
      focus: "",
      sources: [],
      detectors: ["change", "anomaly", "mix", "driver"],
   },
   autoFeature: 3,
   minScore: 0.6,
   notify: false,
   updatedAt: hoursAgo(24 * 14),
};

const DAY_MS = 24 * HOUR;
const lastScheduled = prevOccurrence(insightSchedule);
const scheduledAgo = (days: number) =>
   new Date(lastScheduled.getTime() - days * DAY_MS).toISOString();
/** The evening before the last scheduled run, so that run's findings lead For you. */
const lastEvening = scheduledAgo(9 / 24);

const checks = (view: string): InsightCheck[] => [
   { label: "Compiles against the published model", passed: true },
   {
      label: "Answered from a governed view",
      passed: true,
      detail: `order_items › ${view}`,
   },
   {
      label: "No fan-out through joins",
      passed: true,
      detail: "Every measure aggregates at its own grain",
   },
   { label: "Re-ran and matched", passed: true },
];

const everything = insightSchedule.recipe;

export const insightRuns: InsightRun[] = [
   {
      id: "run-3",
      trigger: "schedule",
      startedBy: "ai",
      recipe: everything,
      startedAt: scheduledAgo(0),
      durationMs: 41_000,
      status: "done",
      steps: runSteps(everything, 2),
      insightIds: ["in-1", "in-5"],
      featuredIds: ["in-1"],
   },
   {
      id: "run-2",
      trigger: "manual",
      startedBy: VIEWER_ID,
      recipe: {
         focus: "returns and margin",
         sources: ["order_items"],
         detectors: ["change", "anomaly"],
      },
      startedAt: lastEvening,
      durationMs: 28_000,
      status: "done",
      steps: runSteps(
         {
            focus: "returns and margin",
            sources: ["order_items"],
            detectors: ["change", "anomaly"],
         },
         2,
      ),
      insightIds: ["in-2", "in-3"],
      featuredIds: [],
   },
   {
      id: "run-1",
      trigger: "schedule",
      startedBy: "ai",
      recipe: everything,
      startedAt: scheduledAgo(1),
      durationMs: 39_000,
      status: "done",
      steps: runSteps(everything, 2),
      insightIds: ["in-4", "in-6"],
      featuredIds: [],
   },
   {
      id: "run-0",
      trigger: "schedule",
      startedBy: "ai",
      recipe: everything,
      startedAt: scheduledAgo(2),
      durationMs: 6_000,
      status: "failed",
      steps: runSteps(everything, 0).slice(0, 1),
      error: "Publisher didn't answer: the examples environment was reloading. The next scheduled run went ahead as normal.",
      insightIds: [],
      featuredIds: [],
   },
];

export const studioInsights: StudioInsight[] = [
   {
      id: "in-1",
      analysisId: "an-revenue-west",
      status: "featured",
      detector: "change",
      score: 0.88,
      reasons: [
         "Largest week-over-week move in total_sales since the holidays (+12%)",
         "One region explains most of it: West is 64% of the gain",
         "Lines up with a known event, the fall catalogue launch",
      ],
      checks: checks("sales_by_region"),
      runId: "run-3",
      generatedAt: scheduledAgo(0),
      delta: {
         value: 0.12,
         unit: "percent",
         period: "WoW",
         polarity: "up_is_good",
      },
      headline: "West drove two thirds of the gain",
      metric: {
         label: "Revenue, last week",
         value: 643200,
         format: "currency",
         trend: [
            512000, 534000, 521000, 548000, 559000, 551000, 574000, 643200,
         ],
      },
   },
   {
      id: "in-2",
      analysisId: "an-refunds-march",
      status: "featured",
      detector: "anomaly",
      score: 0.82,
      reasons: [
         "Return rate rose 0.6 points in a week, toward the top of its normal range",
         "The same measure spiked to 14.2% in March, so a repeat is worth catching early",
         "Matched your steer: returns",
      ],
      checks: checks("by_status"),
      runId: "run-2",
      generatedAt: lastEvening,
      delta: {
         value: 0.006,
         unit: "pp",
         period: "WoW",
         polarity: "down_is_good",
      },
      headline: "Returns are drifting out of range again",
      metric: {
         label: "Return rate, September",
         value: 0.089,
         format: "percent",
         trend: [0.081, 0.084, 0.142, 0.103, 0.086, 0.082, 0.079, 0.083, 0.089],
      },
   },
   {
      id: "in-3",
      analysisId: "an-outerwear-margin",
      status: "featured",
      detector: "change",
      score: 0.77,
      reasons: [
         "Outerwear margin rate fell 2.1 points while every other top category stayed within 0.5",
         "Outerwear is 18% of revenue, so it moves the overall margin rate",
         "Matched your steer: margin",
      ],
      checks: checks("category_performance"),
      runId: "run-2",
      generatedAt: lastEvening,
      delta: {
         value: -0.021,
         unit: "pp",
         period: "MoM",
         polarity: "up_is_good",
      },
      headline: "Outerwear broke away from the pack",
      metric: {
         label: "Outerwear margin rate",
         value: 0.527,
         format: "percent",
         trend: [0.551, 0.553, 0.549, 0.552, 0.55, 0.551, 0.549, 0.548, 0.527],
      },
   },
   {
      id: "in-4",
      analysisId: "an-aov",
      status: "candidate",
      detector: "driver",
      score: 0.58,
      reasons: [
         "Average order value up 4% in a month",
         "Items per order explains most of it (1.41 to 1.49)",
      ],
      checks: checks("key_figures"),
      runId: "run-1",
      generatedAt: scheduledAgo(1),
      delta: {
         value: 0.04,
         unit: "percent",
         period: "MoM",
         polarity: "up_is_good",
      },
      headline: "Customers are adding a second item",
      metric: {
         label: "Avg order value",
         value: 86.4,
         format: "currency",
         trend: [82.1, 82.9, 82.4, 83.6, 84.2, 84.9, 85.7, 86.4],
      },
   },
   {
      id: "in-5",
      analysisId: "an-brand-share",
      status: "candidate",
      detector: "mix",
      score: 0.55,
      reasons: [
         "Calvin Klein passed Levi's in share of sales for the first time this year",
         "Concentration is steady overall, which caps how much this matters",
      ],
      checks: checks("brand_performance"),
      runId: "run-3",
      generatedAt: scheduledAgo(0),
      delta: {
         value: 0.004,
         unit: "pp",
         period: "MoM",
         polarity: "up_is_good",
      },
      headline: "Calvin Klein is the new top brand",
      metric: {
         label: "Calvin Klein share of sales",
         value: 0.058,
         format: "percent",
         trend: [0.047, 0.049, 0.05, 0.052, 0.053, 0.054, 0.056, 0.058],
      },
   },
   {
      id: "in-6",
      analysisId: "an-monday-digest",
      status: "dismissed",
      detector: "change",
      score: 0.48,
      reasons: [
         "Best week since the holidays ($643K)",
         "Overlaps with the West revenue finding, so it adds little on its own",
      ],
      checks: checks("sales_by_month"),
      runId: "run-1",
      generatedAt: scheduledAgo(1),
      delta: {
         value: 0.12,
         unit: "percent",
         period: "WoW",
         polarity: "up_is_good",
      },
      headline: "Best week since the holidays",
      metric: {
         label: "Revenue, last week",
         value: 643200,
         format: "currency",
         trend: [
            512000, 534000, 521000, 548000, 559000, 551000, 574000, 643200,
         ],
      },
   },
];

export const trending: TrendingItem[] = [
   {
      id: "tr-1",
      title: "Storefront overview",
      kind: "dashboard",
      views: 214,
      viewerIds: ["u-diego", "u-maya", "u-sam", "u-jordan"],
      href: "/library?item=li-overview",
   },
   {
      id: "tr-2",
      title: "Q3 margin bridge",
      kind: "insight",
      views: 131,
      viewerIds: ["u-diego", "u-lena", "u-alex"],
      href: "/analysis/an-q3-margin-bridge",
   },
   {
      id: "tr-3",
      title: "Midwest returns and late deliveries",
      kind: "insight",
      views: 96,
      viewerIds: ["u-jordan", "u-maya"],
      href: "/analysis/an-midwest-returns",
   },
   {
      id: "tr-4",
      title: "Brand scorecard",
      kind: "data_app",
      views: 88,
      viewerIds: ["u-sam", "u-lena", "u-diego"],
      href: "/library?item=li-brand-app",
   },
   {
      id: "tr-5",
      title: "Weekly exec KPIs",
      kind: "query",
      views: 73,
      viewerIds: ["u-diego", "u-alex"],
      href: "/library?item=li-exec-kpis",
   },
   {
      id: "tr-6",
      title: "Average order value is climbing",
      kind: "insight",
      views: 52,
      viewerIds: ["u-lena", "u-sam"],
      href: "/analysis/an-aov",
   },
];

export const resume: ResumeItem[] = [
   {
      id: "rs-1",
      title: "Why is West outperforming?",
      kind: "thread",
      context: "2 messages · order_items",
      lastOpenedAt: hoursAgo(15),
      href: "/chat/th-west",
   },
   {
      id: "rs-2",
      title: "Top customers, last 90 days",
      kind: "query",
      context: "order_items · top_customers",
      lastOpenedAt: hoursAgo(22),
      href: "/library?item=li-top-customers",
   },
   {
      id: "rs-3",
      title: "Average order value is climbing",
      kind: "exploration",
      context: "order_items · key_figures",
      lastOpenedAt: hoursAgo(40),
      href: "/analysis/an-aov",
   },
   {
      id: "rs-4",
      title: "Seasonality by category",
      kind: "query",
      context: "order_items · seasonality",
      lastOpenedAt: hoursAgo(70),
      href: "/library?item=li-seasonality",
   },
];

export const feed: FeedPost[] = [
   {
      id: "fp-1",
      analysisId: "an-revenue-west",
      publishedAt: hoursAgo(6),
      reactions: 14,
      comments: 3,
   },
   {
      id: "fp-2",
      analysisId: "an-q3-margin-bridge",
      publishedAt: hoursAgo(20),
      reactions: 22,
      comments: 7,
   },
   {
      id: "fp-3",
      analysisId: "an-monday-digest",
      publishedAt: hoursAgo(30),
      reactions: 9,
      comments: 1,
   },
   {
      id: "fp-4",
      analysisId: "an-brand-share",
      publishedAt: hoursAgo(34),
      reactions: 5,
      comments: 0,
   },
   {
      id: "fp-5",
      analysisId: "an-midwest-returns",
      publishedAt: hoursAgo(50),
      reactions: 18,
      comments: 11,
   },
   {
      id: "fp-6",
      analysisId: "an-aov",
      publishedAt: hoursAgo(76),
      reactions: 7,
      comments: 2,
   },
];

export const collections: Collection[] = [
   {
      id: "co-board",
      name: "Board prep",
      description: "The numbers Diego takes into the quarterly board meeting.",
      ownerId: "u-maya",
      scope: "workspace",
   },
   {
      id: "co-growth",
      name: "Growth experiments",
      description: "Readouts for every live pricing and promo test.",
      ownerId: "u-alex",
      scope: "workspace",
   },
   {
      id: "co-margin",
      name: "Margin watch",
      description: "Category and brand margin, checked weekly.",
      ownerId: "u-sam",
      scope: "workspace",
   },
   {
      id: "co-mine",
      name: "My Monday routine",
      description: "What I open first thing every week.",
      ownerId: "u-alex",
      scope: "personal",
   },
];

export const library: LibraryItem[] = [
   {
      id: "li-overview",
      title: "Storefront overview",
      description: "KPIs, monthly trend, geography, and top sellers.",
      kind: "dashboard",
      ownerId: "u-lena",
      scope: "workspace",
      updatedAt: hoursAgo(26),
      reliedOnBy: 38,
      provenance: storefront("order_items", "business_overview"),
      collectionIds: ["co-board", "co-mine"],
      href: workspaceRoute("storefront", "dashboard", "overview"),
      publisherUrl: workspaceConsoleUrl("storefront", "dashboard", "overview"),
   },
   {
      id: "li-margin-bridge",
      title: "Q3 margin bridge",
      description:
         "Volume, mix, price, and cost contributions to margin change.",
      kind: "insight",
      ownerId: "u-maya",
      scope: "workspace",
      updatedAt: hoursAgo(20),
      reliedOnBy: 12,
      provenance: storefront("order_items", "margin_by_category"),
      collectionIds: ["co-board", "co-margin"],
      href: "/analysis/an-q3-margin-bridge",
   },
   {
      id: "li-brand-app",
      title: "Brand scorecard",
      description: "Interactive brand performance app for merchandising.",
      kind: "data_app",
      ownerId: "u-sam",
      scope: "workspace",
      updatedAt: hoursAgo(98),
      reliedOnBy: 21,
      provenance: storefront("order_items", "brand_performance"),
      collectionIds: ["co-margin"],
      href: "/analysis/an-brand-share",
   },
   {
      id: "li-exec-kpis",
      title: "Weekly exec KPIs",
      description: "Revenue, orders, AOV, margin rate, and return rate.",
      kind: "query",
      ownerId: "u-lena",
      scope: "workspace",
      updatedAt: hoursAgo(170),
      reliedOnBy: 44,
      provenance: storefront("order_items", "key_figures"),
      collectionIds: ["co-board"],
      href: "/analysis/an-aov",
   },
   {
      id: "li-midwest",
      title: "Midwest returns and late deliveries",
      description: "Late shipments drive Midwest returns.",
      kind: "insight",
      ownerId: "u-jordan",
      scope: "workspace",
      updatedAt: hoursAgo(50),
      reliedOnBy: 9,
      provenance: storefront("order_items", "sales_by_region"),
      collectionIds: [],
      href: "/analysis/an-midwest-returns",
   },
   {
      id: "li-promo-test",
      title: "Free-shipping threshold test",
      description: "A/B readout: $50 vs $75 free-shipping threshold.",
      kind: "insight",
      ownerId: "u-alex",
      scope: "workspace",
      updatedAt: hoursAgo(120),
      reliedOnBy: 6,
      provenance: storefront("order_items", "key_figures"),
      collectionIds: ["co-growth"],
      href: "/analysis/an-aov",
   },
   {
      id: "li-top-customers",
      title: "Top customers, last 90 days",
      description: "Highest-spending customers and their order counts.",
      kind: "query",
      ownerId: "u-alex",
      scope: "personal",
      updatedAt: hoursAgo(22),
      reliedOnBy: 1,
      provenance: storefront("order_items", "top_customers"),
      collectionIds: ["co-mine"],
      href: "/analysis/an-aov",
   },
   {
      id: "li-seasonality",
      title: "Seasonality by category",
      description: "Which categories peak in which months.",
      kind: "query",
      ownerId: "u-alex",
      scope: "personal",
      updatedAt: hoursAgo(70),
      reliedOnBy: 2,
      provenance: storefront("order_items", "seasonality"),
      collectionIds: ["co-growth"],
      href: "/analysis/an-monday-digest",
   },
   {
      id: "li-west",
      title: "Why is West outperforming?",
      description: "Saved from chat: breaking down the West lift by category.",
      kind: "insight",
      ownerId: "u-alex",
      scope: "personal",
      updatedAt: hoursAgo(15),
      reliedOnBy: 1,
      provenance: storefront("order_items", "sales_by_region"),
      collectionIds: ["co-mine"],
      href: "/analysis/an-west",
   },
   {
      id: "li-refunds",
      title: "Refunds spiked in March, then settled",
      description: "Return rate by month with the Outerwear breakdown.",
      kind: "insight",
      ownerId: "u-alex",
      scope: "personal",
      updatedAt: hoursAgo(9),
      reliedOnBy: 3,
      provenance: storefront("order_items", "by_status"),
      collectionIds: [],
      href: "/analysis/an-refunds-march",
   },
];

export const threads: Thread[] = [
   {
      id: "th-west",
      title: "Why is West outperforming?",
      createdAt: hoursAgo(16),
      updatedAt: hoursAgo(15),
      messages: [
         {
            id: "m-1",
            role: "user",
            text: "Why is West outperforming?",
            createdAt: hoursAgo(16),
         },
         {
            id: "m-2",
            role: "assistant",
            text: "West revenue grew 23% week over week. Outerwear & Coats and Jeans account for 71% of that growth, and the lift began the week the fall catalogue went live.",
            createdAt: hoursAgo(16),
            confidence: {
               level: "high",
               score: 0.91,
               reason: "Answered from a governed view with no custom joins.",
            },
            evidence: analyses[0].evidence,
            malloy: analyses[0].malloy,
            provenance: analyses[0].provenance,
            status: "accepted",
            analysisId: "an-west",
         },
      ],
   },
];

/** Owners, status and tags for the bundled storefront package's real pages. */
export const pageMeta: Record<string, PageMeta> = {
   [pageKey("storefront", "dashboard", "overview")]: {
      ownerId: "u-lena",
      status: "production",
      tags: ["revenue", "exec"],
      updatedAt: hoursAgo(26),
   },
   [pageKey("storefront", "query", "storefront.malloy")]: {
      ownerId: "u-maya",
      status: "production",
      tags: ["core model", "star schema"],
      updatedAt: hoursAgo(72),
   },
   [pageKey("storefront", "data_app", "index.html")]: {
      ownerId: "u-sam",
      status: "in_review",
      tags: ["merchandising"],
      updatedAt: hoursAgo(98),
   },
   [analysisPageKey("an-q3-margin-bridge")]: {
      ownerId: "u-maya",
      status: "in_review",
      tags: ["q3 close"],
      updatedAt: hoursAgo(18),
   },
};

/**
 * Who owns a package's pages when nobody has set their properties. Unlike
 * `pageMeta`, these hold in every workspace, not only the storefront samples.
 */
export const packageOwners: Record<string, string> = {
   "questionable-football": "u-lena",
   "signals-research": "u-maya",
};

export const comments: AnalysisComment[] = [
   {
      id: "cm-1",
      analysisId: "an-revenue-west",
      authorId: "u-maya",
      text: "Is the West lift net of the fall catalogue discount? If it's mostly Outerwear at promo prices, margin will tell a different story.",
      createdAt: hoursAgo(5),
   },
   {
      id: "cm-2",
      analysisId: "an-revenue-west",
      authorId: "u-sam",
      text: "It's mostly full price. The catalogue promo doesn't start until October. Jeans is the surprise here.",
      createdAt: hoursAgo(4),
   },
   {
      id: "cm-3",
      analysisId: "an-revenue-west",
      authorId: "u-diego",
      text: "Let's bring this to Thursday's staff meeting.",
      createdAt: hoursAgo(2),
   },
   {
      id: "cm-4",
      analysisId: "an-refunds-march",
      authorId: "u-jordan",
      text: "The March spike matches what the warehouse saw. We had a two-week backlog on restocking returns.",
      createdAt: hoursAgo(8),
   },
   {
      id: "cm-5",
      analysisId: "an-q3-margin-bridge",
      authorId: "u-lena",
      text: "The mix number checks out against the finance close. Moving this to production once Maya signs off.",
      createdAt: hoursAgo(17),
   },
   {
      id: "cm-6",
      analysisId: pageKey("storefront", "dashboard", "overview"),
      authorId: "u-diego",
      text: "This is the page I open before every exec sync. Could the margin tile default to last quarter instead of year to date?",
      createdAt: hoursAgo(22),
   },
   {
      id: "cm-7",
      analysisId: "an-west",
      authorId: "u-maya",
      text: "Is the Outerwear piece full price, or is the catalogue discount already in there? Margin would tell a different story.",
      createdAt: hoursAgo(14),
   },
   {
      id: "cm-8",
      analysisId: "an-west",
      authorId: "u-sam",
      text: "Full price. The catalogue promo doesn't start until October. Jeans is the surprise here.",
      createdAt: hoursAgo(12),
   },
   {
      id: "cm-9",
      analysisId: "an-west",
      authorId: "u-diego",
      text: "Saved it to storefront so it's in front of the regional leads before Thursday.",
      createdAt: hoursAgo(10),
   },
];
