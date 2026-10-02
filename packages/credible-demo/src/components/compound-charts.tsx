// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Area,
   CartesianGrid,
   ComposedChart,
   Line,
   ReferenceArea,
   ReferenceDot,
   ReferenceLine,
   XAxis,
   YAxis,
} from "recharts";
import {
   ChartContainer,
   ChartTooltip,
   ChartTooltipContent,
   type ChartConfig,
} from "@/components/ui/chart";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Delta, Evidence, EvidenceVisual } from "@/data/types";
import { formatChange, formatSigned, formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";

type Visual<K extends EvidenceVisual["kind"]> = Extract<
   EvidenceVisual,
   { kind: K }
>;

interface ChartProps<K extends EvidenceVisual["kind"]> {
   evidence: Evidence;
   visual: Visual<K>;
   compact: boolean;
}

const labelOf = (evidence: Evidence, key: string) =>
   evidence.series.find((s) => s.key === key)?.label ?? key;

/** Whether moving by `change` is good news under `polarity`. */
const isGood = (change: number, polarity: Delta["polarity"]) =>
   change > 0 === (polarity === "up_is_good");

/** 1, 2 or 5 times a power of ten, at least `raw`. */
function niceStep(raw: number) {
   if (raw <= 0) return 1;
   const mag = 10 ** Math.floor(Math.log10(raw));
   const r = raw / mag;
   return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
}

const toneText = (good: boolean) => (good ? "text-positive" : "text-negative");
const toneBg = (good: boolean) => (good ? "bg-positive" : "bg-negative");

/** The compound chart for an evidence's visual layer. */
export function CompoundChart({
   evidence,
   compact,
   className,
}: {
   evidence: Evidence & { visual: EvidenceVisual };
   compact: boolean;
   className?: string;
}) {
   const { visual } = evidence;
   return (
      <div className={cn("w-full", className)}>
         {visual.kind === "contribution" && (
            <ContributionChart
               evidence={evidence}
               visual={visual}
               compact={compact}
            />
         )}
         {visual.kind === "anomaly" && (
            <AnomalyChart
               evidence={evidence}
               visual={visual}
               compact={compact}
            />
         )}
         {visual.kind === "divergence" && (
            <DivergenceChart
               evidence={evidence}
               visual={visual}
               compact={compact}
            />
         )}
         {visual.kind === "waterfall" && (
            <WaterfallChart
               evidence={evidence}
               visual={visual}
               compact={compact}
            />
         )}
      </div>
   );
}

function Legend({ children }: { children: React.ReactNode }) {
   return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
         {children}
      </div>
   );
}

/**
 * Dumbbells for each x's move, under a strip that splits the total change by
 * x: the strip says who drove it, the dumbbells say by how much each moved.
 */
