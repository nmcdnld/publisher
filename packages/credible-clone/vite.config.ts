// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { chatAgent } from "./server/plugin";

const sdk = (...p: string[]) => path.resolve(__dirname, "../sdk", ...p);
const publisher = {
   target: process.env.PUBLISHER_URL ?? "http://localhost:4000",
   changeOrigin: true,
};

export default defineConfig(({ mode }) => {
   const isDev = mode === "development";
   // Unprefixed, so these stay server-side: `.env.local` holds the model key.
   const env = loadEnv(mode, __dirname, "");
   return {
      plugins: [
         react(),
         tailwindcss(),
         chatAgent({
            OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
            CHAT_MODEL: env.CHAT_MODEL,
            PUBLISHER_MCP_URL:
               env.PUBLISHER_MCP_URL ?? "http://127.0.0.1:4040/mcp",
         }),
      ],
      // The Malloy explorer and renderer read these at module load.
      define: {
         "process.env.NODE_ENV": JSON.stringify(mode),
         "process.env.NODE_DEBUG": "false",
      },
      resolve: {
         alias: [
            // The SDK's CSS only exists built, so it resolves to dist even when
            // the SDK itself comes from source.
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
      optimizeDeps: {
         include: [
            "@emotion/react",
            "@emotion/styled",
            "@mui/material",
            "@mui/icons-material",
            "@mui/system",
         ],
      },
      server: {
         // Publisher answers CORS only for its own Console, so the dev server
         // reaches it same-origin: the API, and the static routes an embedded
         // data app loads its page and `publisher.js` from.
         proxy: {
            "/api/v0": publisher,
            "/environments": publisher,
            "/sdk": publisher,
         },
      },
      build: {
         emptyOutDir: true,
         target: "esnext",
      },
   };
});
