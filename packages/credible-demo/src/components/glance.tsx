// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Sparkline } from "@/components/sparkline";
import type { Glance as GlanceSpec, GlanceItem, Insight } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * The small visual beside an insight's number, drawn in currentColor. Insights
 * from before glances carry only a trend, and get its sparkline.
 */
export function Glance({
   metric,
   className,
}: {
   metric: Insight["metric"];
   className?: string;
}) {
   const g: GlanceSpec = metric.glance ?? {
      kind: "sparkline",
      values: metric.trend,
   };
   switch (g.kind) {
      case "sparkline":
         return <Sparkline values={g.values} className={className} />;
      case "bars":
         return (
            <Bars
               items={g.items}
               highlight={g.highlight}
               className={className}
            />
         );
      case "donut":
         return (
            <Donut
               items={g.items}
               highlight={g.highlight}
               className={className}
            />
         );
      case "gauge":
         return <Gauge value={g.value} max={g.max} className={className} />;
      case "compare":
         return (
            <Compare
               baseline={g.baseline}
               current={g.current}
               className={className}
            />
         );
   }
}

/** The highlighted item's index, or the last one's when nothing is highlighted. */
const subjectOf = (items: GlanceItem[], highlight?: string) => {
   const i = items.findIndex((it) => it.label === highlight);
   return i >= 0 ? i : items.length - 1;
};

function Bars({
   items,
   highlight,
   className,
}: {
   items: GlanceItem[];
   highlight?: string;
   className?: string;
}) {
   const W = 100;
   const H = 32;
   const lo = Math.min(0, ...items.map((i) => i.value));
   const hi = Math.max(0, ...items.map((i) => i.value));
   const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
   const step = W / items.length;
   const subject = subjectOf(items, highlight);
   return (
      <div className={className} aria-hidden>
         <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="size-full overflow-visible"
         >
            {items.map((it, i) => {
               const top = Math.min(y(it.value), y(0));
               return (
                  <rect
                     key={i}
                     x={i * step + step * 0.12}
                     width={step * 0.76}
                     y={top}
                     height={Math.max(Math.abs(y(it.value) - y(0)), 1)}
                     rx={1.5}
                     fill="currentColor"
                     fillOpacity={i === subject ? 1 : 0.25}
                  />
               );
            })}
         </svg>
      </div>
   );
}

function Donut({
   items,
   highlight,
   className,
}: {
   items: GlanceItem[];
   highlight?: string;
   className?: string;
}) {
   const R = 12;
   const C = 2 * Math.PI * R;
   const GAP = items.length > 1 ? 1.2 : 0;
   const total = items.reduce((s, i) => s + i.value, 0) || 1;
   const subject = subjectOf(items, highlight);
   let offset = 0;
   return (
      <div className={className} aria-hidden>
         <svg
            viewBox="0 0 32 32"
            preserveAspectRatio="xMaxYMid meet"
            className="size-full -rotate-90"
         >
            {items.map((it, i) => {
               const len = (it.value / total) * C;
               const arc = (
                  <circle
                     key={i}
                     cx={16}
                     cy={16}
                     r={R}
                     fill="none"
                     stroke="currentColor"
                     strokeWidth={i === subject ? 6 : 4.5}
                     strokeOpacity={i === subject ? 1 : 0.18 + 0.08 * (i % 2)}
                     strokeDasharray={`${Math.max(len - GAP, 0.01)} ${C}`}
                     strokeDashoffset={-offset}
                  />
               );
               offset += len;
               return arc;
            })}
         </svg>
      </div>
   );
}

function Gauge({
   value,
   max,
   className,
}: {
   value: number;
   max: number;
   className?: string;
}) {
   const R = 14;
   const frac = Math.min(Math.max(value / max, 0), 1);
   const arc = `M${16 - R},18 A${R},${R} 0 0 1 ${16 + R},18`;
   const len = Math.PI * R;
   const angle = Math.PI * (1 - frac);
   return (
      <div className={className} aria-hidden>
         <svg
            viewBox="0 0 32 20"
            preserveAspectRatio="xMaxYMid meet"
            className="size-full overflow-visible"
         >
            <path
               d={arc}
               fill="none"
               stroke="currentColor"
               strokeOpacity={0.15}
               strokeWidth={4}
               strokeLinecap="round"
            />
            <path
               d={arc}
               fill="none"
               stroke="currentColor"
               strokeWidth={4}
               strokeLinecap="round"
               strokeDasharray={`${frac * len} ${len}`}
            />
            <circle
               cx={16 + R * Math.cos(angle)}
               cy={18 - R * Math.sin(angle)}
               r={1.4}
               className="fill-background"
            />
         </svg>
      </div>
   );
}

function Compare({
   baseline,
   current,
   className,
}: {
   baseline: GlanceItem;
   current: GlanceItem;
   className?: string;
}) {
   const hi = Math.max(Math.abs(baseline.value), Math.abs(current.value)) || 1;
   const rows = [
      { ...baseline, strong: false },
      { ...current, strong: true },
   ];
   return (
      <div
         className={cn(
            "@container flex flex-col justify-center gap-1",
            className,
         )}
         aria-hidden
      >
         {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
               <span
                  className={cn(
                     "hidden w-10 shrink-0 truncate text-right text-[9px] leading-none @[6rem]:block",
                     r.strong ? "text-current" : "text-muted-foreground",
                  )}
               >
                  {r.label}
               </span>
               <span className="h-2 flex-1">
                  <span
                     className={cn(
                        "block h-full rounded-sm bg-current",
                        !r.strong && "opacity-25",
                     )}
                     style={{
                        width: `${Math.max((Math.abs(r.value) / hi) * 100, 4)}%`,
                     }}
                  />
               </span>
            </div>
         ))}
      </div>
   );
}
