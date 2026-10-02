// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// POST /api/analyst/runs streams one run as Server-Sent Events: AG-UI
// RUN_STARTED, CUSTOM analyst:* events, then RUN_FINISHED or RUN_ERROR.
// Both chat() calls write into the same stream.

import type {
   AnalystRequest,
   Audience,
   RunMode,
   RunSummary,
} from "../../src/analyst/events";
import {
   analystConfig,
   offeredModels,
   scopedConfig,
   type AnalystConfig,
} from "../../src/analyst/config";
import { INSIGHT_MODEL } from "../../src/analyst/insights";
import { modelRun } from "./agent";
import { parsePackages, startInsights } from "./insight-route";
import { startScenario } from "./scenario";
import { handleMcp } from "./mcp";
import { errorText } from "./middleware";
import { PublisherClient } from "./publisher";
import { RunState, type AnalystContext } from "./run";
import { scriptedRun } from "./scripted";

export interface AnalystEnv {
   OPENROUTER_API_KEY?: string;
   PUBLISHER_URL?: string;
   /** When set, admin requests must carry it as a Bearer token. */
   ANALYST_ADMIN_TOKEN?: string;
}

const MAX_QUESTION = 2_000;

let publisher: PublisherClient | undefined;
const publisherFor = (env: AnalystEnv) => {
   const base = (env.PUBLISHER_URL || "http://localhost:4000").replace(
      /\/$/,
      "",
   );
   if (!publisher || publisher.base !== base)
      publisher = new PublisherClient(base);
   return publisher;
};

/**
 * Who is asking. With a configured token only its holder is an admin; without
 * one (local development) the app's "view as" switch decides.
 */
function audienceOf(request: Request, env: AnalystEnv): Audience {
   const token = env.ANALYST_ADMIN_TOKEN;
   if (token) {
      return request.headers.get("authorization") === `Bearer ${token}`
         ? "admin"
         : "member";
   }
   return request.headers.get("x-analyst-audience") === "admin"
      ? "admin"
      : "member";
}

const json = (status: number, body: unknown) =>
   new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
   });

async function startRun(request: Request, env: AnalystEnv): Promise<Response> {
   let body: AnalystRequest;
   try {
      body = (await request.json()) as AnalystRequest;
   } catch {
      return json(400, { error: "Body must be JSON" });
   }
   const question =
      typeof body.question === "string" ? body.question.trim() : "";
   if (!question || question.length > MAX_QUESTION) {
      return json(400, {
         error: `question must be 1–${MAX_QUESTION} characters`,
      });
   }
   const audience = audienceOf(request, env);
   let config: AnalystConfig = scopedConfig(
      analystConfig,
      parsePackages(body.packages),
   );
   if (body.model && body.model !== config.explorer.model) {
      if (audience !== "admin" && !offeredModels.includes(body.model)) {
         return json(400, { error: `${body.model} is not offered` });
      }
      config = {
         ...config,
         explorer: {
            ...config.explorer,
            model: body.model,
            fallbacks: offeredModels.filter((m) => m !== body.model),
         },
      };
   }
   const key = env.OPENROUTER_API_KEY;
   const mode: RunMode = key ? "model" : "scripted";

   const abort = new AbortController();
   request.signal.addEventListener("abort", () => abort.abort("cancelled"));
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
         const run = new RunState(
            question,
            publisherFor(env),
            audience,
            mode,
            (name, value) => send({ type: "CUSTOM", name, value }),
            // Row-level scopes from the signed-in session would go here, as givens.
            {},
            config,
         );
         const ctx: AnalystContext = { run, user: { id: "local", audience } };

         void (async () => {
            send({ type: "RUN_STARTED", runId: run.id, threadId: run.id });
            run.emit("analyst:run", {
               runId: run.id,
               mode,
               audience,
               model: mode === "model" ? config.explorer.model : "scripted",
            });
            let status: RunSummary["status"] = "ok";
            let reason: string | undefined;
            try {
               if (mode === "model") {
                  const { partial } = await modelRun(
                     run,
                     ctx,
                     key!,
                     body,
                     abort.signal,
                  );
                  if (partial) [status, reason] = ["partial", partial];
               } else {
                  await scriptedRun(run, abort.signal);
               }
            } catch (e) {
               status = "failed";
               reason = abort.signal.aborted
                  ? String(abort.signal.reason)
                  : errorText(e);
               run.trace({ kind: "note", level: "error", text: reason });
            }
            run.emit("analyst:summary", {
               status,
               durationMs: run.elapsedMs,
               toolCalls: run.toolCalls,
               queries: run.queries,
               iterations: run.iterations,
               costUsd: run.costUsd,
               reason,
            });
            if (status === "failed") {
               send({
                  type: "RUN_ERROR",
                  message:
                     audience === "admin"
                        ? reason
                        : "The analyst couldn't finish this question. Try rephrasing it.",
               });
            } else {
               send({ type: "RUN_FINISHED", runId: run.id, threadId: run.id });
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

/** Routes /api/analyst/*; undefined for anything else. */
export async function handleAnalyst(
   request: Request,
   env: AnalystEnv,
): Promise<Response | undefined> {
   const { pathname } = new URL(request.url);
   if (!pathname.startsWith("/api/analyst/")) return undefined;
   if (pathname === "/api/analyst/runs") {
      if (request.method !== "POST")
         return json(405, { error: "POST a question" });
      return startRun(request, env);
   }
   if (pathname === "/api/analyst/insights") {
      if (request.method !== "POST")
         return json(405, { error: "POST a recipe" });
      return startInsights(request, env.OPENROUTER_API_KEY, publisherFor(env));
   }
   if (pathname === "/api/analyst/scenario") {
      if (request.method !== "POST")
         return json(405, { error: "POST a workspace scope" });
      return startScenario(request, env.OPENROUTER_API_KEY, publisherFor(env));
   }
   if (pathname === "/api/analyst/config") {
      return json(200, {
         mode: env.OPENROUTER_API_KEY ? "model" : "scripted",
         adminToken: !!env.ANALYST_ADMIN_TOKEN,
         insightModel: INSIGHT_MODEL,
      });
   }
   if (pathname === "/api/analyst/mcp") {
      if (env.ANALYST_ADMIN_TOKEN && audienceOf(request, env) !== "admin") {
         return json(401, {
            error: "The analyst MCP endpoint needs the admin token",
         });
      }
      return handleMcp(request, publisherFor(env));
   }
   return json(404, { error: "Not found" });
}
