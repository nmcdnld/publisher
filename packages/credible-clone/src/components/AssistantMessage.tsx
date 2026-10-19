// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import { BookOpen, ChevronRight, Loader2 } from "lucide-react";
import type { Message } from "../fixtures";
import { Markdown } from "./Markdown";

type Part = Message["parts"][number];
type ToolCall = Extract<Part, { type: "tool-call" }>;
type ToolResult = Extract<Part, { type: "tool-result" }>;

/** A reply: its text in order, each run of tool calls folded into one step list. */
export function AssistantMessage({
   message,
   live,
}: {
   message: Message;
   live: boolean;
}) {
   const results = new Map<string, ToolResult>();
   for (const part of message.parts) {
      if (part.type === "tool-result") results.set(part.toolCallId, part);
   }
   const blocks: Array<
      { kind: "text"; text: string } | { kind: "tools"; calls: ToolCall[] }
   > = [];
   for (const part of message.parts) {
      const prev = blocks.at(-1);
      if (part.type === "text" && part.content.trim()) {
         if (prev?.kind === "text") prev.text += `\n\n${part.content}`;
         else blocks.push({ kind: "text", text: part.content });
      } else if (part.type === "tool-call") {
         if (prev?.kind === "tools") prev.calls.push(part);
         else blocks.push({ kind: "tools", calls: [part] });
      }
   }
   return (
      <div className="space-y-2.5">
         {blocks.map((block, i) =>
            block.kind === "text" ? (
               <Markdown key={i} text={block.text} />
            ) : (
               <ToolSteps
                  key={i}
                  calls={block.calls}
                  results={results}
                  live={live && i === blocks.length - 1}
               />
            ),
         )}
      </div>
   );
}

/** Streaming text or a running tool already shows progress. */
export function visiblyWorking(message: Message | undefined): boolean {
   if (message?.role !== "assistant") return false;
   const results = new Set(
      message.parts.flatMap((p) =>
         p.type === "tool-result" ? [p.toolCallId] : [],
      ),
   );
   const tail = message.parts
      .filter(
         (p) =>
            (p.type === "text" && p.content.trim()) || p.type === "tool-call",
      )
      .at(-1);
   if (tail?.type === "text") return true;
   return (
      tail?.type === "tool-call" &&
      !results.has(tail.id) &&
      tail.output === undefined &&
      tail.state !== "error"
   );
}

const STEP_LABELS: Record<string, string> = {
   list_packages: "Listed packages",
   get_context: "Looked up the model's fields",
   execute_query: "Ran a query",
   compile_model: "Compiled Malloy",
   load_skill: "Read a skill",
   search_malloy_docs: "Searched the Malloy docs",
   search_database_schema: "Searched the database schema",
   get_status: "Checked Publisher's status",
   reload_package: "Reloaded the package",
};

function ToolSteps({
   calls,
   results,
   live,
}: {
   calls: ToolCall[];
   results: Map<string, ToolResult>;
   live: boolean;
}) {
   const running = live && calls.some((c) => !settled(c, results));
   const labels = [...new Set(calls.map((c) => STEP_LABELS[c.name] ?? c.name))];
   return (
      <details className="group text-[9px] text-muted" open={running}>
         <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-ink">
            {running ? (
               <Loader2 className="size-2.5 animate-spin" />
            ) : (
               <ChevronRight className="size-2.5 transition-transform group-open:rotate-90" />
            )}
            <span className="truncate">
               {labels.join(", ")}
               {calls.length > labels.length && ` · ${calls.length} calls`}
            </span>
         </summary>
         <div className="mt-1 space-y-px border-l border-line pl-2">
            {calls.map((call) => (
               <ToolStep
                  key={call.id}
                  call={call}
                  result={results.get(call.id)}
                  live={live}
               />
            ))}
         </div>
      </details>
   );
}

function settled(call: ToolCall, results: Map<string, ToolResult>) {
   return (
      results.has(call.id) ||
      call.output !== undefined ||
      call.state === "error"
   );
}

function ToolStep({
   call,
   result,
   live,
}: {
   call: ToolCall;
   result?: ToolResult;
   live: boolean;
}) {
   const input = parsedInput(call);
   const output = result ? resultText(result.content) : call.output;
   const failed =
      call.state === "error" ||
      result?.state === "error" ||
      (typeof output === "string" && /^\s*\{\s*"error"\s*:/.test(output));
   const pending = live && output === undefined && !failed;
   const query =
      typeof input?.query === "string" ? (input.query as string) : undefined;
   return (
      <details className="group/step rounded px-1 py-0.5 hover:bg-hover">
         <summary className="flex cursor-pointer list-none items-center gap-1.5">
            {pending ? (
               <Loader2 className="size-2.5 shrink-0 animate-spin" />
            ) : call.name === "load_skill" ? (
               <BookOpen className="size-2.5 shrink-0" />
            ) : (
               <span
                  className={clsx(
                     "mx-0.5 size-1 shrink-0 rounded-full",
                     failed ? "bg-red-500" : "bg-green-600",
                  )}
               />
            )}
            <span className="shrink-0 font-mono text-ink">{call.name}</span>
            <span className="min-w-0 truncate">
               {summarize(call.name, input)}
            </span>
         </summary>
         <div className="mt-1 space-y-1 pl-3">
            {(query || input) && (
               <pre className="overflow-x-auto rounded bg-hover px-1.5 py-1 font-mono text-[9px] leading-relaxed text-ink">
                  {query ?? JSON.stringify(input, null, 2)}
               </pre>
            )}
            {output !== undefined && (
               <pre
                  className={clsx(
                     "max-h-48 overflow-auto rounded border px-1.5 py-1 font-mono text-[9px] leading-relaxed",
                     failed
                        ? "border-red-200 text-red-700"
                        : "border-line text-ink",
                  )}
               >
                  {preview(output)}
               </pre>
            )}
         </div>
      </details>
   );
}

function parsedInput(call: ToolCall): Record<string, unknown> | undefined {
   if (call.input && typeof call.input === "object") {
      return call.input as Record<string, unknown>;
   }
   try {
      return JSON.parse(call.arguments) as Record<string, unknown>;
   } catch {
      return undefined;
   }
}

function summarize(
   name: string,
   input: Record<string, unknown> | undefined,
): string {
   if (!input) return "";
   if (name === "get_context" && Array.isArray(input.search_targets)) {
      return (input.search_targets as Array<{ search_text?: string }>)
         .map((t) => t.search_text)
         .filter(Boolean)
         .join(" · ");
   }
   if (name === "execute_query") {
      const query = (input.query as string | undefined) ?? "";
      return (
         (input.queryName as string | undefined) ??
         query.replace(/\s+/g, " ").slice(0, 120)
      );
   }
   const first = Object.values(input).find((v) => typeof v === "string");
   return typeof first === "string" ? first : "";
}

function resultText(content: ToolResult["content"]): string {
   if (typeof content === "string") return content;
   return content
      .map((c: { type: string; content?: unknown }) =>
         typeof c.content === "string" ? c.content : "",
      )
      .join("\n");
}

function preview(output: unknown): string {
   let text = typeof output === "string" ? output : JSON.stringify(output);
   try {
      text = JSON.stringify(JSON.parse(text), null, 2);
   } catch {
      // Not JSON; show as sent.
   }
   return text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
}
