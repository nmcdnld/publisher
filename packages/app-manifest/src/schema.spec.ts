// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { indexHtmlFor } from "./html";
import {
   appPaths,
   readManifest,
   slugOf,
   slugOfAppPath,
   type AnalysisAppManifest,
} from "./schema";

const valid: AnalysisAppManifest = {
   version: 1,
   kind: "analysis",
   title: "Revenue by year",
   description: "Revenue grew every year.",
   createdAt: "2026-09-30T20:00:00Z",
   updatedAt: "2026-09-30T20:00:00Z",
   topics: [],
   queries: {
      q1: {
         model: "storefront.malloy",
         source: "order_items",
         malloy: "run: order_items -> sales_by_year",
      },
   },
   snapshot: {
      asOf: "2026-09-30T20:00:00Z",
      columns: { q1: [{ name: "order_year", type: "number" }] },
      rows: { q1: [{ order_year: 2025 }] },
   },
   analysis: {
      details: [],
      evidence: {
         query: "q1",
         kind: "bar",
         xKey: "order_year",
         series: [{ key: "total_sales", label: "Revenue" }],
         format: "currency",
      },
   },
};

const problemOf = (value: unknown) => {
   const read = readManifest(value);
   return read.ok ? undefined : read.problem;
};

describe("readManifest", () => {
   it("accepts a valid manifest", () => {
      expect(readManifest(valid)).toEqual({ ok: true, manifest: valid });
   });

   it("names the first problem by its path", () => {
      expect(problemOf({ ...valid, title: "" })).toStartWith("title:");
      expect(
         problemOf({
            ...valid,
            analysis: {
               ...valid.analysis,
               evidence: { ...valid.analysis.evidence, kind: "pie" },
            },
         }),
      ).toStartWith("analysis.evidence.kind:");
   });

   it("refuses a model path that leaves the package", () => {
      for (const model of [
         "../other/x.malloy",
         "/abs.malloy",
         "a/./b.malloy",
         "notes.md",
      ]) {
         expect(
            problemOf({
               ...valid,
               queries: { q1: { ...valid.queries.q1, model } },
            }),
         ).toStartWith("queries.q1.model:");
      }
   });

   it("refuses names that point at nothing", () => {
      expect(
         problemOf({
            ...valid,
            analysis: {
               ...valid.analysis,
               evidence: { ...valid.analysis.evidence, query: "q2" },
            },
         }),
      ).toContain('Names no query: "q2"');
      expect(
         problemOf({
            ...valid,
            snapshot: { ...valid.snapshot, rows: {} },
         }),
      ).toContain('No snapshot rows for query "q1"');
      expect(
         problemOf({
            ...valid,
            analysis: {
               ...valid.analysis,
               evidence: {
                  ...valid.analysis.evidence,
                  program: { library: "chartjs" },
                  tables: ["d9"],
               },
            },
         }),
      ).toContain('Names "d9"');
   });

   it("refuses a report block that cites a missing metric", () => {
      expect(
         problemOf({
            ...valid,
            kind: "report",
            analysis: undefined,
            report: {
               question: "?",
               metrics: [],
               spec: {
                  title: "t",
                  answer: "a",
                  sections: [
                     {
                        layout: "row",
                        blocks: [
                           {
                              type: "kpi",
                              label: "x",
                              metric: { metricId: "m1" },
                           },
                        ],
                     },
                  ],
               },
            },
         }),
      ).toContain('Names no metric: "m1"');
   });

   it("keeps the head of a version it does not understand", () => {
      expect(
         readManifest({ version: 2, title: "Later", description: "d" }),
      ).toEqual({
         ok: false,
         head: { version: 2, title: "Later", description: "d" },
         problem: "Version 2 is not one this reader understands (1)",
      });
   });
});

describe("slugs and paths", () => {
   it("slugs a title", () => {
      expect(slugOf("Refunds spiked in March!")).toBe(
         "refunds-spiked-in-march",
      );
      expect(slugOf("Café: año 2026")).toBe("cafe-ano-2026");
      expect(slugOf("—")).toBe("finding");
      expect(slugOf("x".repeat(80))).toHaveLength(64);
   });

   it("reads the slug back from the page path", () => {
      expect(slugOfAppPath(appPaths("refunds").index)).toBe("refunds");
      expect(slugOfAppPath("apps/refunds/other.html")).toBeUndefined();
      expect(slugOfAppPath("apps/Bad_Slug/index.html")).toBeUndefined();
      expect(slugOfAppPath("index.html")).toBeUndefined();
   });
});

describe("indexHtmlFor", () => {
   it("escapes what it writes", () => {
      const html = indexHtmlFor({ title: "<b>&", description: '"x"' });
      expect(html).toContain("<title>&lt;b&gt;&amp;</title>");
      expect(html).toContain('content="&quot;x&quot;"');
      expect(html).toContain(
         '<meta name="publisher:app" content="app.json" />',
      );
   });
});

// Every manifest the repo ships, so the examples cannot drift from the format.
const REPO = path.resolve(import.meta.dir, "../../..");
const shipped = readdirSync(path.join(REPO, "examples"), {
   withFileTypes: true,
})
   .filter((d) => d.isDirectory())
   .flatMap((pkg) => {
      const apps = path.join(REPO, "examples", pkg.name, "public", "apps");
      try {
         return readdirSync(apps).map((slug) => path.join(apps, slug));
      } catch {
         return [];
      }
   });

describe("shipped examples", () => {
   it("has at least one", () => {
      expect(shipped.length).toBeGreaterThan(0);
   });

   for (const dir of shipped) {
      const name = path.relative(REPO, dir);
      it(`${name} is a valid manifest with a generated page`, () => {
         const read = readManifest(
            JSON.parse(readFileSync(path.join(dir, "app.json"), "utf8")),
         );
         expect(read.ok ? undefined : read.problem).toBeUndefined();
         if (!read.ok) return;
         expect(readFileSync(path.join(dir, "index.html"), "utf8")).toBe(
            indexHtmlFor(read.manifest),
         );
      });
   }
});
