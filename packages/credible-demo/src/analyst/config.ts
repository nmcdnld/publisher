// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   BLOCK_TYPES,
   type BlockType,
} from "@malloy-publisher/app-manifest/analyst/blocks";

export const TOOL_NAMES = [
   "list_sources",
   "describe_source",
   "run_query",
   "compute_metric",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** How the analyst runs: its models, what it may read, and its limits. */
export interface AnalystConfig {
   /** Domain context appended to the base system prompt. */
   instructions: string;
   /** The Publisher environment `sources` live in. */
   environment: string;
   explorer: {
      model: string;
      fallbacks: string[];
      effort: "low" | "medium" | "high";
   };
   presenter: { model: string };
   /** What list_sources exposes; empty means every source in the environment. */
   sources: { package: string; model: string; source: string }[];
   /**
    * The packages a workspace confines the run to. When set, `sources` still
    * curates its own packages, and every other package here is read whole.
    */
   packages?: string[];
   /** When set, only sources with these names. */
   sourceNames?: string[];
   tools: ToolName[];
   budget: {
      maxToolCalls: number;
      maxIterations: number;
      maxUsd: number;
      timeoutMs: number;
   };
   components: BlockType[];
   /** Ordered hints for the presenter, e.g. "Always lead with a KPI row". */
   template: string[];
}

const STOREFRONT_NOTES = [
   "Revenue means total_sales on order_items (sale price, net of nothing).",
   "Margin means total_margin; margin rate is margin_rate.",
];
const GENERAL_NOTES = [
   "Prefer the model's named views when one answers the question.",
   "Match the depth of the answer to the question: a quick lookup needs a number or two, an open question a fuller report.",
];

export const analystConfig: AnalystConfig = {
   instructions: [...STOREFRONT_NOTES, ...GENERAL_NOTES].join("\n"),
   environment: "examples",
   explorer: {
      model: "anthropic/claude-sonnet-5.5",
      fallbacks: ["anthropic/claude-opus-5.5", "openai/gpt-5.6"],
      effort: "medium",
   },
   presenter: { model: "anthropic/claude-sonnet-5.5" },
   sources: [
      {
         package: "storefront",
         model: "storefront.malloy",
         source: "order_items",
      },
      {
         package: "storefront",
         model: "storefront.malloy",
         source: "customers",
      },
      { package: "storefront", model: "storefront.malloy", source: "products" },
   ],
   tools: [...TOOL_NAMES],
   budget: {
      maxToolCalls: 14,
      maxIterations: 10,
      maxUsd: 0.5,
      timeoutMs: 90_000,
   },
   components: [...BLOCK_TYPES],
   template: [
      "Lead with a row of two to four KPIs.",
      "Follow with the one chart that best answers the question.",
      "Add insights for the most important findings.",
      "End with follow-up questions.",
   ],
};

/**
 * `config` confined to a workspace's packages; unchanged when the workspace
 * shows every package.
 */
export function scopedConfig(
   config: AnalystConfig,
   packages: string[] | undefined,
): AnalystConfig {
   if (!packages) return config;
   return {
      ...config,
      packages,
      instructions: packages.includes("storefront")
         ? config.instructions
         : GENERAL_NOTES.join("\n"),
   };
}

/** The explorer models a non-admin may pick. */
export const offeredModels = [
   analystConfig.explorer.model,
   ...analystConfig.explorer.fallbacks,
];
