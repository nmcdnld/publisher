// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { AlertTriangleIcon } from "lucide-react";
import { errorMessage } from "../../../ontology/useOntology";
import type { Entity, Ontology } from "../../../ontology/types";

export type Row = Record<string, unknown>;

/** A source's fields, its own first, then those of each source it extends. */
export function sourceFields(ontology: Ontology, source: Entity): Entity[] {
   const seen = new Set<string>();
   const names = new Set<string>();
   const fields: Entity[] = [];
   let current: Entity | undefined = source;
   while (current && !seen.has(current.id)) {
      seen.add(current.id);
      for (const id of current.fieldIds ?? []) {
         const field = ontology.entities.get(id);
         if (field && !names.has(field.name)) {
            names.add(field.name);
            fields.push(field);
         }
      }
      current = current.extendsId
         ? ontology.entities.get(current.extendsId)
         : undefined;
   }
   return fields;
}

export function timeDimension(
   ontology: Ontology,
   source: Entity,
): Entity | undefined {
   const candidates = sourceFields(ontology, source).filter(
      (f) =>
         f.kind === "dimension" &&
         (f.dataType === "date" || f.dataType === "timestamp"),
   );
   return (
      candidates.find((c) => /creat|order|date|day|time/i.test(c.name)) ??
      candidates[0]
   );
}

export function isPercent(tags: string[] = []): boolean {
   return tags.some((t) => /^#\s*percent\b/.test(t));
}

export function formatValue(
   value: unknown,
   tags: string[] = [],
   compact = false,
): string {
   if (value === null || value === undefined) return "∅";
   if (typeof value === "number") {
      if (isPercent(tags)) {
         return value.toLocaleString(undefined, {
            style: "percent",
            maximumFractionDigits: 1,
         });
      }
      const notation =
         compact && Math.abs(value) >= 10_000 ? "compact" : undefined;
      if (tags.some((t) => /^#\s*currency\b/.test(t))) {
         return value.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            notation,
            maximumFractionDigits: notation
               ? 1
               : Math.abs(value) >= 1000
                 ? 0
                 : 2,
         });
      }
      if (notation) {
         return value.toLocaleString(undefined, {
            notation,
            maximumFractionDigits: 1,
         });
      }
      return Math.abs(value) >= 1000
         ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
         : value.toLocaleString(undefined, {
              maximumFractionDigits: compact ? 2 : 3,
           });
   }
   if (Array.isArray(value)) return `${value.length} nested rows`;
   if (typeof value === "object") return JSON.stringify(value);
   const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?Z$/.exec(
      String(value),
   );
   if (iso) return iso[2].startsWith("00:00") ? iso[1] : `${iso[1]} ${iso[2]}`;
   return String(value);
}

export function MalloyBehind({ text }: { text: string }) {
   return (
      <details className="group">
         <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Malloy behind this panel
         </summary>
         <pre className="mt-2 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {text}
         </pre>
      </details>
   );
}

export function QueryError({ error }: { error: unknown }) {
   return (
      <div className="flex items-start gap-2 rounded-md border border-partial/40 bg-partial/10 px-3 py-2 text-xs">
         <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-partial" />
         <span className="min-w-0 break-words">{errorMessage(error)}</span>
      </div>
   );
}
