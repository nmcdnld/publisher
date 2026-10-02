// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type {
   Analysis,
   ContentKind,
   LibraryItem,
   PackageGraph,
   SourceFacts,
   WorkspaceItem,
   WorkspacePackage,
} from "./types";

/** One linked page in a relation list. */
export interface RelationEntry {
   key: string;
   kind: ContentKind | "source";
   title: string;
   subtitle?: string;
   href?: string;
}

export interface Relations {
   /** Sources the page's own file defines, each with the file it lives in. */
   sources: { facts: SourceFacts; home: WorkspaceItem | undefined }[];
   dependsOn: RelationEntry[];
   usedBy: RelationEntry[];
   referencedIn: RelationEntry[];
   /** Where each source name in the package is defined. */
   sourceHome: Map<string, WorkspaceItem>;
}

const itemEntry = (item: WorkspaceItem, subtitle?: string): RelationEntry => ({
   key: `${item.kind}:${item.id}`,
   kind: item.kind,
   title: item.title,
   subtitle: subtitle ?? (item.path !== item.title ? item.path : undefined),
   href: item.href,
});

/**
 * Everything that links to or from one page in a package: the files it reads,
 * the pages built on it, and the analyses and Library items in this app that
 * cite it. Relationships are read from what the files declare (imports,
 * sources, tile queries, model paths in a data app's page), never guessed
 * from names.
 */
function indexPackage(pkg: WorkspacePackage, graph: PackageGraph) {
   const byPath = new Map<string, WorkspaceItem>();
   for (const i of pkg.items) {
      if (i.kind !== "data_app") byPath.set(i.path, i);
   }
   const sourceHome = new Map<string, WorkspaceItem>();
   for (const file of Object.values(graph.files)) {
      const home = byPath.get(file.path);
      if (!home) continue;
      for (const s of file.sources) {
         if (!sourceHome.has(s.name)) sourceHome.set(s.name, home);
      }
   }
   return { byPath, sourceHome };
}

const analysisEntry = (a: Analysis): RelationEntry => ({
   key: `analysis:${a.id}`,
   kind: "insight",
   title: a.title,
   subtitle: `Analysis · ${a.provenance.source}${a.provenance.view ? ` → ${a.provenance.view}` : ""}`,
   href: `/analysis/${a.id}`,
});

const libraryEntry = (l: LibraryItem): RelationEntry => ({
   key: `library:${l.id}`,
   kind: l.kind,
   title: l.title,
   subtitle: `Library · ${l.scope === "workspace" ? "Workspace" : "Personal"}`,
   href: `/library?item=${l.id}`,
});

export function relationsFor(
   pkg: WorkspacePackage,
   graph: PackageGraph,
   item: WorkspaceItem,
   analyses: Analysis[],
   library: LibraryItem[],
): Relations {
   const { byPath, sourceHome } = indexPackage(pkg, graph);

   const file = item.kind === "data_app" ? undefined : graph.files[item.path];
   const dependsOn = new Map<string, RelationEntry>();
   const usedBy = new Map<string, RelationEntry>();
   const add = (to: Map<string, RelationEntry>, e: RelationEntry) => {
      if (e.key !== `${item.kind}:${item.id}` && !to.has(e.key))
         to.set(e.key, e);
   };

   // What this page reads.
   for (const path of file?.imports ?? []) {
      const target = byPath.get(path);
      add(
         dependsOn,
         target
            ? itemEntry(target, "Imported")
            : {
                 key: `file:${path}`,
                 kind: "query",
                 title: path,
                 subtitle: "Imported, not served",
              },
      );
   }
   const app = item.kind === "data_app" ? graph.dataApps[item.path] : undefined;
   const appSources: Relations["sources"] = [];
   if (app) {
      for (const path of app.models) {
         const target = byPath.get(path);
         if (target) add(dependsOn, itemEntry(target, "Queried by the page"));
      }
      for (const name of new Set(app.queries.map((q) => q.source))) {
         const home = sourceHome.get(name);
         const facts = home
            ? graph.files[home.path]?.sources.find((s) => s.name === name)
            : undefined;
         if (!home || !facts) continue;
         appSources.push({ facts, home });
         add(dependsOn, itemEntry(home, `Defines ${name}`));
      }
   }
   if (item.kind === "dashboard") {
      for (const tile of graph.dashboards[item.id]?.tiles ?? []) {
         const home = sourceHome.get(tile.source);
         if (home && home.path !== item.path) {
            add(dependsOn, itemEntry(home, `Defines ${tile.source}`));
         }
      }
   }
   for (const s of file?.sources ?? []) {
      for (const name of [s.base, ...s.joins.map((j) => j.name)]) {
         const home = name ? sourceHome.get(name) : undefined;
         if (home && home.path !== item.path) {
            add(dependsOn, itemEntry(home, `Defines ${name}`));
         }
      }
   }

   // What reads this page.
   if (item.kind !== "data_app") {
      for (const other of Object.values(graph.files)) {
         if (!other.imports.includes(item.path)) continue;
         const from = byPath.get(other.path);
         if (from) add(usedBy, itemEntry(from, "Imports it"));
      }
      const defined = new Set(file?.sources.map((s) => s.name));
      for (const [appPath, facts] of Object.entries(graph.dataApps)) {
         if (
            !facts.models.includes(item.path) &&
            !facts.queries.some((q) => defined.has(q.source))
         ) {
            continue;
         }
         const target = pkg.items.find(
            (i) => i.kind === "data_app" && i.path === appPath,
         );
         if (target) add(usedBy, itemEntry(target, "Queries it"));
      }
      for (const [slug, dash] of Object.entries(graph.dashboards)) {
         const reads = dash.tiles.filter((t) => defined.has(t.source));
         const target = pkg.items.find(
            (i) => i.kind === "dashboard" && i.id === slug,
         );
         if (target && reads.length > 0) {
            add(
               usedBy,
               itemEntry(
                  target,
                  `${reads.length} ${reads.length === 1 ? "tile" : "tiles"}`,
               ),
            );
         }
      }
   }

   // What this app says about it.
   const cites = (p: { package: string; model: string; source: string }) =>
      p.package === pkg.name &&
      (p.model === item.path ||
         (item.kind === "dashboard" && p.source === item.id));
   const referencedIn: RelationEntry[] = [
      ...analyses.filter((a) => cites(a.provenance)).map(analysisEntry),
      ...library
         .filter(
            (l) =>
               l.href.split("?")[0] === item.href.split("?")[0] ||
               (l.kind === item.kind && cites(l.provenance)),
         )
         .map(libraryEntry),
   ];

   return {
      sources: app
         ? appSources
         : (file?.sources ?? []).map((facts) => ({
              facts,
              home: sourceHome.get(facts.name),
           })),
      dependsOn: [...dependsOn.values()],
      usedBy: [...usedBy.values()],
      referencedIn,
      sourceHome,
   };
}

