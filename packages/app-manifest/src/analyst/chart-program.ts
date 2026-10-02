// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Model-written charts are chart programs: JSON that drives TanStack Charts or
// Chart.js directly, free to compose any marks, scales, transforms or chart
// types those libraries have. What a program may not do is carry its own data
// or run code: it names the run's datasets, rows are bound in from the query
// results, and derived fields, filters and conditional paints are written in
// a small expression language evaluated here, never with eval.

import {
   binX,
   binY,
   boxRows,
   cumulative,
   delta,
   deviation,
   first,
   fold,
   groupBy,
   last,
   linearRegressionRowsY,
   median,
   normalize,
   quantile,
   rank,
   ratio,
   rollingWindow,
   stackRowsX,
   stackRowsY,
   variance,
   waterfall,
} from "@tanstack/charts";
import type {
   DatasetColumn,
   Row,
} from "@malloy-publisher/app-manifest/analyst/schema";

export type ChartLibrary = "tanstack" | "chartjs";

/** A value in the expression language: a field name, a literal, or [op, ...args]. */
export type Expr =
   | string
   | number
   | boolean
   | null
   | { lit: unknown }
   | [string, ...Expr[]];

/** A paint or style that depends on the row. */
export interface Conditional {
   if: Expr;
   then: unknown;
   else: unknown;
}

export type Step = Record<string, unknown>;

export interface TableSpec {
   from: string;
   steps?: Step[];
}

export interface ChartProgram {
   library: ChartLibrary;
   title?: string;
   tables?: Record<string, TableSpec>;
   [key: string]: unknown;
}

export interface BoundSource {
   columns: Pick<DatasetColumn, "name" | "type">[];
   rows: Row[];
}

/** A program with the rows it reads, as stored on an insight. */
export interface BoundProgram extends ChartProgram {
   sources: Record<string, BoundSource>;
}

export type ChartRow = Record<string, unknown>;

/** Whether a stored spec is a chart program (older insights carry other specs). */
export const isChartProgram = (spec: unknown): spec is BoundProgram =>
   !!spec &&
   typeof spec === "object" &&
   ((spec as BoundProgram).library === "tanstack" ||
      (spec as BoundProgram).library === "chartjs") &&
   typeof (spec as BoundProgram).sources === "object";

export class ChartError extends Error {}

/** Theme colors a program may name; the renderer swaps in the live palette. */
export const COLOR_TOKENS = [
   "@series1",
   "@series2",
   "@series3",
   "@series4",
   "@series5",
   "@positive",
   "@negative",
   "@muted",
   "@foreground",
   "@grid",
   "@background",
] as const;

export interface ChartTheme {
   tokens: Record<string, string>;
   series: string[];
   foreground: string;
   muted: string;
   grid: string;
   background: string;
   font: string;
}

/** A neutral palette for building programs where no stylesheet exists. */
export const HEADLESS_THEME: ChartTheme = (() => {
   const series = ["#2563eb", "#0d9488", "#d97706", "#db2777", "#7c3aed"];
   const tokens: Record<string, string> = {
      "@positive": "#16a34a",
      "@negative": "#dc2626",
      "@muted": "#71717a",
      "@foreground": "#09090b",
      "@grid": "#e4e4e7",
      "@background": "#ffffff",
   };
   series.forEach((c, i) => (tokens[`@series${i + 1}`] = c));
   return {
      tokens,
      series,
      foreground: "#09090b",
      muted: "#71717a",
      grid: "#e4e4e7",
      background: "#ffffff",
      font: "sans-serif",
   };
})();

export const resolveToken = (v: unknown, theme: ChartTheme) =>
   typeof v === "string" && v.startsWith("@") ? (theme.tokens[v] ?? v) : v;

const MAX_ROWS = 500;

export function parseChartProgram(text: string): {
   program?: ChartProgram;
   issues: string[];
} {
   let value: unknown;
   try {
      value = JSON.parse(text);
   } catch (e) {
      return {
         issues: [`The chart isn't valid JSON: ${(e as Error).message}`],
      };
   }
   if (!value || typeof value !== "object" || Array.isArray(value))
      return { issues: ["The chart must be a JSON object"] };
   const program = value as ChartProgram;
   if (program.library !== "tanstack" && program.library !== "chartjs")
      return {
         issues: ['The chart needs "library": "tanstack" or "chartjs"'],
      };
   const issues: string[] = [];
   const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (node && typeof node === "object")
         for (const [k, v] of Object.entries(node)) {
            if (/^(url|href|src)$/i.test(k))
               issues.push(`${path}.${k}: charts may not load or link out`);
            walk(v, `${path}.${k}`);
         }
      else if (
         typeof node === "string" &&
         /^\s*(javascript|data|https?):/i.test(node)
      )
         issues.push(`${path}: charts may not reference URLs`);
   };
   walk(program, "chart");
   return issues.length ? { issues } : { program, issues };
}

