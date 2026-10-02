// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Deterministic arithmetic over stored datasets. compute_metric is the only
// source of a number in the analyst's prose, so this is where every one of
// them comes from.

import { z } from "zod";
import { formatTime } from "./format";
import type {
   ColumnUnit,
   Dataset,
   DatasetColumn,
   Metric,
   MetricUnit,
   Row,
} from "./schema";

export const METRIC_OPS = [
   "sum",
   "avg",
   "min",
   "max",
   "count",
   "first",
   "last",
   "lookup",
   "share",
   "pct_change",
   "diff",
   "max_by",
   "min_by",
   "top_n",
   "yoy",
] as const;
export type MetricOp = (typeof METRIC_OPS)[number];

const RowFilter = z
   .array(
      z.object({
         column: z.string(),
         equals: z.union([z.string(), z.number()]),
      }),
   )
   .describe(
      "Rows where every column equals its value. A time column matches by prefix, so '2026-03' selects March 2026.",
   );

export const ComputeMetricInput = z.object({
   datasetId: z.string(),
   op: z
      .enum(METRIC_OPS)
      .describe(
         [
            "sum/avg/min/max/first/last: of `column` over the rows (after `where`); first/last are earliest/latest when the dataset has a time column.",
            "count: rows (after `where`).",
            "lookup: `column` in the single row `where` selects.",
            "share: `column` summed over `where` rows, as a fraction of its total.",
            "pct_change / diff: `column` at `where` (to) against `from` (baseline); defaults to latest vs earliest.",
            "max_by / min_by: the `by` label of the row where `column` is largest / smallest.",
            "top_n: the `by` labels of the `n` largest rows by `column`.",
            "yoy: change of `column` in the latest `by` period against the same period a year earlier.",
         ].join(" "),
      ),
   column: z.string().optional().describe("The numeric column"),
   by: z.string().optional().describe("The label or time column"),
   where: RowFilter.optional(),
   from: RowFilter.optional(),
   n: z.number().int().min(1).max(10).optional(),
   label: z.string().describe("What the number is, in a few words"),
});
export type ComputeMetricInput = z.infer<typeof ComputeMetricInput>;

type Filter = NonNullable<ComputeMetricInput["where"]>;

const num = (v: unknown): number | null =>
   typeof v === "number" && Number.isFinite(v) ? v : null;

function column(ds: Dataset, name: string | undefined, op: string) {
   if (!name) throw new Error(`${op} needs a column`);
   const col = ds.columns.find((c) => c.name === name);
   if (!col) {
      throw new Error(
         `No column "${name}" in ${ds.id}; it has ${ds.columns.map((c) => c.name).join(", ")}`,
      );
   }
   return col;
}

function select(ds: Dataset, filter: Filter | undefined): Row[] {
   if (!filter?.length) return ds.rows;
   for (const f of filter) column(ds, f.column, "where");
   const type = new Map(ds.columns.map((c) => [c.name, c.type]));
   return ds.rows.filter((row) =>
      filter.every(({ column: c, equals }) => {
         const cell = row[c];
         if (cell === null || cell === undefined) return false;
         if (String(cell) === String(equals)) return true;
         return (
            type.get(c) === "date" && String(cell).startsWith(String(equals))
         );
      }),
   );
}

