// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Area,
   AreaChart,
   Bar,
   BarChart,
   CartesianGrid,
   Cell,
   Line,
   LineChart,
   XAxis,
   YAxis,
} from "recharts";
import { CompoundChart } from "@/components/compound-charts";
import {
   ChartContainer,
   ChartLegend,
   ChartLegendContent,
   ChartTooltip,
   ChartTooltipContent,
   type ChartConfig,
} from "@/components/ui/chart";
import { isChartProgram } from "@malloy-publisher/app-manifest/analyst/chart-program";
import { GeneratedChart } from "@/components/generated-chart";
import type { Evidence } from "@/data/types";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The chart under a narrative: evidence for the sentence, not the headline. */
export function EvidenceChart({
   evidence,
   compact = false,
   className,
}: {
   evidence: Evidence;
   compact?: boolean;
   className?: string;
}) {
   const { visual } = evidence;
   if (isChartProgram(evidence.spec)) {
      return (
         <GeneratedChart
            program={evidence.spec}
            compact={compact}
            className={className}
         />
      );
   }
   if (visual) {
      return (
         <CompoundChart
            evidence={{ ...evidence, visual }}
            compact={compact}
            className={className}
         />
      );
   }
   const config: ChartConfig = Object.fromEntries(
      evidence.series.map((s, i) => [
         s.key,
         { label: s.label, color: `var(--chart-${(i % 5) + 1})` },
      ]),
   );
   const fmt = (v: number) =>
      formatValue(v, evidence.format, { compact: true });
   const tooltip = (
      <ChartTooltip
         cursor={evidence.kind === "bar" ? { fill: "var(--muted)" } : true}
         content={
            <ChartTooltipContent
               valueFormatter={(v) => formatValue(v, evidence.format)}
            />
         }
      />
   );
   const axes = (
      <>
         <CartesianGrid vertical={false} strokeDasharray="3 3" />
         <XAxis
            dataKey={evidence.xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            interval={compact ? "preserveStartEnd" : 0}
         />
         <YAxis
            hide={compact}
            domain={evidence.kind === "bar" ? [0, "auto"] : ["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            width={56}
            fontSize={11}
            tickFormatter={fmt}
         />
         {tooltip}
         {!compact && evidence.series.length > 1 && (
            <ChartLegend content={<ChartLegendContent />} />
         )}
      </>
   );
   const margin = compact
      ? { top: 4, right: 4, bottom: 0, left: 4 }
      : { top: 8, right: 8, bottom: 0, left: 0 };

   return (
      <ChartContainer
         config={config}
         className={cn(compact ? "h-28 w-full" : "h-72 w-full", className)}
      >
         {evidence.kind === "bar" ? (
            <BarChart data={evidence.rows} margin={margin}>
               {axes}
               {evidence.series.map((s) => (
                  <Bar
                     key={s.key}
                     dataKey={s.key}
                     fill={`var(--color-${s.key})`}
                     radius={[3, 3, 0, 0]}
                  >
                     {evidence.highlight &&
                        evidence.rows.map((r, i) => (
                           <Cell
                              key={i}
                              fillOpacity={
                                 r[evidence.xKey] === evidence.highlight
                                    ? 1
                                    : 0.35
                              }
                           />
                        ))}
                  </Bar>
               ))}
            </BarChart>
         ) : evidence.kind === "area" ? (
            <AreaChart data={evidence.rows} margin={margin}>
               {axes}
               {evidence.series.map((s) => (
                  <Area
                     key={s.key}
                     dataKey={s.key}
                     type="monotone"
                     stroke={`var(--color-${s.key})`}
                     fill={`var(--color-${s.key})`}
                     fillOpacity={0.15}
                     strokeWidth={2}
                  />
               ))}
            </AreaChart>
         ) : (
            <LineChart data={evidence.rows} margin={margin}>
               {axes}
               {evidence.series.map((s) => (
                  <Line
                     key={s.key}
                     dataKey={s.key}
                     type="monotone"
                     stroke={`var(--color-${s.key})`}
                     strokeWidth={2}
                     dot={!compact}
                  />
               ))}
            </LineChart>
         )}
      </ChartContainer>
   );
}
