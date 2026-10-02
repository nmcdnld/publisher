// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import { describe, expect, it } from "bun:test";
import type { Given } from "../../../client";
import {
   applicableBindings,
   buildQuestionQuery,
   deriveGivenBindings,
   emptyQuestionState,
   questionFields,
   type QuestionState,
} from "./questionQuery";

const string = { kind: "string_type" } as Malloy.AtomicType;
const number = { kind: "number_type" } as Malloy.AtomicType;
const timestamp = { kind: "timestamp_type" } as Malloy.AtomicType;

const source: Malloy.SourceInfo = {
   name: "overview",
   schema: {
      fields: [
         { kind: "dimension", name: "category", type: string },
         { kind: "dimension", name: "region", type: string },
         { kind: "dimension", name: "sale_price", type: number },
         { kind: "dimension", name: "created_at", type: timestamp },
         {
            kind: "measure",
            name: "total_sales",
            type: number,
            annotations: [{ value: '# label="Revenue"\n' }],
         },
         {
            kind: "join",
            name: "products",
            relationship: "one",
            schema: {
               fields: [
                  { kind: "dimension", name: "brand", type: string },
                  { kind: "measure", name: "count", type: number },
               ],
            },
         },
         { kind: "view", name: "by_category", schema: { fields: [] } },
      ],
   },
};

const fields = questionFields(source);
const state = (patch: Partial<QuestionState>): QuestionState => ({
   ...emptyQuestionState(),
   ...patch,
});

describe("questionFields", () => {
   it("collects dimensions and measures, through joins, and skips views", () => {
      expect(fields.map((f) => `${f.kind}:${f.path}`)).toEqual([
         "dimension:category",
         "dimension:region",
         "dimension:sale_price",
         "dimension:created_at",
         "measure:total_sales",
         "dimension:products.brand",
         "measure:products.count",
      ]);
   });

   it("takes a label tag over the humanized name", () => {
      expect(fields.find((f) => f.name === "total_sales")?.label).toBe(
         "Revenue",
      );
      expect(fields.find((f) => f.name === "sale_price")?.label).toBe(
         "Sale price",
      );
   });
});

describe("deriveGivenBindings", () => {
   const givens: Given[] = [
      { name: "CATEGORY", type: "filter<string>" },
      { name: "SINCE", type: "date" },
      {
         name: "BRAND",
         type: "filter<string>",
         suggest: { dimension: "brand" },
      },
      { name: "REGION", type: "filter<string>" },
      { name: "TENANT", type: "string" },
   ];
   const text = [
      "// where: nothing ~ $CATEGORY",
      "view: a is b + { where: category ~ $CATEGORY, where: created_at >= $SINCE }",
      "view: c is d + { where: missing_field ~ $TENANT }",
   ].join("\n");
   const bindings = deriveGivenBindings(givens, text, fields);

   it("reads the field and operator from the model's own where clauses", () => {
      expect(bindings.get("CATEGORY")).toEqual({
         given: "CATEGORY",
         field: "category",
         operator: "~",
      });
      expect(bindings.get("SINCE")?.operator).toBe(">=");
   });

   it("falls back to the suggest dimension, then to a same-named field", () => {
      expect(bindings.get("BRAND")?.field).toBe("products.brand");
      expect(bindings.get("REGION")).toEqual({
         given: "REGION",
         field: "region",
         operator: "~",
      });
   });

   it("drops a binding to a field the source lacks", () => {
      expect(bindings.has("TENANT")).toBe(false);
   });

   it("skips a binding whose given has no value and no default", () => {
      const withDefault = givens.map((g) =>
         g.name === "SINCE" ? { ...g, default: "@2023-01-01" } : g,
      );
      const applied = new Map<string, unknown>([["CATEGORY", "f'Jeans'"]]);
      expect(
         applicableBindings(bindings, withDefault, applied).map((b) => b.given),
      ).toEqual(["CATEGORY", "SINCE"]);
   });
});

describe("buildQuestionQuery", () => {
   const build = (patch: Partial<QuestionState>, bindings = []) =>
      buildQuestionQuery({
         sourceName: "overview",
         fields,
         state: state(patch),
         bindings,
      });

   it("waits for a measure", () => {
      expect(build({ groupBy: "category" })).toBeUndefined();
   });

   it("shows a lone measure as a big value", () => {
      expect(build({ measure: "total_sales" })).toBe(
         "# big_value\nrun: overview -> {\n  aggregate: total_sales\n}",
      );
   });

   it("ranks a category grouping as a bar chart", () => {
      expect(build({ measure: "total_sales", groupBy: "category" })).toBe(
         [
            "# bar_chart",
            "run: overview -> {",
            "  group_by: category",
            "  aggregate: total_sales",
            "  order_by: total_sales desc",
            "  limit: 20",
            "}",
         ].join("\n"),
      );
   });

   it("draws a map of every region, unranked and uncut", () => {
      expect(
         build({ measure: "total_sales", groupBy: "category", chart: "map" }),
      ).toBe(
         [
            "# shape_map",
            "run: overview -> {",
            "  group_by: category",
            "  aggregate: total_sales",
            "}",
         ].join("\n"),
      );
   });

   it("falls back from a map a segment splits", () => {
      expect(
         build({
            measure: "total_sales",
            groupBy: "category",
            segment: "region",
            chart: "map",
         }),
      ).toContain("# bar_chart.stack\n");
   });

   it("truncates a time grouping and orders it as a line", () => {
      expect(
         build({
            measure: "total_sales",
            groupBy: "created_at",
            groupGrain: "month",
            segment: "products.brand",
         }),
      ).toBe(
         [
            "# line_chart",
            "run: overview -> {",
            "  group_by: created_at_month is created_at.month, products_brand is products.brand",
            "  aggregate: total_sales",
            "  order_by: created_at_month asc",
            "}",
         ].join("\n"),
      );
   });

   it("writes given bindings and derived value filters as where clauses", () => {
      const query = build(
         {
            measure: "products.count",
            groupBy: "region",
            filters: { region: ["West", "O'Hare"], category: [] },
         },
         [{ given: "CATEGORY", field: "category", operator: "~" }] as never,
      );
      expect(query).toContain("  where: category ~ $CATEGORY\n");
      expect(query).toContain(
         "  where: (region = 'West' or region = 'O\\'Hare')\n",
      );
      expect(query).toContain(
         "  aggregate: products_count is products.`count`\n",
      );
      expect(query).toContain("  order_by: products_count desc\n");
   });
});
