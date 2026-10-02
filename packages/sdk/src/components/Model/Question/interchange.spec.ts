// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import { describe, expect, it } from "bun:test";
import { questionFromQuery, queryFromQuestion } from "./interchange";
import {
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
         { kind: "dimension", name: "created_at", type: timestamp },
         { kind: "measure", name: "total_sales", type: number },
         { kind: "measure", name: "order_count", type: number },
         {
            kind: "join",
            name: "products",
            relationship: "one",
            schema: {
               fields: [{ kind: "dimension", name: "brand", type: string }],
            },
         },
         {
            kind: "join",
            name: "customers",
            relationship: "one",
            schema: {
               fields: [{ kind: "dimension", name: "state", type: string }],
            },
         },
         {
            kind: "view",
            name: "sales_by_state",
            annotations: [
               { value: "# shape_map\n" },
               {
                  value: "#(malloy) drillable ordered_by = [{ revenue = desc }]\n",
               },
            ],
            schema: {
               fields: [
                  {
                     kind: "dimension",
                     name: "state",
                     type: string,
                     annotations: [
                        {
                           value: '#(malloy) drill_expression { kind = field_reference name = state path = [customers] code = "customers.state" }\n',
                        },
                     ],
                  },
                  {
                     kind: "dimension",
                     name: "revenue",
                     type: number,
                     annotations: [
                        {
                           value: "#(malloy) calculation drill_expression { kind = field_reference name = total_sales }\n",
                        },
                     ],
                  },
               ],
            },
         },
         {
            kind: "view",
            name: "revenue_by_state",
            annotations: [
               { value: "# shape_map\n" },
               { value: '# label="Revenue by state"\n' },
               {
                  value: '#(malloy) drill_filters = [{ code = "category ~ $CATEGORY" }, { code = "created_at >= $SINCE" }] drillable ordered_by = [{ revenue = desc }]\n',
               },
            ],
            schema: {
               fields: [
                  {
                     kind: "dimension",
                     name: "state",
                     type: string,
                     annotations: [
                        {
                           value: '#(malloy) drill_expression { kind = field_reference name = state path = [customers] code = "customers.state" }\n',
                        },
                     ],
                  },
                  {
                     kind: "dimension",
                     name: "revenue",
                     type: number,
                     annotations: [
                        {
                           value: "#(malloy) calculation drill_expression { kind = field_reference name = revenue path = [sales_by_state] }\n",
                        },
                     ],
                  },
               ],
            },
         },
         {
            kind: "view",
            name: "west_top_categories",
            annotations: [
               {
                  value: `#(malloy) limit = 5 drill_filters = [{ code = "region = 'West'" }, { code = "total_sales > 100" }] drillable\n`,
               },
            ],
            schema: {
               fields: [
                  {
                     kind: "dimension",
                     name: "category",
                     type: string,
                     annotations: [
                        {
                           value: '#(malloy) drill_expression { kind = field_reference name = category code = "category" }\n',
                        },
                     ],
                  },
                  {
                     kind: "dimension",
                     name: "total_sales",
                     type: number,
                     annotations: [
                        {
                           value: "#(malloy) calculation drill_expression { kind = field_reference name = total_sales }\n",
                        },
                     ],
                  },
               ],
            },
         },
         {
            kind: "view",
            name: "revenue_trend",
            annotations: [{ value: "# line_chart\n" }],
            schema: {
               fields: [
                  {
                     kind: "dimension",
                     name: "order_month",
                     type: { kind: "date_type", timeframe: "month" },
                     annotations: [
                        {
                           value: '#(malloy) drill_expression { kind = field_reference name = order_month path = [sales_by_month] code = "created_at.month" }\n',
                        },
                     ],
                  },
                  {
                     kind: "dimension",
                     name: "total_sales",
                     type: number,
                     annotations: [
                        {
                           value: "#(malloy) calculation drill_expression { kind = field_reference name = total_sales }\n",
                        },
                     ],
                  },
               ],
            },
         },
      ],
   },
};
const fields = questionFields(source);

