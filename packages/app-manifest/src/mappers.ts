// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The boundary between an app's own records and a manifest. The input types
// here are the shapes the destination already keeps (its Analysis, and the
// analyst record on a thread message), written structurally so this package
// does not depend on it; the outputs are assignable back to them.

import type { ReportSpec } from "./analyst/blocks";
import { resolveText } from "./analyst/format";
import type { Dataset, DatasetColumn, Metric, Row } from "./analyst/schema";
import type { z } from "zod";
import {
   MANIFEST_VERSION,
   MAX_SNAPSHOT_ROWS,
   type AnalysisAppManifest,
   type AppManifest,
   type EvidenceVisual,
   type ManifestColumn,
   type ManifestEvidence,
   type ManifestMetric,
   type ReportAppManifest,
   type Snapshot,
} from "./schema";

/** What the destination calls the app in a manifest's `origin`. */
export const DESTINATION_APP = "destination";

export interface ProvenanceInput {
   environment: string;
   package: string;
   model: string;
   source: string;
   view?: string;
}

export interface EvidenceInput {
   kind: "line" | "bar" | "area";
   xKey: string;
   series: { key: string; label: string }[];
   rows: Record<string, string | number>[];
   format: "currency" | "percent" | "number";
   caption?: string;
   visual?: z.infer<typeof EvidenceVisual>;
   /** A bound chart program, or an older spec this format does not keep. */
   spec?: Record<string, unknown>;
   highlight?: string;
}

export interface AnalysisInput {
   id: string;
   title: string;
   narrative: string;
   details: string[];
   evidence: EvidenceInput;
   malloy: string;
   provenance: ProvenanceInput;
   authorId: string;
   createdAt: string;
   topics: string[];
}

/** The part of a thread's analyst record a report keeps. */
export interface ReportRecordInput {
   question: string;
   datasets: Dataset[];
   metrics: Metric[];
   report?: ReportSpec;
}

export interface ThreadInput {
   id: string;
   title: string;
   createdAt: string;
   messages: { role: "user" | "assistant"; analyst?: ReportRecordInput }[];
}

export interface ManifestOptions {
   /** Written as `updatedAt`, and the snapshot's `asOf`; defaults to now. */
   now?: string;
   /** The author's display name, beside the id the record carries. */
   authorName?: string;
}

/** Where a manifest was read from, which it does not say itself. */
export interface ManifestLocation {
   environment: string;
   package: string;
   slug: string;
}

// ── Home ────────────────────────────────────────────────────────────────

/**
 * The one package a finding can be saved into: the package its data came
 * from. A manifest's model paths are package-relative, so a finding saved
 * anywhere else would name models that are not there, or, worse, models of
 * the same name that mean something else.
 */
export type FindingHome =
   | { ok: true; environment: string; package: string }
   | { ok: false; problem: string };

export function homeOf(
   sources: { environment: string; package: string }[],
): FindingHome {
   const homes = [
      ...new Map(
         sources.map((s) => [`${s.environment}/${s.package}`, s]),
      ).values(),
   ];
   if (homes.length === 0) {
      return { ok: false, problem: "It has no query to save." };
   }
   if (homes.length > 1) {
      return {
         ok: false,
         problem: `Its data comes from ${homes.map((h) => h.package).join(" and ")}, and a data app lives in one package.`,
      };
   }
   return {
      ok: true,
      environment: homes[0].environment,
      package: homes[0].package,
   };
}

export const analysisHome = (a: Pick<AnalysisInput, "provenance">) =>
   homeOf([a.provenance]);

export const reportHome = (r: Pick<ReportRecordInput, "datasets">) =>
   homeOf(r.datasets.map((ds) => ds.source));

export function threadHome(t: ThreadInput): FindingHome {
   const r = reportedRecord(t);
   if (!r) return { ok: false, problem: "It has no report to save." };
   return reportHome(r);
}

// ── Snapshots ───────────────────────────────────────────────────────────

interface BoundSource {
   columns: Pick<DatasetColumn, "name" | "type">[];
   rows: Row[];
}

const isBoundProgram = (
   spec: unknown,
): spec is {
   library: "tanstack" | "chartjs";
   sources: Record<string, BoundSource>;
} =>
   !!spec &&
   typeof spec === "object" &&
   ((spec as { library?: unknown }).library === "tanstack" ||
      (spec as { library?: unknown }).library === "chartjs") &&
   typeof (spec as { sources?: unknown }).sources === "object";

class SnapshotBuilder {
   readonly snapshot: Snapshot;
   constructor(asOf: string) {
      this.snapshot = { asOf, columns: {}, rows: {} };
   }
   add(
      id: string,
      columns: ManifestColumn[],
      rows: Row[],
      rowCount = rows.length,
   ) {
      this.snapshot.columns[id] = columns;
      this.snapshot.rows[id] = rows.slice(0, MAX_SNAPSHOT_ROWS);
      if (rowCount > this.snapshot.rows[id].length) {
         this.snapshot.rowCounts = {
            ...this.snapshot.rowCounts,
            [id]: rowCount,
         };
      }
   }
}

