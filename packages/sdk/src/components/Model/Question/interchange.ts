// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import {
   decodeFilterList,
   encodeFilterList,
   isPlainFilterList,
} from "../../given/filterValue";
import {
   aggregateOf,
   canMap,
   type ChartChoice,
   emptyQuestionState,
   type GivenBinding,
   GRAINS,
   type Grain,
   groupingOf,
   isTemporal,
   type QuestionField,
   type QuestionState,
   resolvedChart,
   SEGMENT_ROWS,
} from "./questionQuery";

/**
 * Moving one question between the explorer's two builders.
 *
 * The Fields builder holds a query AST; question mode holds a measure, a
 * group-by, a segment, a chart and value filters. Each converts into the
 * other so switching modes keeps what the reader built. The AST can say more
 * than the questions can (a second measure, a nest, a `having`), so the
 * conversion into questions reports what it could not place rather than
 * dropping it without a word.
 */

export interface CarriedQuestion {
   state: QuestionState;
   /** What the Fields query held that no question slot takes, in words. */
   notCarried: string[];
}

function pathOf(reference: Malloy.Reference): string {
   return [...(reference.path ?? []), reference.name].join(".");
}

function referenceTo(path: string): Malloy.Reference {
   const segments = path.split(".");
   const name = segments.pop() as string;
   return segments.length > 0 ? { name, path: segments } : { name };
}

function isGrain(value: string | undefined): value is Grain {
   return (GRAINS as readonly string[]).includes(value ?? "");
}

/** The renderer an annotation list names: `# viz=line` or the legacy `# line_chart`. */
export function rendererOf(
   annotations: readonly Malloy.Annotation[] | undefined,
): string | undefined {
   for (const { value } of annotations ?? []) {
      const viz = value.match(/^#\s.*\bviz\s*=\s*"?([A-Za-z_]+)/m);
      if (viz) return viz[1];
      const legacy = value.match(
         /^#\s*(bar_chart|line_chart|big_value|scatter_chart|shape_map|segment_map|point_map|list_detail|list|dashboard|table)\b/m,
      );
      if (legacy) return legacy[1].replace(/_chart$/, "");
   }
   return undefined;
}

function unescape(text: string): string {
   return text.replace(/\\(.)/g, "$1");
}

// Views built on views are followed this deep to find a column's origin.
const MAX_VIEW_DEPTH = 4;

function namedView(
   source: Malloy.SourceInfo,
   name: string | undefined,
): Malloy.FieldInfoWithView | undefined {
   return source.schema?.fields.find(
      (f): f is Malloy.FieldInfoWithView =>
         f.kind === "view" && f.name === name,
   );
}

/**
 * The source field and expression behind one of a view's output columns.
 *
 * Each column carries its origin in a `drill_expression` annotation: `code`
 * when the column is an expression over the source (`created_at.month`), or a
 * `name` and `path`. A path ending in another view means the column was
 * renamed there (`revenue is total_sales`), so that view's column of the same
 * name is followed instead.
 */
function columnOrigin(
   output: Malloy.FieldInfo,
   source: Malloy.SourceInfo,
   fields: readonly QuestionField[],
   depth = 0,
): { field: QuestionField; expression: Malloy.Expression } | undefined {
   const byPath = (path: string) => fields.find((f) => f.path === path);
   const reference = (field: QuestionField) => ({
      field,
      expression: {
         kind: "field_reference" as const,
         ...referenceTo(field.path),
      },
   });
   const text = (output.annotations ?? []).map((a) => a.value).join("\n");
   const drill = text.match(/drill_expression\s*\{[^}]*\}/)?.[0] ?? "";
   const code = drill.match(/\bcode\s*=\s*"((?:[^"\\]|\\.)*)"/)?.[1];
   const name = drill.match(/\bname\s*=\s*([A-Za-z_]\w*)/)?.[1];
   const path = (drill.match(/\bpath\s*=\s*\[([^\]]*)\]/)?.[1] ?? "")
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean);

   const candidate = code?.replace(/`/g, "").trim();
   if (candidate && /^[\w.]+$/.test(candidate)) {
      const field = byPath(candidate);
      if (field) return reference(field);
      const segments = candidate.split(".");
      const grain = segments.pop();
      const truncated = byPath(segments.join("."));
      if (truncated && isTemporal(truncated) && isGrain(grain)) {
         return {
            field: truncated,
            expression: {
               kind: "time_truncation",
               field_reference: referenceTo(truncated.path),
               truncation: grain,
            },
         };
      }
   }
   if (!name) return undefined;
   const via = namedView(source, path[path.length - 1]);
   if (via && depth < MAX_VIEW_DEPTH) {
      const column = via.schema.fields.find((f) => f.name === name);
      return column && columnOrigin(column, source, fields, depth + 1);
   }
   const field = byPath([...path, name].join(".")) ?? byPath(name);
   return field && reference(field);
}

/**
 * The `where:` clauses a view applies, as Malloy text, and its row limit.
 *
 * Neither is in the view's schema, but the compiler records both in the view's
 * `#(malloy)` annotation: `drill_filters = [{ code = "…" }]` and `limit = N`.
 */
function viewRestrictions(view: Malloy.FieldInfoWithView): {
   filters: string[];
   limit?: number;
} {
   const text =
      (view.annotations ?? [])
         .map((a) => a.value)
         .find((value) => value.startsWith("#(malloy)")) ?? "";
   const limit = text.match(/(?:^|\s)limit\s*=\s*(\d+)/)?.[1];
   const filters: string[] = [];
   const start = text.search(/\bdrill_filters\s*=\s*\[/);
   if (start >= 0) {
      // A code string can itself hold brackets, so the list's end is found
      // outside strings rather than at the first `]`.
      let depth = 0;
      let end = text.length;
      for (let i = text.indexOf("[", start); i < text.length; i++) {
         const char = text[i];
         if (char === '"') {
            for (i++; i < text.length && text[i] !== '"'; i++) {
               if (text[i] === "\\") i++;
            }
         } else if (char === "[") {
            depth++;
         } else if (char === "]" && --depth === 0) {
            end = i;
            break;
         }
      }
      for (const match of text
         .slice(start, end)
         .matchAll(/\bcode\s*=\s*"((?:[^"\\]|\\.)*)"/g)) {
         filters.push(unescape(match[1]));
      }
   }
   return { filters, ...(limit ? { limit: Number(limit) } : {}) };
}

