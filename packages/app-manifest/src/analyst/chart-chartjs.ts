// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A "chartjs" chart program as a Chart.js config. The program is Chart.js's
// own config, with datasets that name a table ("rows") instead of carrying
// data, conditional paints for scriptable options, and the theme merged
// underneath whatever the program sets.

import {
   buildTables,
   ChartError,
   checkField,
   evaluate,
   formatValue,
   isConditional,
   NUMBER_FORMATS,
   resolveToken,
   tableRows,
   type BoundProgram,
   type ChartRow,
   type ChartTheme,
   type Expr,
} from "./chart-program";

export const CHARTJS_TYPES = [
   "bar",
   "line",
   "scatter",
   "bubble",
   "pie",
   "doughnut",
   "polarArea",
   "radar",
];
const RADIAL = new Set(["pie", "doughnut", "polarArea", "radar"]);
/** Keys the card owns: it sizes, animates and wires the chart. */
const OWNED = [
   "responsive",
   "maintainAspectRatio",
   "aspectRatio",
   "devicePixelRatio",
   "animation",
   "animations",
   "onClick",
   "onHover",
   "onResize",
   "locale",
];

type Spec = Record<string, unknown>;
const isObject = (v: unknown): v is Spec =>
   !!v && typeof v === "object" && !Array.isArray(v);

function merge(base: Spec, over: Spec): Spec {
   const out: Spec = { ...base };
   for (const [k, v] of Object.entries(over))
      out[k] = isObject(v) && isObject(base[k]) ? merge(base[k] as Spec, v) : v;
   return out;
}

/** How to label a column of dates: by the coarsest grain every value sits on. */
function dateLabeler(values: Date[]) {
   const at = (f: (d: Date) => boolean) => values.every(f);
   const format = at(
      (d) => d.getUTCMonth() === 0 && d.getUTCDate() === 1 && !d.getUTCHours(),
   )
      ? "year"
      : at((d) => d.getUTCDate() === 1 && !d.getUTCHours())
        ? "month_year_long"
        : "date";
   return (d: Date) => formatValue(d, format);
}

/** Dates as labels: Chart.js reads category axes, and has no date adapter here. */
function labelDates(rows: ChartRow[]): ChartRow[] {
   const fields = new Set(
      rows.flatMap((r) =>
         Object.entries(r)
            .filter(([, v]) => v instanceof Date)
            .map(([k]) => k),
      ),
   );
   if (!fields.size) return rows;
   const labelers = new Map(
      [...fields].map((f) => [
         f,
         dateLabeler(
            rows.map((r) => r[f]).filter((v): v is Date => v instanceof Date),
         ),
      ]),
   );
   return rows.map((r) => {
      const out = { ...r };
      for (const [f, label] of labelers)
         if (out[f] instanceof Date) out[f] = label(out[f] as Date);
      return out;
   });
}

/** Tokens to colors, and {"if", "then", "else"} to scriptable options on the row. */
function resolveStyle(node: unknown, theme: ChartTheme): unknown {
   if (isConditional(node)) {
      const cond = node;
      const then = resolveStyle(cond.then, theme);
      const other = resolveStyle(cond.else, theme);
      return (ctx: { raw?: unknown }) => {
         const row = isObject(ctx?.raw) ? (ctx.raw as ChartRow) : undefined;
         if (!row) return other;
         try {
            return evaluate(cond.if, row) ? then : other;
         } catch {
            return other;
         }
      };
   }
   if (Array.isArray(node)) return node.map((x) => resolveStyle(x, theme));
   if (isObject(node))
      return Object.fromEntries(
         Object.entries(node).map(([k, v]) => [k, resolveStyle(v, theme)]),
      );
   return resolveToken(node, theme);
}

function scaleFormats(scales: Spec, where: string) {
   for (const [name, s] of Object.entries(scales)) {
      if (!isObject(s)) continue;
      if (s.type === "time" || s.type === "timeseries")
         throw new ChartError(
            `${where}.${name}.type: time axes aren't available; dates arrive as labels, so use the default category axis`,
         );
      const ticks = s.ticks as Spec | undefined;
      const f = ticks?.format;
      if (isObject(f)) {
         const max = f.maximumFractionDigits;
         if (typeof max === "number" && f.minimumFractionDigits === undefined)
            f.minimumFractionDigits = 0;
         continue;
      }
      if (typeof f !== "string") continue;
      if (f in NUMBER_FORMATS) ticks!.format = NUMBER_FORMATS[f];
      else if (f === "points") {
         delete ticks!.format;
         ticks!.callback = (v: unknown) => formatValue(v, "points");
      } else
         throw new ChartError(
            `${where}.${name}.ticks.format: one of ${[...Object.keys(NUMBER_FORMATS), "points"].join(", ")}, or Intl.NumberFormat options`,
         );
   }
}

export interface ChartJsBuild {
   config: { type: string; data: Spec; options: Spec };
   datasets: { label: string; rows: number }[];
}

