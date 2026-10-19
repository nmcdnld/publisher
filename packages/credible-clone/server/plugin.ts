// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Plugin } from "vite";
import type { AgentEnv } from "./agent";

/**
 * Serves the chat agent (`server/agent.ts`) from the Vite dev server at
 * `/ai/chat`, and its readiness at `/ai/status`, so the OpenRouter key stays on this machine and never reaches
 * the browser. The handler is loaded per request, so edits apply on save.
 */
export function chatAgent(env: AgentEnv): Plugin {
   return {
      name: "credible-clone-chat-agent",
      configureServer(server) {
         server.middlewares.use("/ai/status", async (req, res, next) => {
            if (req.method !== "GET") return next();
            try {
               const { handleStatus } = (await server.ssrLoadModule(
                  "/server/agent.ts",
               )) as typeof import("./agent");
               await send(res, await handleStatus(env));
            } catch (error) {
               server.config.logger.error(`/ai/status: ${String(error)}`);
               res.statusCode = 500;
               res.end();
            }
         });
         server.middlewares.use("/ai/chat", async (req, res, next) => {
            if (req.method !== "POST") return next();
            try {
               const { handleChat } = (await server.ssrLoadModule(
                  "/server/agent.ts",
               )) as typeof import("./agent");
               await send(res, await handleChat(toRequest(req, res), env));
            } catch (error) {
               server.config.logger.error(`/ai/chat: ${String(error)}`);
               if (!res.headersSent) {
                  res.statusCode = 500;
                  res.statusMessage = statusText(String(error));
               }
               res.end();
            }
         });
      },
   };
}

function toRequest(req: IncomingMessage, res: ServerResponse): Request {
   const aborted = new AbortController();
   res.on("close", () => {
      if (!res.writableFinished) aborted.abort();
   });
   const headers = new Headers();
   for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
   }
   return new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      body: Readable.toWeb(req) as ReadableStream,
      duplex: "half",
      signal: aborted.signal,
   } as RequestInit);
}

async function send(res: ServerResponse, response: Response): Promise<void> {
   res.statusCode = response.status;
   if (response.statusText) res.statusMessage = statusText(response.statusText);
   response.headers.forEach((value, key) => res.setHeader(key, value));
   res.flushHeaders();
   if (!response.body) return void res.end();
   for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      res.write(chunk);
   }
   res.end();
}

/** The reason phrase is how an error reaches the client's `fetchServerSentEvents`. */
function statusText(text: string): string {
   return text.replace(/[^\x20-\x7e]/g, " ").slice(0, 200);
}