/** Columns for rows that came without any, typed from their values. */
function columnsOf(
   rows: Record<string, unknown>[],
   units: Record<string, Pick<ManifestColumn, "unit" | "label">> = {},
): ManifestColumn[] {
   const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
   return names.map((name) => {
      const values = rows.map((r) => r[name]).filter((v) => v != null);
      const type = values.every((v) => typeof v === "number")
         ? "number"
         : values.every((v) => typeof v === "boolean")
           ? "boolean"
           : "string";
      return { name, type, ...units[name] };
   });
}

const defined = <T extends object>(o: T) =>
   Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== undefined),
   ) as T;

// ── Analysis ────────────────────────────────────────────────────────────

export function manifestFromAnalysis(
   a: AnalysisInput,
   opts: ManifestOptions = {},
): AnalysisAppManifest {
   const now = opts.now ?? new Date().toISOString();
   const snap = new SnapshotBuilder(now);
   const bound = isBoundProgram(a.evidence.spec) ? a.evidence.spec : undefined;
   const main = bound && "q1" in bound.sources ? "evidence" : "q1";

   const unit = a.evidence.format === "number" ? undefined : a.evidence.format;
   snap.add(
      main,
      columnsOf(
         a.evidence.rows,
         Object.fromEntries(
            a.evidence.series.map((s) => [
               s.key,
               defined({ unit, label: s.label }),
            ]),
         ),
      ),
      a.evidence.rows,
   );
   let program: ManifestEvidence["program"];
   let tables: string[] | undefined;
   if (bound) {
      const { sources, ...rest } = bound;
      program = rest;
      tables = Object.keys(sources);
      for (const [id, s] of Object.entries(sources)) {
         snap.add(id, s.columns, s.rows);
      }
   }

   const ev = a.evidence;
   return {
      version: MANIFEST_VERSION,
      kind: "analysis",
      title: a.title,
      description: a.narrative,
      author: defined({ id: a.authorId, name: opts.authorName }),
      createdAt: a.createdAt,
      updatedAt: now,
      topics: a.topics,
      origin: { app: DESTINATION_APP, kind: "analysis", id: a.id },
      queries: {
         [main]: defined({
            model: a.provenance.model,
            source: a.provenance.source,
            view: a.provenance.view,
            malloy: a.malloy,
         }),
      },
      snapshot: snap.snapshot,
      analysis: {
         details: a.details,
         evidence: defined({
            query: main,
            kind: ev.kind,
            xKey: ev.xKey,
            series: ev.series,
            format: ev.format,
            caption: ev.caption,
            highlight: ev.highlight,
            visual: ev.visual,
            program,
            tables,
         }),
      },
   };
}

/** A manifest's id in the app that wrote it, when that app is this one. */
function originId(m: AppManifest, kind: string) {
   return m.origin?.app === DESTINATION_APP && m.origin.kind === kind
      ? m.origin.id
      : undefined;
}

/** The destination record a manifest was saved from, when it was. */
export function manifestOrigin(
   m: AppManifest,
): { kind: "analysis" | "thread"; id: string } | undefined {
   const analysis = originId(m, "analysis");
   if (analysis) return { kind: "analysis", id: analysis };
   const thread = originId(m, "thread");
   return thread ? { kind: "thread", id: thread } : undefined;
}

/**
 * The manifest with each query's snapshot rows replaced by `rows` where it
 * has them, so the mappers draw live rows the way they draw saved ones.
 */
export function withRows<M extends AppManifest>(
   m: M,
   rows: Record<string, Row[]>,
): M {
   return {
      ...m,
      snapshot: { ...m.snapshot, rows: { ...m.snapshot.rows, ...rows } },
   };
}

/** The id a package-backed item goes by when no app of ours wrote it. */
export const manifestItemId = (at: ManifestLocation) =>
   `app:${at.environment}/${at.package}/${at.slug}`;

const cellText = (v: Row[string]): string | number =>
   typeof v === "number" || typeof v === "string"
      ? v
      : v == null
        ? ""
        : String(v);

/** The analysis a manifest describes, filled in with where it was read from. */
export function analysisFromManifest(
   m: AnalysisAppManifest,
   at: ManifestLocation,
): AnalysisInput {
   const ev = m.analysis.evidence;
   const q = m.queries[ev.query];
   const spec =
      ev.program &&
      ({
         ...ev.program,
         sources: Object.fromEntries(
            (ev.tables ?? []).map((t) => [
               t,
               {
                  columns: m.snapshot.columns[t].map(({ name, type }) => ({
                     name,
                     type,
                  })),
                  rows: m.snapshot.rows[t],
               },
            ]),
         ),
      } as Record<string, unknown>);
   return {
      id: originId(m, "analysis") ?? manifestItemId(at),
      title: m.title,
      narrative: m.description,
      details: m.analysis.details,
      evidence: defined({
         kind: ev.kind,
         xKey: ev.xKey,
         series: ev.series,
         rows: m.snapshot.rows[ev.query].map((r) =>
            Object.fromEntries(
               Object.entries(r).map(([k, v]) => [k, cellText(v)]),
            ),
         ),
         format: ev.format,
         caption: ev.caption,
         visual: ev.visual,
         spec: spec || undefined,
         highlight: ev.highlight,
      }),
      malloy: q.malloy,
      provenance: defined({
         environment: at.environment,
         package: at.package,
         model: q.model,
         source: q.source,
         view: q.view,
      }),
      authorId: m.author?.id ?? "ai",
      createdAt: m.createdAt,
      topics: m.topics,
   };
}

