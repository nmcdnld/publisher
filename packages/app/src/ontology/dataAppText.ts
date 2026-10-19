// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

const MAX_APP_FILES = 25;
const MAX_APP_FILE_BYTES = 300_000;

/**
 * A data app's HTML plus the scripts it loads from its own directory, and
 * what those import, since that is usually where its queries are written.
 * Vendored libraries and anything outside the app's directory are skipped.
 */
export async function dataAppText(
   htmlUrl: string,
   fetchText: (url: string) => Promise<string | undefined>,
): Promise<string | undefined> {
   const entry = new URL(htmlUrl, window.location.href);
   const root = entry.href.slice(0, entry.href.lastIndexOf("/") + 1);
   const seen = new Set<string>([entry.href]);
   const html = await fetchText(entry.href);
   if (html === undefined) return undefined;
   const texts = [html];
   const queue = scriptRefs(html, entry.href, root, seen);
   // A page driven by `publisher-app.js` keeps its queries in `./app.json`.
   if (html.includes("publisher-app.js")) queue.push(`${root}app.json`);
   while (queue.length && texts.length < MAX_APP_FILES) {
      const batch = queue.splice(0, MAX_APP_FILES - texts.length);
      const loaded = await Promise.all(batch.map((url) => fetchText(url)));
      loaded.forEach((text, i) => {
         if (text === undefined || text.length > MAX_APP_FILE_BYTES) return;
         texts.push(text);
         queue.push(...scriptRefs(text, batch[i], root, seen));
      });
   }
   return texts.join("\n");
}

function scriptRefs(
   text: string,
   base: string,
   root: string,
   seen: Set<string>,
): string[] {
   const specifiers = [
      ...text.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g),
      ...text.matchAll(/(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g),
      ...text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
   ].map((m) => m[1]);
   const urls: string[] = [];
   for (const specifier of specifiers) {
      if (!/^\.{1,2}\//.test(specifier) && !/^[\w-]+\//.test(specifier)) {
         continue;
      }
      const url = new URL(specifier, base).href;
      if (!url.startsWith(root) || /\/vendor\/|\.min\.js$/.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
   }
   return urls;
}
