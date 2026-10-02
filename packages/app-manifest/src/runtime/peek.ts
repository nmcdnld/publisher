// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The renderer's check of a manifest: its outline only. The full schema
// would double the bundle, and a manifest is validated where it is written
// and where the destination reads it; what gets past this and still does
// not draw is caught by the renderer and reported the same way.

import { MANIFEST_VERSION } from "../paths";
import type { AppManifest, ManifestHead, ManifestRead } from "../schema";

const isObject = (v: unknown): v is Record<string, unknown> =>
   !!v && typeof v === "object" && !Array.isArray(v);

export function peekManifest(value: unknown): ManifestRead {
   if (!isObject(value) || typeof value.title !== "string") {
      return { ok: false, problem: "its manifest has no title" };
   }
   const head: ManifestHead = {
      version: typeof value.version === "number" ? value.version : NaN,
      title: value.title,
      description:
         typeof value.description === "string" ? value.description : undefined,
   };
   const fail = (problem: string): ManifestRead => ({
      ok: false,
      head,
      problem,
   });
   if (head.version !== MANIFEST_VERSION) {
      return fail(
         `version ${value.version} is not one this Publisher understands (${MANIFEST_VERSION})`,
      );
   }
   const snapshot = value.snapshot;
   if (
      !isObject(value.queries) ||
      !isObject(snapshot) ||
      !isObject(snapshot.rows) ||
      !isObject(snapshot.columns)
   ) {
      return fail("its manifest has no queries or snapshot");
   }
   if (value.kind === "analysis" && isObject(value.analysis)) {
      return { ok: true, manifest: value as AppManifest };
   }
   if (value.kind === "report" && isObject(value.report)) {
      return { ok: true, manifest: value as AppManifest };
   }
   return fail(
      `"${String(value.kind)}" is not a kind of finding this Publisher draws`,
   );
}