/** Every dataset id a program reads, through its tables or directly. */
export function programDatasets(
   program: ChartProgram,
   known: ReadonlySet<string>,
): string[] {
   const tables = program.tables ?? {};
   const names = new Set<string>();
   const visit = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object")
         for (const [k, v] of Object.entries(node)) {
            if (
               (k === "data" || k === "rows" || k === "from") &&
               typeof v === "string"
            )
               names.add(v);
            visit(v);
         }
   };
   visit(program);
   return [...names].filter((n) => known.has(n) && !(n in tables));
}

export function bindChartProgram(
   program: ChartProgram,
   sources: Record<string, BoundSource>,
): BoundProgram {
   return {
      ...program,
      sources: Object.fromEntries(
         Object.entries(sources).map(([id, s]) => [
            id,
            { columns: s.columns, rows: s.rows.slice(0, MAX_ROWS) },
         ]),
      ),
   };
}

// ── Values ──────────────────────────────────────────────────────────────

const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Malloy sends truncated times as UTC wall clock; they stay in UTC throughout. */
export function toDate(v: unknown): Date | undefined {
   if (v instanceof Date) return v;
   if (typeof v !== "string" || !ISO_TIME.test(v)) return undefined;
   const d = new Date(
      /[TZ+]/.test(v.slice(10))
         ? v
         : `${v.slice(0, 10)}T${v.slice(11) || "00:00:00"}Z`,
   );
   return Number.isNaN(d.getTime()) ? undefined : d;
}

const num = (v: unknown): number => {
   if (typeof v === "number") return v;
   if (v instanceof Date) return v.getTime();
   if (typeof v === "boolean") return v ? 1 : 0;
   if (v === null || v === undefined || v === "") return NaN;
   return Number(v);
};

const cmp = (a: unknown, b: unknown) => {
   const x = a instanceof Date ? a.getTime() : a;
   const y = b instanceof Date ? b.getTime() : b;
   if (typeof x === "number" && typeof y === "number") return x - y;
   return String(x ?? "").localeCompare(String(y ?? ""));
};

const eq = (a: unknown, b: unknown) =>
   a instanceof Date || b instanceof Date
      ? cmp(a, b) === 0
      : a === b || (a != null && b != null && String(a) === String(b));

const utc = (d: unknown) => {
   const date = toDate(d);
   if (!date) throw new ChartError(`expected a date, got ${JSON.stringify(d)}`);
   return date;
};

type Op = (args: unknown[]) => unknown;

const OPS: Record<string, Op> = {
   "+": (a) => a.reduce<number>((s, x) => s + num(x), 0),
   "-": (a) => (a.length === 1 ? -num(a[0]) : num(a[0]) - num(a[1])),
   "*": (a) => a.reduce<number>((s, x) => s * num(x), 1),
   "/": ([a, b]) => (num(b) === 0 ? null : num(a) / num(b)),
   "%": ([a, b]) => num(a) % num(b),
   abs: ([a]) => Math.abs(num(a)),
   round: ([a, d]) => {
      const f = 10 ** (d === undefined ? 0 : num(d));
      return Math.round(num(a) * f) / f;
   },
   floor: ([a]) => Math.floor(num(a)),
   ceil: ([a]) => Math.ceil(num(a)),
   min: (a) => Math.min(...a.map(num)),
   max: (a) => Math.max(...a.map(num)),
   pow: ([a, b]) => num(a) ** num(b),
   sqrt: ([a]) => Math.sqrt(num(a)),
   log: ([a]) => Math.log(num(a)),
   exp: ([a]) => Math.exp(num(a)),
   "==": ([a, b]) => eq(a, b),
   "!=": ([a, b]) => !eq(a, b),
   "<": ([a, b]) => cmp(a, b) < 0,
   "<=": ([a, b]) => cmp(a, b) <= 0,
   ">": ([a, b]) => cmp(a, b) > 0,
   ">=": ([a, b]) => cmp(a, b) >= 0,
   and: (a) => a.every(Boolean),
   or: (a) => a.some(Boolean),
   not: ([a]) => !a,
   in: ([a, list]) => Array.isArray(list) && list.some((x) => eq(a, x)),
   isnull: ([a]) =>
      a === null ||
      a === undefined ||
      (typeof a === "number" && Number.isNaN(a)),
   coalesce: (a) => a.find((x) => x !== null && x !== undefined),
   year: ([d]) => utc(d).getUTCFullYear(),
   month: ([d]) => utc(d).getUTCMonth() + 1,
   quarter: ([d]) => Math.floor(utc(d).getUTCMonth() / 3) + 1,
   day: ([d]) => utc(d).getUTCDate(),
   weekday: ([d]) => utc(d).getUTCDay(),
   date: ([y, m, d]) =>
      new Date(Date.UTC(num(y), num(m ?? 1) - 1, num(d ?? 1))),
   concat: (a) => a.map((x) => formatAuto(x)).join(""),
   str: ([a]) => formatAuto(a),
   format: ([a, f]) => formatValue(a, String(f)),
   number: ([a]) => num(a),
};

