// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { ChatMiddleware, StreamChunk } from "@tanstack/ai";
import type { AnalystConfig } from "../../src/analyst/config";
import type { Phase } from "../../src/analyst/events";
import { allowedFor, type AnalystContext } from "./run";

type Mw = ChatMiddleware<AnalystContext>;

const preview = (v: unknown, n = 600) => {
   const s = typeof v === "string" ? v : JSON.stringify(v);
   return s && s.length > n ? `${s.slice(0, n)}…` : (s ?? "");
};

function hash(text: string) {
   let h = 0x811c9dc5;
   for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
   }
   return (h >>> 0).toString(16).padStart(8, "0");
}

const idsIn = (result: unknown) => {
   const r = (result ?? {}) as { datasetId?: unknown; metricId?: unknown };
   return {
      datasetId: typeof r.datasetId === "string" ? r.datasetId : undefined,
      metricId: typeof r.metricId === "string" ? r.metricId : undefined,
   };
};

/**
 * Records every iteration, message, tool call, and usage report as a trace
 * step as it happens, so the inspector works on a live run. Also keeps the
 * structured output for the route, before redaction can drop it.
 */
export function traceRecorder(
   phase: Phase,
   capture: (object: unknown) => void,
): Mw {
   const text = new Map<string, string>();
   const reasoning = new Map<string, string>();
   return {
      name: "traceRecorder",
      onConfig(ctx, config) {
         if (ctx.phase !== "beforeModel") return;
         ctx.context.run.iterations++;
         ctx.context.run.trace({
            kind: "iteration",
            phase,
            index: ctx.iteration,
            model: ctx.model,
            tools: config.tools.map((t) => t.name),
            promptHash: hash(
               config.systemPrompts
                  .map((p) => (typeof p === "string" ? p : p.content))
                  .join("\n"),
            ),
         });
      },
      onChunk(ctx, chunk) {
         const run = ctx.context.run;
         switch (chunk.type) {
            case "TEXT_MESSAGE_CONTENT":
               text.set(
                  chunk.messageId,
                  (text.get(chunk.messageId) ?? "") + chunk.delta,
               );
               break;
            case "REASONING_MESSAGE_CONTENT":
               reasoning.set(
                  chunk.messageId,
                  (reasoning.get(chunk.messageId) ?? "") + chunk.delta,
               );
               break;
            case "TEXT_MESSAGE_END": {
               const t = text.get(chunk.messageId);
               if (t?.trim() && ctx.phase !== "structuredOutput")
                  run.trace({ kind: "text", phase, text: t });
               text.delete(chunk.messageId);
               break;
            }
            case "REASONING_MESSAGE_END": {
               const t = reasoning.get(chunk.messageId);
               if (t?.trim()) run.trace({ kind: "reasoning", phase, text: t });
               reasoning.delete(chunk.messageId);
               break;
            }
            case "CUSTOM":
               if (chunk.name === "structured-output.complete")
                  capture((chunk.value as { object: unknown }).object);
               break;
         }
      },
      onAfterToolCall(ctx, info) {
         ctx.context.run.trace({
            kind: "tool",
            id: `t-${info.toolCallId}`,
            toolName: info.toolName,
            args: parseArgs(info.toolCall.function.arguments),
            ok: info.ok,
            durationMs: info.duration,
            resultPreview: preview(info.ok ? info.result : info.error),
            error: info.ok ? undefined : preview(errorText(info.error), 300),
            ...(info.ok ? idsIn(info.result) : {}),
         });
      },
      onUsage(ctx, usage) {
         const run = ctx.context.run;
         run.costUsd += usage.cost ?? 0;
         run.trace({
            kind: "usage",
            phase,
            model: ctx.model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            costUsd: usage.cost,
         });
      },
      onAbort(ctx, info) {
         ctx.context.run.trace({
            kind: "note",
            level: "warning",
            text: `${phase} stopped: ${info.reason ?? "aborted"}`,
         });
      },
      onError(ctx, info) {
         ctx.context.run.trace({
            kind: "note",
            level: "error",
            text: `${phase} failed: ${errorText(info.error)}`,
         });
      },
   };
}