function ContributionChart({
   evidence,
   visual,
   compact,
}: ChartProps<"contribution">) {
   const rows = evidence.rows.map((r) => ({
      x: String(r[evidence.xKey]),
      from: Number(r[visual.from]),
      to: Number(r[visual.to]),
   }));
   const total = rows.reduce((s, r) => s + (r.to - r.from), 0);
   const values = rows.flatMap((r) => [r.from, r.to]);
   const min = Math.min(...values);
   const max = Math.max(...values);
   const pad = (max - min) * 0.08 || 1;
   const lo = min - pad;
   const hi = max + pad;
   const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
   const share = (r: (typeof rows)[number]) =>
      total === 0 ? 0 : Math.max(0, (r.to - r.from) / total);
   const focus = rows.find((r) => r.x === evidence.highlight);
   const fmt = (v: number) =>
      formatValue(v, evidence.format, { compact: true });

   return (
      <div className={cn("space-y-3", !compact && "space-y-5")}>
         <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-muted-foreground">
               <span>
                  Share of the{" "}
                  <span className="font-medium text-foreground tabular-nums">
                     {formatSigned(total, evidence.format)}
                  </span>{" "}
                  change
               </span>
               {focus && (
                  <span className="shrink-0 tabular-nums">
                     {focus.x}{" "}
                     <span className="font-semibold text-foreground">
                        {Math.round(share(focus) * 100)}%
                     </span>
                  </span>
               )}
            </div>
            <div
               className={cn(
                  "flex gap-0.5 overflow-hidden rounded-full",
                  compact ? "h-2" : "h-3",
               )}
            >
               {rows.map((r) => (
                  <div
                     key={r.x}
                     title={`${r.x}: ${Math.round(share(r) * 100)}%`}
                     style={{ flexGrow: share(r) }}
                     className={cn(
                        "min-w-px",
                        r.x === evidence.highlight
                           ? "bg-chart-1"
                           : "bg-chart-1/25",
                     )}
                  />
               ))}
            </div>
         </div>

         <div className={cn("space-y-1", !compact && "space-y-2.5")}>
            {rows.map((r) => {
               const on = !evidence.highlight || r.x === evidence.highlight;
               const left = pos(Math.min(r.from, r.to));
               const width = Math.abs(pos(r.to) - pos(r.from));
               return (
                  <Tooltip key={r.x}>
                     <TooltipTrigger asChild>
                        <div
                           className={cn(
                              "grid items-center gap-2",
                              compact
                                 ? "grid-cols-[4.25rem_1fr_2.5rem] text-[11px]"
                                 : "grid-cols-[6rem_1fr_4rem] text-xs",
                           )}
                        >
                           <span
                              className={cn(
                                 "truncate",
                                 on
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground",
                              )}
                           >
                              {r.x}
                           </span>
                           <div className="relative h-4">
                              <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                              <div
                                 className={cn(
                                    "absolute top-1/2 h-1 -translate-y-1/2 rounded-full",
                                    on
                                       ? "bg-chart-1/60"
                                       : "bg-muted-foreground/25",
                                 )}
                                 style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                 }}
                              />
                              <span
                                 className={cn(
                                    "absolute top-1/2 size-2 -translate-1/2 rounded-full border-[1.5px] bg-card",
                                    on
                                       ? "border-chart-1"
                                       : "border-muted-foreground/50",
                                 )}
                                 style={{ left: `${pos(r.from)}%` }}
                              />
                              <span
                                 className={cn(
                                    "absolute top-1/2 -translate-1/2 rounded-full ring-2 ring-card",
                                    compact ? "size-2.5" : "size-3",
                                    on
                                       ? "bg-chart-1"
                                       : "bg-muted-foreground/60",
                                 )}
                                 style={{ left: `${pos(r.to)}%` }}
                              />
                           </div>
                           <span
                              className={cn(
                                 "text-right tabular-nums",
                                 on
                                    ? "font-medium text-foreground"
                                    : "text-muted-foreground",
                              )}
                           >
                              {formatChange(r.from, r.to, evidence.format)}
                           </span>
                        </div>
                     </TooltipTrigger>
                     <TooltipContent side="top" className="tabular-nums">
                        {r.x}: {fmt(r.from)} → {fmt(r.to)}
                     </TooltipContent>
                  </Tooltip>
               );
            })}
         </div>

         <Legend>
            <span className="inline-flex items-center gap-1">
               <span className="size-2 rounded-full border-[1.5px] border-chart-1" />
               {labelOf(evidence, visual.from)}
            </span>
            <span className="inline-flex items-center gap-1">
               <span className="size-2 rounded-full bg-chart-1" />
               {labelOf(evidence, visual.to)}
            </span>
         </Legend>
      </div>
   );
}

/**
 * One series against the band it usually sits in. Whatever escapes the band
 * is filled, so the eye goes to the excess rather than to the line.
 */