/** The ops the expression language has, for prompts and error messages. */
export const EXPR_OPS = [...Object.keys(OPS), "if", "field", "lit"];

export function evaluate(expr: Expr | Conditional, row: ChartRow): unknown {
   if (expr === null || typeof expr === "number" || typeof expr === "boolean")
      return expr;
   if (typeof expr === "string") {
      if (!(expr in row))
         throw new ChartError(
            `unknown field "${expr}" (fields: ${Object.keys(row).join(", ")}); write string literals as {"lit": "..."}`,
         );
      return row[expr];
   }
   if (Array.isArray(expr)) {
      const [op, ...args] = expr;
      if (op === "if")
         return evaluate(args[0], row)
            ? evaluate(args[1], row)
            : evaluate(args[2] ?? null, row);
      if (op === "lit") return args[0];
      if (op === "field") return evaluate(String(args[0]), row);
      const fn = OPS[op];
      if (!fn)
         throw new ChartError(
            `unknown op "${op}" (ops: ${EXPR_OPS.join(" ")})`,
         );
      return fn(args.map((a) => evaluate(a, row)));
   }
   if (typeof expr === "object") {
      if ("lit" in expr) return expr.lit;
      if ("if" in expr) return evaluate(expr.if, row) ? expr.then : expr.else;
   }
   throw new ChartError(`can't read expression ${JSON.stringify(expr)}`);
}

export const isConditional = (v: unknown): v is Conditional =>
   !!v &&
   typeof v === "object" &&
   !Array.isArray(v) &&
   "if" in v &&
   "then" in v;

// ── Formats ─────────────────────────────────────────────────────────────

const dateFmt = (o: Intl.DateTimeFormatOptions) =>
   new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o });
const DATE_FORMATS = {
   month: dateFmt({ month: "short" }),
   month_year: dateFmt({ month: "short", year: "2-digit" }),
   month_year_long: dateFmt({ month: "short", year: "numeric" }),
   year: dateFmt({ year: "numeric" }),
   date: dateFmt({ month: "short", day: "numeric", year: "numeric" }),
   day: dateFmt({ month: "short", day: "numeric" }),
};

const digits = (min: number, max: number) => ({
   minimumFractionDigits: min,
   maximumFractionDigits: max,
});

/**
 * Number formats as Intl options, which Chart.js takes as ticks.format. Both
 * digit bounds are set, since Chart.js merges these over its own.
 */
export const NUMBER_FORMATS: Record<string, Intl.NumberFormatOptions> = {
   currency: {
      style: "currency",
      currency: "USD",
      notation: "compact",
      ...digits(0, 1),
   },
   currency_full: { style: "currency", currency: "USD", ...digits(0, 0) },
   percent: { style: "percent", ...digits(0, 0) },
   percent1: { style: "percent", ...digits(1, 1) },
   signed_percent: {
      style: "percent",
      signDisplay: "exceptZero",
      ...digits(0, 1),
   },
   number: digits(0, 2),
   integer: digits(0, 0),
   compact: { notation: "compact", ...digits(0, 1) },
   signed: { signDisplay: "exceptZero", ...digits(0, 1) },
};

export const FORMAT_NAMES = [
   ...Object.keys(NUMBER_FORMATS),
   "points",
   ...Object.keys(DATE_FORMATS),
   "quarter",
];

const numberFormatters = Object.fromEntries(
   Object.entries(NUMBER_FORMATS).map(([k, o]) => [
      k,
      new Intl.NumberFormat("en-US", o),
   ]),
);

