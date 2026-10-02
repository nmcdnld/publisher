// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "bun:test";
import type { Dataset, Metric } from "./analyst/schema";
import type { ReportSpec } from "./analyst/blocks";
import {
   analysisFromManifest,
   analysisHome,
   threadHome,
   manifestFromAnalysis,
   manifestFromReport,
   manifestFromThread,
   manifestOrigin,
   recordFromManifest,
   withRows,
   type AnalysisInput,
   type ReportedAnalysisInput,
   type ThreadInput,
} from "./mappers";
import { AppManifest, MAX_SNAPSHOT_ROWS } from "./schema";

const at = { environment: "examples", package: "storefront", slug: "x" };
const NOW = "2026-09-30T18:02:11.000Z";

const refunds: AnalysisInput = {
   id: "an-refunds-march",
   title: "Refunds spiked in March, then settled",
   narrative: "Return rate hit 14.2% in March, nearly double the usual 8%.",
   details: ["The spike lines up with the spring clearance promotion."],
   evidence: {
      kind: "line",
      xKey: "month",
      series: [{ key: "return_rate", label: "Return rate" }],
      rows: [
         { month: "Feb", return_rate: 0.084 },
         { month: "Mar", return_rate: 0.142 },
         { month: "Apr", return_rate: 0.103 },
      ],
      format: "percent",
      caption: "return_rate by month, 2026",
      visual: {
         kind: "anomaly",
         series: "return_rate",
         normal: [0.075, 0.087],
         normalLabel: "usual range",
         polarity: "down_is_good",
         events: [{ x: "Mar", label: "Spring clearance" }],
      },
      highlight: "Mar",
   },
   malloy:
      "run: order_items -> {\n  group_by: month is created_at.month\n  aggregate: return_rate\n}",
   provenance: {
      environment: "examples",
      package: "storefront",
      model: "storefront.malloy",
      source: "order_items",
      view: "by_status",
   },
   authorId: "ai",
   createdAt: "2026-09-30T09:00:00.000Z",
   topics: ["refunds"],
};

const programmed: AnalysisInput = {
   ...refunds,
   id: "an-with-program",
   evidence: {
      ...refunds.evidence,
      visual: undefined,
      spec: {
         library: "chartjs",
         type: "bar",
         data: { datasets: [{ rows: "d1", x: "month", y: "return_rate" }] },
         sources: {
            d1: {
               columns: [
                  { name: "month", type: "string" },
                  { name: "return_rate", type: "number" },
               ],
               rows: [{ month: "Mar", return_rate: 0.142 }],
            },
         },
      },
   },
};

