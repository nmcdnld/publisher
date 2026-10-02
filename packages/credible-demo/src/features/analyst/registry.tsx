// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The component half of the registry: one component per entry in
// `blockProps`. The mapped type makes a new block type a compile error here
// until it has a component.

import {
   AlertTriangle,
   ArrowRight,
   Info,
   Sparkles,
   TrendingDown,
   TrendingUp,
} from "lucide-react";
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import type { Block, BlockType } from "@malloy-publisher/app-manifest/analyst/blocks";
import { formatMetric } from "@malloy-publisher/app-manifest/analyst/format";
import type { Dataset, Metric } from "@malloy-publisher/app-manifest/analyst/schema";
import { splitTokens } from "@malloy-publisher/app-manifest/analyst/tokens";
import { EvidenceChart } from "@/components/evidence-chart";
import { ResultsGrid } from "@/components/results-grid";
import {
   ChartContainer,
   ChartTooltip,
   ChartTooltipContent,
} from "@/components/ui/chart";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toEvidence } from "./answer";

export interface RenderCtx {
   metrics: ReadonlyMap<string, Metric>;
   datasets: ReadonlyMap<string, Dataset>;
   onFollowUp?: (question: string) => void;
}

/** One number, from compute_metric, with where it came from on hover. */
export function MetricValue({
   metric,
   ctx,
   className,
}: {
   metric: Metric | undefined;
   ctx: RenderCtx;
   className?: string;
}) {
   if (!metric) return <span className="text-muted-foreground">…</span>;
   const ds = ctx.datasets.get(metric.datasetId);
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span
               className={cn(
                  "cursor-help font-medium tabular-nums underline decoration-muted-foreground/40 decoration-dotted underline-offset-2",
                  className,
               )}
            >
               {formatMetric(metric)}
            </span>
         </TooltipTrigger>
         <TooltipContent className="max-w-64">
            <p className="font-medium">{metric.label}</p>
            <p className="text-[11px] opacity-80">
               {metric.op}
               {metric.column ? ` of ${metric.column}` : ""}
               {metric.detail ? ` · ${metric.detail}` : ""}
               {ds ? ` · from “${ds.title}”` : ""}
            </p>
         </TooltipContent>
      </Tooltip>
   );
}

/** Prose with its {{metric:ID}} tokens drawn as values. */
export function MetricText({ text, ctx }: { text: string; ctx: RenderCtx }) {
   return (
      <>
         {splitTokens(text).map((p, i) =>
            "text" in p ? (
               <span key={i}>{p.text}</span>
            ) : (
               <MetricValue
                  key={i}
                  metric={ctx.metrics.get(p.metricId)}
                  ctx={ctx}
               />
            ),
         )}
      </>
   );
}

type Props<T extends BlockType> = {
   block: Extract<Block, { type: T }>;
   ctx: RenderCtx;
};

function KpiCard({ block, ctx }: Props<"kpi">) {
   const metric = ctx.metrics.get(block.metric.metricId);
   const compare = block.compare && ctx.metrics.get(block.compare.metricId);
   const change = typeof compare?.value === "number" ? compare.value : null;
   const good =
      block.tone === "good"
         ? true
         : block.tone === "bad"
           ? false
           : change === null
             ? null
             : change >= 0;
   return (
      <div className="rounded-lg border bg-card px-3 py-2.5">
         <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {block.label}
         </p>
         <p
            className={cn(
               "mt-0.5 truncate text-xl font-semibold tabular-nums",
               block.tone === "good" &&
                  "text-emerald-600 dark:text-emerald-400",
               block.tone === "bad" && "text-destructive",
            )}
         >
            <MetricValue
               metric={metric}
               ctx={ctx}
               className="font-semibold no-underline"
            />
         </p>
         {compare && (
            <p
               className={cn(
                  "mt-0.5 flex items-center gap-1 text-xs tabular-nums",
                  good === true && "text-emerald-600 dark:text-emerald-400",
                  good === false && "text-destructive",
                  good === null && "text-muted-foreground",
               )}
            >
               {change !== null &&
                  (change >= 0 ? (
                     <TrendingUp className="size-3" />
                  ) : (
                     <TrendingDown className="size-3" />
                  ))}
               <MetricValue
                  metric={compare}
                  ctx={ctx}
                  className="font-normal"
               />
               <span className="truncate text-muted-foreground">
                  {compare.detail}
               </span>
            </p>
         )}
      </div>
   );
}

