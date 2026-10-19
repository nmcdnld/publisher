// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { UIMessage } from "@tanstack/ai-react";

export function messageText(message: UIMessage): string {
   return message.parts
      .map((p) => (p.type === "text" ? p.content : ""))
      .join("")
      .trim();
}

/** A chat as Markdown: what was asked, what came back, and the tools it used. */
export function transcriptMarkdown(messages: UIMessage[]): string {
   const blocks: string[] = [];
   for (const message of messages) {
      if (message.role === "user") {
         const text = messageText(message);
         if (text) blocks.push(`**Asked:** ${text}`);
         continue;
      }
      if (message.role !== "assistant") continue;
      let tools: string[] = [];
      const flush = () => {
         if (tools.length) blocks.push(`Tools used:\n\n${tools.join("\n")}`);
         tools = [];
      };
      for (const part of message.parts) {
         if (part.type === "text" && part.content.trim()) {
            flush();
            blocks.push(part.content.trim());
         } else if (part.type === "tool-call") {
            tools.push(toolLine(part.name, toolInput(part)));
         }
      }
      flush();
   }
   return blocks.join("\n\n");
}

function toolInput(part: {
   input?: unknown;
   arguments: string;
}): Record<string, unknown> {
   if (part.input && typeof part.input === "object") {
      return part.input as Record<string, unknown>;
   }
   try {
      return JSON.parse(part.arguments) as Record<string, unknown>;
   } catch {
      return {};
   }
}

function toolLine(name: string, input: Record<string, unknown>): string {
   if (name === "execute_query") {
      const where = [input.modelPath, input.sourceName]
         .filter((v) => typeof v === "string")
         .join(" · ");
      if (typeof input.query === "string") {
         return `- \`execute_query\`${where ? ` (${where})` : ""}:\n\n  \`\`\`malloy\n${input.query
            .trim()
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n")}\n  \`\`\``;
      }
      return `- \`execute_query\`: ${String(input.queryName ?? "")}${where ? ` (${where})` : ""}`;
   }
   if (name === "get_context" && Array.isArray(input.search_targets)) {
      const targets = (
         input.search_targets as Array<{
            target_type?: string;
            search_text?: string;
         }>
      ).map((t) =>
         t.search_text
            ? `${t.search_text} (${t.target_type})`
            : `every ${t.target_type}`,
      );
      return `- \`get_context\`: ${targets.join(", ")}`;
   }
   const first = Object.values(input).find((v) => typeof v === "string");
   return `- \`${name}\`${typeof first === "string" ? `: ${first.slice(0, 160)}` : ""}`;
}