export function chartJsConfig(
   program: BoundProgram,
   theme: ChartTheme,
   { compact = false }: { compact?: boolean } = {},
): ChartJsBuild {
   const type = program.type as string;
   if (!CHARTJS_TYPES.includes(type))
      throw new ChartError(
         `type: "${type}" is not a Chart.js type here (types: ${CHARTJS_TYPES.join(", ")})`,
      );
   if (Array.isArray(program.plugins))
      throw new ChartError("plugins: inline plugins are code; not allowed");
   const tables = buildTables(program);
   const data = (program.data ?? {}) as Spec;
   if (!Array.isArray(data.datasets) || !data.datasets.length)
      throw new ChartError('data.datasets: at least one dataset with "rows"');

   const built = (data.datasets as Spec[]).map((ds, i) => {
      const where = `data.datasets[${i}]`;
      if ("data" in ds)
         throw new ChartError(
            `${where}.data: datasets read rows by name; use "rows": "<table or datasetId>"`,
         );
      if (ds.type !== undefined && !CHARTJS_TYPES.includes(ds.type as string))
         throw new ChartError(
            `${where}.type: one of ${CHARTJS_TYPES.join(", ")}`,
         );
      let rows = tableRows(tables, ds.rows, `${where}.rows`);
      if (ds.filter !== undefined)
         rows = rows.filter((r) => evaluate(ds.filter as Expr, r));
      const parsing = ds.parsing;
      if (!isObject(parsing))
         throw new ChartError(
            `${where}.parsing: name the fields to plot, e.g. {"xAxisKey": "month", "yAxisKey": "revenue"} (or {"key": "value"} for pie, doughnut, polarArea, radar)`,
         );
      for (const [k, f] of Object.entries(parsing))
         if (typeof f === "string")
            checkField(rows, f, `${where}.parsing.${k}`);
      const rest = Object.fromEntries(
         Object.entries(ds).filter(([k]) => !["rows", "filter"].includes(k)),
      );
      const dsType = (ds.type as string | undefined) ?? type;
      const paint =
         RADIAL.has(dsType) && dsType !== "radar"
            ? theme.series
            : theme.series[i % theme.series.length];
      return {
         dataset: {
            ...(ds.backgroundColor === undefined && ds.borderColor === undefined
               ? {
                    backgroundColor: paint,
                    borderColor: Array.isArray(paint)
                       ? theme.background
                       : paint,
                 }
               : {}),
            ...(resolveStyle(rest, theme) as Spec),
            data: labelDates(rows),
         },
         label: String(ds.label ?? `Series ${i + 1}`),
         rows: rows.length,
      };
   });

   let labels: unknown[] | undefined;
   if (isObject(data.labels)) {
      const l = data.labels;
      const rows = labelDates(tableRows(tables, l.rows, "data.labels.rows"));
      if (typeof l.field !== "string")
         throw new ChartError(
            'data.labels: {"rows": "<table>", "field": "<column>"}',
         );
      checkField(rows, l.field, "data.labels.field");
      labels = rows.map((r) =>
         typeof l.format === "string"
            ? formatValue(r[l.field as string], l.format)
            : r[l.field as string],
      );
   } else if (Array.isArray(data.labels)) {
      if (!data.labels.every((x) => typeof x === "string"))
         throw new ChartError('data.labels: strings, or {"rows", "field"}');
      labels = data.labels;
   } else if (RADIAL.has(type)) {
      throw new ChartError(
         `data.labels: a ${type} chart needs labels, e.g. {"rows": "<table>", "field": "<category column>"}`,
      );
   }

   const own = Object.fromEntries(
      Object.entries((program.options ?? {}) as Spec).filter(
         ([k]) => !OWNED.includes(k),
      ),
   );
   const options = resolveStyle(own, theme) as Spec;
   const userScales = isObject(options.scales) ? options.scales : {};
   scaleFormats(userScales, "options.scales");

   const size = compact ? 9 : 11;
   const axis = {
      grid: { color: theme.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: theme.muted, padding: 6, font: { size } },
      title: { color: theme.muted, font: { size } },
   };
   const radialAxis = {
      grid: { color: theme.grid },
      angleLines: { color: theme.grid },
      pointLabels: { color: theme.muted, font: { size } },
      ticks: {
         color: theme.muted,
         backdropColor: "transparent",
         font: { size },
      },
   };
   const scaleNames = new Set([
      ...(RADIAL.has(type)
         ? type === "pie" || type === "doughnut"
            ? []
            : ["r"]
         : ["x", "y"]),
      ...Object.keys(userScales),
   ]);
   const baseScales = Object.fromEntries(
      [...scaleNames].map((n) => [
         n,
         n === "r"
            ? radialAxis
            : merge(
                 axis,
                 n === "x" || (userScales[n] as Spec)?.axis === "x"
                    ? { grid: { display: false } }
                    : {},
              ),
      ]),
   );
   const base: Spec = {
      color: theme.muted,
      borderColor: theme.grid,
      font: { family: theme.font, size },
      layout: { padding: compact ? 2 : 4 },
      elements: {
         line: { borderWidth: 2, tension: 0.25 },
         point: { radius: compact ? 0 : 2.5, hoverRadius: 4 },
         bar: { borderRadius: 3, borderWidth: 0 },
         arc: { borderWidth: 1, borderColor: theme.background },
      },
      plugins: {
         legend: {
            display: !compact && (built.length > 1 || RADIAL.has(type)),
            labels: {
               color: theme.muted,
               boxWidth: 8,
               boxHeight: 8,
               usePointStyle: true,
               font: { size },
            },
         },
         tooltip: {
            backgroundColor: theme.background,
            titleColor: theme.foreground,
            bodyColor: theme.foreground,
            borderColor: theme.grid,
            borderWidth: 1,
            padding: 8,
            boxPadding: 4,
            usePointStyle: true,
         },
      },
      ...(RADIAL.has(type) && type !== "radar" && type !== "polarArea"
         ? {}
         : { scales: baseScales }),
   };
   if (type === "polarArea" || type === "radar") base.scales = baseScales;
   const merged = merge(base, options);
   if (compact && isObject(merged.scales))
      for (const s of Object.values(merged.scales as Spec))
         if (isObject(s) && isObject(s.title))
            s.title = { ...s.title, display: false };

   return {
      config: {
         type,
         data: {
            ...(labels ? { labels } : {}),
            datasets: built.map((b) => b.dataset),
         },
         options: {
            ...merged,
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
         },
      },
      datasets: built.map((b) => ({ label: b.label, rows: b.rows })),
   };
}
