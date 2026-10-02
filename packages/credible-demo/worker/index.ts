// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The Credible Demo Worker: the analyst API under /api/analyst, the built SPA
// for everything else.

import { handleAnalyst, type AnalystEnv } from "./analyst/route";

interface Env extends AnalystEnv {
   ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
   async fetch(request: Request, env: Env): Promise<Response> {
      return (await handleAnalyst(request, env)) ?? env.ASSETS.fetch(request);
   },
};
