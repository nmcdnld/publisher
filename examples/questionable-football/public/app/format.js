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

/** Round first, so a value that prints as zero never carries a sign: -0.03 -> "0.0". */
const rounded = (v, digits) => Number(v.toFixed(digits));

export function num(v, digits = 1) {
   if (!isNum(v)) return DASH;
   const r = rounded(v, digits);
   return `${r < 0 ? MINUS : ""}${fixed(r, digits)}`;
}

/** Signed, for a difference: 3 -> "+3", -2.5 -> "−2.5", 0 -> "0". */
export function signed(v, digits = 0) {
   if (!isNum(v)) return DASH;
   const r = rounded(v, digits);
   const sign = r > 0 ? "+" : r < 0 ? MINUS : "";
   return `${sign}${fixed(r, digits)}`;
}

/** 0.347 -> "35%". Rates on these pages read as whole percents. */
export function pct(v, digits = 0) {
   if (!isNum(v)) return DASH;
   return `${v < 0 ? MINUS : ""}${fixed(v * 100, digits)}%`;
}

/** Fantasy points: one decimal, thousands separated. */
export const pts = (v) => num(v, 1);

/** ADP reads to one decimal: 1.6, 58.4, 131.5. */
export const adp = (v) => num(v, 1);

/** "QB" -> "pos-QB", the class that carries the position colour. */
export function posClass(position) {
   return ["QB", "RB", "WR", "TE", "K"].includes(position) ? `pos-${position}` : "pos-other";
}

/** "Ja'Marr Chase" -> "J. Chase": draft-board cards are too narrow for first names. */
export function shortName(name) {
   return String(name ?? "").replace(/^(\S)\S+\s+/, "$1. ");
}

/**
 * The overall pick in a snake draft that a team slot makes in a round.
 * Odd rounds run 1..N, even rounds N..1. `slot` and `round` are 1-based.
 */
export function snakePick(round, slot, teams = 12) {
   const inRound = round % 2 === 1 ? slot : teams - slot + 1;
   return (round - 1) * teams + inRound;
}

/** The team slot (1-based) that makes overall pick `pick` in a snake draft. */
export function slotOfPick(pick, teams = 12) {
   const round = Math.ceil(pick / teams);
   const inRound = pick - (round - 1) * teams;
   return round % 2 === 1 ? inRound : teams - inRound + 1;
}

/** Picks from overall pick `current` (the one on the clock) until `slot` picks again. */
export function picksUntilTurn(current, slot, teams = 12) {
   for (let p = current; p < current + teams * 2; p++) if (slotOfPick(p, teams) === slot) return p - current;
   return teams;
}

/** "4.07": round and slot for an overall pick. */
export function pickLabel(pick, teams = 12) {
   const round = Math.ceil(pick / teams);
   const inRound = pick - (round - 1) * teams;
   return `${round}.${String(inRound).padStart(2, "0")}`;
}

/** Seconds of regulation elapsed -> the site's game-clock axis label. */
export function gameClock(seconds) {
   const marks = { 0: "Kick-Off", 900: "Q2", 1800: "Half", 2700: "Q4", 3600: "Final" };
   if (seconds in marks) return marks[seconds];
   if (!isNum(seconds)) return DASH;
   if (seconds > 3600) return "OT";
   const quarter = Math.min(4, Math.floor(seconds / 900) + 1);
   const left = 900 - (seconds - (quarter - 1) * 900);
   return `Q${quarter} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/** Any date or timestamp the API returns -> "2026-09-13", read in UTC. */
export function isoDay(v) {
   if (v === null || v === undefined || v === "") return null;
   const text = String(v);
   if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
   const d = new Date(text);
   return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-09-04" -> "Sep 4". */
export function shortDay(v) {
   const day = isoDay(v);
   if (!day) return DASH;
   const [, m, d] = day.split("-").map(Number);
   return `${MONTHS[m - 1]} ${d}`;
}

/** "up" | "down" | "flat" for colouring a signed number. */
export function tone(v) {
   if (!isNum(v) || v === 0) return "flat";
   return v > 0 ? "up" : "down";
}

/**
 * A win probability -> one of six heat steps, 0 (likely loss) to 5 (likely
 * win), symmetric around a coin flip so 40% and 60% are equally strong.
 */
export function winStep(p) {
   if (!isNum(p)) return null;
   if (p >= 0.75) return 5;
   if (p >= 0.6) return 4;
   if (p >= 0.5) return 3;
   if (p > 0.4) return 2;
   if (p > 0.25) return 1;
   return 0;
}

/** Format a value the way the model's annotation asked for. */
export function formatAs(v, format, digits) {
   switch (format) {
      case "percent":
         return pct(v);
      case "decimal":
         return num(v, digits ?? 1);
      case "signed":
         return signed(v, digits ?? 0);
      case "id":
         return isNum(v) ? String(v) : DASH;
      case "date":
         return shortDay(v);
      default:
         if (isNum(v)) return Number.isInteger(v) ? v.toLocaleString("en-US") : num(v, 1);
         return v === null || v === undefined ? DASH : String(v);
   }
}