function ChartBlock({ block, ctx }: Props<"chart">) {
   const ds = ctx.datasets.get(block.data.datasetId);
   if (!ds) return null;
   const highlight =
      block.highlight?.[0] && ctx.metrics.get(block.highlight[0].metricId);
   const evidence = toEvidence(ds, {
      mark: block.mark === "scatter" ? "line" : block.mark,
      x: block.x,
      y: block.y,
      caption: block.title,
      highlight: highlight ? formatMetric(highlight) : undefined,
   });
   return (
      <figure className="rounded-lg border bg-card p-3">
         <figcaption className="mb-2 text-sm font-medium">
            {block.title}
         </figcaption>
         {block.mark === "scatter" ? (
            <ChartContainer
               config={{
                  [block.y[0]]: {
                     label: evidence.series[0]?.label,
                     color: "var(--chart-1)",
                  },
               }}
               className="h-56 w-full"
            >
               <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                     dataKey={block.x}
                     type="number"
                     fontSize={11}
                     tickLine={false}
                  />
                  <YAxis
                     dataKey={block.y[0]}
                     type="number"
                     fontSize={11}
                     tickLine={false}
                     width={48}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Scatter data={evidence.rows} fill="var(--chart-1)" />
               </ScatterChart>
            </ChartContainer>
         ) : (
            <EvidenceChart
               evidence={evidence}
               compact={evidence.rows.length > 6}
               className="h-56"
            />
         )}
         <p className="mt-1.5 text-[11px] text-muted-foreground">
            {ds.grain ? `One point per ${ds.grain}` : ds.title}
            {ds.truncated ? " · first rows only" : ""}
         </p>
      </figure>
   );
}

function TableBlock({ block, ctx }: Props<"table">) {
   const ds = ctx.datasets.get(block.data.datasetId);
   if (!ds) return null;
   const names = block.columns?.length
      ? block.columns
      : ds.columns.map((c) => c.name);
   const cols = ds.columns.filter((c) => names.includes(c.name));
   const x = cols.find((c) => c.type !== "number")?.name ?? cols[0]?.name;
   if (!x) return null;
   const evidence = toEvidence(ds, {
      x,
      y: cols
         .filter((c) => c.type === "number" && c.name !== x)
         .map((c) => c.name),
      caption: block.title,
   });
   return (
      <div className="space-y-1.5">
         <p className="text-sm font-medium">{block.title}</p>
         <ResultsGrid
            evidence={evidence}
            filename={block.title.toLowerCase().replace(/\W+/g, "-")}
            className="max-h-80"
         />
      </div>
   );
}

const severity = {
   info: { icon: Info, className: "border-border bg-muted/40" },
   positive: {
      icon: Sparkles,
      className:
         "border-emerald-500/30 bg-emerald-500/5 [&_svg]:text-emerald-600",
   },
   warning: {
      icon: AlertTriangle,
      className: "border-amber-500/40 bg-amber-500/5 [&_svg]:text-amber-600",
   },
} as const;

function InsightCallout({ block, ctx }: Props<"insight">) {
   const s = severity[block.severity];
   return (
      <div
         className={cn(
            "flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
            s.className,
         )}
      >
         <s.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
         <p className="leading-relaxed">
            <MetricText text={block.text} ctx={ctx} />
         </p>
      </div>
   );
}

function Summary({ block, ctx }: Props<"summary">) {
   return (
      <p className="text-sm leading-relaxed text-foreground/90">
         <MetricText text={block.text} ctx={ctx} />
      </p>
   );
}

function FollowUps({ block, ctx }: Props<"followUps">) {
   return (
      <div className="space-y-1.5">
         <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Ask next
         </p>
         <div className="flex flex-wrap gap-1.5">
            {block.questions.map((q) => (
               <button
                  key={q}
                  type="button"
                  disabled={!ctx.onFollowUp}
                  onClick={() => ctx.onFollowUp?.(q)}
                  className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
               >
                  {q}
                  <ArrowRight className="size-3 text-muted-foreground" />
               </button>
            ))}
         </div>
      </div>
   );
}

export const registry: {
   [T in BlockType]: (props: Props<T>) => React.ReactNode;
} = {
   kpi: KpiCard,
   chart: ChartBlock,
   table: TableBlock,
   insight: InsightCallout,
   summary: Summary,
   followUps: FollowUps,
};

export function RenderBlock({ block, ctx }: { block: Block; ctx: RenderCtx }) {
   const Component = registry[block.type] as (p: {
      block: Block;
      ctx: RenderCtx;
   }) => React.ReactNode;
   return <Component block={block} ctx={ctx} />;
}

/** The ids a block cites, for "Why?". */
export function citedIds(block: Block): {
   metrics: string[];
   datasets: string[];
} {
   const fromText = (t: string) =>
      splitTokens(t).flatMap((p) => ("metricId" in p ? [p.metricId] : []));
   switch (block.type) {
      case "kpi":
         return {
            metrics: [
               block.metric.metricId,
               ...(block.compare ? [block.compare.metricId] : []),
            ],
            datasets: [],
         };
      case "chart":
         return {
            metrics: (block.highlight ?? []).map((h) => h.metricId),
            datasets: [block.data.datasetId],
         };
      case "table":
         return { metrics: [], datasets: [block.data.datasetId] };
      case "insight":
      case "summary":
         return { metrics: fromText(block.text), datasets: [] };
      case "followUps":
         return { metrics: [], datasets: [] };
   }
}