function formatAuto(v: unknown): string {
   if (v === null || v === undefined) return "";
   if (v instanceof Date) return DATE_FORMATS.date.format(v);
   if (typeof v === "number")
      return Number.isInteger(v)
         ? String(v)
         : numberFormatters.number.format(v);
   return String(v);
}

export function formatValue(v: unknown, format?: string): string {
   if (!format) return formatAuto(v);
   if (format in DATE_FORMATS) {
      const d = toDate(v);
      return d
         ? DATE_FORMATS[format as keyof typeof DATE_FORMATS].format(d)
         : formatAuto(v);
   }
   if (format === "quarter") {
      const d = toDate(v);
      return d
         ? `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${String(d.getUTCFullYear()).slice(2)}`
         : formatAuto(v);
   }
   const n = num(v);
   if (!Number.isFinite(n)) return formatAuto(v);
   if (format === "points")
      return `${n > 0 ? "+" : ""}${numberFormatters.number.format(n)} pts`;
   const f = numberFormatters[format];
   if (!f)
      throw new ChartError(
         `unknown format "${format}" (formats: ${FORMAT_NAMES.join(", ")})`,
      );
   return f.format(n);
}

export function checkFormat(format: unknown, where: string) {
   if (format === undefined) return;
   if (typeof format !== "string" || !FORMAT_NAMES.includes(format))
      throw new ChartError(
         `${where}: unknown format ${JSON.stringify(format)} (formats: ${FORMAT_NAMES.join(", ")})`,
      );
}

// ── Tables ──────────────────────────────────────────────────────────────

const REDUCERS: Record<string, unknown> = {
   median,
   variance,
   deviation,
   first,
   last,
   delta,
   ratio,
};

/** A transform's JSON options, with reducer names swapped for TanStack's reducers. */
function transformOptions(options: unknown): Record<string, unknown> {
   if (!options || typeof options !== "object" || Array.isArray(options))
      throw new ChartError("a transform step takes an options object");
   const o = { ...(options as Record<string, unknown>) };
   if (o.outputs && typeof o.outputs === "object") {
      o.outputs = Object.fromEntries(
         Object.entries(
            o.outputs as Record<string, Record<string, unknown>>,
         ).map(([k, out]) => {
            const r = out?.reduce;
            if (r === "quantile")
               return [k, { ...out, reduce: quantile(num(out.p ?? 0.5)) }];
            return [
               k,
               typeof r === "string" && r in REDUCERS
                  ? { ...out, reduce: REDUCERS[r] }
                  : out,
            ];
         }),
      );
   }
   return o;
}

type Transform = (rows: ChartRow[], options: never) => unknown;

const TRANSFORMS: Record<string, Transform> = {
   fold: fold as never,
   groupBy: groupBy as never,
   rollingWindow: rollingWindow as never,
   cumulative: cumulative as never,
   rank: rank as never,
   normalize: normalize as never,
   stackRowsX: stackRowsX as never,
   stackRowsY: stackRowsY as never,
   waterfall: waterfall as never,
   binX: binX as never,
   binY: binY as never,
   boxRows: boxRows as never,
   linearRegressionRowsY: linearRegressionRowsY as never,
};

const OWN_STEPS = ["filter", "derive", "summarize", "sort", "limit"];

export const STEP_NAMES = [...OWN_STEPS, ...Object.keys(TRANSFORMS)];

const sortRows = (rows: ChartRow[], spec: unknown) => {
   const keys = (Array.isArray(spec) ? spec : [spec]).map((s) =>
      typeof s === "string"
         ? { field: s, order: "asc" }
         : (s as { field: string; order?: string }),
   );
   return [...rows].sort((a, b) => {
      for (const k of keys) {
         const c = cmp(evaluate(k.field, a), evaluate(k.field, b));
         if (c) return k.order === "desc" ? -c : c;
      }
      return 0;
   });
};

/** Whole-table (or per-group) aggregates attached to every row. */
function summarize(rows: ChartRow[], step: Step): ChartRow[] {
   const { summarize: outputs, by } = step as {
      summarize: Record<string, { value?: string; reduce: string }>;
      by?: string | string[];
   };
   const keys = by === undefined ? [] : [by].flat();
   const groups = groupBy(rows, {
      by: Object.fromEntries(
         keys.length
            ? keys.map((k) => [k, (d: ChartRow) => evaluate(k, d) as never])
            : [["__all", () => "all"]],
      ),
      outputs: transformOptions({ outputs }).outputs as never,
   }) as unknown as ChartRow[];
   const keyOf = (r: ChartRow) =>
      keys.length ? JSON.stringify(keys.map((k) => formatAuto(r[k]))) : "all";
   const byKey = new Map(groups.map((g) => [keyOf(g), g]));
   return rows.map((r) => {
      const g = byKey.get(keyOf(r))!;
      return {
         ...r,
         ...Object.fromEntries(Object.keys(outputs).map((k) => [k, g[k]])),
      };
   });
}

