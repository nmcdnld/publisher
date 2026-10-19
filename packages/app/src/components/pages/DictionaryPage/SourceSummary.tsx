// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import { useMalloyRows } from "../../../ontology/useOntology";
import type { Entity, Ontology } from "../../../ontology/types";
import { Skeleton } from "../../ui/misc";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import {
   formatValue,
   isPercent,
   MalloyBehind,
   QueryError,
   type Row,
   sourceFields,
   timeDimension,
} from "./liveData";
import { dictionaryHref, q } from "./shared";

const MAX_METRICS = 12;
const MAX_BREAKDOWNS = 4;
const BREAKDOWN_ROWS = 8;
const GRAINS = ["week", "month", "quarter", "year"] as const;
type Grain = (typeof GRAINS)[number];

/** Not worth a bar chart: one value per row, or nearly. */
const ID_LIKE = /(^|_)(id|key|uuid|guid|email|phone|url)$/i;

interface Metric {
   /** Column the value comes back in. */
   key: string;
   /** The `aggregate:` clause. */
   expr: string;
   label: string;
   tags: string[];
   /** Plotted as a line on a padded axis rather than an area from zero. */
   ratio: boolean;
   entity?: Entity;
}

/**
 * The live-data panel for a source: a scorecard per measure, a timeline of
 * the one picked, and that measure broken down by the source's categories.
 * Everything is derived from the model, at most four queries.
 */
