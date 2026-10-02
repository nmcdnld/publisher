// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A saved finding as a package holds it: `public/apps/<slug>/app.json`. The
// environment and package are deliberately absent, because they are wherever
// the file lives, so a package can move or be copied without editing it.
// Nothing here imports React or a server-only module.

import { z } from "zod";
import {
   BLOCK_TYPES,
   blockProps,
   type Block,
   type BlockType,
} from "./analyst/blocks";
import { MetricUnit } from "./analyst/schema";
import { MANIFEST_VERSION, MAX_SNAPSHOT_ROWS } from "./paths";

export * from "./paths";

const Id = z.string().regex(/^[\w.-]+$/, "Use letters, digits, _ . or -");

const ModelPath = z
   .string()
   .min(1)
   .refine(
      (p) =>
         p.endsWith(".malloy") &&
         !p.startsWith("/") &&
         !p.includes("\\") &&
         !p.split("/").some((seg) => seg === ".." || seg === "." || seg === ""),
      "A package-relative path to a .malloy file, with no .. or leading /",
   );

export const ManifestQuery = z.object({
   model: ModelPath,
   source: z.string().min(1),
   malloy: z.string().min(1),
   /** The named view it ran, or was built from. */
   view: z.string().optional(),
   givens: z.record(z.string(), z.unknown()).optional(),
   title: z.string().optional(),
   /** What one row is, e.g. "one row per month". */
   grain: z.string().optional(),
});
export type ManifestQuery = z.infer<typeof ManifestQuery>;

export const ManifestColumn = z.object({
   name: z.string(),
   type: z.enum(["number", "string", "date", "boolean"]),
   unit: z.enum(["currency", "percent", "number"]).optional(),
   label: z.string().optional(),
});
export type ManifestColumn = z.infer<typeof ManifestColumn>;

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const SnapshotRow = z.record(z.string(), Cell);

/**
 * The rows the finding was written against. A key that is also a query is a
 * fallback for when that query fails; a key that is not is rows the finding
 * carries but cannot re-run, such as a chart program's extra table.
 */
export const Snapshot = z.object({
   asOf: z.iso.datetime({ offset: true }),
   columns: z.record(Id, z.array(ManifestColumn)),
   rows: z.record(Id, z.array(SnapshotRow).max(MAX_SNAPSHOT_ROWS)),
   /** Rows the query returned before the cap, when it returned more. */
   rowCounts: z.record(Id, z.number().int().nonnegative()).optional(),
});
export type Snapshot = z.infer<typeof Snapshot>;

const Polarity = z.enum(["up_is_good", "down_is_good"]);

export const EvidenceVisual = z.discriminatedUnion("kind", [
   z.object({
      kind: z.literal("contribution"),
      from: z.string(),
      to: z.string(),
   }),
   z.object({
      kind: z.literal("anomaly"),
      series: z.string(),
      normal: z.tuple([z.number(), z.number()]),
      normalLabel: z.string(),
      polarity: Polarity,
      events: z
         .array(z.object({ x: z.string(), label: z.string() }))
         .optional(),
   }),
   z.object({
      kind: z.literal("divergence"),
      from: z.string(),
      to: z.string(),
      noise: z.number(),
      polarity: Polarity,
   }),
   z.object({
      kind: z.literal("waterfall"),
      series: z.string(),
      totalLabel: z.string(),
   }),
]);

export const ManifestEvidence = z.object({
   /** The query whose rows the chart draws. */
   query: Id,
   kind: z.enum(["line", "bar", "area"]),
   xKey: z.string(),
   series: z.array(z.object({ key: z.string(), label: z.string() })).min(1),
   format: z.enum(["currency", "percent", "number"]),
   caption: z.string().optional(),
   highlight: z.string().optional(),
   visual: EvidenceVisual.optional(),
   /**
    * A chart program (TanStack Charts or Chart.js), without rows; `tables`
    * names the snapshot entries bound in as its sources by whoever draws it.
    */
   program: z
      .looseObject({ library: z.enum(["tanstack", "chartjs"]) })
      .nullish(),
   tables: z.array(Id).optional(),
});
export type ManifestEvidence = z.infer<typeof ManifestEvidence>;

export const ManifestAnalysis = z.object({
   details: z.array(z.string()),
   evidence: ManifestEvidence,
});

export const ManifestMetric = z.object({
   id: Id,
   /** The query it was computed over. */
   datasetId: Id,
   op: z.string(),
   column: z.string().optional(),
   label: z.string(),
   value: z.union([z.number(), z.string(), z.null()]),
   unit: MetricUnit,
   detail: z.string().optional(),
});
export type ManifestMetric = z.infer<typeof ManifestMetric>;

/** A stored block: the registry's props, with absent fields absent rather than null. */
const storedBlock = <T extends BlockType>(type: T) =>
   blockProps[type].extend({ type: z.literal(type) });

export const ManifestBlock = z.discriminatedUnion(
   "type",
   BLOCK_TYPES.map(storedBlock) as unknown as [
      ReturnType<typeof storedBlock>,
      ...ReturnType<typeof storedBlock>[],
   ],
) as unknown as z.ZodType<Block>;

