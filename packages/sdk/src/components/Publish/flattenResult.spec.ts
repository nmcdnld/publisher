// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import { describe, expect, it } from "bun:test";
import { flattenResult } from "./flattenResult";

const result = (
   fields: Malloy.FieldInfo[],
   rows: Malloy.Cell[][],
): Malloy.Result => ({
   connection_name: "duckdb",
   schema: { fields },
   data: {
      kind: "array_cell",
      array_value: rows.map((record_value) => ({
         kind: "record_cell",
         record_value,
      })),
   },
});

describe("flattenResult", () => {
   it("reads each column's type, label, and format", () => {
      const table = flattenResult(
         result(
            [
               {
                  kind: "dimension",
                  name: "order_month",
                  type: { kind: "date_type", timeframe: "month" },
                  annotations: [{ value: '# label="Month"\n' }],
               },
               {
                  kind: "dimension",
                  name: "total_sales",
                  type: { kind: "number_type" },
                  annotations: [{ value: "# currency\n" }],
               },
            ],
            [
               [
                  { kind: "date_cell", date_value: "2024-01-01T00:00:00.000Z" },
                  { kind: "number_cell", number_value: 12.5 },
               ],
               [
                  { kind: "date_cell", date_value: "2024-02-01T00:00:00.000Z" },
                  { kind: "null_cell" },
               ],
            ],
         ),
      );
      expect(table.columns).toEqual([
         { name: "order_month", type: "date", label: "Month" },
         { name: "total_sales", type: "number", format: "currency" },
      ]);
      expect(table.rows).toEqual([
         { order_month: "2024-01-01T00:00:00.000Z", total_sales: 12.5 },
         { order_month: "2024-02-01T00:00:00.000Z", total_sales: null },
      ]);
      expect(table.totalRows).toBe(2);
   });

   it("drops nested views, which have no flat form, and keeps cell positions aligned", () => {
      const table = flattenResult(
         result(
            [
               {
                  kind: "dimension",
                  name: "nested",
                  type: {
                     kind: "array_type",
                     element_type: { kind: "record_type", fields: [] },
                  },
               },
               {
                  kind: "dimension",
                  name: "brand",
                  type: { kind: "string_type" },
               },
            ],
            [
               [
                  { kind: "array_cell", array_value: [] },
                  { kind: "string_cell", string_value: "Acme" },
               ],
            ],
         ),
      );
      expect(table.columns.map((c) => c.name)).toEqual(["brand"]);
      expect(table.rows).toEqual([{ brand: "Acme" }]);
   });

   it("caps the rows it keeps but reports how many there were", () => {
      const rows = Array.from({ length: 5 }, (_, i): Malloy.Cell[] => [
         { kind: "number_cell", number_value: i },
      ]);
      const table = flattenResult(
         result(
            [{ kind: "dimension", name: "n", type: { kind: "number_type" } }],
            rows,
         ),
         3,
      );
      expect(table.rows).toHaveLength(3);
      expect(table.totalRows).toBe(5);
   });
});