const ref = (name: string, path?: string[]) => ({
   kind: "field_reference" as const,
   name,
   ...(path ? { path } : {}),
});

const segmentQuery = (
   operations: Malloy.ViewOperation[],
   viz?: string,
): Malloy.Query => ({
   definition: {
      kind: "arrow",
      source: { kind: "source_reference", name: "overview" },
      view: { kind: "segment", operations },
   },
   ...(viz ? { annotations: [{ value: `# viz=${viz}\n` }] } : {}),
});

const state = (patch: Partial<QuestionState>): QuestionState => ({
   ...emptyQuestionState(),
   ...patch,
});

describe("questionFromQuery", () => {
   it("puts a Fields line chart's fields in the matching slots", () => {
      const carried = questionFromQuery(
         segmentQuery(
            [
               {
                  kind: "group_by",
                  field: {
                     expression: {
                        kind: "time_truncation",
                        field_reference: { name: "created_at" },
                        truncation: "month",
                     },
                  },
               },
               { kind: "aggregate", field: { expression: ref("total_sales") } },
            ],
            "line",
         ),
         source,
         fields,
      );
      expect(carried).toEqual({
         state: state({
            measure: "total_sales",
            groupBy: "created_at",
            groupGrain: "month",
            // A line over time is what Auto picks, so Auto it is.
            chart: "auto",
         }),
         notCarried: [],
      });
   });

   it("takes a second group-by as the segment and a value filter as a filter", () => {
      const carried = questionFromQuery(
         segmentQuery([
            {
               kind: "where",
               filter: {
                  kind: "filter_string",
                  expression: ref("region"),
                  filter: "West, East",
               },
            },
            { kind: "group_by", field: { expression: ref("category") } },
            {
               kind: "group_by",
               field: { expression: ref("brand", ["products"]) },
            },
            { kind: "aggregate", field: { expression: ref("order_count") } },
            { kind: "limit", limit: 200 },
         ]),
         source,
         fields,
      );
      expect(carried?.state).toEqual(
         state({
            measure: "order_count",
            groupBy: "category",
            segment: "products.brand",
            // No chart tag is the Fields builder's table.
            chart: "table",
            limit: 10,
            filters: { region: ["West", "East"] },
         }),
      );
   });

   it("names what no slot takes", () => {
      const carried = questionFromQuery(
         segmentQuery([
            { kind: "group_by", field: { expression: ref("category") } },
            { kind: "group_by", field: { expression: ref("region") } },
            {
               kind: "group_by",
               field: { expression: ref("brand", ["products"]) },
            },
            { kind: "aggregate", field: { expression: ref("total_sales") } },
            { kind: "aggregate", field: { expression: ref("order_count") } },
            {
               kind: "where",
               filter: {
                  kind: "filter_string",
                  expression: ref("category"),
                  filter: "%shirt%",
               },
            },
            {
               kind: "nest",
               name: "by_month",
               view: { definition: { kind: "segment", operations: [] } },
            },
         ]),
         source,
         fields,
      );
      expect(carried?.notCarried).toEqual([
         "the extra group-by Brand",
         "the extra measure Order count",
         "the filter on category",
         "the nested view by_month",
      ]);
   });

   it("expands a named view from its columns' drill expressions", () => {
      const carried = questionFromQuery(
         {
            definition: {
               kind: "arrow",
               source: { kind: "source_reference", name: "overview" },
               view: { kind: "view_reference", name: "revenue_trend" },
            },
         },
         source,
         fields,
      );
      expect(carried?.state).toMatchObject({
         measure: "total_sales",
         groupBy: "created_at",
         groupGrain: "month",
         chart: "auto",
      });
      expect(carried?.notCarried).toEqual([]);
   });

   const viewQuery = (name: string): Malloy.Query => ({
      definition: {
         kind: "arrow",
         source: { kind: "source_reference", name: "overview" },
         view: { kind: "view_reference", name },
      },
   });

   it("carries a dashboard's state map whole: renamed measure, given filters and the map", () => {
      const bindings = new Map([
         ["CATEGORY", { given: "CATEGORY", field: "category", operator: "~" }],
         ["SINCE", { given: "SINCE", field: "created_at", operator: ">=" }],
      ]);
      expect(
         questionFromQuery(
            viewQuery("revenue_by_state"),
            source,
            fields,
            bindings,
         ),
      ).toEqual({
         state: state({
            measure: "total_sales",
            groupBy: "customers.state",
            chart: "map",
         }),
         notCarried: [],
      });
   });

   it("names a view's given filter question mode would not write", () => {
      expect(
         questionFromQuery(viewQuery("revenue_by_state"), source, fields)
            ?.notCarried,
      ).toEqual([
         "the view's filter category ~ $CATEGORY",
         "the view's filter created_at >= $SINCE",
      ]);
   });

   it("carries a view's limit and literal filter, and names the rest", () => {
      const carried = questionFromQuery(
         viewQuery("west_top_categories"),
         source,
         fields,
      );
      expect(carried?.state).toEqual(
         state({
            measure: "total_sales",
            groupBy: "category",
            chart: "table",
            limit: 5,
            filters: { region: ["West"] },
         }),
      );
      expect(carried?.notCarried).toEqual([
         "the view's filter total_sales > 100",
      ]);
   });

   it("carries nothing from Malloy text, and says so", () => {
      expect(
         questionFromQuery("run: overview -> x", source, fields)?.notCarried,
      ).toEqual(["a query written as Malloy text"]);
      expect(questionFromQuery(undefined, source, fields)).toBeUndefined();
   });
});