function applyStep(rows: ChartRow[], step: Step): ChartRow[] {
   const name = Object.keys(step).find((k) => STEP_NAMES.includes(k));
   if (!name)
      throw new ChartError(
         `unknown step ${JSON.stringify(Object.keys(step))} (steps: ${STEP_NAMES.join(", ")})`,
      );
   const arg = step[name];
   switch (name) {
      case "filter":
         return rows.filter((r) => evaluate(arg as Expr, r));
      case "derive": {
         const fields = Object.entries(arg as Record<string, Expr>);
         return rows.map((r) => {
            const out = { ...r };
            for (const [k, e] of fields) out[k] = evaluate(e, out);
            return out;
         });
      }
      case "summarize":
         return summarize(rows, step);
      case "sort":
         return sortRows(rows, arg);
      case "limit":
         return rows.slice(0, num(arg));
      default: {
         const result = TRANSFORMS[name](rows, transformOptions(arg) as never);
         if (!Array.isArray(result))
            throw new ChartError(`${name} didn't return rows`);
         return result as ChartRow[];
      }
   }
}

/** Source rows as chart rows: time columns become Dates, in UTC. */
function sourceRows(source: BoundSource): ChartRow[] {
   const dates = source.columns
      .filter((c) => c.type === "date")
      .map((c) => c.name);
   return source.rows.map((r) => {
      const out: ChartRow = { ...r };
      for (const k of dates) out[k] = toDate(r[k]) ?? r[k];
      for (const [k, v] of Object.entries(r))
         if (!dates.includes(k) && typeof v === "string" && ISO_TIME.test(v))
            out[k] = toDate(v) ?? v;
      return out;
   });
}

/** Every table a program can read: its datasets as bound, then its derived tables. */
export function buildTables(program: BoundProgram): Map<string, ChartRow[]> {
   const tables = new Map<string, ChartRow[]>();
   for (const [id, s] of Object.entries(program.sources))
      tables.set(id, sourceRows(s));
   const specs = program.tables ?? {};
   const building = new Set<string>();
   const build = (name: string): ChartRow[] => {
      const done = tables.get(name);
      if (done) return done;
      const spec = specs[name];
      if (!spec)
         throw new ChartError(
            `"${name}" is not a dataset of this run or a table of the chart (known: ${[...tables.keys(), ...Object.keys(specs)].join(", ")})`,
         );
      if (building.has(name))
         throw new ChartError(`table "${name}" reads itself`);
      building.add(name);
      let rows = build(spec.from);
      (spec.steps ?? []).forEach((step, i) => {
         try {
            rows = applyStep(rows, step);
         } catch (e) {
            throw new ChartError(
               `tables.${name}.steps[${i}]: ${(e as Error).message}`,
            );
         }
      });
      tables.set(name, rows);
      return rows;
   };
   for (const name of Object.keys(specs)) build(name);
   return tables;
}

export function tableRows(
   tables: Map<string, ChartRow[]>,
   name: unknown,
   where: string,
): ChartRow[] {
   if (typeof name !== "string")
      throw new ChartError(`${where}: name a table or dataset`);
   const rows = tables.get(name);
   if (!rows)
      throw new ChartError(
         `${where}: "${name}" is not a dataset of this run or a table of the chart (known: ${[...tables.keys()].join(", ")})`,
      );
   return rows;
}

export function checkField(rows: ChartRow[], field: string, where: string) {
   if (rows.length && !rows.some((r) => field in r))
      throw new ChartError(
         `${where}: no field "${field}" (fields: ${Object.keys(rows[0]).join(", ")})`,
      );
}

/** A program's JSON with each dataset's rows summarized, for reading. */
export function programText(program: BoundProgram): string {
   const { sources, ...rest } = program;
   return JSON.stringify(
      {
         ...rest,
         sources: Object.fromEntries(
            Object.entries(sources ?? {}).map(([id, s]) => [
               id,
               `${s.rows.length} rows from the query`,
            ]),
         ),
      },
      null,
      2,
   );
}