const PATH = String.raw`((?:\x60[^\x60]+\x60|[A-Za-z_]\w*)(?:\.(?:\x60[^\x60]+\x60|[A-Za-z_]\w*))*)`;
const GIVEN_FILTER = new RegExp(
   String.raw`^${PATH}\s*(!~|~|>=|<=|!=|=|>|<)\s*\$([A-Za-z_]\w*)$`,
);
const LITERAL_FILTER = new RegExp(
   String.raw`^${PATH}\s*=\s*'((?:[^'\\]|\\.)*)'$`,
);

/**
 * A view's own filters and limit, as the operations question mode reads.
 *
 * A filter reading a given is already written by question mode, from the same
 * binding, so it needs no operation of its own; only a binding question mode
 * would write differently is reported.
 */
function restrictionsOf(
   view: Malloy.FieldInfoWithView,
   bindings: ReadonlyMap<string, GivenBinding> | undefined,
   notCarried: string[],
): Malloy.ViewOperation[] {
   const { filters, limit } = viewRestrictions(view);
   const operations: Malloy.ViewOperation[] = [];
   for (const code of filters) {
      const given = code.match(GIVEN_FILTER);
      if (given) {
         const [, path, operator, name] = given;
         const binding = bindings?.get(name);
         if (
            binding?.field === path.replace(/`/g, "") &&
            binding.operator === operator
         ) {
            continue;
         }
      }
      const literal = code.match(LITERAL_FILTER);
      if (literal) {
         operations.push({
            kind: "where",
            filter: {
               kind: "literal_equality",
               expression: {
                  kind: "field_reference",
                  ...referenceTo(literal[1].replace(/`/g, "")),
               },
               value: {
                  kind: "string_literal",
                  string_value: unescape(literal[2]),
               },
            },
         });
         continue;
      }
      notCarried.push(`the view's filter ${code}`);
   }
   if (limit !== undefined) operations.push({ kind: "limit", limit });
   return operations;
}

/**
 * A view's output fields, as the group-bys and aggregates that produced them,
 * with the view's own filters and limit.
 *
 * A named view arrives as a reference, and the model's schema holds only its
 * output, but its annotations record the rest: each column's origin, and the
 * view's filters and limit.
 */
function expandView(
   view: Malloy.FieldInfoWithView,
   source: Malloy.SourceInfo,
   fields: readonly QuestionField[],
   bindings: ReadonlyMap<string, GivenBinding> | undefined,
   notCarried: string[],
): Malloy.ViewOperation[] {
   const operations = restrictionsOf(view, bindings, notCarried);
   for (const output of view.schema.fields) {
      const origin = columnOrigin(output, source, fields);
      if (!origin) {
         notCarried.push(`the view's "${output.name}" column`);
         continue;
      }
      operations.push({
         kind: origin.field.kind === "measure" ? "aggregate" : "group_by",
         field: { expression: origin.expression },
      });
   }
   return operations;
}

