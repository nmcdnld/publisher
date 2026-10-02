// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import type { Given } from "../../../client";

/**
 * The pure half of the explorer's question mode: which fields a source offers
 * as answers to "what would you like to measure / group by / segment by?",
 * which parameters filter which of those fields, and the Malloy a set of
 * answers compiles to.
 */

export type FieldType =
   | "string"
   | "number"
   | "boolean"
   | "date"
   | "timestamp"
   | "other";

export interface QuestionField {
   /** Dotted path from the source, e.g. `products.category`. */
   path: string;
   /** Last path segment. */
   name: string;
   label: string;
   /** The join path the field sits under, or the source's name for its own fields. */
   group: string;
   kind: "dimension" | "measure";
   type: FieldType;
   /** A date or timestamp already truncated in the model (`created_at.month`). */
   truncated: boolean;
   description?: string;
}

export const GRAINS = ["year", "quarter", "month", "week", "day"] as const;
export type Grain = (typeof GRAINS)[number];

export type ChartChoice = "auto" | "bar" | "line" | "table" | "map";

/**
 * With a segment each group is several rows, so a top-N caps rows at N times
 * this: generous enough to keep the top groups whole.
 */
export const SEGMENT_ROWS = 20;

export interface QuestionState {
   measure?: string;
   groupBy?: string;
   groupGrain?: Grain;
   segment?: string;
   segmentGrain?: Grain;
   chart: ChartChoice;
   limit: number;
   /** Value filters derived from a chosen dimension, by field path. */
   filters: Record<string, string[]>;
}

export function emptyQuestionState(): QuestionState {
   return { chart: "auto", limit: 20, filters: {} };
}

/** A given that filters a field of the source, and how: `category ~ $CATEGORY`. */
export interface GivenBinding {
   given: string;
   field: string;
   operator: string;
}

// Joins are walked this deep, so a snowflake of joins does not turn the
// dropdowns into every column in the warehouse.
const MAX_JOIN_DEPTH = 2;

function fieldType(type: Malloy.AtomicType): FieldType {
   switch (type.kind) {
      case "string_type":
         return "string";
      case "number_type":
         return "number";
      case "boolean_type":
         return "boolean";
      case "date_type":
         return "date";
      case "timestamp_type":
      case "timestamptz_type":
         return "timestamp";
      default:
         return "other";
   }
}

export function isTemporal(field: QuestionField | undefined): boolean {
   return field?.type === "date" || field?.type === "timestamp";
}

function annotationText(
   annotations: Malloy.Annotation[] | undefined,
): string[] {
   return (annotations ?? []).map((annotation) => annotation.value);
}