function values(rows: Row[], col: DatasetColumn): number[] {
   if (col.type !== "number") throw new Error(`${col.name} is not numeric`);
   return rows
      .map((r) => num(r[col.name]))
      .filter((v): v is number => v !== null);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A date column, or a numeric year column, that orders the rows in time. */
function timeColumn(ds: Dataset): DatasetColumn | undefined {
   return (
      ds.columns.find((c) => c.type === "date") ??
      ds.columns.find((c) => c.type === "number" && /(^|_)year$/i.test(c.name))
   );
}

/** Rows earliest first when the dataset has a time column; as stored otherwise. */
function chronological(ds: Dataset, rows: Row[]): Row[] {
   const t = timeColumn(ds);
   if (!t) return rows;
   return [...rows].sort((a, b) =>
      String(a[t.name]).localeCompare(String(b[t.name])),
   );
}

const describeFilter = (f: Filter | undefined) =>
   f?.length
      ? f.map((x) => formatTime(String(x.equals))).join(", ")
      : undefined;

function unitOf(col: DatasetColumn): MetricUnit {
   return (col.unit ?? "number") satisfies ColumnUnit;
}

/** Computes one metric, or throws an error written for the model to act on. */
export function computeMetric(
   ds: Dataset,
   input: ComputeMetricInput,
): Omit<Metric, "id" | "stepId"> {
   const base = {
      datasetId: ds.id,
      op: input.op,
      column: input.column,
      label: input.label,
   };
   const rows = select(ds, input.where);
   switch (input.op) {
      case "count":
         return { ...base, value: rows.length, unit: "number" };
      case "sum":
      case "avg":
      case "min":
      case "max":
      case "first":
      case "last": {
         const col = column(ds, input.column, input.op);
         const xs = values(chronological(ds, rows), col);
         if (xs.length === 0)
            throw new Error(`No ${col.name} values to ${input.op}`);
         const value =
            input.op === "sum"
               ? sum(xs)
               : input.op === "avg"
                 ? sum(xs) / xs.length
                 : input.op === "min"
                   ? Math.min(...xs)
                   : input.op === "max"
                     ? Math.max(...xs)
                     : input.op === "first"
                       ? xs[0]
                       : xs[xs.length - 1];
         return {
            ...base,
            value,
            unit: unitOf(col),
            detail: describeFilter(input.where),
         };
      }
      case "lookup": {
         const col = column(ds, input.column, "lookup");
         if (rows.length !== 1) {
            throw new Error(
               `lookup's where selected ${rows.length} rows; it must select exactly one`,
            );
         }
         const v = rows[0][col.name];
         return {
            ...base,
            value: typeof v === "number" ? v : v === null ? null : String(v),
            unit: col.type === "number" ? unitOf(col) : "label",
            detail: describeFilter(input.where),
         };
      }
      case "share": {
         const col = column(ds, input.column, "share");
         const total = sum(values(ds.rows, col));
         if (total === 0) throw new Error(`${col.name} totals zero`);
         return {
            ...base,
            value: sum(values(rows, col)) / total,
            unit: "percent",
            detail: describeFilter(input.where),
         };
      }
      case "pct_change":
      case "diff": {
         const col = column(ds, input.column, input.op);
         const ordered = chronological(ds, ds.rows);
         const t = timeColumn(ds);
         const toRows = input.where?.length ? rows : ordered.slice(-1);
         const fromRows = input.from?.length
            ? select(ds, input.from)
            : ordered.slice(0, 1);
         if (!toRows.length || !fromRows.length) {
            throw new Error(`${input.op} found no rows for one side`);
         }
         const to = sum(values(toRows, col));
         const from = sum(values(fromRows, col));
         const edge = (r: Row[], fallback: string) =>
            t ? formatTime(String(r[0][t.name])) : fallback;
         const detail = `${describeFilter(input.where) ?? edge(toRows, "last row")} vs ${describeFilter(input.from) ?? edge(fromRows, "first row")}`;
         if (input.op === "diff") {
            return {
               ...base,
               value: to - from,
               unit: col.unit === "percent" ? "points" : unitOf(col),
               detail,
            };
         }
         if (from === 0) throw new Error("The baseline is zero");
         return {
            ...base,
            value: (to - from) / Math.abs(from),
            unit: "percent",
            detail,
         };
      }
      case "max_by":
      case "min_by": {
         const col = column(ds, input.column, input.op);
         const by = column(ds, input.by, input.op);
         let best: Row | undefined;
         for (const r of rows) {
            const v = num(r[col.name]);
            if (v === null) continue;
            const b = best ? num(best[col.name])! : null;
            if (b === null || (input.op === "max_by" ? v > b : v < b)) best = r;
         }
         if (!best) throw new Error(`No ${col.name} values`);
         return {
            ...base,
            value: String(best[by.name]),
            unit: by.type === "date" ? "date" : "label",
            detail: `${col.name} ${input.op === "max_by" ? "highest" : "lowest"}`,
         };
      }
      case "top_n": {
         const col = column(ds, input.column, "top_n");
         const by = column(ds, input.by, "top_n");
         const top = [...rows]
            .filter((r) => num(r[col.name]) !== null)
            .sort((a, b) => num(b[col.name])! - num(a[col.name])!)
            .slice(0, input.n ?? 3)
            .map((r) =>
               by.type === "date"
                  ? formatTime(String(r[by.name]))
                  : String(r[by.name]),
            );
         return { ...base, value: top.join(", "), unit: "label" };
      }
      case "yoy": {
         const col = column(ds, input.column, "yoy");
         const by = column(ds, input.by, "yoy");
         if (by.type !== "date")
            throw new Error("yoy needs a time `by` column");
         const dated = rows
            .filter((r) => typeof r[by.name] === "string")
            .sort((a, b) =>
               String(a[by.name]).localeCompare(String(b[by.name])),
            );
         const latest = dated[dated.length - 1];
         if (!latest) throw new Error("No rows");
         const at = String(latest[by.name]);
         const prior = at.replace(/^\d{4}/, (y) => String(Number(y) - 1));
         const before = dated.find((r) => String(r[by.name]) === prior);
         const to = num(latest[col.name]);
         const from = before ? num(before[col.name]) : null;
         if (to === null || from === null || from === 0) {
            throw new Error(`No ${col.name} a year before ${formatTime(at)}`);
         }
         return {
            ...base,
            value: (to - from) / Math.abs(from),
            unit: "percent",
            detail: `${formatTime(at)} vs ${formatTime(prior)}`,
         };
      }
   }
}

// ── Datasets ────────────────────────────────────────────────────────────

/** Columns from the rows, with units and labels from the model's field tags. */
export function inferColumns(
   rows: Row[],
   hints: ReadonlyMap<string, { unit?: ColumnUnit; label?: string }>,
): DatasetColumn[] {
   const names = new Set<string>();
   for (const r of rows.slice(0, 50))
      Object.keys(r).forEach((k) => names.add(k));
   return [...names].map((name) => {
      const sample = rows
         .map((r) => r[name])
         .find((v) => v !== null && v !== undefined);
      const type: DatasetColumn["type"] =
         typeof sample === "number"
            ? "number"
            : typeof sample === "boolean"
              ? "boolean"
              : typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample)
                ? "date"
                : "string";
      const hint = hints.get(name);
      return {
         name,
         type,
         unit: type === "number" ? (hint?.unit ?? "number") : undefined,
         label: hint?.label,
      };
   });
}

