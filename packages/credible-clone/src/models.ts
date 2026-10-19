// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

/** The chat models the picker offers, by OpenRouter slug. Shared with `server/agent.ts`. */
export interface ChatModel {
   id: string;
   label: string;
   vendor: string;
}

export const DEFAULT_MODEL = "anthropic/claude-opus-5.5";

export const MODELS: ChatModel[] = [
   { id: "anthropic/claude-opus-5.5", label: "Opus 5.5", vendor: "Anthropic" },
   {
      id: "anthropic/claude-sonnet-5.5",
      label: "Sonnet 5.5",
      vendor: "Anthropic",
   },
   { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", vendor: "OpenAI" },
   { id: "openai/gpt-5.5", label: "GPT-5.5", vendor: "OpenAI" },
   {
      id: "google/gemini-3.1-pro-preview",
      label: "Gemini 3.1 Pro",
      vendor: "Google",
   },
   { id: "moonshotai/kimi-k3", label: "Kimi K3", vendor: "Moonshot" },
];

/** A slug outside the list (a `CHAT_MODEL` override) is shown by its own name. */
export function modelInfo(id: string): ChatModel {
   return (
      MODELS.find((m) => m.id === id) ?? {
         id,
         label: id.split("/").pop() ?? id,
         vendor: id.split("/")[0] ?? "",
      }
   );
}