export interface AnalysisRelations {
   /** The model file the analysis runs against, when the package serves it. */
   model: WorkspaceItem | undefined;
   /** The source it queries, as the file that defines it declares it. */
   source: { facts: SourceFacts; home: WorkspaceItem } | undefined;
   dependsOn: RelationEntry[];
   /** Dashboards and other analyses that read the same source. */
   sameSource: RelationEntry[];
   referencedIn: RelationEntry[];
   sourceHome: Map<string, WorkspaceItem>;
}

/** The same links as {@link relationsFor}, seen from one analysis in this app. */
export function analysisRelations(
   pkg: WorkspacePackage,
   graph: PackageGraph,
   analysis: Analysis,
   analyses: Analysis[],
   library: LibraryItem[],
): AnalysisRelations {
   const { byPath, sourceHome } = indexPackage(pkg, graph);
   const { model: modelPath, source: sourceName } = analysis.provenance;
   const model = byPath.get(modelPath);
   const home = sourceHome.get(sourceName);
   const facts = home
      ? graph.files[home.path]?.sources.find((s) => s.name === sourceName)
      : undefined;

   const dependsOn = new Map<string, RelationEntry>();
   const add = (e: RelationEntry) => {
      if (!dependsOn.has(e.key)) dependsOn.set(e.key, e);
   };
   if (model) add(itemEntry(model, "The model it runs against"));
   if (home) add(itemEntry(home, `Defines ${sourceName}`));
   for (const name of [
      facts?.base,
      ...(facts?.joins.map((j) => j.name) ?? []),
   ]) {
      const at = name ? sourceHome.get(name) : undefined;
      if (at) add(itemEntry(at, `Defines ${name}`));
   }

   const sameSource: RelationEntry[] = [];
   for (const [slug, dash] of Object.entries(graph.dashboards)) {
      const reads = dash.tiles.filter((t) => t.source === sourceName);
      const target = pkg.items.find(
         (i) => i.kind === "dashboard" && i.id === slug,
      );
      if (target && reads.length > 0) {
         sameSource.push(
            itemEntry(
               target,
               `${reads.length} ${reads.length === 1 ? "tile" : "tiles"}`,
            ),
         );
      }
   }
   for (const other of analyses) {
      if (
         other.id !== analysis.id &&
         other.provenance.package === pkg.name &&
         other.provenance.source === sourceName
      ) {
         sameSource.push(analysisEntry(other));
      }
   }

   return {
      model,
      source: facts && home ? { facts, home } : undefined,
      dependsOn: [...dependsOn.values()],
      sameSource,
      referencedIn: library
         .filter((l) => l.href.split("?")[0] === `/analysis/${analysis.id}`)
         .map(libraryEntry),
      sourceHome,
   };
}
