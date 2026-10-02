// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Pure formatting: a value in, a string out. No DOM, no globals, which is what
// lets tests/format.test.mjs cover it with `node --test`.

const MINUS = "\u2212";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const fixed = (v, digits) =>
   Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
   });

/** A missing value is a dash, never a zero. */
export const DASH = "\u2014";

/** 0.1234 -> "12.3%", -0.05 -> "−5.0%". */
export function pct(v, digits = 1) {
   if (!isNum(v)) return DASH;
   return `${v < 0 ? MINUS : ""}${fixed(v * 100, digits)}%`;
}

/** Signed, for a change: 0.012 -> "+1.2%". */
export function signedPct(v, digits = 1) {
   if (!isNum(v)) return DASH;
   const sign = v > 0 ? "+" : v < 0 ? MINUS : "";
   return `${sign}${fixed(v * 100, digits)}%`;
}

/** Percentage points, for an edge: 0.0125 -> "+1.25 pts". */
export function points(v, digits = 2) {
   if (!isNum(v)) return DASH;
   const sign = v > 0 ? "+" : v < 0 ? MINUS : "";
   return `${sign}${fixed(v * 100, digits)}`;
}

/** Price: two decimals, four under a dollar. */
export function price(v) {
   if (!isNum(v)) return DASH;
   return `${v < 0 ? MINUS : ""}${fixed(v, Math.abs(v) < 1 ? 4 : 2)}`;
}

export function num(v, digits = 1) {
   if (!isNum(v)) return DASH;
   return `${v < 0 ? MINUS : ""}${fixed(v, digits)}`;
}

/** 1234567 -> "1.23M". Signed values keep their sign. */
export function compact(v) {
   if (!isNum(v)) return DASH;
   const a = Math.abs(v);
   const [div, unit] =
      a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
   return `${v < 0 ? MINUS : ""}${fixed(a / div, unit ? 2 : 0)}${unit}`;
}

/** `compact` for axis ticks, which have a fixed width: 1.50B -> "1.5B", 500.00M -> "500M". */
export function compactTick(v) {
   return compact(v).replace(/\.?0+(?=[KMBT]$)/, "");
}

/** Any date or timestamp the API returns -> "2026-09-29", read in UTC. */
export function isoDay(v) {
   if (v === null || v === undefined || v === "") return null;
   const text = String(v);
   if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
   const d = new Date(text);
   return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29" -> "Sep 29, 2026". */
export function dayLabel(v) {
   const day = isoDay(v);
   if (!day) return DASH;
   const [y, m, d] = day.split("-").map(Number);
   return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-09-29" -> "Sep 29". */
export function shortDay(v) {
   const day = isoDay(v);
   if (!day) return DASH;
   const [, m, d] = day.split("-").map(Number);
   return `${MONTHS[m - 1]} ${d}`;
}

/** A timestamp -> "9:30" in New York, the exchange's clock. */
export function clock(v) {
   const d = new Date(String(v));
   if (Number.isNaN(d.getTime())) return DASH;
   return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
}

/** "2026-09-01" -> "Sep 2026". */
export function monthLabel(v) {
   const day = isoDay(v);
   if (!day) return DASH;
   const [y, m] = day.split("-").map(Number);
   return `${MONTHS[m - 1]} ${y}`;
}

/** Subtract whole months from an ISO day, clamping to the month's end. */
export function monthsBefore(day, months) {
   const [y, m, d] = day.split("-").map(Number);
   const target = new Date(Date.UTC(y, m - 1 - months, 1));
   const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
   target.setUTCDate(Math.min(d, last));
   return target.toISOString().slice(0, 10);
}

/** "up" | "down" | "flat" for colouring a signed number. */
export function tone(v) {
   if (!isNum(v) || v === 0) return "flat";
   return v > 0 ? "up" : "down";
}

/**
 * The Finviz heat step for a return, -3..3, scaled to the horizon so a 1-day
 * move and a 1-year move both use the whole ramp. `scale` is the move that
 * reaches the strongest step.
 */
export function heatStep(v, scale) {
   if (!isNum(v) || !isNum(scale) || scale <= 0) return 0;
   const step = Math.round((v / scale) * 3);
   return Math.max(-3, Math.min(3, step));
}

/** The strongest move each horizon's heat ramp is scaled to. */
export const HEAT_SCALE = {
   return_1d: 0.03,
   return_5d: 0.06,
   return_20d: 0.12,
   return_63d: 0.25,
   return_ytd: 0.4,
   return_252d: 0.5,
};

/** Format a value the way the model's annotation asked for. */
export function formatAs(v, format) {
   switch (format) {
      case "percent":
         return pct(v);
      case "currency":
         return price(v);
      case "decimal":
         return num(v, 2);
      case "date":
         return dayLabel(v);
      default:
         if (isNum(v)) return Number.isInteger(v) ? v.toLocaleString("en-US") : num(v, 2);
         return v === null || v === undefined ? DASH : String(v);
   }
}
