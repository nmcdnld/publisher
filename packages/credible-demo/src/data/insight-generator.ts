// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   INSIGHT_EVENTS,
   type InsightRunRequest,
   type InsightRunResult,
   type InsightStep,
} from "@/analyst/insights";
import { readEvents } from "@/analyst/stream";

/** The generator endpoint isn't there: no Worker behind this build. */
export class GeneratorUnavailable extends Error {}

/** Streams one generation run from the Worker; resolves with its grounded insights. */
export async function generateInsights(
   request: InsightRunRequest,
   {
      signal,
      onModel,
      onStep,
   }: {
      signal?: AbortSignal;
      onModel: (model: string) => void;
      onStep: (step: InsightStep) => void;
   },
): Promise<InsightRunResult> {
   let res: Response;
   try {
      res = await fetch("/api/analyst/insights", {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: JSON.stringify(request),
         signal,
      });
   } catch (e) {
      if (signal?.aborted) throw e;
      throw new GeneratorUnavailable("The insight generator is unreachable");
   }
   const type = res.headers.get("content-type") ?? "";
   if (!res.ok || !res.body || !type.includes("text/event-stream")) {
      if (res.status === 404 || type.includes("text/html"))
         throw new GeneratorUnavailable("No insight generator is deployed");
      const body = await res.json().catch(() => ({}) as { error?: string });
      throw new Error(body.error ?? `The generator answered ${res.status}`);
   }
   let result: InsightRunResult | undefined;
   let failure: string | undefined;
   await readEvents(res.body, (chunk) => {
      if (chunk.type === "RUN_ERROR")
         failure = chunk.message ?? "The run failed";
      if (chunk.type !== "CUSTOM") return;
      if (chunk.name === INSIGHT_EVENTS.run)
         onModel((chunk.value as { model: string }).model);
      else if (chunk.name === INSIGHT_EVENTS.step)
         onStep(chunk.value as InsightStep);
      else if (chunk.name === INSIGHT_EVENTS.result)
         result = chunk.value as InsightRunResult;
   });
   if (failure) throw new Error(failure);
   if (!result) throw new Error("The run ended without a result");
   return result;
}
