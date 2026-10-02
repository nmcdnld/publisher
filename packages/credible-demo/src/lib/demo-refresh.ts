// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { DestinationClient } from "@/data/client";
import type {
   DemoRefreshOptions,
   DemoRefreshStep,
   DemoScenario,
} from "@/data/types";

/**
 * A demo refresh outlives the menu that started it, so its progress lives
 * here rather than in a component. A page reload ends it.
 */
export interface DemoRefreshState {
   status: "idle" | "running" | "done" | "failed";
   /** A full refresh from the menu, a briefing from the home page, or chat templates. */
   task?: "refresh" | "briefing" | "questions";
   steps: DemoRefreshStep[];
   error?: string;
   scenario?: DemoScenario;
}

let state: DemoRefreshState = { status: "idle", steps: [] };
const listeners = new Set<() => void>();

function set(next: DemoRefreshState) {
   state = next;
   for (const l of listeners) l();
}

export function useDemoRefresh(): DemoRefreshState {
   return useSyncExternalStore(
      (l) => {
         listeners.add(l);
         return () => listeners.delete(l);
      },
      () => state,
   );
}

/** Runs one task at a time, narrating its steps into the shared state. */
async function run<T>(
   task: NonNullable<DemoRefreshState["task"]>,
   qc: QueryClient,
   work: (onStep: (step: DemoRefreshStep) => void) => Promise<T>,
   failure: string,
): Promise<T | undefined> {
   if (state.status === "running") return;
   set({ status: "running", task, steps: [] });
   try {
      const result = await work((step) => {
         set({ ...state, steps: [...state.steps, step] });
         void qc.invalidateQueries();
      });
      set({ ...state, status: "done" });
      return result;
   } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      set({ ...state, status: "failed", error });
      toast.error(failure, { description: error });
   } finally {
      void qc.invalidateQueries();
   }
}

export async function startDemoRefresh(
   client: DestinationClient,
   qc: QueryClient,
   options: DemoRefreshOptions,
) {
   const scenario = await run(
      "refresh",
      qc,
      (onStep) => client.refreshDemo(options, onStep),
      "Couldn't refresh the demo content",
   );
   if (!scenario) return;
   set({ ...state, scenario });
   toast.success("Demo content refreshed", {
      description: scenario.featured
         ? `${scenario.featured} new insights are in For you.`
         : "Nothing new was featured; see the steps in the workspace menu.",
   });
}

export async function startSuggestions(
   client: DestinationClient,
   qc: QueryClient,
) {
   await run(
      "questions",
      qc,
      () => client.writeSuggestions(),
      "Couldn't write suggested questions",
   );
}

export async function startBriefing(
   client: DestinationClient,
   qc: QueryClient,
) {
   const done = await run(
      "briefing",
      qc,
      (onStep) => client.writeBriefing(onStep),
      "Couldn't write the briefing",
   );
   if (done) toast.success("Briefing written");
}
