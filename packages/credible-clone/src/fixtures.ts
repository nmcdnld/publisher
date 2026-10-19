// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { UIMessage } from "@tanstack/ai-client";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

export type User = { email: string; initial: string };

export type Workspace = {
   id: string;
   name: string;
   description: string;
   visibility: "Private" | "Shared";
};

export type Environment = { id: string; name: string };

export type Scope = {
   environment?: string;
   package?: string;
   /** A dashboard or notebook the chat is about, narrower than its package. */
   report?: { kind: "dashboard" | "notebook"; title: string };
};

/** The page a chat was started from, alongside its content. */
export type ChatOrigin = { title: string; path: string };

export type Chat = {
   id: string;
   title: string;
   updatedAt: string;
   scope: Scope;
   origin?: ChatOrigin;
   pinned?: boolean;
   artifacts?: string[];
   /** The OpenRouter slug the chat was started with; the default when unset. */
   model?: string;
};

export type Message = UIMessage;

const said = (
   id: string,
   role: "user" | "assistant",
   ...paragraphs: string[]
): Message => ({
   id,
   role,
   parts: [{ type: "text", content: paragraphs.join("\n\n") }],
});

/** A package on the local Publisher server that content comes from. */
export type Served = { environment: string; package: string };

export type Package = {
   id: string;
   name: string;
   environment: string;
   status: "Draft" | "Published";
   description: string;
   served?: Served;
};

/** `fixtures/thelook_ecommerce`, registered with the local Publisher. */
const thelookServed: Served = {
   environment: "examples",
   package: "thelook_ecommerce",
};

export const currentUser: User = {
   email: "noahamac@icloud.com",
   initial: "N",
};

export const workspace: Workspace = {
   id: "noahamac-at-icloud-com-personal",
   name: "My Workspace",
   description: `Personal workspace for ${currentUser.email}`,
   visibility: "Private",
};

export const environments: Environment[] = [
   { id: "analytics", name: "analytics" },
];

const thelook: Scope = {
   environment: "analytics",
   package: "thelook_ecommerce",
};

export const chats: Chat[] = [
   {
      id: "tool-access",
      title: "Tool access",
      updatedAt: new Date().toISOString(),
      scope: {},
   },
   {
      id: "revenue-performance-dashboard",
      title: "Revenue performance dashboard",
      updatedAt: daysAgo(2),
      scope: thelook,
      pinned: true,
      artifacts: ["1 dashboard"],
   },
   {
      id: "additional-dashboards",
      title: "Additional dashboards",
      updatedAt: daysAgo(2),
      scope: thelook,
   },
   {
      id: "customers-and-acquisition",
      title: "Customers and acquisition",
      updatedAt: daysAgo(2),
      scope: thelook,
      artifacts: ["1 dashboard"],
   },
   {
      id: "database-connection",
      title: "Database connection",
      updatedAt: daysAgo(3),
      scope: {},
   },
   {
      id: "return-rate-by-category",
      title: "Return rate by category",
      updatedAt: daysAgo(4),
      scope: thelook,
   },
];

export const messages: Record<string, Message[]> = {
   "tool-access": [
      said("m1", "user", "what tools do you have access to?"),
      said(
         "m2",
         "assistant",
         "I can list your packages, search a model for the sources and fields a question needs, run Malloy queries, and save dashboards and notebooks to your workspace.",
      ),
   ],
   "revenue-performance-dashboard": [
      said(
         "m1",
         "user",
         "put together some basic charts into a dashboard ! revenue performance",
      ),
      said(
         "m2",
         "assistant",
         'I saved the "Revenue performance" dashboard to your personal workspace. It has six tiles: key figures, a monthly trend of gross vs kept revenue, and bar charts of revenue by year, by department, by product category and for the top 15 brands.',
         "The data runs from January 2019 to mid-March 2026, and gross revenue is $10.8M over that time. About a quarter of it was cancelled or returned, which leaves $8.1M kept.",
      ),
   ],
   "additional-dashboards": [
      said("m1", "user", "can you make a couple more dashboards?"),
      said(
         "m2",
         "assistant",
         "Happy to. Customers and acquisition, and inventory health, are the two areas the model covers best that don't have a dashboard yet. Which should I start with?",
      ),
   ],
   "customers-and-acquisition": [
      said("m1", "user", "dashboard for customers and acquisition"),
      said(
         "m2",
         "assistant",
         'I saved "Customers and acquisition". It opens with buyers, orders, average order value and revenue, then shows new sign-ups by month, and buyers and revenue by acquisition channel, age group, gender and department, and country.',
      ),
   ],
   "database-connection": [
      said("m1", "user", "how do I connect my postgres database?"),
      said(
         "m2",
         "assistant",
         "Add a Postgres connection to an environment with the host, database and credentials, then point a package's model at it. Once it's connected I can rank its tables against a description of what you want to model.",
      ),
   ],
   "return-rate-by-category": [
      said("m1", "user", "return rate by category"),
      said(
         "m2",
         "assistant",
         "Clothing returns the most: about 12% of items in Jeans, Outerwear & Coats and Dresses come back, against roughly 9% for accessories.",
      ),
   ],
};

export const newChatSuggestions = [
   "Which products get returned most?",
   "How are new customers trending?",
];

export const packages: Package[] = [
   {
      id: "thelook_ecommerce",
      name: "thelook_ecommerce",
      environment: "analytics",
      status: "Draft",
      description:
         "Semantic model of theLook online store: orders, line items, customers, products and inventory.",
      served: thelookServed,
   },
];

export function timeAgo(iso: string, short = false): string {
   const diff = Date.now() - new Date(iso).getTime();
   const minutes = Math.floor(diff / 60000);
   const suffix = short ? "" : " ago";
   if (minutes < 1) return short ? "now" : "just now";
   if (minutes < 60) return `${minutes}m${suffix}`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h${suffix}`;
   return `${Math.floor(hours / 24)}d${suffix}`;
}
