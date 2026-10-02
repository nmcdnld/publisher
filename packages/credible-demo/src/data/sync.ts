// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { manifestOrigin } from "@malloy-publisher/app-manifest";
import type {
   Analysis,
   FindingRef,
   LibraryItem,
   PackageRef,
   Provenance,
   WorkspaceItem,
   WorkspacePackage,
} from "./types";

/**
 * How a Library entry stands against the packages Publisher serves:
 * - `package`: a file in a package that nobody has kept in the Library;
 * - `synced`: a Library item a package file backs;
 * - `unpromoted`: a Library item only this app keeps, which can be promoted;
 * - `missing`: promoted once, but its package no longer serves it;
 * - `linkable`: not tied to a package, but a package holds a data app saved
 *   from this very finding, which it can be tied to;
 * - `unknown`: Publisher hasn't answered, so nothing can be said.
 */
export type SyncState =
   | {
        kind: "package" | "synced" | "linkable";
        pkg: string;
        target: WorkspaceItem;
     }
   | { kind: "unpromoted" }
   | { kind: "missing"; ref: PackageRef }
   | { kind: "unknown" };

export interface LibraryEntry {
   key: string;
   /** Absent for a package file nobody has kept. */
   item?: LibraryItem;
   /** The package it is in, or the one it was built on. */
   pkg?: string;
   sync: SyncState;
}

const refKey = (pkg: string, kind: string, id: string) =>
   `${pkg}\u0000${kind}\u0000${id}`;
const pathOf = (href: string) => href.split("?")[0];

/**
 * The Library's entries: each item, with the package file behind it when
 * there is one, then (when `withPackageFiles`) every package file no item
 * claims. `packages` undefined means Publisher hasn't answered.
 */
export function libraryEntries(
   items: LibraryItem[],
   packages: WorkspacePackage[] | undefined,
   withPackageFiles: (pkg: WorkspacePackage) => boolean,
): LibraryEntry[] {
   const byRef = new Map<string, [WorkspacePackage, WorkspaceItem]>();
   const byHref = new Map<string, [WorkspacePackage, WorkspaceItem]>();
   const byOrigin = new Map<string, [WorkspacePackage, WorkspaceItem]>();
   for (const pkg of packages ?? []) {
      for (const it of pkg.items) {
         byRef.set(refKey(pkg.name, it.kind, it.id), [pkg, it]);
         byHref.set(pathOf(it.href), [pkg, it]);
         const origin = it.manifest && manifestOrigin(it.manifest);
         if (origin?.kind === "analysis")
            byOrigin.set(findingHref({ kind: "analysis", id: origin.id }), [
               pkg,
               it,
            ]);
      }
   }
   const claimed = new Set<WorkspaceItem>();
   const tied = items.map((item) =>
      !packages
         ? undefined
         : item.packageRef
           ? byRef.get(
                refKey(
                   item.packageRef.package,
                   item.packageRef.kind,
                   item.packageRef.id,
                ),
             )
           : byHref.get(pathOf(item.href)),
   );
   for (const found of tied) if (found) claimed.add(found[1]);
   const entries: LibraryEntry[] = items.map((item, i) => {
      const found = tied[i];
      // Asked only once nothing ties it: an app saved from this finding.
      const saved = found ? undefined : byOrigin.get(pathOf(item.href));
      const linkable = saved && !claimed.has(saved[1]) ? saved : undefined;
      if (linkable) claimed.add(linkable[1]);
      const sync: SyncState = !packages
         ? { kind: "unknown" }
         : found
           ? { kind: "synced", pkg: found[0].name, target: found[1] }
           : linkable
             ? { kind: "linkable", pkg: linkable[0].name, target: linkable[1] }
             : item.packageRef
               ? { kind: "missing", ref: item.packageRef }
               : { kind: "unpromoted" };
      return {
         key: item.id,
         item,
         pkg:
            found?.[0].name ??
            linkable?.[0].name ??
            item.packageRef?.package ??
            item.provenance.package,
         sync,
      };
   });
   for (const pkg of packages ?? []) {
      if (!withPackageFiles(pkg)) continue;
      for (const it of pkg.items) {
         if (claimed.has(it)) continue;
         entries.push({
            key: `pkg:${refKey(pkg.name, it.kind, it.id)}`,
            pkg: pkg.name,
            sync: { kind: "package", pkg: pkg.name, target: it },
         });
      }
   }
   return entries;
}

export const inPackage = (s: SyncState) =>
   s.kind === "synced" || s.kind === "package" || s.kind === "linkable";
export const needsPromotion = (s: SyncState) =>
   s.kind === "unpromoted" || s.kind === "missing";

/** What a promotion writes: the Malloy behind a Library item, and where it ran. */
export interface Promotable {
   malloy: string;
   provenance: Provenance;
   /** The content itself, which a save as a data app writes whole. */
   finding: { kind: "analysis"; analysis: Analysis };
}

/** An analysis as something to save, when it has a query. */
export const analysisPromotable = (a: Analysis): Promotable | undefined =>
   a.malloy
      ? {
           malloy: a.malloy,
           provenance: a.provenance,
           finding: { kind: "analysis", analysis: a },
        }
      : undefined;

export const findingOf = (p: Promotable): FindingRef => ({
   kind: "analysis",
   id: p.finding.analysis.id,
});

export const findingHref = (f: FindingRef) => `/analysis/${f.id}`;

/** The finding a Library item's route names, when it names one. */
export function findingOfHref(href: string): FindingRef | undefined {
   const analysis = href.match(/^\/analysis\/([^/?#]+)/)?.[1];
   return analysis ? { kind: "analysis", id: analysis } : undefined;
}

/** The Malloy a Library item stands for, when it has any: the query behind a saved analysis. */
export function promotableOf(
   item: LibraryItem,
   analyses: Map<string, Analysis>,
): Promotable | undefined {
   const finding = findingOfHref(item.href);
   const a = finding && analyses.get(finding.id);
   return a && analysisPromotable(a);
}
