// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "bun:test";
import type { AnalysisAppManifest } from "../schema";
import { loadTables } from "./load";
import { peekManifest } from "./peek";

const manifest: AnalysisAppManifest = {
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
      columns: {
         q1: [
            { name: "order_year", type: "number" },
            { name: "total_sales", type: "number", unit: "currency" },
         ],
      },
      rows: {
         q1: [
            { order_year: 2024, total_sales: 10 },
            { order_year: 2025, total_sales: 20 },
         ],
      },
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

describe("loadTables", () => {
   it("prefers live rows", async () => {
      const live = [{ order_year: 2025, total_sales: 99 }];
      const loaded = await loadTables(manifest, async () => live);
      expect(loaded.tables.q1.rows).toEqual(live);
      expect(loaded.failed).toEqual({});
   });

   it("falls back to the snapshot, and says why", async () => {
      const loaded = await loadTables(manifest, async () => {
         throw new Error("'sales_by_year' is not defined");
      });
      expect(loaded.tables.q1.rows).toEqual(manifest.snapshot.rows.q1);
      expect(loaded.failed).toEqual({ q1: "'sales_by_year' is not defined" });
   });

   it("falls back when live rows lack the columns the finding was written against", async () => {
      const loaded = await loadTables(manifest, async () => [
         { order_year: 2025, revenue: 99 },
      ]);
      expect(loaded.tables.q1.rows).toEqual(manifest.snapshot.rows.q1);
      expect(loaded.failed).toEqual({
         q1: "it no longer returns `total_sales`",
      });
   });

   it("falls back when a query that had rows returns none", async () => {
      const loaded = await loadTables(manifest, async () => []);
      expect(loaded.tables.q1.rows).toEqual(manifest.snapshot.rows.q1);
      expect(loaded.failed).toEqual({ q1: "it returns no rows now" });
   });
});

describe("peekManifest", () => {
   it("passes a manifest's outline", () => {
      expect(peekManifest(manifest)).toEqual({ ok: true, manifest });
   });

   it("keeps what it can show of one it will not draw", () => {
      expect(peekManifest({ version: 2, title: "Later" })).toEqual({
         ok: false,
         head: { version: 2, title: "Later", description: undefined },
         problem: "version 2 is not one this Publisher understands (1)",
      });
      expect(peekManifest({ ...manifest, kind: "deck" })).toMatchObject({
         ok: false,
         problem: '"deck" is not a kind of finding this Publisher draws',
      });
      expect(peekManifest([])).toEqual({
         ok: false,
         problem: "its manifest has no title",
      });
   });
});
