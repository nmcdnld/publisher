// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Builds /sdk/publisher-app.js, the renderer a saved finding's standalone page
// loads, from this app's own components, into the server's runtime directory
// beside the hand-written publisher.js. One self-contained script: the CSS is
// inlined and the lazily loaded chart renderers are bundled in.

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
   plugins: [react(), tailwindcss()],
   define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
   },
   resolve: {
      alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
   },
   publicDir: false,
   build: {
      outDir: path.resolve(__dirname, "../server/src/runtime"),
      emptyOutDir: false,
      lib: {
         entry: path.resolve(__dirname, "src/standalone/main.tsx"),
         formats: ["iife"],
         name: "PublisherApp",
         fileName: () => "publisher-app.js",
      },
      rollupOptions: { output: { inlineDynamicImports: true } },
   },
});
