// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// This package resolves modules the "Node" (pre-exports) way, which cannot
// see subpath exports; Vite resolves the real entry at build time.
declare module "@tanstack/markdown/react" {
   export * from "@tanstack/markdown/dist/react";
}
