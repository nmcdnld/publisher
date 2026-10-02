// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Every number the analyst shows is formatted here, from its unit, never by
// the model.

import type { ColumnUnit, Metric } from "./schema";
import { splitTokens } from "./tokens";

const nf = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-US", o);
const fmt = {
   currency: nf({
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
   }),
   cents: nf({ style: "currency", currency: "USD", maximumFractionDigits: 2 }),
   compactCurrency: nf({
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
   }),
   percent: nf({ style: "percent", maximumFractionDigits: 1 }),
   number: nf({ maximumFractionDigits: 1 }),
   compact: nf({ notation: "compact", maximumFractionDigits: 1 }),
};

const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/** A time value at the grain it was truncated to: "2026", "Mar 2026", or "Mar 3, 2026". */
export function formatTime(value: string): string {
   if (!ISO.test(value)) return value;
   const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
   if (Number.isNaN(d.getTime())) return value;
   const utc = { timeZone: "UTC" } as const;
   if (d.getUTCDate() === 1 && d.getUTCMonth() === 0)
      return String(d.getUTCFullYear());
   if (d.getUTCDate() === 1)
      return d.toLocaleDateString("en-US", {
         ...utc,
         month: "short",
         year: "numeric",
      });
   return d.toLocaleDateString("en-US", {
      ...utc,
      month: "short",
      day: "numeric",
      year: "numeric",
   });
}

export const isTimeValue = (v: unknown) => typeof v === "string" && ISO.test(v);

export function formatCell(
   value: unknown,
   unit?: ColumnUnit,
   { compact = false } = {},
): string {
   if (value === null || value === undefined) return "—";
   if (typeof value === "number") {
      if (unit === "currency") {
         if (compact) return fmt.compactCurrency.format(value);
         return Math.abs(value) < 1000
            ? fmt.cents.format(value)
            : fmt.currency.format(value);
      }
      if (unit === "percent") return fmt.percent.format(value);
      return compact ? fmt.compact.format(value) : fmt.number.format(value);
   }
   if (typeof value === "string") return formatTime(value);
   return String(value);
}

/** Ops whose value is a change, written with its sign. */
const CHANGE_OPS = new Set(["pct_change", "diff", "yoy"]);

export function formatMetric(
   metric: Pick<Metric, "value" | "unit"> & { op?: string },
   { signed = CHANGE_OPS.has(metric.op ?? "") } = {},
): string {
   const { value, unit } = metric;
   if (value === null) return "—";
   if (typeof value === "string")
      return unit === "date" || unit === "label" ? formatTime(value) : value;
   const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "±") : "";
   const v = signed ? Math.abs(value) : value;
   switch (unit) {
      case "currency":
         return sign + fmt.compactCurrency.format(v);
      case "percent":
         return sign + fmt.percent.format(v);
      case "points": {
         const pts = Math.abs(value) * 100;
         const s = value > 0 ? "+" : value < 0 ? "−" : "±";
         return `${s}${pts.toFixed(pts < 10 ? 1 : 0)} pts`;
      }
      default:
         return (
            sign + (Math.abs(v) >= 10_000 ? fmt.compact : fmt.number).format(v)
         );
   }
}

/** Prose with its tokens replaced by formatted values, for places that take a string. */
export function resolveText(
   text: string,
   metrics: ReadonlyMap<string, Metric>,
): string {
   return splitTokens(text)
      .map((p) => {
         if ("text" in p) return p.text;
         const m = metrics.get(p.metricId);
         return m ? formatMetric(m) : "…";
      })
      .join("");
}
