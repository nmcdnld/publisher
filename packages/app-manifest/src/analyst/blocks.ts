// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The schema half of the component registry. `registry.tsx` binds a React
// component to every entry here, and the presenter's output schema is built
// from the same entries, so the model can only ask for what the app renders.

import { z } from "zod";
import { DatasetRef, MetricRef } from "./schema";

const text = (hint: string) =>
   z.string().describe(`${hint} Numbers only as {{metric:ID}} tokens.`);

export const blockProps = {
   kpi: z.object({
      label: z.string().describe("A few words naming the number."),
      metric: MetricRef,
      compare: MetricRef.optional().describe(
         "A change metric (pct_change, diff, yoy) shown under the value.",
      ),
      tone: z.enum(["neutral", "good", "bad"]).optional(),
   }),
   chart: z.object({
      title: z.string(),
      mark: z.enum(["line", "bar", "area", "scatter"]),
      data: DatasetRef,
      x: z.string().describe("A column of that dataset."),
      y: z
         .array(z.string())
         .min(1)
         .describe("Numeric columns of that dataset."),
      highlight: z
         .array(MetricRef)
         .optional()
         .describe(
            "Label metrics (max_by, min_by) whose x value to emphasize.",
         ),
   }),
   table: z.object({
      title: z.string(),
      data: DatasetRef,
      columns: z.array(z.string()).optional(),
   }),
   insight: z.object({
      findingId: z.string(),
      text: text("One or two sentences."),
      severity: z.enum(["info", "positive", "warning"]),
   }),
   summary: z.object({ text: text("A short paragraph.") }),
   followUps: z.object({
      questions: z
         .array(z.string())
         .max(4)
         .describe("Questions the reader might ask next."),
   }),
} as const;

export type BlockType = keyof typeof blockProps;
export const BLOCK_TYPES = Object.keys(blockProps) as BlockType[];

export type BlockProps<T extends BlockType> = z.infer<(typeof blockProps)[T]>;
export type Block = {
   [T in BlockType]: { type: T } & BlockProps<T>;
}[BlockType];

export const blockLabels: Record<BlockType, string> = {
   kpi: "KPI",
   chart: "Chart",
   table: "Table",
   insight: "Insight",
   summary: "Summary",
   followUps: "Follow-ups",
};

/**
 * A block as the presenter writes it. Strict structured output has no optional
 * fields and no `oneOf`, so an absent field is sent as `null` (and dropped
 * here), the type is an `enum`, and variants are joined with `anyOf`.
 */
function wireBlock<T extends BlockType>(type: T) {
   const shape: Record<string, z.ZodType> = { type: z.enum([type]) };
   for (const [key, field] of Object.entries(blockProps[type].shape)) {
      if (field instanceof z.ZodOptional) {
         const nullable = (field.unwrap() as z.ZodType).nullable();
         shape[key] = field.description
            ? nullable.describe(field.description)
            : nullable;
      } else {
         shape[key] = field as z.ZodType;
      }
   }
   return z
      .object(shape)
      .transform(
         (value) =>
            Object.fromEntries(
               Object.entries(value).filter(([, v]) => v !== null),
            ) as Extract<Block, { type: T }>,
      );
}

const wireBlocks = Object.fromEntries(
   BLOCK_TYPES.map((type) => [type, wireBlock(type)]),
) as { [T in BlockType]: ReturnType<typeof wireBlock<T>> };

function blockSchema(allowed: readonly BlockType[]) {
   const variants = allowed.map((type) => wireBlocks[type]);
   if (variants.length === 0) throw new Error("A report needs a component");
   return variants.length === 1
      ? variants[0]
      : z.union(
           variants as unknown as [
              (typeof variants)[number],
              ...(typeof variants)[number][],
           ],
        );
}

/**
 * The presenter's output schema, narrowed to the components the analyst allows.
 * The type stays the full {@link ReportSpec}, so the renderer is exhaustive.
 */
export function reportSchema(allowed: readonly BlockType[] = BLOCK_TYPES) {
   return z.object({
      title: z.string(),
      answer: text("One line that answers the question."),
      sections: z.array(
         z.object({
            heading: z.string().optional(),
            layout: z.enum(["row", "grid-2", "grid-3", "stack"]),
            blocks: z.array(blockSchema(allowed)),
         }),
      ),
   });
}

export interface ReportSection {
   heading?: string;
   layout: "row" | "grid-2" | "grid-3" | "stack";
   blocks: Block[];
}

export interface ReportSpec {
   title: string;
   answer: string;
   sections: ReportSection[];
}

export const ReportSpec = reportSchema();

/** Parses one block on its own, so a streaming report renders what is complete. */
export function parseBlock(value: unknown): Block | null {
   if (!value || typeof value !== "object") return null;
   const type = (value as { type?: unknown }).type;
   if (typeof type !== "string" || !(type in blockProps)) return null;
   const parsed = wireBlocks[type as BlockType].safeParse(value);
   return parsed.success ? (parsed.data as Block) : null;
}
