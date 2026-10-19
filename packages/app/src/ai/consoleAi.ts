// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Where the console-ai Worker (`packages/console-ai`) answers. In dev, Vite
 * proxies `/ai` to it. Publisher has no `/ai` route (it answers with the SPA's
 * index.html), so a build opened on localhost calls the Worker's local dev
 * port directly; it allows any origin. A build served elsewhere sets
 * `VITE_CONSOLE_AI_URL` to the deployed Worker's origin.
 */
export const CONSOLE_AI_BASE: string =
   (import.meta.env.VITE_CONSOLE_AI_URL as string | undefined) ??
   (!import.meta.env.DEV &&
   ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? "http://localhost:8790"
      : "");

export function aiUrl(path: string): string {
   return `${CONSOLE_AI_BASE}/ai${path}`;
}

export interface AiHealth {
   /** An OpenRouter key is set, so chat and structured calls work. */
   chat: boolean;
   defaultModel: string;
   jev: boolean;
   jevUnavailable?: string;
   publisherMcp: boolean;
}

/** `null` when the Worker is not running: every tile still renders without it. */
export function useAiHealth() {
   return useQuery({
      queryKey: ["console-ai-health"],
      staleTime: 30_000,
      retry: false,
      queryFn: async (): Promise<AiHealth | null> => {
         try {
            const response = await fetch(aiUrl("/health"));
            if (!response.ok) return null;
            return (await response.json()) as AiHealth;
         } catch {
            return null;
         }
      },
   });
}

/** Mirrors `ModelInfo` in `packages/console-ai/src/models.ts`. */
export interface ModelInfo {
   id: string;
   name: string;
   provider: string;
   contextLength?: number;
   inputPrice?: number;
   outputPrice?: number;
}

export interface ModelList {
   default: string;
   featured: ModelInfo[];
   all: ModelInfo[];
}

export function useModels(enabled = true) {
   return useQuery({
      queryKey: ["console-ai-models"],
      staleTime: 15 * 60_000,
      retry: false,
      enabled,
      queryFn: async (): Promise<ModelList> => {
         const response = await fetch(aiUrl("/models"));
         if (!response.ok)
            throw new Error(`/models answered ${response.status}`);
         return (await response.json()) as ModelList;
      },
   });
}

const MODEL_KEY = "console-ai:model";
const modelListeners = new Set<() => void>();

/** The chat model picked in any panel, shared and kept in this browser. */
export function useChatModel(): [string | undefined, (id: string) => void] {
   const model = useSyncExternalStore(
      (listener) => {
         modelListeners.add(listener);
         return () => modelListeners.delete(listener);
      },
      () => localStorage.getItem(MODEL_KEY) ?? undefined,
   );
   const setModel = useCallback((id: string) => {
      try {
         localStorage.setItem(MODEL_KEY, id);
      } catch {
         // The choice still applies for this session's open panels.
      }
      modelListeners.forEach((l) => l());
   }, []);
   return [model, setModel];
}

export async function postAi<T>(path: string, body: unknown): Promise<T> {
   const response = await fetch(aiUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
   });
   const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
   };
   if (!response.ok) {
      throw new Error(payload.error ?? `${path} answered ${response.status}`);
   }
   return payload as T;
}
