// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The page beside every manifest. It exists so Publisher's `/data-apps`
// listing and the Console's viewer show the app with no change of their own;
// everything in it is derived from the manifest, and it is regenerated on
// every save rather than edited.

import { MANIFEST_FILE } from "./paths";
import type { ManifestHead } from "./schema";

/** The runtime every data app loads, and the renderer that draws a manifest. */
export const RUNTIME_SRC = "/sdk/publisher.js";
export const RENDERER_SRC = "/sdk/publisher-app.js";
/** The meta tag that marks a page as manifest-backed and names its manifest. */
export const APP_META = "publisher:app";

const escape = (s: string) =>
   s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

/**
 * The page for a manifest. The body carries the title and description so a
 * browser without the renderer, or before it loads, still shows what this is;
 * the renderer replaces it.
 */
export function indexHtmlFor(
   manifest: Pick<ManifestHead, "title" | "description">,
): string {
   const title = escape(manifest.title);
   const description = escape(manifest.description ?? "");
   return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${description}" />
  <meta name="${APP_META}" content="${MANIFEST_FILE}" />
  <script src="${RUNTIME_SRC}"></script>
  <script src="${RENDERER_SRC}" defer></script>
</head>
<body>
  <main id="publisher-app">
    <h1>${title}</h1>
    <p>${description}</p>
  </main>
</body>
</html>
`;
}
