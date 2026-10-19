// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useState,
   type ReactNode,
} from "react";
import { DEFAULT_MODEL } from "./models";

/** Mirrors `AgentStatus` in `server/agent.ts`. */
export type AgentStatus = {
   defaultModel: string;
   models: string[];
   openRouter: { configured: boolean };
   mcpServers: McpServerStatus[];
};

export type McpServerStatus = {
   id: string;
   name: string;
   url: string;
   connected: boolean;
   tools: string[];
   skills: number;
   error?: string;
};

/** `checking` until the first probe answers; the bead is grey meanwhile. */
export type Readiness = "checking" | "ready" | "degraded" | "down";

type AgentContextValue = {
   status: AgentStatus | undefined;
   /** Why `/ai/status` itself could not be read. */
   error: string | undefined;
   readiness: Readiness;
   checking: boolean;
   model: string;
   setModel: (model: string) => void;
   refresh: () => void;
};

const STORAGE_KEY = "credible-clone.chat-model";

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
   const [status, setStatus] = useState<AgentStatus>();
   const [error, setError] = useState<string>();
   const [checking, setChecking] = useState(true);
   const [chosen, setChosen] = useState(
      () => localStorage.getItem(STORAGE_KEY) ?? undefined,
   );

   const refresh = useCallback(() => {
      setChecking(true);
      fetch("/ai/status")
         .then(async (res) => {
            if (!res.ok)
               throw new Error(res.statusText || `HTTP ${res.status}`);
            setStatus((await res.json()) as AgentStatus);
            setError(undefined);
         })
         .catch((e: unknown) =>
            setError(e instanceof Error ? e.message : String(e)),
         )
         .finally(() => setChecking(false));
   }, []);

   useEffect(refresh, [refresh]);

   const setModel = useCallback((model: string) => {
      localStorage.setItem(STORAGE_KEY, model);
      setChosen(model);
   }, []);

   const model =
      chosen && (!status || status.models.includes(chosen))
         ? chosen
         : (status?.defaultModel ?? DEFAULT_MODEL);

   const value = useMemo(
      () => ({
         status,
         error,
         readiness: readinessOf(status, error),
         checking,
         model,
         setModel,
         refresh,
      }),
      [status, error, checking, model, setModel, refresh],
   );

   return (
      <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
   );
}

function readinessOf(
   status: AgentStatus | undefined,
   error: string | undefined,
): Readiness {
   if (error) return "down";
   if (!status) return "checking";
   if (!status.openRouter.configured) return "down";
   return status.mcpServers.every((s) => s.connected) ? "ready" : "degraded";
}

export function useAgent() {
   const ctx = useContext(AgentContext);
   if (!ctx) throw new Error("useAgent must be used inside AgentProvider");
   return ctx;
}