function parseArgs(raw: string) {
   try {
      return JSON.parse(raw) as unknown;
   } catch {
      return raw;
   }
}

export const errorText = (e: unknown) =>
   e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : JSON.stringify(e);

/** Stops the loop at the analyst's caps and aborts past its spend limit. */
export function budget(limits: AnalystConfig["budget"]): Mw {
   return {
      name: "budget",
      onShouldContinue(_ctx, state) {
         if (state.toolCallCount >= limits.maxToolCalls) return false;
         if (state.iterationCount + 1 >= limits.maxIterations) return false;
      },
      onBeforeToolCall(ctx) {
         const run = ctx.context.run;
         if (run.toolCalls >= limits.maxToolCalls) {
            return {
               type: "skip",
               result: {
                  error: "Tool budget reached. Write your findings from what you have.",
               },
            };
         }
         run.toolCalls++;
      },
      onUsage(ctx) {
         if (ctx.context.run.costUsd > limits.maxUsd) {
            ctx.abort(`spend cap of $${limits.maxUsd.toFixed(2)} reached`);
         }
      },
   };
}

export function phrase(toolName: string, args: unknown): string {
   const a = (args ?? {}) as Record<string, unknown>;
   const name = (id: unknown) =>
      typeof id === "string"
         ? (id.split("#")[1] ?? id).replace(/_/g, " ")
         : "the data";
   switch (toolName) {
      case "list_sources":
         return "Looking for the right data";
      case "describe_source":
         return `Reading what ${name(a.source)} holds`;
      case "run_query":
         return typeof a.title === "string"
            ? `Checking ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)}`
            : "Running a query";
      case "compute_metric":
         return typeof a.label === "string"
            ? `Working out ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`
            : "Working out a number";
      default:
         return "Working";
   }
}

/** Turns tool calls into the plain phrases an end user sees while the analyst works. */
export function statusEmitter(phase: Phase): Mw {
   return {
      name: "statusEmitter",
      onStart(ctx) {
         ctx.emitCustomEvent("analyst:status", {
            phase,
            text:
               phase === "present"
                  ? "Laying out the report"
                  : "Reading the question",
         });
      },
      onIteration(ctx, info) {
         if (phase === "explore" && info.iteration > 0) {
            ctx.emitCustomEvent("analyst:status", {
               phase,
               text: "Deciding what to look at next",
            });
         }
      },
      onStructuredOutputConfig(ctx) {
         if (phase === "explore") {
            ctx.emitCustomEvent("analyst:status", {
               phase,
               text: "Writing up what it found",
            });
         }
      },
      onBeforeToolCall(ctx, hook) {
         ctx.emitCustomEvent("analyst:status", {
            phase,
            text: phrase(hook.toolName, hook.args),
         });
      },
   };
}

/**
 * Last in the chain. For an end user only run lifecycle, analyst status and
 * data events, and the presenter's structured output survive; tool calls,
 * Malloy, reasoning, and model text never leave the server.
 */
export function redactForAudience(phase: Phase): Mw {
   return {
      name: "redactForAudience",
      onChunk(ctx, chunk: StreamChunk) {
         const audience = ctx.context.user.audience;
         if (chunk.type === "CUSTOM") {
            return chunk.name.startsWith("analyst:") &&
               allowedFor(audience, chunk.name)
               ? chunk
               : null;
         }
         if (chunk.type.startsWith("RUN_")) return chunk;
         // The presenter has no tools: all it writes is the report's JSON.
         if (phase === "present" && chunk.type === "TEXT_MESSAGE_CONTENT")
            return chunk;
         return audience === "admin" ? chunk : null;
      },
   };
}