export type ColumnStats =
   | {
        type: "number";
        min: number;
        max: number;
        mean: number;
        sum: number;
        nulls: number;
     }
   | { type: "date"; min: string; max: string; nulls: number }
   | {
        type: "string" | "boolean";
        distinct: number;
        top: string[];
        nulls: number;
     };

/** Per-column summary the model reads instead of every row. */
export function columnStats(ds: Pick<Dataset, "columns" | "rows">) {
   const out: Record<string, ColumnStats> = {};
   for (const col of ds.columns) {
      const cells = ds.rows.map((r) => r[col.name]);
      const nulls = cells.filter((v) => v === null || v === undefined).length;
      if (col.type === "number") {
         const xs = cells.map(num).filter((v): v is number => v !== null);
         if (xs.length === 0) continue;
         const total = sum(xs);
         out[col.name] = {
            type: "number",
            min: Math.min(...xs),
            max: Math.max(...xs),
            mean: total / xs.length,
            sum: total,
            nulls,
         };
      } else if (col.type === "date") {
         const xs = cells
            .filter((v): v is string => typeof v === "string")
            .sort();
         if (xs.length === 0) continue;
         out[col.name] = {
            type: "date",
            min: xs[0],
            max: xs[xs.length - 1],
            nulls,
         };
      } else {
         const counts = new Map<string, number>();
         for (const v of cells) {
            if (v === null || v === undefined) continue;
            counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
         }
         out[col.name] = {
            type: col.type,
            distinct: counts.size,
            top: [...counts.entries()]
               .sort((a, b) => b[1] - a[1])
               .slice(0, 5)
               .map(([k]) => k),
            nulls,
         };
      }
   }
   return out;
}
