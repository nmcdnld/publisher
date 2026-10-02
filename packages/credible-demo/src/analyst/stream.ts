// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ANALYST_EVENTS,
   type AnalystEventName,
   type AnalystEvents,
   type AnalystRequest,
   type Audience,
} from "./events";

const KNOWN = new Set<string>(ANALYST_EVENTS);

export interface RunHandlers {
   onEvent: <N extends AnalystEventName>(
      name: N,
      value: AnalystEvents[N],
   ) => void;
   onError: (message: string) => void;
}

/**
 * Starts a run and reads its event stream until it ends. Resolves when the
 * stream closes; `signal` cancels the run on the server too.
 */
export async function streamRun(
   request: AnalystRequest,
   {
      audience,
      adminToken,
      signal,
   }: { audience: Audience; adminToken?: string; signal: AbortSignal },
   handlers: RunHandlers,
) {
   const res = await fetch("/api/analyst/runs", {
      method: "POST",
      headers: {
         "content-type": "application/json",
         "x-analyst-audience": audience,
         ...(adminToken ? { authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify(request),
      signal,
   });
   if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}) as { error?: string });
      handlers.onError(body.error ?? `The analyst answered ${res.status}`);
      return;
   }
   await readEvents(res.body, (chunk) => {
      if (chunk.type === "CUSTOM" && chunk.name && KNOWN.has(chunk.name)) {
         const name = chunk.name as AnalystEventName;
         handlers.onEvent(name, chunk.value as AnalystEvents[typeof name]);
      } else if (chunk.type === "RUN_ERROR") {
         handlers.onError(chunk.message ?? "The analyst stopped");
      }
   });
}

export interface StreamChunk {
   type?: string;
   name?: string;
   value?: unknown;
   message?: string;
}

/** Reads an SSE body frame by frame until it closes. */
export async function readEvents(
   body: NonNullable<Response["body"]>,
   onChunk: (chunk: StreamChunk) => void,
) {
   const reader = body.pipeThrough(new TextDecoderStream()).getReader();
   let buffer = "";
   for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
         const frame = buffer.slice(0, end);
         buffer = buffer.slice(end + 2);
         const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart())
            .join("\n");
         if (!data) continue;
         let chunk: StreamChunk;
         try {
            chunk = JSON.parse(data);
         } catch {
            continue;
         }
         onChunk(chunk);
      }
   }
}
