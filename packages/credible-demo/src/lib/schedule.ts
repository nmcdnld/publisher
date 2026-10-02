// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { InsightSchedule } from "@/data/types";

type When = Pick<InsightSchedule, "cadence" | "time" | "weekday">;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const WEEKDAYS = [
   "Sunday",
   "Monday",
   "Tuesday",
   "Wednesday",
   "Thursday",
   "Friday",
   "Saturday",
];

function runsOn(when: When, day: Date): boolean {
   const d = day.getDay();
   if (when.cadence === "weekdays") return d >= 1 && d <= 5;
   if (when.cadence === "weekly") return d === when.weekday;
   return true;
}

/** Every occurrence within a week either side of `from`, in order. */
function occurrences(when: When, from: Date): Date[] {
   const [h, m] = when.time.split(":").map(Number);
   const out: Date[] = [];
   if (when.cadence === "hourly") {
      const base = new Date(from);
      base.setMinutes(m, 0, 0);
      for (let i = -2; i <= 2; i++) {
         out.push(new Date(base.getTime() + i * HOUR));
      }
      return out;
   }
   for (let i = -8; i <= 8; i++) {
      const day = new Date(from.getTime() + i * DAY);
      day.setHours(h, m, 0, 0);
      if (runsOn(when, day)) out.push(day);
   }
   return out;
}

/** The first time the schedule fires strictly after `from`. */
export function nextOccurrence(when: When, from = new Date()): Date {
   return occurrences(when, from).find((d) => d > from)!;
}

/** The last time the schedule fired at or before `from`. */
export function prevOccurrence(when: When, from = new Date()): Date {
   return occurrences(when, from)
      .reverse()
      .find((d) => d <= from)!;
}

function clock(time: string): string {
   const [h, m] = time.split(":").map(Number);
   const d = new Date();
   d.setHours(h, m, 0, 0);
   return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Every weekday at 6:00 AM", "Hourly at :15". */
export function describeSchedule(when: When): string {
   switch (when.cadence) {
      case "hourly":
         return `Hourly at :${when.time.split(":")[1]}`;
      case "daily":
         return `Every day at ${clock(when.time)}`;
      case "weekdays":
         return `Every weekday at ${clock(when.time)}`;
      case "weekly":
         return `${WEEKDAYS[when.weekday]}s at ${clock(when.time)}`;
   }
}

/** "in 3 hours", "in 12 minutes", "tomorrow at 6:00 AM". */
export function describeNext(at: Date, now = new Date()): string {
   const ms = at.getTime() - now.getTime();
   if (ms < 60_000) return "in under a minute";
   if (ms < HOUR) return `in ${Math.round(ms / 60_000)} min`;
   if (ms < 12 * HOUR) return `in ${Math.round(ms / HOUR)} h`;
   const tomorrow = new Date(now.getTime() + DAY).toDateString();
   const time = at.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
   });
   if (at.toDateString() === now.toDateString()) return `today at ${time}`;
   if (at.toDateString() === tomorrow) return `tomorrow at ${time}`;
   return `${at.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}
