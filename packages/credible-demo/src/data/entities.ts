// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { estimateTokens } from "./models";
import { workspaceRoute } from "./publisher";
import type {
   Analysis,
   EntityKind,
   EntityRef,
   PackageGraph,
   Thread,
   WorkspacePackage,
} from "./types";

export const entityKinds: Record<
   EntityKind,
   { label: string; plural: string }
> = {
   source: { label: "Source", plural: "Sources" },
   dashboard: { label: "Dashboard", plural: "Dashboards" },
   notebook: { label: "Notebook", plural: "Notebooks" },
   data_app: { label: "Data app", plural: "Data apps" },
   model: { label: "Model", plural: "Models" },
   package: { label: "Package", plural: "Packages" },
   analysis: { label: "Analysis", plural: "Analyses" },
   thread: { label: "Thread", plural: "Threads" },
};

/** The order groups appear in the mention menu. */
export const entityKindOrder: EntityKind[] = [
   "source",
   "dashboard",
   "notebook",
   "data_app",
   "model",
   "package",
   "analysis",
   "thread",
];

const slug = (s: string, max = 40) =>
   s
      .toLowerCase()
      .replace(/[^a-z0-9_./-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "");

const basename = (path: string) =>
   path
      .split("/")
      .pop()!
      .replace(/\.(malloy|malloynb|html)$/, "");

/**
 * Everything a message can mention: what each Publisher package serves, the
 * sources its models define, and the analyses and threads this app keeps.
 * Handles are made unique by prefixing the package when two collide.
 */
export function buildEntities({
   packages,
   graphs,
   analyses,
   threads,
}: {
   packages: WorkspacePackage[];
   graphs: Record<string, PackageGraph | undefined>;
   analyses: Analysis[];
   threads: Thread[];
}): EntityRef[] {
   const out: EntityRef[] = [];
   const taken = new Set<string>();
   const add = (e: Omit<EntityRef, "handle">, handle: string, pkg?: string) => {
      if (out.some((o) => o.id === e.id)) return;
      let h = handle;
      if (taken.has(h) && pkg) h = `${pkg}/${handle}`;
      for (let i = 2; taken.has(h); i++) h = `${handle}-${i}`;
      taken.add(h);
      out.push({ ...e, handle: h });
   };

   for (const pkg of packages) {
      const graph = graphs[pkg.name];
      for (const file of Object.values(graph?.files ?? {})) {
         for (const s of file.sources) {
            const fields = s.dimensions + s.measures + s.views;
            add(
               {
                  kind: "source",
                  id: `source:${pkg.name}/${s.name}`,
                  label: s.name,
                  detail: `${pkg.name} · ${file.path}`,
                  description:
                     s.doc ??
                     `${s.dimensions} dimensions, ${s.measures} measures, ${s.views} views`,
                  tokens: 500 + fields * 45 + s.joins.length * 60,
                  href: workspaceRoute(pkg.name, "query", file.path),
               },
               s.name,
               pkg.name,
            );
         }
      }
      for (const item of pkg.items) {
         const kind: EntityKind = item.kind === "query" ? "model" : item.kind;
         const tiles = graph?.dashboards[item.id]?.tiles.length ?? 6;
         const tokens =
            kind === "dashboard"
               ? 400 + tiles * 160
               : kind === "notebook"
                 ? 2400
                 : kind === "data_app"
                   ? 1800
                   : 800 +
                     (graph?.files[item.path]?.sources ?? []).reduce(
                        (n, s) =>
                           n + 500 + (s.dimensions + s.measures + s.views) * 45,
                        0,
                     );
         add(
            {
               kind,
               id: `${kind}:${pkg.name}/${item.id}`,
               label: item.title,
               detail: `${pkg.name} · ${item.path}`,
               description: item.description,
               tokens,
               href: item.href,
            },
            kind === "model" || item.title === item.path
               ? slug(basename(item.path))
               : slug(item.title),
            pkg.name,
         );
      }
      add(
         {
            kind: "package",
            id: `package:${pkg.name}`,
            label: pkg.name,
            detail: `${pkg.items.length} items`,
            description: pkg.description,
            tokens: 600 + pkg.items.length * 220,
            href: pkg.href,
         },
         pkg.name,
      );
   }

   // Sources the analyses were answered from, for when Publisher is unreachable.
   for (const a of analyses) {
      const p = a.provenance;
      if (out.some((o) => o.kind === "source" && o.label === p.source))
         continue;
      add(
         {
            kind: "source",
            id: `source:${p.package}/${p.source}`,
            label: p.source,
            detail: `${p.package} · ${p.model}`,
            tokens: 1600,
            href: workspaceRoute(p.package, "query", p.model),
         },
         p.source,
         p.package,
      );
   }

   for (const a of analyses) {
      add(
         {
            kind: "analysis",
            id: `analysis:${a.id}`,
            label: a.title,
            detail: `${a.provenance.package} · ${a.provenance.source}`,
            description: a.narrative,
            tokens: estimateTokens(
               a.narrative + a.malloy + JSON.stringify(a.evidence.rows),
            ),
            href: `/analysis/${a.id}`,
         },
         slug(a.title, 32),
      );
   }

   for (const t of threads) {
      add(
         {
            kind: "thread",
            id: `thread:${t.id}`,
            label: t.title,
            detail: `${t.messages.length} messages`,
            tokens: threadTokens(t),
            href: `/chat/${t.id}`,
         },
         slug(t.title, 32),
      );
   }

   return out;
}

/** What a thread's messages cost when replayed as history. */
export function threadTokens(thread: Thread | null | undefined): number {
   if (!thread) return 0;
   return thread.messages.reduce(
      (n, m) =>
         n +
         estimateTokens(
            m.text +
               (m.malloy ?? "") +
               (m.evidence ? JSON.stringify(m.evidence.rows) : ""),
         ) +
         (m.references ?? []).reduce((r, e) => r + e.tokens, 0) +
         (m.attachments ?? []).reduce((r, a) => r + a.tokens, 0),
      0,
   );
}

/** Entities matching `query`, best first: handle prefix, then label, then package. */
export function rankEntities(
   entities: EntityRef[],
   query: string,
): EntityRef[] {
   const q = query.toLowerCase();
   if (!q) return entities;
   const score = (e: EntityRef) => {
      const handle = e.handle.toLowerCase();
      const label = e.label.toLowerCase();
      if (handle.startsWith(q)) return 0;
      if (label.startsWith(q)) return 1;
      if (handle.includes(q) || label.includes(q)) return 2;
      return -1;
   };
   return entities
      .map((e) => [e, score(e)] as const)
      .filter(([, s]) => s >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([e]) => e);
}