describe("analysis manifests", () => {
   it("round-trips an analysis", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      expect(AppManifest.parse(m)).toEqual(m);
      expect(analysisFromManifest(m, at)).toEqual(refunds);
   });

   it("keeps the query and rows apart from the prose", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      expect(m.queries.q1).toEqual({
         model: "storefront.malloy",
         source: "order_items",
         view: "by_status",
         malloy: refunds.malloy,
      });
      expect(m.snapshot.rows.q1).toEqual(refunds.evidence.rows);
      expect(m.snapshot.columns.q1).toEqual([
         { name: "month", type: "string" },
         {
            name: "return_rate",
            type: "number",
            unit: "percent",
            label: "Return rate",
         },
      ]);
      expect(m.updatedAt).toBe(NOW);
      expect(m.origin).toEqual({
         app: "destination",
         kind: "analysis",
         id: refunds.id,
      });
   });

   it("names the record it was saved from", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      expect(manifestOrigin(m)).toEqual({ kind: "analysis", id: refunds.id });
      expect(manifestOrigin({ ...m, origin: undefined })).toBeUndefined();
      expect(
         manifestOrigin({
            ...m,
            origin: { app: "other", kind: "analysis", id: "a" },
         }),
      ).toBeUndefined();
   });

   it("draws live rows through the same mapper as saved ones", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      const live = [{ month: "May", return_rate: 0.09 }];
      expect(
         analysisFromManifest(withRows(m, { q1: live }), at).evidence.rows,
      ).toEqual(live);
      expect(withRows(m, {}).snapshot.rows).toEqual(m.snapshot.rows);
   });

   it("fills the environment and package from where the file was read", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      const read = analysisFromManifest(m, {
         ...at,
         environment: "prod",
         package: "shop",
      });
      expect(read.provenance).toEqual({
         ...refunds.provenance,
         environment: "prod",
         package: "shop",
      });
   });

   it("stores a chart program without its rows, and binds them back", () => {
      const m = manifestFromAnalysis(programmed, { now: NOW });
      expect(m.analysis.evidence.program).not.toHaveProperty("sources");
      expect(m.analysis.evidence.tables).toEqual(["d1"]);
      expect(m.snapshot.rows.d1).toEqual([
         { month: "Mar", return_rate: 0.142 },
      ]);
      expect(AppManifest.safeParse(m).success).toBe(true);
      expect(analysisFromManifest(m, at)).toEqual(programmed);
   });

   it("drops a spec that is not a chart program", () => {
      const m = manifestFromAnalysis(
         {
            ...refunds,
            evidence: { ...refunds.evidence, spec: { mark: "bar" } },
         },
         { now: NOW },
      );
      expect(m.analysis.evidence.program).toBeUndefined();
   });

   it("caps the snapshot and records how many rows there were", () => {
      const rows = Array.from({ length: MAX_SNAPSHOT_ROWS + 50 }, (_, i) => ({
         month: `m${i}`,
         return_rate: i,
      }));
      const m = manifestFromAnalysis(
         { ...refunds, evidence: { ...refunds.evidence, rows } },
         { now: NOW },
      );
      expect(m.snapshot.rows.q1).toHaveLength(MAX_SNAPSHOT_ROWS);
      expect(m.snapshot.rowCounts).toEqual({ q1: MAX_SNAPSHOT_ROWS + 50 });
      expect(AppManifest.safeParse(m).success).toBe(true);
   });

   it("names an item it did not write by where it lives", () => {
      const m = manifestFromAnalysis(refunds, { now: NOW });
      const { origin: _, ...foreign } = m;
      expect(analysisFromManifest(foreign, at).id).toBe(
         "app:examples/storefront/x",
      );
   });
});

const dataset: Dataset = {
   id: "d1",
   title: "Return rate by month",
   grain: "one row per month",
   source: {
      environment: "examples",
      package: "storefront",
      model: "storefront.malloy",
      source: "order_items",
   },
   query: "run: order_items -> { group_by: month is created_at.month; aggregate: return_rate }",
   columns: [
      { name: "month", type: "date" },
      {
         name: "return_rate",
         type: "number",
         unit: "percent",
         label: "Return rate",
      },
   ],
   rows: [
      { month: "2026-02-01", return_rate: 0.084 },
      { month: "2026-03-01", return_rate: 0.142 },
   ],
   rowCount: 2,
   truncated: false,
};

const metrics: Metric[] = [
   {
      id: "m1",
      datasetId: "d1",
      op: "max",
      column: "return_rate",
      label: "Peak return rate",
      value: 0.142,
      unit: "percent",
   },
   {
      id: "m2",
      datasetId: "d1",
      op: "max_by",
      column: "month",
      label: "Peak month",
      value: "2026-03-01",
      unit: "date",
      detail: "by return_rate",
   },
];

const report: ReportSpec = {
   title: "Returns peaked in March",
   answer: "Return rate peaked at {{metric:m1}}.",
   sections: [
      {
         layout: "row",
         blocks: [
            { type: "kpi", label: "Peak", metric: { metricId: "m1" } },
            {
               type: "chart",
               title: "Return rate",
               mark: "line",
               data: { datasetId: "d1" },
               x: "month",
               y: ["return_rate"],
               highlight: [{ metricId: "m2" }],
            },
         ],
      },
      {
         heading: "Detail",
         layout: "stack",
         blocks: [
            { type: "table", title: "Rows", data: { datasetId: "d1" } },
            { type: "followUps", questions: ["Which categories drove it?"] },
         ],
      },
   ],
};