/** Flatten a view into its operations, expanding named views from the schema. */
function operationsOf(
   view: Malloy.ViewDefinition,
   source: Malloy.SourceInfo,
   fields: readonly QuestionField[],
   bindings: ReadonlyMap<string, GivenBinding> | undefined,
   notCarried: string[],
   annotations: Malloy.Annotation[],
): Malloy.ViewOperation[] | undefined {
   switch (view.kind) {
      case "segment":
         return view.operations;
      case "refinement": {
         const base = operationsOf(
            view.base,
            source,
            fields,
            bindings,
            notCarried,
            annotations,
         );
         const refinement = operationsOf(
            view.refinement,
            source,
            fields,
            bindings,
            notCarried,
            annotations,
         );
         return base && refinement ? [...base, ...refinement] : undefined;
      }
      case "view_reference": {
         const named = namedView(source, view.name);
         if (!named) {
            notCarried.push(`the view "${view.name}"`);
            return undefined;
         }
         annotations.push(...(named.annotations ?? []));
         return expandView(named, source, fields, bindings, notCarried);
      }
      default:
         notCarried.push("a multi-stage query");
         return undefined;
   }
}

function describe(expression: Malloy.Expression): string {
   switch (expression.kind) {
      case "field_reference":
         return pathOf(expression);
      case "time_truncation":
         return `${pathOf(expression.field_reference)}.${expression.truncation}`;
      case "filtered_field":
         return `${pathOf(expression.field_reference)} with a filter`;
      default:
         return expression.kind.replace(/_/g, " ");
   }
}

/**
 * The questions a Fields query answers, or undefined when there is nothing to
 * carry: no query, or Malloy text the builder never parsed.
 *
 * `bindings` are the given bindings question mode writes, so a named view's
 * filter on a given is known to carry over.
 */
export function questionFromQuery(
   query: Malloy.Query | string | undefined,
   source: Malloy.SourceInfo,
   fields: readonly QuestionField[],
   bindings?: ReadonlyMap<string, GivenBinding>,
): CarriedQuestion | undefined {
   if (query === undefined) return undefined;
   if (typeof query === "string") {
      return {
         state: emptyQuestionState(),
         notCarried: ["a query written as Malloy text"],
      };
   }
   const notCarried: string[] = [];
   const state = emptyQuestionState();
   const definition = query.definition;
   if (definition.kind !== "arrow") {
      return { state, notCarried: ["a named or refined query"] };
   }
   const annotations = [...(query.annotations ?? [])];
   const operations =
      operationsOf(
         definition.view,
         source,
         fields,
         bindings,
         notCarried,
         annotations,
      ) ?? [];
   const byPath = (path: string) => fields.find((f) => f.path === path);
   let readLimit = false;

   for (const operation of operations) {
      switch (operation.kind) {
         case "group_by": {
            const expression = operation.field.expression;
            const reference =
               expression.kind === "field_reference"
                  ? expression
                  : expression.kind === "time_truncation"
                    ? expression.field_reference
                    : undefined;
            const field = reference && byPath(pathOf(reference));
            if (!field || field.kind !== "dimension") {
               notCarried.push(`the group-by ${describe(expression)}`);
               break;
            }
            let grain: Grain | undefined;
            if (expression.kind === "time_truncation") {
               if (isGrain(expression.truncation))
                  grain = expression.truncation;
               else {
                  notCarried.push(
                     `the ${expression.truncation} grain on ${field.label} (grouped by day)`,
                  );
                  grain = "day";
               }
            } else if (isTemporal(field) && !field.truncated) {
               grain = "day";
               if (field.type === "timestamp") {
                  notCarried.push(
                     `grouping ${field.label} by exact time (grouped by day)`,
                  );
               }
            }
            if (!state.groupBy) {
               state.groupBy = field.path;
               if (grain) state.groupGrain = grain;
            } else if (!state.segment && field.path !== state.groupBy) {
               state.segment = field.path;
               if (grain) state.segmentGrain = grain;
            } else {
               notCarried.push(`the extra group-by ${field.label}`);
            }
            break;
         }
         case "aggregate": {
            const expression = operation.field.expression;
            const field =
               expression.kind === "field_reference"
                  ? byPath(pathOf(expression))
                  : undefined;
            if (!field || field.kind !== "measure") {
               notCarried.push(`the measure ${describe(expression)}`);
            } else if (!state.measure) {
               state.measure = field.path;
            } else {
               notCarried.push(`the extra measure ${field.label}`);
            }
            break;
         }
         case "where": {
            const filter = operation.filter;
            const field =
               filter.expression.kind === "field_reference"
                  ? byPath(pathOf(filter.expression))
                  : undefined;
            if (field?.kind === "dimension" && field.type === "string") {
               if (
                  filter.kind === "filter_string" &&
                  isPlainFilterList(filter.filter)
               ) {
                  const values = decodeFilterList(filter.filter);
                  if (values.length > 0) state.filters[field.path] = values;
                  break;
               }
               if (
                  filter.kind === "literal_equality" &&
                  filter.value.kind === "string_literal"
               ) {
                  state.filters[field.path] = [filter.value.string_value];
                  break;
               }
            }
            notCarried.push(`the filter on ${describe(filter.expression)}`);
            break;
         }
         case "limit":
            state.limit = operation.limit;
            readLimit = true;
            break;
         case "order_by":
         case "drill":
            // Question mode orders by the chart's own logic.
            break;
         case "nest":
            notCarried.push(`the nested view ${operation.name ?? ""}`.trim());
            break;
         case "having":
            notCarried.push("a having filter");
            break;
         case "calculate":
            notCarried.push(`the calculation ${operation.name}`);
            break;
      }
   }

   const group = state.groupBy ? byPath(state.groupBy) : undefined;
   // `queryFromQuestion` writes a segmented top-N as rows, N times this.
   if (
      readLimit &&
      state.segment &&
      !isTemporal(group) &&
      state.limit % SEGMENT_ROWS === 0 &&
      // Question mode's smallest top-N; a lower row cap was set in Fields.
      state.limit >= SEGMENT_ROWS * 5
   ) {
      state.limit /= SEGMENT_ROWS;
   }
   const renderer = rendererOf(annotations);
   let chart: ChartChoice;
   if (renderer === "bar" || renderer === "line" || renderer === "table") {
      chart = renderer;
   } else if (renderer === "shape_map" && canMap(state, group)) {
      chart = "map";
   } else if (renderer === undefined) {
      // The Fields builder's own default is a table.
      chart = group ? "table" : "auto";
   } else {
      if (renderer !== "big_value") {
         notCarried.push(`the ${renderer.replace(/_/g, " ")} chart`);
      }
      chart = "auto";
   }
   state.chart =
      chart !== "auto" &&
      resolvedChart({ ...state, chart: "auto" }, group) === chart
         ? "auto"
         : chart;
   return { state, notCarried };
}

