// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { PublishRequest, PublishTable } from "@malloy-publisher/sdk";

/**
 * Where Publish sends content. Unset in a production build, which hides every
 * Publish button: the Console ships to people who have no destination app.
 */
export const DESTINATION_URL: string | undefined =
   import.meta.env.VITE_DESTINATION_URL ??
   (import.meta.env.DEV ? "http://localhost:5180" : undefined);

/**
 * What the destination app receives, in its `/publish` URL's fragment. The
 * destination declares the same shape in `src/data/handoff.ts`; bump `version`
 * on any change either side would misread.
 */
export interface DestinationDraft {
   version: 1;
   kind: "query" | "dashboard";
   title: string;
   description: string;
   provenance: {
      environment: string;
      package: string;
      model: string;
      source: string;
      view?: string;
   };
   malloy?: string;
   givens?: Record<string, unknown>;
   result?: PublishTable;
   /** The Console page the content came from, so the destination can link back. */
   publisherUrl: string;
   preparedAt: string;
}

const humanize = (name: string) =>
   name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The last named view a query runs, when it ends in one: `order_items -> by_month`. */
function lastView(malloy: string): string | undefined {
   return malloy.match(/->\s*([A-Za-z_]\w*)\s*$/)?.[1];
}

export function draftFromRequest(
   request: PublishRequest,
   publisherUrl: string,
): DestinationDraft {
   const base = {
      version: 1 as const,
      givens:
         request.givens && Object.keys(request.givens).length > 0
            ? request.givens
            : undefined,
      publisherUrl,
      preparedAt: new Date().toISOString(),
   };
   if (request.kind === "dashboard") {
      return {
         ...base,
         kind: "dashboard",
         title: request.title ?? humanize(request.dashboardName),
         description: request.description ?? "",
         provenance: {
            environment: request.environmentName,
            package: request.packageName,
            model: request.modelPath,
            source: request.dashboardName,
         },
      };
   }
   const view = lastView(request.malloy);
   const { totalRows } = request.result;
   return {
      ...base,
      kind: "query",
      title: view ? humanize(view) : `${humanize(request.sourceName)} query`,
      description: `${totalRows.toLocaleString()} ${totalRows === 1 ? "row" : "rows"} from ${request.packageName} · ${request.sourceName}.`,
      provenance: {
         environment: request.environmentName,
         package: request.packageName,
         model: request.modelPath,
         source: request.sourceName,
         view,
      },
      malloy: request.malloy,
      result: request.result,
   };
}

function toBase64Url(text: string): string {
   let binary = "";
   for (const byte of new TextEncoder().encode(text)) {
      binary += String.fromCharCode(byte);
   }
   return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
}

/** The fragment keeps the payload out of server logs and off the wire entirely. */
export function destinationPublishUrl(
   destinationUrl: string,
   draft: DestinationDraft,
): string {
   return `${destinationUrl.replace(/\/$/, "")}/publish#draft=${toBase64Url(JSON.stringify(draft))}`;
}
