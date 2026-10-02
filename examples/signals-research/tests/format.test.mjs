// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { test } from "node:test";
import assert from "node:assert/strict";
import {
   DASH,
   HEAT_SCALE,
   clock,
   compact,
   compactTick,
   dayLabel,
   formatAs,
   heatStep,
   isoDay,
   monthLabel,
   monthsBefore,
   num,
   pct,
   points,
   price,
   shortDay,
   signedPct,
   tone,
} from "../public/app/format.js";
import { readResult } from "../public/app/result.js";

const MINUS = "\u2212";

test("a missing value is a dash, never a zero", () => {
   for (const f of [pct, signedPct, points, price, num, compact, dayLabel, shortDay, monthLabel]) {
      assert.equal(f(null), DASH, f.name);
      assert.equal(f(undefined), DASH, f.name);
   }
   assert.equal(pct(Number.NaN), DASH);
   assert.equal(price(Number.POSITIVE_INFINITY), DASH);
});

test("percentages take a fraction and use a true minus sign", () => {
   assert.equal(pct(0.1234), "12.3%");
   assert.equal(pct(-0.05), `${MINUS}5.0%`);
   assert.equal(signedPct(0.012), "+1.2%");
   assert.equal(signedPct(-0.012, 2), `${MINUS}1.20%`);
   assert.equal(signedPct(0), "0.0%");
});

test("an edge is percentage points of a fraction", () => {
   assert.equal(points(0.0125), "+1.25");
   assert.equal(points(-0.0267), `${MINUS}2.67`);
});

test("prices keep four decimals under a dollar", () => {
   assert.equal(price(227.21), "227.21");
   assert.equal(price(0.4321), "0.4321");
   assert.equal(price(1234.5), "1,234.50");
});

test("axis ticks drop trailing zeros", () => {
   assert.equal(compactTick(500_000_000), "500M");
   assert.equal(compactTick(1_000_000_000), "1B");
   assert.equal(compactTick(1_500_000_000), "1.5B");
   assert.equal(compactTick(-2_000_000), `${MINUS}2M`);
   assert.equal(compactTick(950), "950");
});

test("compact numbers keep their sign", () => {
   assert.equal(compact(1_234_567), "1.23M");
   assert.equal(compact(-5_000_000_000), `${MINUS}5.00B`);
   assert.equal(compact(950), "950");
});

test("dates are read in UTC, whatever the reader's time zone", () => {
   assert.equal(isoDay("2026-09-29T00:00:00.000Z"), "2026-09-29");
   assert.equal(isoDay("2026-09-29"), "2026-09-29");
   assert.equal(isoDay("not a date"), null);
   assert.equal(dayLabel("2026-09-29T00:00:00.000Z"), "Sep 29, 2026");
   assert.equal(shortDay("2026-01-05"), "Jan 5");
   assert.equal(monthLabel("2025-07-01T00:00:00.000Z"), "Jul 2025");
});

test("the exchange clock is New York time", () => {
   // 13:30 UTC in September is 09:30 EDT, the open.
   assert.equal(clock("2026-09-29T13:30:00.000Z"), "09:30");
   assert.equal(clock("nope"), DASH);
});

test("chart ranges count whole months back and clamp to the month's end", () => {
   assert.equal(monthsBefore("2026-09-29", 12), "2025-09-29");
   assert.equal(monthsBefore("2026-09-29", 3), "2026-06-29");
   assert.equal(monthsBefore("2026-03-31", 1), "2026-02-28");
   assert.equal(monthsBefore("2026-01-15", 2), "2025-11-15");
});

test("tone colours by sign and leaves zero and missing flat", () => {
   assert.equal(tone(0.01), "up");
   assert.equal(tone(-0.01), "down");
   assert.equal(tone(0), "flat");
   assert.equal(tone(null), "flat");
});

test("the heat ramp is scaled per horizon and clamped to three steps", () => {
   assert.equal(heatStep(0.03, HEAT_SCALE.return_1d), 3);
   assert.equal(heatStep(0.5, HEAT_SCALE.return_1d), 3);
   assert.equal(heatStep(-0.01, HEAT_SCALE.return_1d), -1);
   assert.equal(heatStep(0.001, HEAT_SCALE.return_1d), 0);
   // The same move is strong over a day and faint over a year.
   assert.ok(heatStep(0.05, HEAT_SCALE.return_1d) > heatStep(0.05, HEAT_SCALE.return_252d));
   assert.equal(heatStep(null, 0.03), 0);
});

test("formatAs follows the model's annotation", () => {
   assert.equal(formatAs(0.25, "percent"), "25.0%");
   assert.equal(formatAs(12.5, "currency"), "12.50");
   assert.equal(formatAs(1.23456, "decimal"), "1.23");
   assert.equal(formatAs("2026-09-29T00:00:00.000Z", "date"), "Sep 29, 2026");
   assert.equal(formatAs(1500, undefined), "1,500");
   assert.equal(formatAs(null, undefined), DASH);
});

test("readResult reads labels, formats and cells from the envelope", () => {
   const envelope = {
      schema: {
         fields: [
            {
               kind: "dimension",
               name: "symbol",
               annotations: [{ value: '# label="Symbol"\n' }],
               type: { kind: "string_type" },
            },
            {
               kind: "measure",
               name: "hit_rate_5d",
               annotations: [{ value: "#(malloy) calculation\n" }, { value: "# percent\n" }],
               type: { kind: "number_type" },
            },
            { kind: "dimension", name: "session_date", type: { kind: "date_type" } },
         ],
      },
      data: {
         kind: "array_cell",
         array_value: [
            {
               kind: "record_cell",
               record_value: [
                  { kind: "string_cell", string_value: "NVDA" },
                  { kind: "number_cell", number_value: 0.63 },
                  { kind: "date_cell", date_value: "2026-09-29T00:00:00.000Z" },
               ],
            },
            {
               kind: "record_cell",
               record_value: [{ kind: "string_cell", string_value: "AAPL" }, { kind: "null_cell" }, { kind: "null_cell" }],
            },
         ],
      },
   };
   const { fields, rows } = readResult(envelope);
   assert.deepEqual(
      fields.map((f) => [f.name, f.label, f.format ?? null, f.isAggregate]),
      [
         ["symbol", "Symbol", null, false],
         ["hit_rate_5d", "hit_rate_5d", "percent", true],
         ["session_date", "session_date", "date", false],
      ],
   );
   assert.deepEqual(rows[0], { symbol: "NVDA", hit_rate_5d: 0.63, session_date: "2026-09-29T00:00:00.000Z" });
   assert.equal(rows[1].hit_rate_5d, null);
});
