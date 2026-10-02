// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The demo scenario writer's contract, shared by the Worker that runs it and
// the workspace menu that asks for it. Opus 5.5 writes the Discover briefing,
// suggested questions and topics for a workspace's packages. It never writes
// a number of its own: the briefing restates findings an insight run already
// grounded, and each highlight's change is copied from the finding it names.

import { z } from "zod";
import type { Delta, Topic, WhatChanged } from "../data/types";

/** One grounded finding the briefing may restate. */
export interface ScenarioFinding {
   headline: string;
   narrative: string;
   label: string;
   delta: Delta;
   topics: string[];
}

export interface ScenarioRequest {
   /** The workspace's packages; absent when it shows every package. */
   packages?: string[];
   /** The workspace's name, when it has one. */
   workspace?: string;
   /** Who the demo is for and what they care about, in plain English. */
   focus: string;
   findings: ScenarioFinding[];
   /** Topics the workspace already follows, to reuse rather than rename. */
   topics?: string[];
}

export const ScenarioSpec = z.object({
   summary: z
      .string()
      .describe(
         "At most two short sentences, under 260 characters, for the top of the home page: the one or two things worth knowing, restating the findings. Use at most three numbers, each one that appears in the findings; empty when there are no findings.",
      ),
   highlights: z
      .array(
         z.object({
            finding: z
               .number()
               .int()
               .describe("Index into the findings list, from 0"),
            label: z
               .string()
               .describe(
                  "The metric in one to three words, e.g. 'Return rate'",
               ),
         }),
      )
      .describe("Two or three, one per finding; empty when there are none"),
   questions: z
      .array(z.string())
      .describe(
         "Five questions someone in this scenario would ask next, each answerable from the sources listed, at most nine words, no field names",
      ),
   topics: z
      .array(
         z.object({
            id: z
               .string()
               .describe(
                  "Lowercase tag, words joined by hyphens; reuse every tag the findings carry",
               ),
            label: z.string().describe("Lowercase, as shown on a chip"),
            description: z.string().describe("A few words on what it covers"),
         }),
      )
      .describe("Four to six topics people here would follow"),
});
export type ScenarioSpec = z.infer<typeof ScenarioSpec>;

export interface Scenario {
   whatChanged: WhatChanged | null;
   suggestedQuestions: string[];
   topics: Topic[];
   model: string;
   costUsd: number;
}