export const ManifestReportSpec = z.object({
   title: z.string(),
   answer: z.string(),
   sections: z.array(
      z.object({
         heading: z.string().optional(),
         layout: z.enum(["row", "grid-2", "grid-3", "stack"]),
         blocks: z.array(ManifestBlock),
      }),
   ),
});

export const ManifestReport = z.object({
   question: z.string(),
   metrics: z.array(ManifestMetric),
   spec: ManifestReportSpec,
});

const Base = z.object({
   version: z.literal(MANIFEST_VERSION),
   title: z.string().min(1),
   description: z.string(),
   author: z
      .object({ id: z.string().min(1), name: z.string().optional() })
      .optional(),
   createdAt: z.iso.datetime({ offset: true }),
   updatedAt: z.iso.datetime({ offset: true }),
   topics: z.array(z.string()),
   /** Where it came from, so a re-save updates rather than duplicates. */
   origin: z
      .object({
         app: z.string().min(1),
         kind: z.string().min(1),
         id: z.string().min(1),
      })
      .optional(),
   queries: z.record(Id, ManifestQuery),
   snapshot: Snapshot,
});

const AnalysisManifest = Base.extend({
   kind: z.literal("analysis"),
   analysis: ManifestAnalysis,
});
const ReportManifest = Base.extend({
   kind: z.literal("report"),
   report: ManifestReport,
});

/** Everything a name must point at, checked after the shapes parse. */
function checkReferences(
   m: z.infer<typeof AnalysisManifest> | z.infer<typeof ReportManifest>,
   ctx: z.RefinementCtx,
) {
   const problem = (path: PropertyKey[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
   const queries = new Set(Object.keys(m.queries));
   const rows = new Set(Object.keys(m.snapshot.rows));
   for (const id of queries) {
      if (!rows.has(id)) {
         problem(["snapshot", "rows"], `No snapshot rows for query "${id}"`);
      }
   }
   for (const id of rows) {
      if (!(id in m.snapshot.columns)) {
         problem(["snapshot", "columns"], `No columns for snapshot "${id}"`);
      }
   }
   if (m.kind === "analysis") {
      const ev = m.analysis.evidence;
      if (!queries.has(ev.query)) {
         problem(
            ["analysis", "evidence", "query"],
            `Names no query: "${ev.query}"`,
         );
      }
      for (const table of ev.tables ?? []) {
         if (!rows.has(table)) {
            problem(
               ["analysis", "evidence", "tables"],
               `Names "${table}", which the snapshot does not have`,
            );
         }
      }
      if (ev.tables?.length && !ev.program) {
         problem(["analysis", "evidence", "tables"], "Tables with no program");
      }
      return;
   }
   const metrics = new Set(m.report.metrics.map((x) => x.id));
   m.report.metrics.forEach((x, i) => {
      if (!queries.has(x.datasetId)) {
         problem(
            ["report", "metrics", i, "datasetId"],
            `Names no query: "${x.datasetId}"`,
         );
      }
   });
   m.report.spec.sections.forEach((s, si) =>
      s.blocks.forEach((b, bi) => {
         const at = ["report", "spec", "sections", si, "blocks", bi];
         if (
            (b.type === "chart" || b.type === "table") &&
            !queries.has(b.data.datasetId)
         ) {
            problem([...at, "data"], `Names no query: "${b.data.datasetId}"`);
         }
         const refs =
            b.type === "kpi"
               ? [b.metric, ...(b.compare ? [b.compare] : [])]
               : b.type === "chart"
                 ? (b.highlight ?? [])
                 : [];
         for (const r of refs) {
            if (!metrics.has(r.metricId)) {
               problem(at, `Names no metric: "${r.metricId}"`);
            }
         }
      }),
   );
}

export const AppManifest = z
   .discriminatedUnion("kind", [AnalysisManifest, ReportManifest])
   .superRefine(checkReferences);
export type AppManifest = z.infer<typeof AppManifest>;
export type AnalysisAppManifest = Extract<AppManifest, { kind: "analysis" }>;
export type ReportAppManifest = Extract<AppManifest, { kind: "report" }>;

/**
 * What any version of a manifest is expected to carry, so a reader that does
 * not understand one can still show its title rather than failing.
 */
export const ManifestHead = z.object({
   version: z.number(),
   kind: z.string().optional(),
   title: z.string(),
   description: z.string().optional(),
});
export type ManifestHead = z.infer<typeof ManifestHead>;

export type ManifestRead =
   | { ok: true; manifest: AppManifest }
   | { ok: false; head?: ManifestHead; problem: string };

/** Parses a manifest, naming the first problem by its path when it does not. */
export function readManifest(value: unknown): ManifestRead {
   const parsed = AppManifest.safeParse(value);
   if (parsed.success) return { ok: true, manifest: parsed.data };
   const head = ManifestHead.safeParse(value);
   const issue = parsed.error.issues[0];
   const at = issue.path.length ? issue.path.join(".") : "manifest";
   return {
      ok: false,
      head: head.success ? head.data : undefined,
      problem:
         head.success && head.data.version !== MANIFEST_VERSION
            ? `Version ${head.data.version} is not one this reader understands (${MANIFEST_VERSION})`
            : `${at}: ${issue.message}`,
   };
}
