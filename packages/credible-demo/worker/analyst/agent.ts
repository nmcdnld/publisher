// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The model-driven run: an explorer chat() with tools that returns Findings,
// then a presenter chat() with no tools that returns a ReportSpec.

import {
   chat,
   type ChatMiddleware,
   type ModelMessage,
   type StreamChunk,
} from "@tanstack/ai";
import {
   createOpenRouterText,
   type OpenRouterSummarizeModel as OpenRouterTextModels,
   type OpenRouterTextModelOptions,
} from "@tanstack/ai-openrouter";
import { reportSchema, type ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import type { AnalystEvents, AnalystRequest } from "../../src/analyst/events";
import {
   findingsIssues,
   groundingContext,
   groundReport,
} from "../../src/analyst/grounding";
import { FindingsSchema, type Findings } from "@malloy-publisher/app-manifest/analyst/schema";
import {
   budget,
   errorText,
   redactForAudience,
   statusEmitter,
   traceRecorder,
} from "./middleware";
import {
   explorerBasePrompt,
   presenterInput,
   presenterPrompt,
   sourceCatalog,
} from "./prompts";
import type { AnalystContext, RunState } from "./run";
import { allowedTools } from "./tools";

const PRESENTER_TIMEOUT_MS = 45_000;

export const model = (id: string) => id as OpenRouterTextModels;

/** Forwards the analyst events that survived redaction; returns the presenter's text. */
export async function drain(
   run: RunState,
   stream: AsyncIterable<StreamChunk>,
   onText?: (delta: string) => void,
) {
   for await (const chunk of stream) {
      if (chunk.type === "CUSTOM" && chunk.name.startsWith("analyst:")) {
         const name = chunk.name as keyof AnalystEvents;
         run.emit(name, chunk.value as AnalystEvents[typeof name]);
      } else if (chunk.type === "TEXT_MESSAGE_CONTENT") {
         onText?.(chunk.delta);
      } else if (chunk.type === "RUN_ERROR") {
         throw new Error(chunk.message);
      }
   }
}

export function captureMessages(
   into: ModelMessage[],
): ChatMiddleware<AnalystContext> {
   const keep = (ctx: { messages: ReadonlyArray<ModelMessage> }) => {
      into.splice(0, into.length, ...ctx.messages);
   };
   return {
      name: "captureMessages",
      onFinish: keep,
      onAbort: keep,
      onError: keep,
   };
}

export function historyMessages(request: AnalystRequest): ModelMessage[] {
   return (request.history ?? []).flatMap((turn): ModelMessage[] => [
      { role: "user", content: turn.question },
      {
         role: "assistant",
         content: [turn.answer, ...(turn.notes ?? [])].join("\n"),
      },
   ]);
}

function partialFindings(run: RunState, reason: string): Findings {
   return {
      question: run.question,
      answer: "",
      findings: [],
      datasets: [...run.datasets.values()].map((d) => ({
         id: d.id,
         title: d.title,
         grain: d.grain,
      })),
      openQuestions: [`Exploration stopped early (${reason}).`],
   };
}

async function explore(
   run: RunState,
   ctx: AnalystContext,
   key: string,
   request: AnalystRequest,
   signal: AbortSignal,
): Promise<{ findings: Findings; partial?: string }> {
   const { config } = run;
   const catalog = await run.catalog();
   const abort = new AbortController();
   const onAbort = () => abort.abort("cancelled");
   signal.addEventListener("abort", onAbort);
   const timer = setTimeout(
      () =>
         abort.abort(
            `the ${Math.round(config.budget.timeoutMs / 1000)}s time limit`,
         ),
      config.budget.timeoutMs - (Date.now() - run.started),
   );

   const adapter = createOpenRouterText(model(config.explorer.model), key, {
      appTitle: "Credible analyst",
   });
   const modelOptions: OpenRouterTextModelOptions = {
      models: config.explorer.fallbacks.map(model),
      reasoning: { effort: config.explorer.effort },
      sessionId: run.id,
   };
   const systemPrompts = [
      explorerBasePrompt,
      config.instructions,
      sourceCatalog(catalog),
   ].filter(Boolean);
   const messages: ModelMessage[] = [
      ...historyMessages(request),
      { role: "user", content: run.question },
   ];
   const transcript: ModelMessage[] = [];

   const attempt = async (msgs: ModelMessage[]) => {
      let captured: unknown;
      const stream = chat({
         adapter,
         modelOptions,
         systemPrompts,
         messages: msgs,
         tools: allowedTools(config.tools),
         outputSchema: FindingsSchema,
         stream: true,
         middleware: [
            traceRecorder("explore", (o) => (captured = o)),
            budget(config.budget),
            statusEmitter("explore"),
            captureMessages(transcript),
            redactForAudience("explore"),
         ],
         context: ctx,
         abortController: abort,
      });
      await drain(run, stream);
      return FindingsSchema.safeParse(captured);
   };

   try {
      let parsed = await attempt(messages);
      const grounding = () =>
         groundingContext(
            run.question,
            run.datasets.values(),
            run.metrics.values(),
         );
      let issues = parsed.success
         ? findingsIssues(parsed.data, grounding())
         : [parsed.error.message];
      if (issues.length && !abort.signal.aborted) {
         run.emit("analyst:status", {
            phase: "repair",
            text: "Double-checking its numbers",
         });
         run.trace({
            kind: "note",
            level: "warning",
            text: `Findings failed checks; one repair turn: ${issues.join("; ")}`,
         });
         parsed = await attempt([
            ...(transcript.length ? transcript : messages),
            {
               role: "user",
               content: `Your findings had problems:\n- ${issues.join("\n- ")}\nReturn corrected Findings. Cite only metric ids compute_metric returned; compute any you are missing.`,
            },
         ]);
         issues = parsed.success
            ? findingsIssues(parsed.data, grounding())
            : issues;
      }
      if (parsed.success) {
         run.findings = parsed.data;
         return {
            findings: parsed.data,
            partial: abort.signal.aborted
               ? String(abort.signal.reason)
               : undefined,
         };
      }
      if (run.datasets.size === 0) {
         throw new Error(
            `The explorer returned no usable findings: ${issues.join("; ")}`,
         );
      }
      return {
         findings: partialFindings(run, "no valid findings"),
         partial: "no valid findings",
      };
   } catch (e) {
      if (!abort.signal.aborted || run.datasets.size === 0) throw e;
      const reason = String(abort.signal.reason ?? errorText(e));
      return { findings: partialFindings(run, reason), partial: reason };
   } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
   }
}

