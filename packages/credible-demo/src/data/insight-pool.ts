// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// What the fixture generator can "find". Each entry is a finding a run over
// the bundled storefront package could plausibly surface, with the analysis
// behind it, so a generated insight opens like any other. The Publisher-backed
// client replaces this with a real scan.

import { storefront } from "./fixtures";
import type {
   Analysis,
   Insight,
   InsightCheck,
   InsightDetector,
   InsightRecipe,
} from "./types";

export interface PoolFinding {
   key: string;
   detector: InsightDetector;
   score: number;
   reasons: string[];
   checks: InsightCheck[];
   /** Every source the query reads, joins included; defaults to its provenance source. */
   touches?: string[];
   insight: Pick<Insight, "delta" | "headline" | "metric">;
   analysis: Omit<Analysis, "id" | "createdAt" | "authorId">;
}

const grounded = (view: string): InsightCheck[] => [
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
const days = [
   "Sep 20",
   "Sep 21",
   "Sep 22",
   "Sep 23",
   "Sep 24",
   "Sep 25",
   "Sep 26",
   "Sep 27",
];

export const insightPool: PoolFinding[] = [
   {
      key: "jeans-surge",
      detector: "change",
      score: 0.84,
      reasons: [
         "Largest month-over-month move among the 9 categories (+18%)",
         "Jeans is 14% of revenue, so the move reaches the topline",
         "Three consecutive weeks of growth, so not a one-day spike",
      ],
      checks: grounded("category_performance"),
      insight: {
         delta: {
            value: 0.18,
            unit: "percent",
            period: "MoM",
            polarity: "up_is_good",
         },
         headline: "Jeans is the fastest-growing category",
         metric: {
            label: "Jeans revenue, September",
            value: 96400,
            format: "currency",
            trend: [71200, 74800, 73100, 76900, 78400, 81700, 81700, 96400],
         },
      },
      analysis: {
         title: "Jeans revenue up 18% month over month",
         narrative:
            "Jeans revenue grew 18% in September, the biggest move of any category, and it accounts for 41% of the month's total growth.",
         details: [
            "The lift is spread across brands: Levi's, Calvin Klein and Carhartt all grew double digits.",
            "Units grew 15% and average sale price 3%, so this is demand, not a price change.",
         ],
         evidence: {
            kind: "bar",
            xKey: "category",
            series: [
               { key: "august", label: "August" },
               { key: "september", label: "September" },
            ],
            rows: [
               { category: "Jeans", august: 81700, september: 96400 },
               { category: "Outerwear", august: 118200, september: 121900 },
               { category: "Sweaters", august: 64300, september: 67800 },
               { category: "Active", august: 58800, september: 60100 },
               { category: "Accessories", august: 52100, september: 55900 },
            ],
            format: "currency",
            caption: "total_sales by category, August vs September",
            visual: { kind: "contribution", from: "august", to: "september" },
            highlight: "Jeans",
         },
         malloy: `run: order_items -> {
  where: created_at ? @2026-08 to @2026-10
  group_by: category
  aggregate:
    august is total_sales { where: created_at ? @2026-08 }
    september is total_sales { where: created_at ? @2026-09 }
  order_by: september desc
  limit: 5
}`,
         provenance: storefront("order_items", "category_performance"),
         topics: ["revenue", "brands"],
      },
   },
   {
      key: "cancellations",
      detector: "anomaly",
      score: 0.79,
      reasons: [
         "Cancellation share is 1.6 points above its 26-week normal range",
         "The last time it left the range was the March clearance",
         "Concentrated in orders over $150, where cancellations cost the most",
      ],
      checks: grounded("by_status"),
      insight: {
         delta: {
            value: 0.016,
            unit: "pp",
            period: "WoW",
            polarity: "down_is_good",
         },
         headline: "Cancellations jumped out of their normal range",
         metric: {
            label: "Cancelled share, last week",
            value: 0.061,
            format: "percent",
            trend: [0.043, 0.041, 0.044, 0.042, 0.045, 0.043, 0.045, 0.061],
         },
      },
      analysis: {
         title: "Cancellations spiked last week",
         narrative:
            "6.1% of orders were cancelled last week, well above the usual 4 to 4.6%, and most of the extra cancellations were orders over $150.",
         details: [
            "The spike starts the day the new checkout flow shipped, Sep 22.",
            "Cancellations under $150 stayed inside their normal range.",
         ],
         evidence: {
            kind: "line",
            xKey: "week",
            series: [{ key: "cancelled_share", label: "Cancelled share" }],
            rows: weeks.map((week, i) => ({
               week,
               cancelled_share: [
                  0.043, 0.041, 0.044, 0.042, 0.045, 0.043, 0.045, 0.061,
               ][i],
            })),
            format: "percent",
            caption: "Share of orders cancelled, by week",
            visual: {
               kind: "anomaly",
               series: "cancelled_share",
               normal: [0.04, 0.046],
               normalLabel: "26-week range",
               polarity: "down_is_good",
               events: [{ x: "Sep 21", label: "New checkout" }],
            },
            highlight: "Sep 21",
         },
         malloy: `run: order_items -> {
  group_by: week is created_at.week
  aggregate:
    cancelled_share is order_count { where: status = 'Cancelled' }
      / nullif(order_count, 0)
  order_by: week
  limit: 8
}`,
         provenance: storefront("order_items", "by_status"),
         topics: ["refunds", "customers"],
      },
   },
   {
      key: "accessories-mix",
      detector: "mix",
      score: 0.71,
      reasons: [
         "Accessories share of sales reached a 12-month high",
         "Accessories carries the best margin rate (60%), so mix lifts margin",
         "The share has grown six months in a row",
      ],
      checks: grounded("category_performance"),
      insight: {
         delta: {
            value: 0.011,
            unit: "pp",
            period: "MoM",
            polarity: "up_is_good",
         },
         headline: "Accessories keeps taking share, at the best margin",
         metric: {
            label: "Accessories share of sales",
            value: 0.123,
            format: "percent",
            trend: [0.089, 0.091, 0.094, 0.098, 0.103, 0.107, 0.112, 0.123],
         },
      },
      analysis: {
         title: "Accessories share of sales at a 12-month high",
         narrative:
            "Accessories reached 12.3% of sales in September, up from 8.9% in March, and because it carries a 60% margin rate the shift alone added about 0.4 points to overall margin.",
         details: [
            "Growth is broad: belts, bags and hats all gained share.",
            "Accessories now attaches to 1 in 5 Outerwear orders, up from 1 in 8.",
         ],
         evidence: {
            kind: "area",
            xKey: "month",
            series: [{ key: "percent_of_sales", label: "Share of sales" }],
            rows: months.slice(1).map((month, i) => ({
               month,
               percent_of_sales: [
                  0.089, 0.091, 0.094, 0.098, 0.103, 0.107, 0.112, 0.123,
               ][i],
            })),
            format: "percent",
            caption: "Accessories percent_of_sales by month",
         },
         malloy: `run: order_items -> {
  group_by: month is created_at.month
  aggregate:
    accessories_share is total_sales { where: category = 'Accessories' }
      / nullif(total_sales, 0)
  order_by: month
}`,
         provenance: storefront("order_items", "category_performance"),
         topics: ["margins", "brands"],
      },
   },
   {
      key: "aov-drivers",
      detector: "driver",
      score: 0.68,
      reasons: [
         "Average order value rose $4.30 in a month",
         "Decomposed into items per order, price, and mix: items per order explains 70%",
      ],
      checks: grounded("key_figures"),
      insight: {
         delta: {
            value: 0.052,
            unit: "percent",
            period: "MoM",
            polarity: "up_is_good",
         },
         headline: "Bigger baskets, not higher prices, lifted order value",
         metric: {
            label: "Avg order value, September",
            value: 86.4,
            format: "currency",
            trend: [82.1, 82.9, 82.4, 83.6, 84.2, 84.9, 85.7, 86.4],
         },
      },
      analysis: {
         title: "What moved average order value",
         narrative:
            "Average order value rose $4.30 in September. Three dollars of that is customers adding a second item; price increases contributed less than a dollar.",
         details: [
            "Mix toward Outerwear added $0.90; discounting took back $0.40.",
         ],
         evidence: {
            kind: "bar",
            xKey: "driver",
            series: [{ key: "impact", label: "Change in AOV" }],
            rows: [
               { driver: "Items per order", impact: 3.0 },
               { driver: "Category mix", impact: 0.9 },
               { driver: "List price", impact: 0.8 },
               { driver: "Discounts", impact: -0.4 },
            ],
            format: "currency",
            caption: "Change in avg_order_value, August to September",
            visual: {
               kind: "waterfall",
               series: "impact",
               totalLabel: "Net",
            },
            highlight: "Items per order",
         },
         malloy: `run: order_items -> {
  where: created_at ? @2026-08 to @2026-10
  group_by: month is created_at.month
  aggregate:
    avg_order_value
    items_per_order is order_item_count / nullif(order_count, 0)
    avg_item_price is total_sales / nullif(order_item_count, 0)
}`,
         provenance: storefront("order_items", "key_figures"),
         topics: ["revenue", "customers"],
      },
   },
   {
      key: "south-loyalty",
      detector: "change",
      score: 0.63,
      reasons: [
         "Orders per customer rose in the South while every other region was flat",
         "The move is 3x the region's usual week-to-week noise",
      ],
      checks: grounded("sales_by_region"),
      insight: {
         delta: {
            value: 0.07,
            unit: "percent",
            period: "QoQ",
            polarity: "up_is_good",
         },
         headline: "Southern customers are coming back more often",
         metric: {
            label: "Orders per customer, South",
            value: 1.62,
            format: "number",
            trend: [1.49, 1.5, 1.51, 1.52, 1.55, 1.57, 1.6, 1.62],
         },
      },
      analysis: {
         title: "South repeat purchasing is up",
         narrative:
            "Customers in the South placed 1.62 orders each this quarter, up 7%, while the other regions stayed within a percent of last quarter.",
         details: [
            "The rise is concentrated in customers who first ordered in Q2.",
         ],
         evidence: {
            kind: "bar",
            xKey: "region",
            series: [
               { key: "q2", label: "Q2" },
               { key: "q3", label: "Q3" },
            ],
            rows: [
               { region: "South", q2: 1.51, q3: 1.62 },
               { region: "West", q2: 1.58, q3: 1.59 },
               { region: "Midwest", q2: 1.46, q3: 1.45 },
               { region: "Northeast", q2: 1.53, q3: 1.54 },
            ],
            format: "number",
            caption: "orders_per_customer by region, Q2 vs Q3",
            visual: {
               kind: "divergence",
               from: "q2",
               to: "q3",
               noise: 0.03,
               polarity: "up_is_good",
            },
            highlight: "South",
         },
         malloy: `run: order_items -> {
  where: created_at ? @2026-Q2 to @2026-Q4
  group_by: region
  aggregate:
    q2 is orders_per_customer { where: created_at ? @2026-Q2 }
    q3 is orders_per_customer { where: created_at ? @2026-Q3 }
}`,
         provenance: storefront("order_items", "sales_by_region"),
         topics: ["customers", "regions"],
      },
   },
   {
      key: "saturday-spike",
      detector: "anomaly",
      score: 0.74,
      reasons: [
         "Saturday revenue was 38% above the upper end of its 8-week daily range",
         "No promotion was scheduled, so the spike is unexplained",
      ],
      checks: [
         ...grounded("sales_by_month").slice(0, 3),
         {
            label: "Re-ran and matched",
            passed: true,
            detail: "Partial day excluded",
         },
      ],
      insight: {
         delta: {
            value: 0.38,
            unit: "percent",
            period: "DoD",
            polarity: "up_is_good",
         },
         headline: "Saturday broke the daily record with no promo running",
         metric: {
            label: "Revenue, Sat Sep 26",
            value: 118300,
            format: "currency",
            trend: [84200, 86900, 81100, 83700, 85800, 88600, 118300, 90100],
         },
      },
      analysis: {
         title: "Record Saturday, no promotion behind it",
         narrative:
            "Saturday brought in $118K, 38% above any day in the last eight weeks, with no promotion scheduled. Outerwear and Jeans made up most of it.",
         details: [
            "Traffic came mostly from returning customers, not new ones.",
            "Sunday returned to normal, so it isn't a new baseline yet.",
         ],
         evidence: {
            kind: "line",
            xKey: "day",
            series: [{ key: "total_sales", label: "Revenue" }],
            rows: days.map((day, i) => ({
               day,
               total_sales: [
                  84200, 86900, 81100, 83700, 85800, 88600, 118300, 90100,
               ][i],
            })),
            format: "currency",
            caption: "total_sales by day, last 8 days",
            visual: {
               kind: "anomaly",
               series: "total_sales",
               normal: [78000, 92000],
               normalLabel: "8-week daily range",
               polarity: "up_is_good",
            },
            highlight: "Sep 26",
         },
         malloy: `run: order_items -> {
  where: created_at ? @2026-09-20 for 8 days
  group_by: day is created_at.day
  aggregate: total_sales
  order_by: day
}`,
         provenance: storefront("order_items", "sales_by_month"),
         topics: ["revenue"],
      },
   },
   {
      key: "product-concentration",
      detector: "mix",
      score: 0.52,
      reasons: [
         "Top-10 products' share of sales fell for the fourth month running",
         "Revenue is becoming less dependent on a few best sellers",
      ],
      checks: grounded("top_products"),
      insight: {
         delta: {
            value: -0.013,
            unit: "pp",
            period: "MoM",
            polarity: "up_is_good",
         },
         headline: "Best sellers matter a little less every month",
         metric: {
            label: "Top-10 product share",
            value: 0.082,
            format: "percent",
            trend: [0.118, 0.116, 0.113, 0.109, 0.104, 0.098, 0.095, 0.082],
         },
      },
      analysis: {
         title: "Top products' share of sales is shrinking",
         narrative:
            "The ten best-selling products made 8.2% of sales in September, down from 11.8% in February, as the long tail of the catalogue grows.",
         details: [
            "Neutral news on its own; worth watching if inventory planning still assumes a concentrated head.",
         ],
         evidence: {
            kind: "line",
            xKey: "month",
            series: [{ key: "top10_share", label: "Top-10 share" }],
            rows: months.slice(1).map((month, i) => ({
               month,
               top10_share: [
                  0.118, 0.116, 0.113, 0.109, 0.104, 0.098, 0.095, 0.082,
               ][i],
            })),
            format: "percent",
            caption: "Share of total_sales from the top 10 products, by month",
         },
         malloy: `run: order_items -> {
  group_by: month is created_at.month
  aggregate: total_sales
  nest: top10 is top_products
  order_by: month
}`,
         provenance: storefront("order_items", "top_products"),
         topics: ["brands"],
      },
      touches: ["order_items", "products"],
   },
   {
      key: "new-vs-returning",
      detector: "driver",
      score: 0.66,
      reasons: [
         "Quarter-over-quarter revenue growth split by customer tenure",
         "Returning customers explain 78% of the growth",
      ],
      checks: [
         { label: "Compiles against the published model", passed: true },
         {
            label: "Answered from a governed view",
            passed: false,
            detail: "Tenure isn't modeled yet; derived inline from customers",
         },
         {
            label: "No fan-out through joins",
            passed: true,
            detail: "customers is join_one from order_items",
         },
         { label: "Re-ran and matched", passed: true },
      ],
      insight: {
         delta: {
            value: 0.09,
            unit: "percent",
            period: "QoQ",
            polarity: "up_is_good",
         },
         headline: "Returning customers carried the quarter",
         metric: {
            label: "Revenue, Q3",
            value: 2210000,
            format: "currency",
            trend: [1850000, 1920000, 1970000, 2030000, 2210000],
         },
      },
      analysis: {
         title: "Q3 growth came from returning customers",
         narrative:
            "Revenue grew $183K from Q2 to Q3, and $143K of it came from customers who had ordered before.",
         details: [
            "New-customer revenue grew only 4%, slower than the last three quarters.",
            "Tenure is computed inline; modeling a first_order_at dimension would make this reusable.",
         ],
         evidence: {
            kind: "bar",
            xKey: "segment",
            series: [
               { key: "q2", label: "Q2" },
               { key: "q3", label: "Q3" },
            ],
            rows: [
               { segment: "Returning", q2: 1180000, q3: 1323000 },
               { segment: "New", q2: 847000, q3: 887000 },
            ],
            format: "currency",
            caption: "total_sales by customer tenure, Q2 vs Q3",
            visual: { kind: "contribution", from: "q2", to: "q3" },
            highlight: "Returning",
         },
         malloy: `run: order_items -> {
  where: created_at ? @2026-Q2 to @2026-Q4
  group_by: segment is pick 'Returning'
    when customers.created_at < @2026-04 else 'New'
  aggregate:
    q2 is total_sales { where: created_at ? @2026-Q2 }
    q3 is total_sales { where: created_at ? @2026-Q3 }
}`,
         provenance: storefront("order_items", "top_customers"),
         topics: ["customers", "revenue"],
      },
      touches: ["order_items", "customers"],
   },
   {
      key: "carhartt-margin",
      detector: "change",
      score: 0.58,
      reasons: [
         "Carhartt margin rate rose 3.1 points, the largest move among the top 8 brands",
         "Driven by a lower product cost after the August supplier change",
      ],
      checks: grounded("brand_performance"),
      insight: {
         delta: {
            value: 0.031,
            unit: "pp",
            period: "MoM",
            polarity: "up_is_good",
         },
         headline: "Carhartt's margin jumped after the supplier switch",
         metric: {
            label: "Carhartt margin rate",
            value: 0.562,
            format: "percent",
            trend: [0.528, 0.531, 0.529, 0.533, 0.53, 0.531, 0.548, 0.562],
         },
      },
      analysis: {
         title: "Carhartt margin rate up 3 points",
         narrative:
            "Carhartt's margin rate rose from 53.1% to 56.2% this month, the biggest move among the top brands, on lower cost per unit rather than higher prices.",
         details: ["Average sale price is flat; average product cost fell 6%."],
         evidence: {
            kind: "bar",
            xKey: "brand",
            series: [
               { key: "august", label: "August" },
               { key: "september", label: "September" },
            ],
            rows: [
               { brand: "Carhartt", august: 0.531, september: 0.562 },
               { brand: "Levi's", august: 0.512, september: 0.509 },
               { brand: "Calvin Klein", august: 0.548, september: 0.551 },
               { brand: "Columbia", august: 0.523, september: 0.52 },
               { brand: "Nike", august: 0.497, september: 0.499 },
            ],
            format: "percent",
            caption: "margin_rate by brand, August vs September",
            visual: {
               kind: "divergence",
               from: "august",
               to: "september",
               noise: 0.006,
               polarity: "up_is_good",
            },
            highlight: "Carhartt",
         },
         malloy: `run: order_items -> brand_performance + {
  where: created_at ? @2026-08 to @2026-10
  limit: 5
}`,
         provenance: storefront("order_items", "brand_performance"),
         topics: ["margins", "brands"],
      },
      touches: ["order_items", "products"],
   },
];

const FILLER = new Set(
   "the and any anything are for from how into keep eye look unusual what which who why changed change driving there this that with".split(
      " ",
   ),
);

const words = (text: string) =>
   text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !FILLER.has(w));

