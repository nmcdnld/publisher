// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { InsightDetector, InsightRecipe, InsightRunStep } from "./types";

export const DETECTORS: Record<
   InsightDetector,
   { label: string; one: string; description: string }
> = {
   change: {
      label: "Changes",
      one: "Change",
      description: "The biggest period-over-period moves in each measure",
   },
   anomaly: {
      label: "Anomalies",
      one: "Anomaly",
      description: "Values that left their usual range",
   },
   mix: {
      label: "Mix shifts",
      one: "Mix shift",
      description: "Segments gaining or losing share of a total",
   },
   driver: {
      label: "Drivers",
      one: "Driver",
      description: "A change split into the parts that caused it",
   },
};

/** The storefront sources a recipe can scope a run to. */
export const STUDIO_SOURCES = [
   { name: "order_items", label: "Order items", measures: 11 },
   { name: "customers", label: "Customers", measures: 1 },
   { name: "products", label: "Products", measures: 1 },
];

export const RUN_DURATION_MS = 5200;

/** What a run reports doing, given what it scanned and how many findings it kept. */
export function runSteps(
   recipe: InsightRecipe,
   kept: number,
): InsightRunStep[] {
   const sources = recipe.sources.length
      ? STUDIO_SOURCES.filter((s) => recipe.sources.includes(s.name))
      : STUDIO_SOURCES;
   const measures = sources.reduce((n, s) => n + s.measures, 0);
   const slices = 7 * recipe.detectors.length;
   const detectors = recipe.detectors
      .map((d) => DETECTORS[d].label.toLowerCase())
      .join(", ");
   return [
      {
         at: 0,
         label: "Reading the storefront model",
         detail: `${sources.length} ${sources.length === 1 ? "source" : "sources"} · ${measures} measures`,
      },
      {
         at: 800,
         label: `Scanning for ${detectors}`,
         detail: `${measures * slices} measure × slice combinations`,
      },
      {
         at: 2000,
         label: "Testing each move against its normal range",
         detail: `${kept * 3 + 2} moves outside normal`,
      },
      {
         at: 3200,
         label: "Grounding each finding in a governed view",
         detail: "Compiled and re-ran every query",
      },
      {
         at: 4300,
         label: "Drafting headlines",
         detail: kept
            ? `Kept ${kept} ${kept === 1 ? "finding" : "findings"}`
            : "Nothing new cleared the bar",
      },
   ];
}
