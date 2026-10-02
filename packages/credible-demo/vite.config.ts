// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";

const sdk = (...p: string[]) => path.resolve(__dirname, "../sdk", ...p);
const publisher = { target: "http://localhost:4000", changeOrigin: true };

/**
 * Serves /api/analyst/* in dev from the Worker's own handler, loaded through
 * Vite so an edit to worker/ applies on the next request. Reads
 * OPENROUTER_API_KEY and friends from .env.local.
 */
function analystWorker(env: Record<string, string>): Plugin {
   return {
      name: "analyst-worker",
      configureServer(server) {
         server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith("/api/analyst/")) return next();
            try {
               const { handleAnalyst } = await server.ssrLoadModule(
                  "/worker/analyst/route.ts",
               );
               const chunks: Buffer[] = [];
               for await (const c of req) chunks.push(c as Buffer);
               const abort = new AbortController();
               res.on("close", () => abort.abort());
               const request = new Request(`http://localhost${req.url}`, {
                  method: req.method,
                  headers: req.headers as Record<string, string>,
                  body: chunks.length ? Buffer.concat(chunks) : undefined,
                  signal: abort.signal,
               });
               const response: Response | undefined = await handleAnalyst(
                  request,
                  env,
               );
               if (!response) return next();
               res.statusCode = response.status;
               response.headers.forEach((v, k) => res.setHeader(k, v));
               res.flushHeaders();
               if (response.body) {
                  for await (const chunk of response.body) res.write(chunk);
               }
               res.end();
            } catch (e) {
               server.ssrFixStacktrace(e as Error);
               next(e);
            }
         });
      },
   };
}

export default defineConfig(({ mode }) => {
   const isDev = mode === "development";
   const env = loadEnv(mode, __dirname, "");
   return {
      plugins: [
         react(),
         tailwindcss(),
         analystWorker({
            OPENROUTER_API_KEY: env.OPENROUTER_API_KEY ?? "",
            PUBLISHER_URL: env.PUBLISHER_URL || "http://localhost:4000",
            ANALYST_ADMIN_TOKEN: env.ANALYST_ADMIN_TOKEN ?? "",
         }),
      ],
      // The Malloy explorer and renderer read these at module load.
      define: {
         "process.env.NODE_ENV": JSON.stringify(mode),
         "process.env.NODE_DEBUG": "false",
      },
      resolve: {
         alias: [
            { find: "@", replacement: path.resolve(__dirname, "./src") },
            // The Publisher SDK from source in dev, so an SDK edit shows here
            // without a rebuild; the built package otherwise, as the Console
            // does. The CSS only exists built.
            {
               find: "@malloy-publisher/sdk/styles.css",
               replacement: sdk("dist/styles.css"),
            },
            {
               find: /^@malloy-publisher\/sdk$/,
               replacement: isDev
                  ? sdk("src/index.ts")
                  : sdk("dist/index.es.js"),
            },
         ],
      },
      // The chart renderers load lazily; bundled at startup, the first chart
      // doesn't re-optimize deps and break the open page's imports.
      optimizeDeps: {
         include: [
            "@tanstack/charts",
            "@tanstack/charts/legend",
            "@tanstack/charts/react",
            "@tanstack/charts/scales/band",
            "@tanstack/charts/scales/linear",
            "@tanstack/charts/scales/point",
            "@tanstack/charts/tooltip",
            "chart.js",
            "d3-scale",
            "d3-shape",
         ],
      },
      server: {
         port: 5180,
         // Publisher answers CORS only for its own Console, so the dev server
         // reaches it same-origin: the API, and the static routes an embedded
         // data app loads its page and `publisher.js` from.
         proxy: {
            "/api/v0": publisher,
            "/environments": publisher,
            "/sdk": publisher,
         },
      },
   };
});
