// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Runs every query a manifest reads, and falls back to the rows it was
// written against when one fails. Live numbers, pinned prose: the charts and
// tables are live whenever they can be; the sentences are as written.

import type { Row } from "../analyst/schema";
import type { AppManifest, ManifestColumn, ManifestQuery } from "../schema";

export interface Table {
   columns: ManifestColumn[];
   rows: Row[];
}

export type RunQuery = (query: ManifestQuery) => Promise<Row[]>;

export interface Loaded {
   tables: Record<string, Table>;
   /** Queries whose live rows are not shown, with why; their tables are the snapshot's. */
   failed: Record<string, string>;
}

/**
 * The columns the finding was written against that live rows lack. A model
 * that changed what a view returns would otherwise draw an empty chart as if
 * it were the live answer.
 */
function missingColumns(
   columns: { name: string }[] | undefined,
   rows: Row[],
): string[] {
   if (!columns || rows.length === 0) return [];
   const live = new Set(rows.flatMap((r) => Object.keys(r)));
   return columns.map((c) => c.name).filter((name) => !live.has(name));
}

export async function loadTables(
   m: AppManifest,
   run: RunQuery,
): Promise<Loaded> {
   const tables: Record<string, Table> = {};
   const failed: Record<string, string> = {};
   for (const [id, rows] of Object.entries(m.snapshot.rows)) {
      tables[id] = { columns: m.snapshot.columns[id], rows };
   }
   await Promise.all(
      Object.entries(m.queries).map(async ([id, q]) => {
         try {
            const rows = await run(q);
            if (rows.length === 0 && (m.snapshot.rows[id]?.length ?? 0) > 0) {
               failed[id] = "it returns no rows now";
               return;
            }
            const missing = missingColumns(m.snapshot.columns[id], rows);
            if (missing.length) {
               failed[id] =
                  `it no longer returns ${missing.map((c) => `\`${c}\``).join(", ")}`;
               return;
            }
            tables[id] = { columns: m.snapshot.columns[id], rows };
         } catch (e) {
            failed[id] = e instanceof Error ? e.message : String(e);
         }
      }),
   );
   return { tables, failed };
}
