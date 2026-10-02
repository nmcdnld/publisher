// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// One run as the app keeps it: built up from the stream, then saved on the
// thread message it answered.

import { parseBlock, type ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import type {
   AnalystEventName,
   AnalystEvents,
   Audience,
   RunMode,
   RunSummary,
   TraceStep,
} from "./events";
import { formatTime, resolveText } from "@malloy-publisher/app-manifest/analyst/format";
import type { GroundingResult } from "./grounding";
import { groundingContext, groundReport } from "./grounding";
import { parsePartialJson } from "./partial-json";
import type { Dataset, Findings, Metric } from "@malloy-publisher/app-manifest/analyst/schema";

export interface AnalystRecord {
   runId?: string;
   question: string;
   mode?: RunMode;
   audience?: Audience;
   model?: string;
   status: "running" | "ok" | "partial" | "failed";
   /** The latest plain-language status, while running. */
   statusText?: string;
   datasets: Dataset[];
   metrics: Metric[];
   /** The presenter's raw JSON so far, until the grounded report lands. */
   reportText?: string;
   report?: ReportSpec;
   grounding?: GroundingResult;
   partial?: boolean;
   summary?: RunSummary;
   error?: string;
   /** Admin only: the explorer's findings and every step it took. */
   findings?: Findings;
   trace?: TraceStep[];
}

export const newRecord = (question: string): AnalystRecord => ({
   question,
   status: "running",
   statusText: "Reading the question",
   datasets: [],
   metrics: [],
});

/** Folds one stream event into the record. */
export function applyEvent<N extends AnalystEventName>(
   r: AnalystRecord,
   name: N,
   value: AnalystEvents[N],
): AnalystRecord {
   const v = value as AnalystEvents[AnalystEventName];
   switch (name) {
      case "analyst:run": {
         const run = v as AnalystEvents["analyst:run"];
         return {
            ...r,
            runId: run.runId,
            mode: run.mode,
            audience: run.audience,
            model: run.model,
         };
      }
      case "analyst:status":
         return {
            ...r,
            statusText: (v as AnalystEvents["analyst:status"]).text,
         };
      case "analyst:dataset":
         return { ...r, datasets: [...r.datasets, v as Dataset] };
      case "analyst:metric":
         return { ...r, metrics: [...r.metrics, v as Metric] };
      case "analyst:findings":
         return { ...r, findings: v as Findings };
      case "analyst:report-delta":
         return {
            ...r,
            reportText:
               (r.reportText ?? "") +
               (v as AnalystEvents["analyst:report-delta"]).delta,
         };
      case "analyst:report": {
         const rep = v as AnalystEvents["analyst:report"];
         return {
            ...r,
            report: rep.report,
            grounding: rep.grounding,
            partial: rep.partial,
            reportText: undefined,
         };
      }
      case "analyst:trace":
         return { ...r, trace: [...(r.trace ?? []), v as TraceStep] };
      case "analyst:summary": {
         const s = v as RunSummary;
         return {
            ...r,
            summary: s,
            status: s.status,
            statusText: undefined,
            error: s.status === "failed" ? (s.reason ?? r.error) : r.error,
         };
      }
   }
   return r;
}

export const metricMap = (r: Pick<AnalystRecord, "metrics">) =>
   new Map(r.metrics.map((m) => [m.id, m]));

export const datasetMap = (r: Pick<AnalystRecord, "datasets">) =>
   new Map(r.datasets.map((d) => [d.id, d]));

/**
 * The report to draw: the grounded one once it lands, otherwise what has
 * streamed so far, grounded here so a failing block never flashes on screen.
 */
export function visibleReport(r: AnalystRecord): ReportSpec | undefined {
   if (r.report) return r.report;
   if (!r.reportText) return undefined;
   const draft = parsePartialJson(r.reportText) as
      | Partial<ReportSpec>
      | undefined;
   if (!draft || typeof draft !== "object") return undefined;
   const spec: ReportSpec = {
      title: typeof draft.title === "string" ? draft.title : "",
      answer:
         typeof draft.answer === "string"
            ? draft.answer.replace(/\{\{[^}]*$/, "")
            : "",
      sections: Array.isArray(draft.sections)
         ? draft.sections
              .filter((s) => s && typeof s === "object")
              .map((s) => ({
                 heading: typeof s.heading === "string" ? s.heading : undefined,
                 layout: s.layout ?? "stack",
                 // A block still arriving is left out until it validates whole.
                 blocks: Array.isArray(s.blocks)
                    ? s.blocks.flatMap((b) => parseBlock(b) ?? [])
                    : [],
              }))
         : [],
   };
   return groundReport(
      spec,
      groundingContext(r.question, r.datasets, r.metrics),
   ).report;
}

/** Every dropped block's path, for the admin's "Show work". */
export const droppedPaths = (r: AnalystRecord) =>
   new Map((r.grounding?.dropped ?? []).map((d) => [d.path, d]));

// ── For the rest of the app ─────────────────────────────────────────────

const MAX_STORED_ROWS = 400;

/** What is saved on the thread: rows capped, and nothing a member may not see. */
export function storedRecord(r: AnalystRecord): AnalystRecord {
   const admin = r.audience === "admin";
   return {
      ...r,
      statusText: undefined,
      reportText: undefined,
      datasets: r.datasets.map((d) =>
         d.rows.length > MAX_STORED_ROWS
            ? { ...d, rows: d.rows.slice(0, MAX_STORED_ROWS), truncated: true }
            : d,
      ),
      findings: admin ? r.findings : undefined,
      trace: admin ? r.trace : undefined,
   };
}

/** The answer line with its numbers written out, for places that take a string. */
export const answerText = (r: AnalystRecord) =>
   r.report ? resolveText(r.report.answer, metricMap(r)) : (r.error ?? "");

/** Rows earliest first when x is a time or a year, so charts read left to right. */
export function chartRows(ds: Dataset, x: string) {
   const col = ds.columns.find((c) => c.name === x);
   const timed =
      col?.type === "date" || (col?.type === "number" && /(^|_)year$/i.test(x));
   const rows = timed
      ? [...ds.rows].sort((a, b) => String(a[x]).localeCompare(String(b[x])))
      : ds.rows;
   return rows.map(
      (row) =>
         Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
               k,
               typeof v === "string"
                  ? formatTime(v)
                  : typeof v === "number"
                    ? v
                    : String(v ?? ""),
            ]),
         ) as Record<string, string | number>,
   );
}

/** The dataset's named view, when it ran one. */
export const viewOf = (ds: Dataset) =>
   ds.query.match(/->\s*(\w+)\s*(\+|$)/)?.[1];