// ── Report ──────────────────────────────────────────────────────────────

/** The answer a thread ends on: its last assistant message with a report. */
export const reportedRecord = (t: ThreadInput) =>
   [...t.messages]
      .reverse()
      .find((msg) => msg.role === "assistant" && msg.analyst?.report)
      ?.analyst as (ReportRecordInput & { report: ReportSpec }) | undefined;

/** A thread's answer as a report manifest; undefined when it has none. */
export function manifestFromThread(
   t: ThreadInput,
   opts: ManifestOptions & { authorId?: string } = {},
): ReportAppManifest | undefined {
   const r = reportedRecord(t);
   if (!r) return undefined;
   return reportManifest(
      r,
      {
         title: r.report.title || t.title,
         createdAt: t.createdAt,
         topics: [],
         origin: { kind: "thread", id: t.id },
         authorId: opts.authorId,
      },
      opts,
   );
}

/** An analysis saved from an analyst's answer, which keeps the whole report. */
export interface ReportedAnalysisInput {
   id: string;
   title: string;
   authorId: string;
   createdAt: string;
   topics: string[];
   report: ReportRecordInput & { report: ReportSpec };
}

/** An analysis that carries an analyst's report, as a report manifest. */
export function manifestFromReport(
   a: ReportedAnalysisInput,
   opts: ManifestOptions = {},
): ReportAppManifest {
   return reportManifest(
      a.report,
      {
         title: a.title || a.report.report.title,
         createdAt: a.createdAt,
         topics: a.topics,
         origin: { kind: "analysis", id: a.id },
         authorId: a.authorId,
      },
      opts,
   );
}

function reportManifest(
   r: ReportRecordInput & { report: ReportSpec },
   meta: {
      title: string;
      createdAt: string;
      topics: string[];
      origin: { kind: "analysis" | "thread"; id: string };
      authorId?: string;
   },
   opts: ManifestOptions,
): ReportAppManifest {
   const now = opts.now ?? new Date().toISOString();
   const snap = new SnapshotBuilder(now);
   for (const ds of r.datasets) {
      snap.add(ds.id, ds.columns, ds.rows, ds.rowCount);
   }
   const metrics = r.metrics.map(
      (x): ManifestMetric =>
         defined({
            id: x.id,
            datasetId: x.datasetId,
            op: x.op,
            column: x.column,
            label: x.label,
            value: x.value,
            unit: x.unit,
            detail: x.detail,
         }),
   );
   return {
      version: MANIFEST_VERSION,
      kind: "report",
      title: meta.title,
      description: resolveText(
         r.report.answer,
         new Map(r.metrics.map((x) => [x.id, x])),
      ),
      author: meta.authorId
         ? defined({ id: meta.authorId, name: opts.authorName })
         : undefined,
      createdAt: meta.createdAt,
      updatedAt: now,
      topics: meta.topics,
      origin: { app: DESTINATION_APP, ...meta.origin },
      queries: Object.fromEntries(
         r.datasets.map((ds) => [
            ds.id,
            {
               model: ds.source.model,
               source: ds.source.source,
               malloy: ds.query,
               title: ds.title,
               grain: ds.grain,
            },
         ]),
      ),
      snapshot: snap.snapshot,
      report: { question: r.question, metrics, spec: r.report },
   };
}

/** The analyst record a report manifest describes, as a thread message keeps it. */
export function recordFromManifest(
   m: ReportAppManifest,
   at: Omit<ManifestLocation, "slug">,
): ReportRecordInput & { status: "ok"; report: ReportSpec } {
   return {
      question: m.report.question,
      status: "ok",
      datasets: Object.entries(m.queries).map(([id, q]): Dataset => {
         const rows = m.snapshot.rows[id];
         const rowCount = m.snapshot.rowCounts?.[id] ?? rows.length;
         return {
            id,
            title: q.title ?? id,
            grain: q.grain ?? "",
            source: {
               environment: at.environment,
               package: at.package,
               model: q.model,
               source: q.source,
            },
            query: q.malloy,
            columns: m.snapshot.columns[id],
            rows,
            rowCount,
            truncated: rowCount > rows.length,
         };
      }),
      metrics: m.report.metrics,
      report: m.report.spec as ReportSpec,
   };
}