function AnomalyChart({ evidence, visual, compact }: ChartProps<"anomaly">) {
   const [lo, hi] = visual.normal;
   const values = evidence.rows.map((r) => Number(r[visual.series]));
   const data = evidence.rows.map((r, i) => ({
      ...r,
      over: [hi, Math.max(values[i], hi)],
      under: [Math.min(values[i], lo), lo],
   }));
   const min = Math.min(lo, ...values);
   const max = Math.max(hi, ...values);
   const step = niceStep((max - min) / 4);
   const yMin = Math.floor(min / step) * step;
   const yMax = Math.ceil(max / step) * step;
   const ticks = Array.from(
      { length: Math.round((yMax - yMin) / step) + 1 },
      (_, i) => yMin + i * step,
   );
   const overColor = isGood(1, visual.polarity)
      ? "var(--positive)"
      : "var(--negative)";
   const underColor = isGood(-1, visual.polarity)
      ? "var(--positive)"
      : "var(--negative)";
   const outOf = (v: number) => v > hi || v < lo;
   const config: ChartConfig = {
      [visual.series]: {
         label: labelOf(evidence, visual.series),
         color: "var(--chart-1)",
      },
   };
   const focus = evidence.rows.find(
      (r) => r[evidence.xKey] === evidence.highlight,
   );
   const focusValue = focus ? Number(focus[visual.series]) : undefined;
   const fmt = (v: number) => formatValue(v, evidence.format);

   return (
      <div className="space-y-2">
         <ChartContainer
            config={config}
            className={cn("aspect-auto w-full", compact ? "h-32" : "h-72")}
         >
            <ComposedChart
               data={data}
               margin={
                  compact
                     ? { top: 14, right: 12, bottom: 0, left: 12 }
                     : { top: 20, right: 40, bottom: 0, left: 0 }
               }
            >
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
                  domain={[yMin, yMax]}
                  ticks={ticks}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  fontSize={11}
                  tickFormatter={(v: number) =>
                     formatValue(v, evidence.format, { compact: true })
                  }
               />
               <ReferenceArea
                  y1={lo}
                  y2={hi}
                  fill="var(--muted-foreground)"
                  fillOpacity={0.09}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.25}
                  strokeDasharray="2 3"
                  ifOverflow="extendDomain"
                  label={
                     compact
                        ? undefined
                        : {
                             value: visual.normalLabel,
                             position: "insideBottomLeft",
                             fontSize: 10,
                             fill: "var(--muted-foreground)",
                          }
                  }
               />
               {visual.events?.map((e) => (
                  <ReferenceLine
                     key={e.x}
                     x={e.x}
                     stroke="var(--muted-foreground)"
                     strokeOpacity={0.5}
                     strokeDasharray="2 3"
                     label={(props: { viewBox?: { x: number; y: number } }) =>
                        props.viewBox ? (
                           <text
                              x={props.viewBox.x + 5}
                              y={props.viewBox.y + 2}
                              dominantBaseline="hanging"
                              fontSize={10}
                              fill="var(--muted-foreground)"
                              stroke="var(--card)"
                              strokeWidth={3}
                              strokeOpacity={0.85}
                              paintOrder="stroke"
                           >
                              {e.label}
                           </text>
                        ) : null
                     }
                  />
               ))}
               <Area
                  dataKey="over"
                  type="linear"
                  stroke="none"
                  fill={overColor}
                  fillOpacity={0.22}
                  tooltipType="none"
                  isAnimationActive={false}
                  activeDot={false}
               />
               <Area
                  dataKey="under"
                  type="linear"
                  stroke="none"
                  fill={underColor}
                  fillOpacity={0.22}
                  tooltipType="none"
                  isAnimationActive={false}
                  activeDot={false}
               />
               <Line
                  dataKey={visual.series}
                  type="linear"
                  stroke={`var(--color-${visual.series})`}
                  strokeWidth={2}
                  dot={(p: {
                     cx?: number;
                     cy?: number;
                     index?: number;
                     value?: number;
                  }) =>
                     p.value !== undefined && outOf(p.value) ? (
                        <circle
                           key={p.index}
                           cx={p.cx}
                           cy={p.cy}
                           r={compact ? 2.5 : 3.5}
                           fill={p.value > hi ? overColor : underColor}
                           stroke="var(--card)"
                           strokeWidth={1.5}
                        />
                     ) : (
                        <g key={p.index} />
                     )
                  }
               />
               {focus && focusValue !== undefined && (
                  <ReferenceDot
                     x={String(focus[evidence.xKey])}
                     y={focusValue}
                     r={compact ? 3.5 : 5}
                     fill={
                        outOf(focusValue)
                           ? focusValue > hi
                              ? overColor
                              : underColor
                           : "var(--chart-1)"
                     }
                     stroke="var(--card)"
                     strokeWidth={2}
                     label={{
                        value: formatValue(focusValue, evidence.format),
                        position: compact ? "top" : "right",
                        offset: compact ? 7 : 8,
                        fontSize: 10.5,
                        fontWeight: 600,
                        fill: "var(--foreground)",
                     }}
                  />
               )}
               <ChartTooltip
                  cursor
                  content={<ChartTooltipContent valueFormatter={fmt} />}
               />
            </ComposedChart>
         </ChartContainer>
         <Legend>
            <span className="inline-flex items-center gap-1">
               <span className="h-2 w-3 rounded-[2px] border border-dashed border-muted-foreground/50 bg-muted-foreground/10" />
               {visual.normalLabel} {formatValue(lo, evidence.format)}–
               {formatValue(hi, evidence.format)}
            </span>
            <span className="inline-flex items-center gap-1">
               <span
                  className="h-2 w-3 rounded-[2px]"
                  style={{ background: overColor, opacity: 0.35 }}
               />
               outside range
            </span>
         </Legend>
      </div>
   );
}

