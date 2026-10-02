// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The analyst's tools over MCP, for an outside agent (Claude Code, Cursor) to
// explore with the same allowlist, query guard, and compute_metric the
// explorer uses. Datasets live in one shared, bounded run per Worker instance.

import { createMCPServer } from "@tanstack/ai-mcp/server";
import type { PublisherClient } from "./publisher";
import { RunState, type AnalystContext } from "./run";
import { allServerTools } from "./tools";

const MAX_DATASETS = 50;

const server = createMCPServer({
   name: "credible-analyst",
   version: "0.1.0",
   tools: allServerTools,
   sessions: "reject",
});

let shared: RunState | undefined;

function sharedRun(publisher: PublisherClient) {
   if (!shared || shared.publisher !== publisher) {
      shared = new RunState("(mcp)", publisher, "admin", "model", () => {});
   }
   while (shared.datasets.size > MAX_DATASETS) {
      const oldest = shared.datasets.keys().next().value!;
      shared.datasets.delete(oldest);
      for (const [id, m] of shared.metrics)
         if (m.datasetId === oldest) shared.metrics.delete(id);
   }
   return shared;
}

export function handleMcp(request: Request, publisher: PublisherClient) {
   const run = sharedRun(publisher);
   const context: AnalystContext = {
      run,
      user: { id: "mcp", audience: "admin" },
   };
   return server.handle(request, {
      context: context as unknown as Record<string, unknown>,
   });
}
