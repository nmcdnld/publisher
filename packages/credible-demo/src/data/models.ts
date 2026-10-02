// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The models the workspace's AI gateway offers. A fixture list until the
// gateway reports its own.

export interface ChatModel {
   id: string;
   label: string;
   description: string;
   /** Context window, in tokens. */
   window: number;
   /** The gateway model a white-labeled entry is served by; `id` when absent. */
   upstream?: string;
   /** Shown with the house mark in the picker. */
   house?: boolean;
   /** The OpenRouter slug the analyst's explorer runs it as. */
   openRouterId?: string;
}

export const DEFAULT_MODEL = "credible-one";

export const chatModels: ChatModel[] = [
   {
      id: DEFAULT_MODEL,
      label: "Credible One",
      description: "Tuned for analysis on your governed models",
      window: 200_000,
      upstream: "claude-opus-5.5",
      house: true,
      openRouterId: "anthropic/claude-opus-5.5",
   },
   {
      id: "claude-sonnet-5.5",
      label: "Claude Sonnet 5.5",
      description: "Fast and accurate for most questions",
      window: 200_000,
      openRouterId: "anthropic/claude-sonnet-5.5",
   },
   {
      id: "gpt-5.6",
      label: "GPT-5.6",
      description: "Strong at writing and revising Malloy",
      window: 272_000,
      openRouterId: "openai/gpt-5.6",
   },
   {
      id: "gemini-3.8-flash",
      label: "Gemini 3.8 Flash",
      description: "Largest context, for big files and long threads",
      window: 1_000_000,
      openRouterId: "google/gemini-3.8-flash",
   },
];

const byId = new Map(chatModels.map((m) => [m.id, m]));

/** An unknown id, such as one saved before a model was retired, falls back to the default. */
export function resolveModel(id: string): ChatModel {
   return byId.get(id) ?? byId.get(DEFAULT_MODEL)!;
}

/** Roughly four characters a token, the usual rule of thumb for English and code. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** The system prompt, tool definitions, and the grounding get_context adds on its own. */
export const BASE_TOKENS = 4_200;

export type ContextSegment =
   | "system"
   | "history"
   | "references"
   | "attachments"
   | "prompt";

export const contextSegments: {
   key: ContextSegment;
   label: string;
   color: string;
}[] = [
   {
      key: "system",
      label: "System, tools & grounding",
      color: "bg-muted-foreground/50",
   },
   { key: "history", label: "Thread history", color: "bg-chart-2" },
   { key: "references", label: "@ references", color: "bg-chart-1" },
   { key: "attachments", label: "Attachments", color: "bg-chart-3" },
   { key: "prompt", label: "Your message", color: "bg-chart-4" },
];

export type ContextUsage = Record<ContextSegment, number> & { total: number };

export function contextUsage(
   parts: Omit<Record<ContextSegment, number>, "system">,
): ContextUsage {
   const usage = { system: BASE_TOKENS, ...parts };
   const total = Object.values(usage).reduce((a, b) => a + b, 0);
   return { ...usage, total };
}

const TEXT_TYPES =
   /\.(csv|tsv|json|jsonl|ndjson|txt|md|malloy|malloynb|sql|ya?ml|html?)$/i;

/** What a file costs once it is read into the prompt. */
export function fileTokens(file: { name: string; type: string; size: number }) {
   if (file.type.startsWith("image/")) return 1_100;
   if (file.type === "application/pdf") return Math.max(1_500, file.size / 20);
   if (file.type.startsWith("text/") || TEXT_TYPES.test(file.name))
      return Math.ceil(file.size / 4);
   // Spreadsheets and Parquet are summarized to a schema and a sample.
   return 2_000;
}

export function formatTokens(n: number): string {
   if (n < 1_000) return String(Math.round(n));
   if (n < 1_000_000)
      return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
   return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
