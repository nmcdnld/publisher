import {
   createOpenRouterDecider,
   createOpenRouterText,
} from "@tanstack/ai-openrouter";
import type { Env } from "./env";

type OpenRouterSlug = Parameters<typeof createOpenRouterText>[0];

export const FALLBACK_MODEL = "anthropic/claude-opus-5.5";

/**
 * The picker's short list, one or two per lab. Entries OpenRouter no longer
 * lists, or that cannot call tools, are dropped when the catalog loads.
 */
const FEATURED = [
   "anthropic/claude-opus-5.5",
   "anthropic/claude-sonnet-5.5",
   "anthropic/claude-fable-5.1",
   "openai/gpt-6.1-sol",
   "openai/gpt-6.1-sol-pro",
   "openai/gpt-6-luna",
   "google/gemini-3.8-flash",
   "x-ai/grok-4.7",
   "deepseek/deepseek-v4-pro-0813",
   "deepseek/deepseek-v4.1-flash",
   "qwen/qwen3.8-max-0902",
   "moonshotai/kimi-k3",
   "z-ai/glm-5.3",
   "mistralai/mistral-large-4-0",
   "minimax/minimax-m3",
];

export function defaultModel(env: Env): string {
   return env.DEFAULT_MODEL || FALLBACK_MODEL;
}

/** A text adapter on OpenRouter for any slug it serves. */
export function textModel(env: Env, model?: string) {
   if (!env.OPENROUTER_API_KEY) {
      throw new HttpError(
         503,
         "No model key: set OPENROUTER_API_KEY on the Worker.",
      );
   }
   const slug = model?.trim() || defaultModel(env);
   if (!/^[\w.-]+\/[\w.:-]+$/.test(slug)) {
      throw new HttpError(400, `Not an OpenRouter model slug: ${slug}`);
   }
   return createOpenRouterText(slug as OpenRouterSlug, env.OPENROUTER_API_KEY);
}

/** An output ceiling for `textModel(env)`. */
export function maxTokens(tokens: number): never {
   return { maxCompletionTokens: tokens } as never;
}

export interface ModelInfo {
   id: string;
   name: string;
   provider: string;
   contextLength?: number;
   /** USD per million tokens. */
   inputPrice?: number;
   outputPrice?: number;
}

export interface ModelList {
   default: string;
   featured: ModelInfo[];
   /** Every tool-capable model OpenRouter lists, newest first. */
   all: ModelInfo[];
}

interface CatalogEntry {
   id: string;
   name: string;
   created?: number;
   context_length?: number;
   pricing?: { prompt?: string; completion?: string };
   supported_parameters?: string[];
}

let catalog: { at: number; models: ModelInfo[] } | undefined;

export async function listModels(env: Env): Promise<ModelList> {
   if (!catalog || Date.now() - catalog.at > 15 * 60_000) {
      try {
         const response = await fetch("https://openrouter.ai/api/v1/models", {
            signal: AbortSignal.timeout(5000),
         });
         if (!response.ok) throw new Error(`catalog ${response.status}`);
         const { data } = (await response.json()) as { data: CatalogEntry[] };
         catalog = {
            at: Date.now(),
            models: data
               .filter(
                  (m) =>
                     m.supported_parameters?.includes("tools") &&
                     !m.id.endsWith(":batch"),
               )
               .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
               .map(toInfo),
         };
      } catch (error) {
         console.error(`OpenRouter catalog: ${String(error)}`);
      }
   }
   const all = catalog?.models ?? [];
   const byId = new Map(all.map((m) => [m.id, m]));
   const wanted = [defaultModel(env), ...FEATURED];
   const featured = [...new Set(wanted)]
      .map((id) => byId.get(id) ?? (all.length ? undefined : bareInfo(id)))
      .filter((m): m is ModelInfo => Boolean(m));
   return { default: defaultModel(env), featured, all };
}

function toInfo(m: CatalogEntry): ModelInfo {
   const perMillion = (price?: string) =>
      price === undefined ? undefined : Number(price) * 1_000_000;
   return {
      id: m.id,
      name: m.name.replace(/^[^:]+:\s*/, ""),
      provider: m.name.includes(":")
         ? m.name.split(":")[0]
         : m.id.split("/")[0],
      contextLength: m.context_length,
      inputPrice: perMillion(m.pricing?.prompt),
      outputPrice: perMillion(m.pricing?.completion),
   };
}

function bareInfo(id: string): ModelInfo {
   return { id, name: id.split("/")[1], provider: id.split("/")[0] };
}

/** Jev on OpenRouter, for typed decisions at classification scale. */
export function jev(env: Env) {
   if (!env.OPENROUTER_API_KEY) {
      throw new HttpError(
         503,
         "No model key: set OPENROUTER_API_KEY on the Worker.",
      );
   }
   return createOpenRouterDecider(
      "~typesafe/jev-latest",
      env.OPENROUTER_API_KEY,
   );
}

export class HttpError extends Error {
   constructor(
      readonly status: number,
      message: string,
   ) {
      super(message);
   }
}
