// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { test } from "node:test";
import assert from "node:assert/strict";
import {
   DASH,
   formatAs,
   gameClock,
   isoDay,
   num,
   pct,
   pickLabel,
   picksUntilTurn,
   posClass,
   shortDay,
   shortName,
   signed,
   slotOfPick,
   snakePick,
   tone,
   winStep,
} from "../public/app/format.js";

const MINUS = "\u2212";

test("a missing value is a dash, never a zero", () => {
   for (const f of [num, signed, pct]) {
      assert.equal(f(null), DASH);
      assert.equal(f(undefined), DASH);
      assert.equal(f(Number.NaN), DASH);
   }
   assert.equal(shortDay(null), DASH);
   assert.equal(formatAs(null), DASH);
});

test("numbers round before they take a sign, so zero never reads as negative", () => {
   assert.equal(num(1234.56), "1,234.6");
   assert.equal(num(-0.03), "0.0");
   assert.equal(num(-2.5, 1), `${MINUS}2.5`);
   assert.equal(signed(3), "+3");
   assert.equal(signed(-2.5, 1), `${MINUS}2.5`);
   assert.equal(signed(-0.4), "0");
   assert.equal(signed(0), "0");
});

test("rates read as whole percents", () => {
   assert.equal(pct(0.347), "35%");
   assert.equal(pct(0.125, 1), "12.5%");
   assert.equal(pct(-0.28), `${MINUS}28%`);
});

test("a snake draft runs odd rounds forward and even rounds back", () => {
   assert.equal(snakePick(1, 1), 1);
   assert.equal(snakePick(1, 12), 12);
   assert.equal(snakePick(2, 12), 13);
   assert.equal(snakePick(2, 1), 24);
   assert.equal(snakePick(3, 5), 29);
   for (let pick = 1; pick <= 192; pick++) {
      const slot = slotOfPick(pick);
      assert.equal(snakePick(Math.ceil(pick / 12), slot), pick, `pick ${pick} round-trips through slot ${slot}`);
   }
});

test("picks until a slot's turn counts across the turn of a round", () => {
   assert.equal(picksUntilTurn(1, 1), 0);
   assert.equal(picksUntilTurn(2, 1), 22, "slot 1 picks 1 and then 24");
   assert.equal(picksUntilTurn(12, 12), 0);
   assert.equal(picksUntilTurn(13, 12), 0, "slot 12 has the turn: picks 12 and 13");
   assert.equal(picksUntilTurn(14, 12), 22);
});

test("a pick reads as round.slot within the round", () => {
   assert.equal(pickLabel(1), "1.01");
   assert.equal(pickLabel(12), "1.12");
   assert.equal(pickLabel(43), "4.07");
});

test("the game clock reads the way the site's flow chart labels it", () => {
   assert.equal(gameClock(0), "Kick-Off");
   assert.equal(gameClock(1800), "Half");
   assert.equal(gameClock(3600), "Final");
   assert.equal(gameClock(60), "Q1 14:00");
   assert.equal(gameClock(2705), "Q4 14:55");
   assert.equal(gameClock(3700), "OT");
});

test("dates read in UTC whatever shape the API sends", () => {
   assert.equal(isoDay("2025-09-04"), "2025-09-04");
   assert.equal(isoDay("2025-09-04T00:00:00.000Z"), "2025-09-04");
   assert.equal(isoDay(""), null);
   assert.equal(shortDay("2026-09-13"), "Sep 13");
});

test("labels for players and positions", () => {
   assert.equal(shortName("Ja'Marr Chase"), "J. Chase");
   assert.equal(shortName("Saquon Barkley"), "S. Barkley");
   assert.equal(posClass("TE"), "pos-TE");
   assert.equal(posClass("DST"), "pos-other");
});

test("tone and win-probability steps are symmetric around even", () => {
   assert.equal(tone(2), "up");
   assert.equal(tone(-2), "down");
   assert.equal(tone(0), "flat");
   assert.equal(tone(null), "flat");
   assert.equal(winStep(0.8), 5);
   assert.equal(winStep(0.2), 0);
   assert.equal(winStep(0.5), 3);
   assert.equal(winStep(0.45), 2);
   assert.equal(winStep(null), null);
});

test("formatAs follows the model's annotation", () => {
   assert.equal(formatAs(0.5, "percent"), "50%");
   assert.equal(formatAs(2025, "id"), "2025");
   assert.equal(formatAs(12.345, "decimal", 2), "12.35");
   assert.equal(formatAs(7, "signed"), "+7");
   assert.equal(formatAs("2025-09-04", "date"), "Sep 4");
   assert.equal(formatAs(1234), "1,234");
   assert.equal(formatAs("PHI"), "PHI");
});