/**
 * The Fields query for a set of answers, or undefined until a measure is
 * chosen. Given bindings are left out: the builder's AST has no way to read a
 * `$GIVEN`, and question mode adds them again on the way back.
 */
export function queryFromQuestion(
   state: QuestionState,
   sourceName: string,
   fields: readonly QuestionField[],
): Malloy.Query | undefined {
   const byPath = (path: string | undefined) =>
      path === undefined ? undefined : fields.find((f) => f.path === path);
   const measure = byPath(state.measure);
   if (!measure) return undefined;
   const group = byPath(state.groupBy);
   const segment = group ? byPath(state.segment) : undefined;
   const operations: Malloy.ViewOperation[] = [];

   for (const [path, values] of Object.entries(state.filters)) {
      if (values.length === 0 || !byPath(path)) continue;
      operations.push({
         kind: "where",
         filter: {
            kind: "filter_string",
            expression: { kind: "field_reference", ...referenceTo(path) },
            filter: encodeFilterList(values),
         },
      });
   }

   const outputs: string[] = [];
   for (const [field, grain] of [
      [group, state.groupGrain ?? "month"],
      [segment, state.segmentGrain ?? "year"],
   ] as const) {
      if (!field) continue;
      const { truncate, output, alias } = groupingOf(field, grain);
      outputs.push(output);
      operations.push({
         kind: "group_by",
         ...(alias ? { name: output } : {}),
         field: {
            expression: truncate
               ? {
                    kind: "time_truncation",
                    field_reference: referenceTo(field.path),
                    truncation: truncate,
                 }
               : { kind: "field_reference", ...referenceTo(field.path) },
         },
      });
   }

   const { output: measureOutput, alias } = aggregateOf(measure);
   operations.push({
      kind: "aggregate",
      ...(alias ? { name: measureOutput } : {}),
      field: {
         expression: { kind: "field_reference", ...referenceTo(measure.path) },
      },
   });

   const chart = resolvedChart(state, group);
   if (group && chart !== "map") {
      if (isTemporal(group)) {
         operations.push({
            kind: "order_by",
            field_reference: { name: outputs[0] },
            direction: "asc",
         });
      } else {
         operations.push({
            kind: "order_by",
            field_reference: { name: measureOutput },
            direction: "desc",
         });
         operations.push({
            kind: "limit",
            limit: segment ? state.limit * SEGMENT_ROWS : state.limit,
         });
      }
   }

   return {
      definition: {
         kind: "arrow",
         source: { kind: "source_reference", name: sourceName },
         view: { kind: "segment", operations },
      },
      ...(chart === "bar" || chart === "line"
         ? { annotations: [{ value: `# viz=${chart}\n` }] }
         : chart === "map"
           ? { annotations: [{ value: "# shape_map\n" }] }
           : {}),
   };
}