function labelOf(annotations: string[]): string | undefined {
   for (const text of annotations) {
      const match = text.match(/^#\s.*\blabel\s*=\s*"([^"]*)"/m);
      if (match) return match[1];
   }
   return undefined;
}

function descriptionOf(annotations: string[]): string | undefined {
   const lines: string[] = [];
   for (const text of annotations) {
      const doc =
         text.match(/^#\(doc\)\s*(.*)$/m) ?? text.match(/^#"\s?(.*)$/m);
      if (doc?.[1]) lines.push(doc[1].trim());
   }
   return lines.length > 0 ? lines.join(" ") : undefined;
}

export function humanize(name: string): string {
   const words = name.replace(/_/g, " ").trim();
   return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every dimension and measure a source offers, its joins' included. */
export function questionFields(source: Malloy.SourceInfo): QuestionField[] {
   const fields: QuestionField[] = [];
   const walk = (
      schema: Malloy.Schema | undefined,
      prefix: string[],
      depth: number,
   ) => {
      for (const field of schema?.fields ?? []) {
         if (field.kind === "dimension" || field.kind === "measure") {
            const type = fieldType(field.type);
            if (type === "other") continue;
            const annotations = annotationText(field.annotations);
            fields.push({
               path: [...prefix, field.name].join("."),
               name: field.name,
               label: labelOf(annotations) ?? humanize(field.name),
               group: prefix.length > 0 ? prefix.join(".") : source.name,
               kind: field.kind,
               type,
               truncated:
                  (type === "date" || type === "timestamp") &&
                  (field.type as { timeframe?: string }).timeframe !==
                     undefined,
               description: descriptionOf(annotations),
            });
         } else if (field.kind === "join" && depth < MAX_JOIN_DEPTH) {
            walk(field.schema, [...prefix, field.name], depth + 1);
         }
      }
   };
   walk(source.schema, [], 0);
   return fields;
}

const BINDING_PATTERN =
   /((?:`[^`]+`|[A-Za-z_]\w*)(?:\.(?:`[^`]+`|[A-Za-z_]\w*))*)\s*(!~|~|>=|<=|!=|=|>|<)\s*\$([A-Za-z_]\w*)/g;

function operatorForType(type: string | undefined): string {
   if (type?.startsWith("filter")) return "~";
   if (type === "date" || type === "timestamp") return ">=";
   return "=";
}

/**
 * Which field each given filters, for the givens that filter a field of this
 * source.
 *
 * Givens are declared model-wide and bind by a `where:` someone wrote, so the
 * binding is read from the model's own text first: `category ~ $CATEGORY` in a
 * dashboard tile says exactly which field and operator. A given no `where:`
 * names falls back to its `suggest` dimension, then to a field sharing its
 * name, with the operator its type implies. A binding naming a field this
 * source lacks is dropped, so a parameter is only offered where it can apply.
 */
export function deriveGivenBindings(
   givens: readonly Given[],
   sourceText: string | undefined,
   fields: readonly QuestionField[],
): Map<string, GivenBinding> {
   const paths = new Set(fields.map((field) => field.path));
   const declared = new Map(
      givens
         .filter((given) => given.name !== undefined)
         .map((given) => [given.name as string, given]),
   );
   const bindings = new Map<string, GivenBinding>();

   if (sourceText) {
      const code = sourceText.replace(/(\/\/|--).*$/gm, "");
      for (const match of code.matchAll(BINDING_PATTERN)) {
         const [, rawPath, operator, given] = match;
         const field = rawPath.replace(/`/g, "");
         if (!declared.has(given) || bindings.has(given)) continue;
         if (!paths.has(field)) continue;
         bindings.set(given, { given, field, operator });
      }
   }

   const byName = (name: string) =>
      fields.find(
         (field) =>
            field.kind === "dimension" &&
            (field.path === name || field.path.endsWith(`.${name}`)),
      );
   for (const [name, given] of declared) {
      if (bindings.has(name)) continue;
      const match =
         (given.suggest?.dimension && byName(given.suggest.dimension)) ||
         byName(name.toLowerCase());
      if (match) {
         bindings.set(name, {
            given: name,
            field: match.path,
            operator: operatorForType(given.type),
         });
      }
   }
   return bindings;
}

/**
 * The bindings a query can write: a `$GIVEN` with neither a value nor a
 * default has nothing to read, so its `where:` would fail the whole run.
 */
export function applicableBindings(
   bindings: ReadonlyMap<string, GivenBinding>,
   givens: readonly Given[],
   applied: ReadonlyMap<string, unknown>,
): GivenBinding[] {
   return [...bindings.values()].filter((binding) => {
      const value = applied.get(binding.given);
      if (value !== null && value !== undefined) return true;
      const given = givens.find((g) => g.name === binding.given);
      return given?.default != null;
   });
}

const RESERVED = new Set(
   (
      "all and as asc avg by case count date day desc else end false from " +
      "group hour index is limit max min minute month not now null on or " +
      "order quarter second source string sum table then timestamp to true " +
      "type view week when with year number boolean"
   ).split(" "),
);

function quoteSegment(segment: string): string {
   return /^[A-Za-z_]\w*$/.test(segment) && !RESERVED.has(segment.toLowerCase())
      ? segment
      : `\`${segment.replace(/`/g, "")}\``;
}

export function quotePath(path: string): string {
   return path.split(".").map(quoteSegment).join(".");
}

function malloyString(value: string): string {
   return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * How a chosen field is grouped: the truncation applied, and the column it
 * produces. `alias` is false when the field's own name is the column.
 */
export function groupingOf(
   field: QuestionField,
   grain: Grain | undefined,
): { truncate?: Grain; output: string; alias: boolean } {
   const truncate = isTemporal(field) && !field.truncated ? grain : undefined;
   if (!truncate && !field.path.includes(".")) {
      return { output: field.name, alias: false };
   }
   const output = [field.path.replace(/\./g, "_"), truncate]
      .filter(Boolean)
      .join("_");
   return { truncate, output, alias: true };
}

/** The column a chosen measure produces, and whether that needs an alias. */
export function aggregateOf(field: QuestionField): {
   output: string;
   alias: boolean;
} {
   return field.path.includes(".")
      ? { output: field.path.replace(/\./g, "_"), alias: true }
      : { output: field.name, alias: false };
}

/** A `group_by` entry and the column name it produces. */
function grouping(
   field: QuestionField,
   grain: Grain | undefined,
): { entry: string; output: string } {
   const { truncate, output, alias } = groupingOf(field, grain);
   if (!alias) return { entry: quotePath(field.path), output };
   const expression = truncate
      ? `${quotePath(field.path)}.${truncate}`
      : quotePath(field.path);
   return { entry: `${quoteSegment(output)} is ${expression}`, output };
}

export interface BuildQuestionOptions {
   sourceName: string;
   fields: readonly QuestionField[];
   state: QuestionState;
   /** Given bindings to write as `where:` clauses. */
   bindings: readonly GivenBinding[];
}

/**
 * Whether the answers can be drawn as a `# shape_map`: one string grouping,
 * the region key, and nothing splitting it into series.
 */
export function canMap(
   state: QuestionState,
   group: QuestionField | undefined,
): boolean {
   return group?.type === "string" && !state.segment;
}

/** The chart a set of answers renders as, once "auto" is resolved. */
export function resolvedChart(
   state: QuestionState,
   group: QuestionField | undefined,
): "big_value" | "bar" | "line" | "table" | "map" {
   // A map the answers no longer fit falls back to what Auto would draw.
   if (state.chart === "map" && canMap(state, group)) return "map";
   if (state.chart !== "auto" && state.chart !== "map") return state.chart;
   if (!group) return "big_value";
   return isTemporal(group) ? "line" : "bar";
}

/**
 * The Malloy the answers compile to, or undefined until a measure is chosen.
 *
 * Written as text rather than a query AST because a parameter binds through a
 * `where:` reading `$GIVEN`, which the AST has no node for.
 */
export function buildQuestionQuery({
   sourceName,
   fields,
   state,
   bindings,
}: BuildQuestionOptions): string | undefined {
   const find = (path: string | undefined) =>
      path === undefined ? undefined : fields.find((f) => f.path === path);
   const measure = find(state.measure);
   if (!measure) return undefined;
   const group = find(state.groupBy);
   const segment = group ? find(state.segment) : undefined;

   const wheres = bindings.map(
      (binding) =>
         `${quotePath(binding.field)} ${binding.operator} $${binding.given}`,
   );
   for (const [path, values] of Object.entries(state.filters)) {
      if (values.length === 0 || !find(path)) continue;
      const field = quotePath(path);
      wheres.push(
         values.length === 1
            ? `${field} = ${malloyString(values[0])}`
            : `(${values.map((v) => `${field} = ${malloyString(v)}`).join(" or ")})`,
      );
   }

   const groups = [
      group && grouping(group, state.groupGrain ?? "month"),
      segment && grouping(segment, state.segmentGrain ?? "year"),
   ].filter((g): g is { entry: string; output: string } => Boolean(g));

   const { output: measureOutput, alias: measureAlias } = aggregateOf(measure);
   const aggregate = measureAlias
      ? `${quoteSegment(measureOutput)} is ${quotePath(measure.path)}`
      : quotePath(measure.path);

   const chart = resolvedChart(state, group);
   const tag =
      chart === "big_value"
         ? "# big_value"
         : chart === "line"
           ? "# line_chart"
           : chart === "bar"
             ? segment
                ? "# bar_chart.stack"
                : "# bar_chart"
             : chart === "map"
               ? "# shape_map"
               : undefined;

   const body: string[] = wheres.map((where) => `  where: ${where}`);
   if (groups.length > 0) {
      body.push(`  group_by: ${groups.map((g) => g.entry).join(", ")}`);
   }
   body.push(`  aggregate: ${aggregate}`);
   // A map shows every region, so it is neither ranked nor cut to a top N.
   if (group && chart !== "map") {
      if (isTemporal(group)) {
         body.push(`  order_by: ${quoteSegment(groups[0].output)} asc`);
      } else {
         body.push(`  order_by: ${quoteSegment(measureOutput)} desc`);
         body.push(
            `  limit: ${segment ? state.limit * SEGMENT_ROWS : state.limit}`,
         );
      }
   }

   return [
      ...(tag ? [tag] : []),
      `run: ${quotePath(sourceName)} -> {`,
      ...body,
      `}`,
   ].join("\n");
}