/**
 * Each x's change as a bar diverging from zero, over a band of ordinary
 * movement. Bars inside the band are noise and stay gray; only a break-out
 * gets color.
 */
function DivergenceChart({
   evidence,
   visual,
   compact,
}: ChartProps<"divergence">) {
   const rows = evidence.rows.map((r) => {
      const from = Number(r[visual.from]);
      const to = Number(r[visual.to]);
      return { x: String(r[evidence.xKey]), from, to, change: to - from };
   });
   const reach =
      Math.max(visual.noise * 1.8, ...rows.map((r) => Math.abs(r.change))) *
      1.1;
   const half = (v: number) => (Math.abs(v) / reach) * 50;
   const rowH = compact ? "h-5" : "h-7";
   const fmt = (v: number) => formatValue(v, evidence.format);

   return (
      <div className="space-y-2">
         <div
            className={cn(
               "grid gap-x-2",
               compact
                  ? "grid-cols-[4.25rem_1fr_3rem] text-[11px]"
                  : "grid-cols-[6rem_1fr_4.5rem] text-xs",
            )}
         >
            <div className="flex flex-col">
               {rows.map((r) => (
                  <span
                     key={r.x}
                     className={cn(
                        "flex items-center truncate",
                        rowH,
                        r.x === evidence.highlight
                           ? "font-medium text-foreground"
                           : "text-muted-foreground",
                     )}
                  >
                     {r.x}
                  </span>
               ))}
            </div>
            <div className="relative flex flex-col">
               <div
                  className="absolute inset-y-0 rounded-sm border-x border-dashed border-muted-foreground bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1px,transparent_1px_6px)] opacity-25"
                  style={{
                     left: `${50 - half(visual.noise)}%`,
                     width: `${half(visual.noise) * 2}%`,
                  }}
               />
               <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
               {rows.map((r) => {
                  const breaks = Math.abs(r.change) > visual.noise;
                  const good = isGood(r.change, visual.polarity);
                  return (
                     <Tooltip key={r.x}>
                        <TooltipTrigger asChild>
                           <div className={cn("relative", rowH)}>
                              <div
                                 className={cn(
                                    "absolute top-1/2 -translate-y-1/2",
                                    compact ? "h-2.5" : "h-3.5",
                                    r.change < 0
                                       ? "rounded-l-sm"
                                       : "rounded-r-sm",
                                    breaks
                                       ? toneBg(good)
                                       : "bg-muted-foreground/35",
                                 )}
                                 style={{
                                    [r.change < 0 ? "right" : "left"]: "50%",
                                    width: `${Math.max(half(r.change), 0.8)}%`,
                                 }}
                              />
                           </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="tabular-nums">
                           {r.x}: {fmt(r.from)} → {fmt(r.to)}
                        </TooltipContent>
                     </Tooltip>
                  );
               })}
            </div>
            <div className="flex flex-col">
               {rows.map((r) => {
                  const breaks = Math.abs(r.change) > visual.noise;
                  return (
                     <span
                        key={r.x}
                        className={cn(
                           "flex items-center justify-end tabular-nums",
                           rowH,
                           breaks
                              ? cn(
                                   "font-semibold",
                                   toneText(isGood(r.change, visual.polarity)),
                                )
                              : "text-muted-foreground",
                        )}
                     >
                        {formatChange(r.from, r.to, evidence.format)}
                     </span>
                  );
               })}
            </div>
         </div>
         <Legend>
            <span className="inline-flex items-center gap-1">
               <span className="h-2 w-3 rounded-[2px] border-x border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_1px,transparent_1px_4px)] opacity-60" />
               normal movement ±
               {formatSigned(visual.noise, evidence.format).slice(1)}
            </span>
            <span>
               {labelOf(evidence, visual.from)} → {labelOf(evidence, visual.to)}
            </span>
         </Legend>
      </div>
   );
}