describe("queryFromQuestion", () => {
   it("waits for a measure", () => {
      expect(
         queryFromQuestion(state({ groupBy: "category" }), "overview", fields),
      ).toBeUndefined();
   });

   it("writes the chart the question showed", () => {
      const query = queryFromQuestion(
         state({ measure: "total_sales", groupBy: "created_at" }),
         "overview",
         fields,
      );
      expect(query?.annotations).toEqual([{ value: "# viz=line\n" }]);
      expect(query?.definition).toEqual({
         kind: "arrow",
         source: { kind: "source_reference", name: "overview" },
         view: {
            kind: "segment",
            operations: [
               {
                  kind: "group_by",
                  name: "created_at_month",
                  field: {
                     expression: {
                        kind: "time_truncation",
                        field_reference: { name: "created_at" },
                        truncation: "month",
                     },
                  },
               },
               { kind: "aggregate", field: { expression: ref("total_sales") } },
               {
                  kind: "order_by",
                  field_reference: { name: "created_at_month" },
                  direction: "asc",
               },
            ],
         },
      });
   });

   const roundTrips: [string, Partial<QuestionState>][] = [
      ["a single number", { measure: "total_sales" }],
      ["a time line", { measure: "total_sales", groupBy: "created_at" }],
      [
         "a segmented bar with filters",
         {
            measure: "order_count",
            groupBy: "category",
            segment: "products.brand",
            limit: 5,
            filters: { region: ["West", "O'Hare, IL"] },
         },
      ],
      [
         "a state map",
         { measure: "total_sales", groupBy: "customers.state", chart: "map" },
      ],
      [
         "a forced table by quarter",
         {
            measure: "total_sales",
            groupBy: "created_at",
            groupGrain: "quarter",
            segment: "region",
            chart: "table",
         },
      ],
   ];
   for (const [name, patch] of roundTrips) {
      it(`round-trips ${name} through Fields unchanged`, () => {
         const start = state({
            ...patch,
            ...(patch.groupBy === "created_at" && !patch.groupGrain
               ? { groupGrain: "month" }
               : {}),
         });
         const back = questionFromQuery(
            queryFromQuestion(start, "overview", fields),
            source,
            fields,
         );
         expect(back).toEqual({ state: start, notCarried: [] });
      });
   }
});