/** How well a finding matches a free-text steer, 0 when there is none. */
export function focusMatch(finding: PoolFinding, focus: string): number {
   const wanted = words(focus);
   if (wanted.length === 0) return 0;
   const text = new Set(
      words(
         [
            finding.analysis.title,
            finding.analysis.narrative,
            finding.insight.headline,
            finding.analysis.topics.join(" "),
            finding.analysis.evidence.caption ?? "",
         ].join(" "),
      ),
   );
   const hits = wanted.filter((w) =>
      [...text].some((t) => t.startsWith(w) || w.startsWith(t)),
   );
   return hits.length / wanted.length;
}

/**
 * The findings a run with this recipe keeps, best first, skipping ones already
 * found and favoring kinds of finding the Studio has fewest of.
 */
export function findInPool(
   recipe: InsightRecipe,
   alreadyFound: ReadonlySet<string>,
   existing: readonly { detector: InsightDetector }[] = [],
   limit = 3,
): PoolFinding[] {
   const covered = (d: InsightDetector) =>
      existing.filter((e) => e.detector === d).length;
   return insightPool
      .filter(
         (f) =>
            !alreadyFound.has(f.key) &&
            recipe.detectors.includes(f.detector) &&
            (recipe.sources.length === 0 ||
               (f.touches ?? [f.analysis.provenance.source]).some((s) =>
                  recipe.sources.includes(s),
               )),
      )
      .map((f) => ({
         f,
         rank:
            f.score +
            focusMatch(f, recipe.focus) * 0.6 -
            covered(f.detector) * 0.05,
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map(({ f }) => f);
}