/** Signed contributions stepping from zero to their net, with the driver the narrative names in full color. */
function WaterfallChart({
   evidence,
   visual,
   compact,
}: ChartProps<"waterfall">) {
   let running = 0;
   const steps = evidence.rows.map((r) => {
      const value = Number(r[visual.series]);
      const start = running;
      running += value;
      return { x: String(r[evidence.xKey]), value, start, end: running };
   });
   const net = running;
   const bars = [
      ...steps,
      { x: visual.totalLabel, value: net, start: 0, end: net, total: true },
   ] as ((typeof steps)[number] & { total?: boolean })[];
   const levels = bars.flatMap((b) => [b.start, b.end]);
   const lo = Math.min(0, ...levels);
   const hi = Math.max(0, ...levels);
   const span = hi - lo || 1;
   const pct = (v: number) => ((v - lo) / span) * 100;

   return (
      <div className="space-y-1.5">
         <div className={cn("relative mt-4", compact ? "h-24" : "h-64")}>
            <div
               className="absolute inset-x-0 h-px bg-foreground/25"
               style={{ bottom: `${pct(0)}%` }}
            />
            <div className="absolute inset-0 flex gap-2">
               {bars.map((b, i) => {
                  const on =
                     b.total ||
                     !evidence.highlight ||
                     b.x === evidence.highlight;
                  const bottom = pct(Math.min(b.start, b.end));
                  const height = Math.max(
                     pct(Math.max(b.start, b.end)) - bottom,
                     0.5,
                  );
                  const color = b.total
                     ? "bg-chart-1"
                     : b.value >= 0
                       ? "bg-positive"
                       : "bg-negative";
                  return (
                     <div key={b.x} className="relative flex-1">
                        <div
                           className={cn(
                              "absolute inset-x-0 rounded-[3px]",
                              color,
                              !on && "opacity-40",
                           )}
                           style={{
                              bottom: `${bottom}%`,
                              height: `${height}%`,
                           }}
                        />
                        <span
                           className={cn(
                              "absolute inset-x-0 text-center text-[10.5px] tabular-nums",
                              on
                                 ? "font-semibold text-foreground"
                                 : "text-muted-foreground",
                           )}
                           style={{ bottom: `calc(${bottom + height}% + 2px)` }}
                        >
                           {b.total
                              ? formatValue(b.value, evidence.format, {
                                   compact: true,
                                })
                              : formatSigned(b.value, evidence.format)}
                        </span>
                        {i < bars.length - 1 && (
                           <div
                              className="absolute right-0 w-2 translate-x-full border-t border-dashed border-muted-foreground/50"
                              style={{ bottom: `${pct(b.end)}%` }}
                           />
                        )}
                     </div>
                  );
               })}
            </div>
         </div>
         <div className="flex gap-2">
            {bars.map((b) => (
               <span
                  key={b.x}
                  className={cn(
                     "flex-1 truncate text-center text-[11px]",
                     b.x === evidence.highlight || b.total
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                  )}
               >
                  {b.x}
               </span>
            ))}
         </div>
      </div>
   );
}