async function present(
   run: RunState,
   ctx: AnalystContext,
   key: string,
   findings: Findings,
   partial: string | undefined,
   signal: AbortSignal,
): Promise<ReportSpec> {
   const { config } = run;
   const schema = reportSchema(config.components);
   const adapter = createOpenRouterText(model(config.presenter.model), key, {
      appTitle: "Credible analyst",
   });
   const modelOptions: OpenRouterTextModelOptions = {
      provider: { sort: "latency" },
      sessionId: run.id,
   };
   const abort = new AbortController();
   const onAbort = () => abort.abort("cancelled");
   signal.addEventListener("abort", onAbort);
   const timer = setTimeout(
      () => abort.abort("presenter timeout"),
      PRESENTER_TIMEOUT_MS,
   );
   const input = presenterInput(run, findings, partial);

   const once = async (extra?: string, streamDeltas = true) => {
      let captured: unknown;
      const stream = chat({
         adapter,
         modelOptions,
         systemPrompts: [presenterPrompt(config)],
         messages: [
            { role: "user", content: input },
            ...(extra ? [{ role: "user" as const, content: extra }] : []),
         ],
         outputSchema: schema,
         stream: true,
         middleware: [
            traceRecorder("present", (o) => (captured = o)),
            statusEmitter("present"),
            redactForAudience("present"),
         ],
         context: ctx,
         abortController: abort,
      });
      await drain(
         run,
         stream,
         streamDeltas
            ? (delta) => run.emit("analyst:report-delta", { delta })
            : undefined,
      );
      const parsed = schema.safeParse(captured);
      if (!parsed.success)
         throw new Error(
            `The report did not validate: ${parsed.error.message}`,
         );
      return parsed.data as ReportSpec;
   };

   try {
      const ctxG = groundingContext(
         run.question,
         run.datasets.values(),
         run.metrics.values(),
      );
      let report = await once();
      let grounded = groundReport(report, ctxG);
      if (!grounded.result.answerOk) {
         run.trace({
            kind: "grounding",
            ok: false,
            dropped: grounded.result.dropped,
         });
         run.emit("analyst:status", {
            phase: "repair",
            text: "Rewording the answer",
         });
         const errors = grounded.result.dropped.map(
            (d) => `${d.path}: ${d.reason}`,
         );
         report = await once(
            `The report failed grounding:\n- ${errors.join("\n- ")}\nReturn it again with those fixed.`,
            false,
         );
         grounded = groundReport(report, ctxG);
      }
      return finish(run, grounded, partial);
   } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
   }
}

export function finish(
   run: RunState,
   grounded: ReturnType<typeof groundReport>,
   partial: string | undefined,
): ReportSpec {
   run.emit("analyst:status", {
      phase: "ground",
      text: "Checking every number",
   });
   run.trace({
      kind: "grounding",
      ok: grounded.result.ok,
      dropped: grounded.result.dropped,
   });
   run.emit("analyst:report", {
      report: grounded.report,
      grounding: grounded.result,
      partial: !!partial,
   });
   return grounded.report;
}

export async function modelRun(
   run: RunState,
   ctx: AnalystContext,
   key: string,
   request: AnalystRequest,
   signal: AbortSignal,
) {
   const { findings, partial } = await explore(run, ctx, key, request, signal);
   run.emit("analyst:findings", findings);
   await present(run, ctx, key, findings, partial, signal);
   return { partial };
}
