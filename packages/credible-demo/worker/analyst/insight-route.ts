// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// POST /api/analyst/insights streams one generation run as Server-Sent Events:
// RUN_STARTED, insights:run, a series of insights:step, then insights:result
// with the grounded insights, and RUN_FINISHED or RUN_ERROR.

import type { RunMode } from "../../src/analyst/events";
import {
   headlineKey,
   INSIGHT_EVENTS,
   INSIGHT_MODEL,
   MAX_RUN_INSIGHTS,
   type InsightContext,
   type InsightRunRequest,
   type InsightRunResult,
} from "../../src/analyst/insights";
import { DETECTORS } from "../../src/data/insight-runs";
import type { InsightDetector, InsightRecipe } from "../../src/data/types";
import { scriptedInsights } from "./insight-scripted";
import {
   groundBatch,
   insightConfig,
   modelInsights,
   recipeQuestion,
} from "./insights";
import { errorText } from "./middleware";
import type { PublisherClient } from "./publisher";
import { RunState, type AnalystContext } from "./run";

const DETECTOR_IDS = new Set<string>(Object.keys(DETECTORS));

const json = (status: number, body: unknown) =>
   new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
   });

const STATUSES = new Set<string>(["featured", "candidate", "dismissed"]);
const clip = (s: unknown, n: number) =>
   typeof s === "string" ? s.slice(0, n) : "";

function parseContext(raw: unknown): InsightContext[] {
   if (!Array.isArray(raw)) return [];
   return raw.slice(0, 40).flatMap((x): InsightContext[] => {
      const c = (x ?? {}) as Partial<InsightContext>;
      const headline = clip(c.headline, 200);
      if (
         !headline ||
         !DETECTOR_IDS.has(c.detector as string) ||
         !STATUSES.has(c.status as string)
      )
         return [];
      return [
         {
            headline,
            detector: c.detector!,
            status: c.status!,
            topics: Array.isArray(c.topics)
               ? c.topics.slice(0, 3).map((t) => clip(t, 40))
               : [],
            ...(c.source ? { source: clip(c.source, 120) } : {}),
         },
      ];
   });
}

/** A workspace's package list off a request; undefined means every package. */
export function parsePackages(raw: unknown): string[] | undefined {
   if (!Array.isArray(raw)) return undefined;
   return raw
      .filter((p): p is string => typeof p === "string")
      .slice(0, 50)
      .map((p) => p.slice(0, 120));
}

function parseRequest(raw: unknown): InsightRunRequest | string {
   const b = (raw ?? {}) as Partial<InsightRunRequest>;
   const r = (b.recipe ?? {}) as Partial<InsightRecipe>;
   const count = Number.isInteger(b.count)
      ? Math.min(Math.max(b.count!, 1), MAX_RUN_INSIGHTS)
      : MAX_RUN_INSIGHTS;
   const detectors = Array.isArray(r.detectors)
      ? r.detectors.filter((d): d is InsightDetector => DETECTOR_IDS.has(d))
      : [];
   if (!detectors.length)
      return "recipe.detectors must name at least one detector";
   return {
      recipe: {
         focus: typeof r.focus === "string" ? r.focus.slice(0, 500) : "",
         detectors,
         sources: Array.isArray(r.sources)
            ? r.sources.filter((s): s is string => typeof s === "string")
            : [],
      },
      count,
      existing: parseContext(b.existing),
      packages: parsePackages(b.packages),
   };
}

export async function startInsights(
   request: Request,
   key: string | undefined,
   publisher: PublisherClient,
): Promise<Response> {
   let body: InsightRunRequest;
   try {
      const parsed = parseRequest(await request.json());
      if (typeof parsed === "string") return json(400, { error: parsed });
      body = parsed;
   } catch {
      return json(400, { error: "Body must be JSON" });
   }
   const mode: RunMode = key ? "model" : "scripted";
   const modelId = key ? INSIGHT_MODEL : "scripted";

   const abort = new AbortController();
   request.signal.addEventListener("abort", () => abort.abort("cancelled"));
   const signal = abort.signal;
   const encoder = new TextEncoder();

   const stream = new ReadableStream<Uint8Array>({
      start(controller) {
         let open = true;
         const send = (chunk: Record<string, unknown>) => {
            if (!open) return;
            try {
               controller.enqueue(
                  encoder.encode(
                     `data: ${JSON.stringify({ ...chunk, timestamp: Date.now() })}\n\n`,
                  ),
               );
            } catch {
               open = false;
            }
         };
         let last = "";
         const step = (label: string) => {
            if (label === last) return;
            last = label;
            send({
               type: "CUSTOM",
               name: INSIGHT_EVENTS.step,
               value: { label },
            });
         };
         const run = new RunState(
            recipeQuestion(body.recipe),
            publisher,
            "member",
            mode,
            (name, value) => {
               if (name === "analyst:status")
                  step((value as { text: string }).text);
            },
            {},
            insightConfig(body.recipe, body.packages),
         );
         const ctx: AnalystContext = {
            run,
            user: { id: "local", audience: "member" },
         };

         void (async () => {
            send({ type: "RUN_STARTED", runId: run.id, threadId: run.id });
            send({
               type: "CUSTOM",
               name: INSIGHT_EVENTS.run,
               value: { model: modelId, mode },
            });
            try {
               let out: Awaited<ReturnType<typeof modelInsights>>;
               if (key) {
                  out = await modelInsights(run, ctx, key, body, signal);
               } else {
                  const batch = await scriptedInsights(run, body, signal);
                  const g = await groundBatch(run, batch);
                  out = {
                     kept: g.kept,
                     dropped: g.failed.map((f) => ({
                        headline: f.d.headline,
                        issues: f.issues,
                     })),
                     skipped: batch.skipped,
                  };
               }
               const seen = new Set(
                  body.existing.map((c) => headlineKey(c.headline)),
               );
               const fresh = out.kept
                  .filter((i) => !seen.has(headlineKey(i.headline)))
                  .sort((a, b) => b.score - a.score)
                  .slice(0, body.count);
               step(
                  fresh.length
                     ? `Kept ${fresh.length} ${fresh.length === 1 ? "finding" : "findings"}`
                     : "Nothing new cleared the bar",
               );
               const result: InsightRunResult = {
                  model: modelId,
                  mode,
                  insights: fresh,
                  dropped: out.dropped,
                  skipped: out.skipped,
                  queries: run.queries,
                  costUsd: run.costUsd,
               };
               send({
                  type: "CUSTOM",
                  name: INSIGHT_EVENTS.result,
                  value: result,
               });
               send({ type: "RUN_FINISHED", runId: run.id, threadId: run.id });
            } catch (e) {
               send({
                  type: "RUN_ERROR",
                  message: signal.aborted
                     ? String(signal.reason)
                     : errorText(e),
               });
            }
            open = false;
            try {
               controller.close();
            } catch {
               // The client already went away.
            }
         })();
      },
      cancel() {
         abort.abort("cancelled");
      },
   });

   return new Response(stream, {
      headers: {
         "content-type": "text/event-stream",
         "cache-control": "no-cache, no-transform",
         "x-accel-buffering": "no",
      },
   });
}
