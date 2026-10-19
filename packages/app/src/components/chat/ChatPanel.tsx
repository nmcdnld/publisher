// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { UIMessage } from "@tanstack/ai-react";
import {
   AlertCircleIcon,
   BookOpenIcon,
   ChevronRightIcon,
   Loader2Icon,
   SendIcon,
   SquareIcon,
   WrenchIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";
import { Markdown } from "./Markdown";
import { ModelPicker } from "./ModelPicker";
import type { ConsoleChat } from "./useConsoleChat";

type Part = UIMessage["parts"][number];
type ToolCall = Extract<Part, { type: "tool-call" }>;
type ToolResult = Extract<Part, { type: "tool-result" }>;

/** The thread and composer for a `useConsoleChat` chat; fills a flex column. */
export function ChatPanel({
   chat,
   suggestions = [],
   empty,
   before,
   placeholder = "Ask a question…",
}: {
   chat: ConsoleChat;
   suggestions?: string[];
   /** Shown above the suggestions while the thread is empty. */
   empty?: ReactNode;
   /** Pinned above the thread, e.g. a verdict. */
   before?: ReactNode;
   placeholder?: string;
}) {
   const [input, setInput] = useState("");
   const scrollRef = useRef<HTMLDivElement>(null);
   const { messages, sendMessage, isLoading, error, stop, unavailable } = chat;

   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      if (nearBottom || isLoading) el.scrollTo({ top: el.scrollHeight });
   }, [messages, isLoading]);

   const send = (text: string) => {
      if (!text.trim() || isLoading || unavailable) return;
      void sendMessage(text.trim());
      setInput("");
   };

   const last = messages[messages.length - 1];
   const thinking = isLoading && !visiblyWorking(last);

   return (
      <>
         <div
            ref={scrollRef}
            className="flex-1 space-y-5 overflow-y-auto px-4 pb-4"
         >
            {before}
            {unavailable && (
               <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  {chat.health.data === null ? (
                     <>
                        The console-ai Worker is not answering. Start it with{" "}
                        <code className="font-mono">bun run dev</code> in{" "}
                        <code className="font-mono">packages/console-ai</code>.
                     </>
                  ) : (
                     <>
                        Chat needs an{" "}
                        <code className="font-mono">OPENROUTER_API_KEY</code> in{" "}
                        <code className="font-mono">
                           packages/console-ai/.dev.vars
                        </code>
                        .
                     </>
                  )}
               </p>
            )}
            {!messages.length && !unavailable && (
               <div className="space-y-2">
                  {empty}
                  {suggestions.map((s) => (
                     <button
                        key={s}
                        onClick={() => send(s)}
                        className="block w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                     >
                        {s}
                     </button>
                  ))}
               </div>
            )}
            {messages.map((message) =>
               message.role === "user" ? (
                  <div
                     key={message.id}
                     className="ml-10 whitespace-pre-wrap rounded-lg bg-primary/10 px-3 py-2 text-sm"
                  >
                     {message.parts
                        .map((p) => (p.type === "text" ? p.content : ""))
                        .join("")}
                  </div>
               ) : message.role === "assistant" ? (
                  <AssistantMessage
                     key={message.id}
                     message={message}
                     live={isLoading && message === last}
                  />
               ) : null,
            )}
            {thinking && (
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" /> Thinking
               </div>
            )}
            {error && (
               <p className="flex items-start gap-1.5 text-sm text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  {error.message}
               </p>
            )}
         </div>

         <form
            className="space-y-1.5 border-t p-3"
            onSubmit={(e) => {
               e.preventDefault();
               send(input);
            }}
         >
            <div className="flex items-end gap-2">
               <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(input);
                     }
                  }}
                  placeholder={placeholder}
                  className="max-h-40 min-h-10"
                  disabled={unavailable}
               />
               {isLoading ? (
                  <Button
                     type="button"
                     size="icon"
                     variant="outline"
                     onClick={stop}
                     title="Stop"
                  >
                     <SquareIcon />
                  </Button>
               ) : (
                  <Button
                     type="submit"
                     size="icon"
                     disabled={!input.trim() || unavailable}
                  >
                     <SendIcon />
                  </Button>
               )}
            </div>
            <div className="flex items-center justify-between gap-2">
               <ModelPicker
                  value={chat.model}
                  onChange={chat.setModel}
                  disabled={unavailable}
               />
               <span className="truncate text-[11px] text-muted-foreground">
                  {chat.health.data?.publisherMcp
                     ? "Publisher tools and skills over MCP"
                     : "No Publisher MCP: answers without queries"}
               </span>
            </div>
         </form>
      </>
   );
}

/** Streaming text or a running tool already shows progress. */
function visiblyWorking(message: UIMessage | undefined): boolean {
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

/** Text in order, with each run of tool calls folded into one step list. */
function AssistantMessage({
   message,
   live,
}: {
   message: UIMessage;
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
      const prev = blocks[blocks.length - 1];
      if (part.type === "text" && part.content.trim()) {
         if (prev?.kind === "text") prev.text += part.content;
         else blocks.push({ kind: "text", text: part.content });
      } else if (part.type === "tool-call") {
         if (prev?.kind === "tools") prev.calls.push(part);
         else blocks.push({ kind: "tools", calls: [part] });
      }
   }
   return (
      <div className="space-y-3">
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

function ToolSteps({
   calls,
   results,
   live,
}: {
   calls: ToolCall[];
   results: Map<string, ToolResult>;
   live: boolean;
}) {
   const counts = new Map<string, number>();
   for (const c of calls) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
   const running = live && calls.some((c) => !settled(c, results));
   return (
      <details
         className="group rounded-md border bg-muted/30 text-xs"
         open={running}
      >
         <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground">
            <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
            {running ? (
               <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
               <WrenchIcon className="size-3.5" />
            )}
            <span className="truncate">
               {running ? "Working: " : "Used "}
               {[...counts.entries()]
                  .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
                  .join(", ")}
            </span>
         </summary>
         <div className="space-y-px border-t p-1">
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
      <details className="group/step rounded px-1.5 py-1 hover:bg-background/60">
         <summary className="flex cursor-pointer list-none items-center gap-1.5">
            {pending ? (
               <Loader2Icon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : call.name === "load_skill" ? (
               <BookOpenIcon className="size-3 shrink-0 text-muted-foreground" />
            ) : (
               <span
                  className={cn(
                     "mx-0.5 size-1.5 shrink-0 rounded-full",
                     failed ? "bg-destructive" : "bg-answerable",
                  )}
               />
            )}
            <span className="shrink-0 font-mono font-medium">{call.name}</span>
            <span className="min-w-0 truncate text-muted-foreground">
               {summarize(call.name, input)}
            </span>
         </summary>
         <div className="mt-1 space-y-1.5 pl-4">
            {query ? (
               <pre className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                  {query}
               </pre>
            ) : (
               input && (
                  <pre className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                     {JSON.stringify(input, null, 2)}
                  </pre>
               )
            )}
            {output !== undefined && (
               <pre
                  className={cn(
                     "max-h-64 overflow-auto rounded border px-2 py-1.5 font-mono text-[11px] leading-relaxed",
                     failed && "border-destructive/40 text-destructive",
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
