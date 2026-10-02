// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Names and paths of the format, with no zod, so the renderer bundle can
// import them without the schema.

export const MANIFEST_VERSION = 1;
/** The same cap the destination applies to a thread's stored datasets. */
export const MAX_SNAPSHOT_ROWS = 400;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Where an app lives under the package's `public/` directory. */
export const APPS_DIR = "apps";
export const MANIFEST_FILE = "app.json";
export const INDEX_FILE = "index.html";

export const isSlug = (slug: string) => SLUG_PATTERN.test(slug);

/** Where an app's files live, relative to the package's `public/` directory. */
export function appPaths(slug: string) {
   const dir = `${APPS_DIR}/${slug}`;
   return {
      dir,
      manifest: `${dir}/${MANIFEST_FILE}`,
      index: `${dir}/${INDEX_FILE}`,
   };
}

/** The slug of an app's page path (`apps/<slug>/index.html`), when it is one. */
export function slugOfAppPath(path: string): string | undefined {
   const m = path.match(/^apps\/([^/]+)\/index\.html$/);
   return m && isSlug(m[1]) ? m[1] : undefined;
}

/** A slug from a title: lowercase words joined by dashes, at most 64 characters. */
export function slugOf(title: string): string {
   const slug = title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64)
      .replace(/^-+|-+$/g, "");
   return slug || "finding";
}
