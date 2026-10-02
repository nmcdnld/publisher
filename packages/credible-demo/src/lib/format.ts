// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Delta, ValueFormat } from "@/data/types";

const currency = new Intl.NumberFormat("en-US", {
   style: "currency",
   currency: "USD",
   maximumFractionDigits: 0,
});
const currencyCents = new Intl.NumberFormat("en-US", {
   style: "currency",
   currency: "USD",
   maximumFractionDigits: 2,
});
const compactCurrency = new Intl.NumberFormat("en-US", {
   style: "currency",
   currency: "USD",
   notation: "compact",
   maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("en-US", {
   style: "percent",
   maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat("en-US", {
   notation: "compact",
   maximumFractionDigits: 1,
});

export function formatValue(
   value: number,
   format: ValueFormat,
   { compact = false } = {},
): string {
   switch (format) {
      case "currency":
         if (compact) return compactCurrency.format(value);
         return Math.abs(value) < 1000
            ? currencyCents.format(value)
            : currency.format(value);
      case "percent":
         return percent.format(value);
      case "number":
         return compact ? compactNumber.format(value) : number.format(value);
   }
}

export function formatCount(value: number): string {
   return compactNumber.format(value);
}

export function formatDelta(delta: Delta): string {
   const sign = delta.value > 0 ? "+" : delta.value < 0 ? "−" : "±";
   const magnitude = Math.abs(delta.value) * 100;
   const digits = magnitude < 10 && delta.unit === "pp" ? 1 : 0;
   const amount = magnitude.toFixed(digits);
   return delta.unit === "pp"
      ? `${sign}${amount} pts ${delta.period}`
      : `${sign}${amount}% ${delta.period}`;
}

/** A signed amount in the value's own units: "+$42K", "−2.1 pts", "+8%". */
export function formatSigned(value: number, format: ValueFormat): string {
   const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
   if (format === "percent") {
      const pts = Math.abs(value) * 100;
      return `${sign}${pts.toFixed(pts < 10 ? 1 : 0)} pts`;
   }
   return `${sign}${formatValue(Math.abs(value), format, { compact: true })}`;
}

/** The change from one value to another: points for rates, a relative percent otherwise. */
export function formatChange(
   from: number,
   to: number,
   format: ValueFormat,
): string {
   if (format === "percent") return formatSigned(to - from, "percent");
   if (from === 0) return "—";
   const rel = (to - from) / Math.abs(from);
   const sign = rel > 0 ? "+" : rel < 0 ? "−" : "±";
   return `${sign}${Math.round(Math.abs(rel) * 100)}%`;
}

/** "good" | "bad" | "flat", after accounting for whether a rise is good news. */
export function deltaTone(delta: Delta): "good" | "bad" | "flat" {
   if (Math.abs(delta.value) < 0.002) return "flat";
   const up = delta.value > 0;
   return up === (delta.polarity === "up_is_good") ? "good" : "bad";
}

const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()): string {
   const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
   const abs = Math.abs(seconds);
   if (abs < 60) return "just now";
   if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
   if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
   if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
   return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
   });
}

export function greeting(date = new Date()): string {
   const hour = date.getHours();
   if (hour < 12) return "Good morning";
   if (hour < 18) return "Good afternoon";
   return "Good evening";
}