const thread: ThreadInput = {
   id: "th-returns",
   title: "Why did returns spike?",
   createdAt: "2026-09-30T09:00:00.000Z",
   messages: [
      { role: "user" },
      {
         role: "assistant",
         analyst: {
            question: "Why did returns spike?",
            datasets: [dataset],
            metrics,
            report,
         },
      },
   ],
};

describe("report manifests", () => {
   it("round-trips a thread's analyst record", () => {
      const m = manifestFromThread(thread, { now: NOW })!;
      expect(AppManifest.parse(m)).toEqual(m);
      expect(recordFromManifest(m, at)).toEqual({
         question: "Why did returns spike?",
         status: "ok",
         datasets: [dataset],
         metrics,
         report,
      });
   });

   it("writes the answer out as the description", () => {
      const m = manifestFromThread(thread, { now: NOW })!;
      expect(m.title).toBe("Returns peaked in March");
      expect(m.description).toBe("Return rate peaked at 14.2%.");
      expect(m.queries.d1).toEqual({
         model: "storefront.malloy",
         source: "order_items",
         malloy: dataset.query,
         title: dataset.title,
         grain: dataset.grain,
      });
   });

   it("keeps a truncated dataset's full row count", () => {
      const big: Dataset = {
         ...dataset,
         rows: Array.from({ length: MAX_SNAPSHOT_ROWS }, (_, i) => ({
            month: `2026-01-${i}`,
            return_rate: i,
         })),
         rowCount: 1200,
         truncated: true,
      };
      const t: ThreadInput = {
         ...thread,
         messages: [
            {
               role: "assistant",
               analyst: { ...thread.messages[1].analyst!, datasets: [big] },
            },
         ],
      };
      const m = manifestFromThread(t, { now: NOW })!;
      expect(m.snapshot.rowCounts).toEqual({ d1: 1200 });
      expect(recordFromManifest(m, at).datasets[0]).toEqual(big);
   });

   it("has nothing to write for a thread with no report", () => {
      expect(
         manifestFromThread({ ...thread, messages: [{ role: "user" }] }),
      ).toBeUndefined();
   });

   it("writes an analysis kept from an answer as its report", () => {
      const m = manifestFromReport(
         {
            id: "an-returns",
            title: "Returns peaked in March",
            authorId: "u-alex",
            createdAt: "2026-09-30T09:00:00.000Z",
            topics: ["refunds"],
            report: thread.messages[1]
               .analyst! as ReportedAnalysisInput["report"],
         },
         { now: NOW, authorName: "Alex Kim" },
      );
      expect(AppManifest.parse(m)).toEqual(m);
      expect(m.kind).toBe("report");
      expect(m.topics).toEqual(["refunds"]);
      expect(m.author).toEqual({ id: "u-alex", name: "Alex Kim" });
      expect(manifestOrigin(m)).toEqual({ kind: "analysis", id: "an-returns" });
      expect(recordFromManifest(m, at).report).toEqual(report);
   });
});

describe("a finding's home package", () => {
   it("is the package an analysis ran on", () => {
      expect(analysisHome(refunds)).toEqual({
         ok: true,
         environment: "examples",
         package: "storefront",
      });
   });

   it("is the one package every dataset of a thread's report came from", () => {
      const second = { ...dataset, id: "d2" };
      const t: ThreadInput = {
         ...thread,
         messages: [
            {
               role: "assistant",
               analyst: {
                  ...thread.messages[1].analyst!,
                  datasets: [dataset, second],
               },
            },
         ],
      };
      expect(threadHome(t)).toMatchObject({ ok: true, package: "storefront" });
   });

   it("is not there when the data spans packages, or there is no report", () => {
      const elsewhere = {
         ...dataset,
         id: "d2",
         source: { ...dataset.source, package: "governed-analytics" },
      };
      const t: ThreadInput = {
         ...thread,
         messages: [
            {
               role: "assistant",
               analyst: {
                  ...thread.messages[1].analyst!,
                  datasets: [dataset, elsewhere],
               },
            },
         ],
      };
      expect(threadHome(t)).toEqual({
         ok: false,
         problem:
            "Its data comes from storefront and governed-analytics, and a data app lives in one package.",
      });
      expect(threadHome({ ...thread, messages: [{ role: "user" }] }).ok).toBe(
         false,
      );
   });
});