export function SourceSummary({
   ontology,
   source,
}: {
   ontology: Ontology;
   source: Entity;
}) {
   const metrics = metricsFor(ontology, source);
   const time = timeDimension(ontology, source);
   const dims = breakdownDimensions(ontology, source);
   const [activeKey, setActiveKey] = useState(
      () =>
         metrics.find((m) => m.tags.some((t) => /^#\s*currency\b/.test(t)))
            ?.key ?? metrics[0].key,
   );
   const [grain, setGrain] = useState<Grain>("month");
   const active = metrics.find((m) => m.key === activeKey) ?? metrics[0];

   const s = q(source.name);
   const aggregates = metrics.map((m) => `\n    ${m.expr}`).join("");
   const totalsQuery = `run: ${s} -> {\n  aggregate:${aggregates}${
      time
         ? `\n    first_seen is min(${q(time.name)})\n    last_seen is max(${q(time.name)})`
         : ""
   }\n}`;
   const trendQuery = (g: Grain) =>
      time
         ? `run: ${s} -> {\n  group_by: period is ${q(time.name)}.${g}\n  aggregate:${aggregates}\n  order_by: period\n  limit: 1000\n}`
         : undefined;
   const orderKey = active.entity ? q(active.key) : active.key;
   const breakdownQuery = dims.length
      ? `run: ${s} -> {${dims
           .map(
              (d, i) =>
                 `\n  nest: breakdown_${i} is {\n    group_by: ${q(d.name)}\n    aggregate: ${active.expr}\n    order_by: ${orderKey} desc\n    limit: ${BREAKDOWN_ROWS}\n  }`,
           )
           .join("")}\n}`
      : undefined;

   const env = ontology.environmentName;
   const pkg = ontology.packageName;
   const totals = useMalloyRows(env, pkg, source.modelPath, totalsQuery);
   const monthly = useMalloyRows(
      env,
      pkg,
      source.modelPath,
      trendQuery("month"),
   );
   const timeline = useMalloyRows(
      env,
      pkg,
      source.modelPath,
      trendQuery(grain),
   );
   const breakdowns = useMalloyRows(env, pkg, source.modelPath, breakdownQuery);

   const totalRow = totals.data?.[0];
   const monthRows = monthly.data ?? [];

   return (
      <div className="@container space-y-5">
         {totals.isLoading ? (
            <Skeleton className="h-28 w-full" />
         ) : totals.error ? (
            <QueryError error={totals.error} />
         ) : (
            <div className="space-y-2">
               {time && totalRow?.first_seen != null && (
                  <p className="text-xs text-muted-foreground">
                     <Link
                        to={dictionaryHref(ontology, time.id)}
                        className="font-mono hover:text-foreground hover:underline"
                     >
                        {time.name}
                     </Link>{" "}
                     runs from{" "}
                     <span className="text-foreground tabular-nums">
                        {formatValue(totalRow.first_seen)}
                     </span>{" "}
                     to{" "}
                     <span className="text-foreground tabular-nums">
                        {formatValue(totalRow.last_seen)}
                     </span>
                     {metrics.length > 1 && " · pick a scorecard to chart it"}
                  </p>
               )}
               <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3 @3xl:grid-cols-4">
                  {metrics.map((m) => (
                     <Scorecard
                        key={m.key}
                        ontology={ontology}
                        metric={m}
                        value={totalRow?.[m.key]}
                        trend={monthRows}
                        trendLoading={monthly.isLoading}
                        active={metrics.length > 1 && m.key === active.key}
                        onSelect={() => setActiveKey(m.key)}
                     />
                  ))}
               </div>
            </div>
         )}

         {time && (
            <section className="space-y-2">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                     {active.label}{" "}
                     <span className="font-normal text-muted-foreground">
                        by {grain} of {time.name}
                     </span>
                  </h3>
                  <Tabs
                     value={grain}
                     onValueChange={(v) => setGrain(v as Grain)}
                  >
                     <TabsList className="h-7">
                        {GRAINS.map((g) => (
                           <TabsTrigger
                              key={g}
                              value={g}
                              className="px-2 text-xs"
                           >
                              {g}
                           </TabsTrigger>
                        ))}
                     </TabsList>
                  </Tabs>
               </div>
               {timeline.isLoading ? (
                  <Skeleton className="h-56 w-full" />
               ) : timeline.error ? (
                  <QueryError error={timeline.error} />
               ) : (timeline.data?.length ?? 0) > 1 ? (
                  <TimelineChart
                     rows={timeline.data!}
                     metric={active}
                     grain={grain}
                  />
               ) : (
                  <p className="text-xs text-muted-foreground">
                     Not enough periods to draw a timeline.
                  </p>
               )}
            </section>
         )}

         {dims.length > 0 && (
            <section className="space-y-2">
               <h3 className="text-sm font-medium">
                  {active.label}{" "}
                  <span className="font-normal text-muted-foreground">
                     top {BREAKDOWN_ROWS} by{" "}
                     {dims.map((d) => d.label ?? d.name).join(", ")}
                  </span>
               </h3>
               {breakdowns.isLoading ? (
                  <Skeleton className="h-40 w-full" />
               ) : breakdowns.error ? (
                  <QueryError error={breakdowns.error} />
               ) : (
                  <div className="grid grid-cols-1 gap-x-6 gap-y-4 @2xl:grid-cols-2">
                     {dims.map((d, i) => (
                        <BreakdownBars
                           key={d.id}
                           ontology={ontology}
                           dimension={d}
                           metric={active}
                           rows={
                              (breakdowns.data?.[0]?.[`breakdown_${i}`] as
                                 | Row[]
                                 | undefined) ?? []
                           }
                        />
                     ))}
                  </div>
               )}
            </section>
         )}

         <MalloyBehind
            text={[
               totalsQuery,
               trendQuery("month"),
               grain !== "month" && trendQuery(grain),
               breakdownQuery,
            ]
               .filter(Boolean)
               .join("\n\n")}
         />
      </div>
   );
}

function metricsFor(ontology: Ontology, source: Entity): Metric[] {
   // `all()` and `exclude()` measures are shares of a total, which is 100%
   // (or meaningless) with nothing grouped.
   const measures = sourceFields(ontology, source).filter(
      (f) =>
         f.kind === "measure" && !/\b(all|exclude)\s*\(/.test(f.formula ?? ""),
   );
   const metrics: Metric[] = measures.map((m) => ({
      key: m.name,
      expr: q(m.name),
      label: m.label ?? m.name,
      tags: m.tags,
      ratio: isPercent(m.tags) || (m.formula ?? "").includes("/"),
      entity: m,
   }));
   if (!measures.some((m) => /^count\(\s*\)$/.test((m.formula ?? "").trim()))) {
      metrics.unshift({
         key: "row_count",
         expr: "row_count is count()",
         label: "Rows",
         tags: [],
         ratio: false,
      });
   }
   return metrics.slice(0, MAX_METRICS);
}

function breakdownDimensions(ontology: Ontology, source: Entity): Entity[] {
   const dims = sourceFields(ontology, source).filter(
      (f) =>
         f.kind === "dimension" &&
         f.dataType === "string" &&
         f.name !== source.primaryKey &&
         !ID_LIKE.test(f.name),
   );
   const described = (d: Entity) => Boolean(d.label || d.doc);
   return [
      ...dims.filter(described),
      ...dims.filter((d) => !described(d)),
   ].slice(0, MAX_BREAKDOWNS);
}

function num(value: unknown): number {
   const n = Number(value);
   return Number.isFinite(n) ? n : 0;
}

function periodLabel(value: unknown, grain: Grain): string {
   const d = new Date(String(value));
   if (Number.isNaN(d.getTime())) return String(value ?? "");
   const year = d.getUTCFullYear();
   const month = d.toLocaleString(undefined, {
      month: "short",
      timeZone: "UTC",
   });
   switch (grain) {
      case "year":
         return `${year}`;
      case "quarter":
         return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`;
      case "month":
         return `${month} ${year}`;
      case "week":
         return `${month} ${d.getUTCDate()}, ${year}`;
   }
}

/**
 * Latest period against the same period a year earlier when there is one,
 * the previous period otherwise. A ratio moves in points, anything else in
 * percent.
 */
function changeOf(metric: Metric, rows: Row[]) {
   if (rows.length < 2) return undefined;
   const last = rows[rows.length - 1];
   const base =
      rows.length >= 13 ? rows[rows.length - 13] : rows[rows.length - 2];
   const now = num(last[metric.key]);
   const then = num(base[metric.key]);
   const against = periodLabel(base.period, "month");
   if (isPercent(metric.tags)) {
      const pts = (now - then) * 100;
      return {
         sign: Math.sign(pts),
         text: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts`,
         against,
      };
   }
   if (!then) return undefined;
   const pct = (now - then) / Math.abs(then);
   return {
      sign: Math.sign(pct),
      text: `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`,
      against,
   };
}

function Scorecard({
   ontology,
   metric,
   value,
   trend,
   trendLoading,
   active,
   onSelect,
}: {
   ontology: Ontology;
   metric: Metric;
   value: unknown;
   trend: Row[];
   trendLoading: boolean;
   active: boolean;
   onSelect: () => void;
}) {
   const change = changeOf(metric, trend);
   const values = trend.map((r) => num(r[metric.key]));
   const gauge =
      isPercent(metric.tags) &&
      typeof value === "number" &&
      value >= 0 &&
      value <= 1;
   const ChangeIcon =
      change?.sign === 1
         ? ArrowUpRightIcon
         : change?.sign === -1
           ? ArrowDownRightIcon
           : MinusIcon;
   return (
      <div
         role="button"
         tabIndex={0}
         aria-pressed={active}
         onClick={onSelect}
         onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               onSelect();
            }
         }}
         className={cn(
            "group flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            active && "border-primary/60 bg-primary/5 hover:bg-primary/10",
         )}
      >
         <div className="flex items-center justify-between gap-2">
            <span
               className="truncate text-xs text-muted-foreground"
               title={metric.entity?.name}
            >
               {metric.label}
            </span>
            {metric.entity && (
               <Link
                  to={dictionaryHref(ontology, metric.entity.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  title={`Open ${metric.entity.name}`}
                  aria-label={`Open ${metric.entity.name}`}
               >
                  <ArrowUpRightIcon className="size-3.5" />
               </Link>
            )}
         </div>
         <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xl font-semibold tabular-nums tracking-tight">
               {formatValue(value, metric.tags, true)}
            </span>
            {gauge && <Gauge value={value} />}
         </div>
         {change ? (
            <span
               className="flex items-center gap-0.5 text-[11px] text-muted-foreground"
               title={`Latest month against ${change.against}`}
            >
               <ChangeIcon className="size-3" />
               <span className="tabular-nums text-foreground">
                  {change.text}
               </span>
               <span className="truncate">&nbsp;vs {change.against}</span>
            </span>
         ) : (
            <span className="h-[16.5px]" />
         )}
         {trendLoading ? (
            <Skeleton className="h-7 w-full" />
         ) : (
            values.length > 1 && <MiniSpark values={values} active={active} />
         )}
      </div>
   );
}

function MiniSpark({ values, active }: { values: number[]; active: boolean }) {
   const w = 100;
   const h = 28;
   const min = Math.min(...values);
   const span = Math.max(...values) - min || 1;
   const points = values
      .map(
         (v, i) =>
            `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`,
      )
      .join(" ");
   return (
      <svg
         viewBox={`0 0 ${w} ${h}`}
         preserveAspectRatio="none"
         className={cn(
            "h-7 w-full",
            active ? "text-primary" : "text-muted-foreground/60",
         )}
         aria-hidden
      >
         <polyline
            points={`0,${h} ${points} ${w},${h}`}
            className={active ? "fill-primary/10" : "fill-muted-foreground/5"}
            stroke="none"
         />
         <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
         />
      </svg>
   );
}

/** A half-ring for a share between 0 and 1. */
function Gauge({ value }: { value: number }) {
   const r = 16;
   const length = Math.PI * r;
   return (
      <svg
         width={40}
         height={22}
         viewBox="0 0 40 22"
         className="shrink-0"
         aria-hidden
      >
         <path
            d={`M 4 20 A ${r} ${r} 0 0 1 36 20`}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            className="stroke-muted"
         />
         <path
            d={`M 4 20 A ${r} ${r} 0 0 1 36 20`}
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${value * length} ${length}`}
            className="stroke-primary"
         />
      </svg>
   );
}

function niceTicks(lo: number, hi: number, count = 4): number[] {
   if (lo === hi) {
      lo = lo === 0 ? 0 : lo - Math.abs(lo) * 0.1;
      hi = hi === 0 ? 1 : hi + Math.abs(hi) * 0.1;
   }
   const raw = (hi - lo) / count;
   const mag = 10 ** Math.floor(Math.log10(raw));
   const step = ([1, 2, 2.5, 5, 10].find((f) => f * mag >= raw) ?? 10) * mag;
   const ticks: number[] = [];
   for (
      let t = Math.floor(lo / step) * step;
      t <= hi + step * 1e-9;
      t += step
   ) {
      ticks.push(t);
   }
   if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
   return ticks;
}

function TimelineChart({
   rows,
   metric,
   grain,
}: {
   rows: Row[];
   metric: Metric;
   grain: Grain;
}) {
   const [hover, setHover] = useState<number>();
   const values = rows.map((r) => num(r[metric.key]));
   const n = values.length;
   const min = Math.min(...values);
   const max = Math.max(...values);
   const pad = metric.ratio ? (max - min) * 0.15 : 0;
   const ticks = niceTicks(
      metric.ratio ? min - pad : Math.min(0, min),
      max + pad,
   );
   const yMin = ticks[0];
   const yMax = ticks[ticks.length - 1];
   const W = 1000;
   const H = 200;
   const xAt = (i: number) => (i / (n - 1)) * 100;
   const yAt = (v: number) => (1 - (v - yMin) / (yMax - yMin || 1)) * 100;
   const points = values
      .map((v, i) => `${(xAt(i) / 100) * W},${(yAt(v) / 100) * H}`)
      .join(" ");
   const peak = values.indexOf(max);
   const shown = hover ?? n - 1;
   const labelIdx = [
      ...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (n - 1)))),
   ];

   const onMove = (e: MouseEvent<HTMLDivElement>) => {
      const box = e.currentTarget.getBoundingClientRect();
      const i = Math.round(((e.clientX - box.left) / box.width) * (n - 1));
      setHover(Math.max(0, Math.min(n - 1, i)));
   };

   return (
      <div className="space-y-1">
         <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>
               <span className="text-base font-semibold tabular-nums text-foreground">
                  {formatValue(values[shown], metric.tags)}
               </span>{" "}
               {hover === undefined ? "latest, " : ""}
               {periodLabel(rows[shown].period, grain)}
            </span>
            <span>
               peak{" "}
               <span className="tabular-nums text-foreground">
                  {formatValue(max, metric.tags, true)}
               </span>{" "}
               in {periodLabel(rows[peak].period, grain)}
            </span>
         </div>
         <div className="flex gap-2">
            <div className="relative h-52 w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
               {ticks.map((t) => (
                  <span
                     key={t}
                     className="absolute right-0 -translate-y-1/2"
                     style={{ top: `${yAt(t)}%` }}
                  >
                     {formatValue(t, metric.tags, true)}
                  </span>
               ))}
            </div>
            <div className="min-w-0 flex-1">
               <div
                  className="relative h-52 text-primary"
                  onMouseMove={onMove}
                  onMouseLeave={() => setHover(undefined)}
               >
                  <svg
                     viewBox={`0 0 ${W} ${H}`}
                     preserveAspectRatio="none"
                     className="absolute inset-0 h-full w-full overflow-visible"
                     role="img"
                     aria-label={`${metric.label} by ${grain}`}
                  >
                     {ticks.map((t) => (
                        <line
                           key={t}
                           x1={0}
                           x2={W}
                           y1={(yAt(t) / 100) * H}
                           y2={(yAt(t) / 100) * H}
                           className="stroke-border"
                           strokeDasharray={t === 0 ? undefined : "3 3"}
                           vectorEffect="non-scaling-stroke"
                        />
                     ))}
                     {!metric.ratio && (
                        <polyline
                           points={`0,${(yAt(Math.max(0, yMin)) / 100) * H} ${points} ${W},${(yAt(Math.max(0, yMin)) / 100) * H}`}
                           className="fill-primary/10"
                           stroke="none"
                        />
                     )}
                     <polyline
                        points={points}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                     />
                  </svg>
                  {hover !== undefined && (
                     <>
                        <div
                           className="pointer-events-none absolute inset-y-0 w-px bg-foreground/20"
                           style={{ left: `${xAt(hover)}%` }}
                        />
                        <div
                           className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
                           style={{
                              left: `${xAt(hover)}%`,
                              top: `${yAt(values[hover])}%`,
                           }}
                        />
                     </>
                  )}
               </div>
               <div className="relative mt-1 h-4 text-[10px] text-muted-foreground">
                  {labelIdx.map((i, k) => (
                     <span
                        key={i}
                        className={cn(
                           "absolute whitespace-nowrap",
                           k === 0
                              ? ""
                              : k === labelIdx.length - 1
                                ? "-translate-x-full"
                                : "-translate-x-1/2",
                        )}
                        style={{ left: `${xAt(i)}%` }}
                     >
                        {periodLabel(rows[i].period, grain)}
                     </span>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}

function BreakdownBars({
   ontology,
   dimension,
   metric,
   rows,
}: {
   ontology: Ontology;
   dimension: Entity;
   metric: Metric;
   rows: Row[];
}) {
   const max = Math.max(0, ...rows.map((r) => num(r[metric.key])));
   return (
      <div className="min-w-0 space-y-1.5">
         <Link
            to={dictionaryHref(ontology, dimension.id)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
         >
            {dimension.label ?? dimension.name}
         </Link>
         {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No values.</p>
         ) : (
            rows.map((row, i) => {
               const v = num(row[metric.key]);
               return (
                  <div
                     key={i}
                     className="grid grid-cols-[minmax(0,8rem)_1fr_4.5rem] items-center gap-2 text-xs"
                     title={`${formatValue(row[dimension.name])}: ${formatValue(v, metric.tags)}`}
                  >
                     <span className="truncate">
                        {formatValue(row[dimension.name])}
                     </span>
                     <div className="h-2 overflow-hidden rounded-sm bg-muted">
                        <div
                           className="h-full rounded-sm bg-primary/70"
                           style={{
                              width: `${max ? Math.max((v / max) * 100, 1) : 0}%`,
                           }}
                        />
                     </div>
                     <span className="text-right tabular-nums text-muted-foreground">
                        {formatValue(v, metric.tags, true)}
                     </span>
                  </div>
               );
            })
         )}
      </div>
   );
}
