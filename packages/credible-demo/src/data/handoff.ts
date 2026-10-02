// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { PublishRequest } from "@malloy-publisher/sdk";
import { workspaceConsoleUrl } from "./publisher";
import type { Evidence, Provenance, ValueFormat } from "./types";

/**
 * What the Publisher Console's Publish button sends, in `/publish#draft=…`.
 * The Console declares the same shape in
 * `packages/app/src/components/publish/destinationDraft.ts`.
 */
export interface DestinationDraft {
   version: 1;
   kind: "query" | "dashboard";
   title: string;
   description: string;
   provenance: Provenance;
   malloy?: string;
   givens?: Record<string, unknown>;
   result?: {
      columns: {
         name: string;
         label?: string;
         type: "string" | "number" | "date" | "boolean" | "other";
         format?: "currency" | "percent";
      }[];
      rows: Record<string, string | number | boolean | null>[];
      totalRows: number;
   };
   publisherUrl: string;
   preparedAt: string;
}

function fromBase64Url(text: string): string {
   const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
   const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
   return new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
   );
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

/** This app's review page for a draft, the same URL the Console opens. */
export const draftRoute = (draft: DestinationDraft) =>
   `/publish#draft=${toBase64Url(JSON.stringify(draft))}`;

const humanize = (name: string) =>
   name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * A draft for content published from Publisher embedded in this app, built
 * the way the Console builds one so the review page cannot tell them apart.
 */
export function draftFromRequest(request: PublishRequest): DestinationDraft {
   const base = {
      version: 1 as const,
      givens:
         request.givens && Object.keys(request.givens).length > 0
            ? request.givens
            : undefined,
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
         publisherUrl: workspaceConsoleUrl(
            request.packageName,
            "dashboard",
            request.dashboardName,
            base.givens,
            request.environmentName,
         ),
      };
   }
   const view = request.malloy.match(/->\s*([A-Za-z_]\w*)\s*$/)?.[1];
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
      publisherUrl: workspaceConsoleUrl(
         request.packageName,
         "query",
         request.modelPath,
         undefined,
         request.environmentName,
      ),
   };
}

export type DraftRead =
   | { ok: true; draft: DestinationDraft }
   | { ok: false; reason: string };

export function readDraft(hash: string): DraftRead {
   const encoded = new URLSearchParams(hash.replace(/^#/, "")).get("draft");
   if (!encoded) return { ok: false, reason: "missing" };
   try {
      const draft = JSON.parse(fromBase64Url(encoded)) as DestinationDraft;
      if (draft?.version !== 1) {
         return {
            ok: false,
            reason: `This link was prepared by a Publisher this app doesn't understand (version ${String(draft?.version)}).`,
         };
      }
      return { ok: true, draft };
   } catch {
      return {
         ok: false,
         reason:
            "This link is damaged: it may have been cut off when it was copied.",
      };
   }
}

const MAX_SERIES = 4;
const MAX_POINTS = 60;

/**
 * A chart for the draft's rows: the first text or date column along the axis
 * and up to four numeric columns as series. A single row of measures, which
 * has no axis, becomes one bar per measure.
 */
export function draftEvidence(draft: DestinationDraft): Evidence | undefined {
   const result = draft.result;
   if (!result || result.rows.length === 0) return undefined;
   const numeric = result.columns.filter((c) => c.type === "number");
   if (numeric.length === 0) return undefined;
   const axis = result.columns.find(
      (c) => c.type === "date" || c.type === "string",
   );
   const series = numeric.slice(0, MAX_SERIES);
   const format: ValueFormat = series[0].format ?? "number";
   const label = (c: { name: string; label?: string }) => c.label ?? c.name;

   if (!axis) {
      const row = result.rows[0];
      return {
         kind: "bar",
         xKey: "measure",
         series: [{ key: "value", label: "Value" }],
         rows: numeric.map((c) => ({
            measure: label(c),
            value: Number(row[c.name] ?? 0),
         })),
         format,
      };
   }

   const tick = (value: unknown) => {
      if (axis.type !== "date" || typeof value !== "string") {
         return String(value ?? "∅");
      }
      const d = new Date(value);
      return Number.isNaN(d.getTime())
         ? value
         : d.toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit",
              timeZone: "UTC",
           });
   };
   return {
      kind: axis.type === "date" ? "line" : "bar",
      xKey: axis.name,
      series: series.map((c) => ({ key: c.name, label: label(c) })),
      rows: result.rows.slice(0, MAX_POINTS).map((r) => ({
         [axis.name]: tick(r[axis.name]),
         ...Object.fromEntries(
            series.map((c) => [c.name, Number(r[c.name] ?? 0)]),
         ),
      })),
      format,
      caption:
         result.rows.length > MAX_POINTS
            ? `First ${MAX_POINTS} of ${result.totalRows.toLocaleString()} rows`
            : undefined,
   };
}
