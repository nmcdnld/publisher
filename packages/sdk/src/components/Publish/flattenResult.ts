// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type * as Malloy from "@malloydata/malloy-interfaces";
import type { PublishColumn, PublishTable } from "./PublishContext";

export const PUBLISH_ROW_CAP = 500;

function columnType(type: Malloy.AtomicType): PublishColumn["type"] {
   switch (type.kind) {
      case "string_type":
         return "string";
      case "number_type":
         return "number";
      case "boolean_type":
         return "boolean";
      case "date_type":
      case "timestamp_type":
      case "timestamptz_type":
         return "date";
      default:
         return "other";
   }
}

function readTags(annotations: Malloy.Annotation[] | undefined) {
   let label: string | undefined;
   let format: PublishColumn["format"];
   for (const { value } of annotations ?? []) {
      const line = value.trim();
      if (!line.startsWith("# ")) continue;
      const labelMatch = line.match(/\blabel\s*=\s*"((?:[^"\\]|\\.)*)"/);
      if (labelMatch) label = labelMatch[1];
      if (/(^|\s)currency(\s|=|$)/.test(line.slice(1))) format = "currency";
      else if (/(^|\s)percent(\s|=|$)/.test(line.slice(1))) format = "percent";
   }
   return { label, format };
}

function cellValue(cell: Malloy.Cell): string | number | boolean | null {
   switch (cell.kind) {
      case "string_cell":
         return cell.string_value;
      case "number_cell":
         return cell.number_value;
      case "boolean_cell":
         return cell.boolean_value;
      case "date_cell":
         return cell.date_value;
      case "timestamp_cell":
         return cell.timestamp_value;
      default:
         return null;
   }
}

/**
 * The top level of a result as plain rows. Nested views have no flat form, so
 * their columns are dropped rather than stringified into something unreadable.
 */
export function flattenResult(
   result: Malloy.Result,
   cap = PUBLISH_ROW_CAP,
): PublishTable {
   const fields = result.schema.fields.flatMap((field, index) =>
      field.kind === "dimension" || field.kind === "measure"
         ? [{ field, index }]
         : [],
   );
   const columns = fields
      .map(({ field, index }) => {
         const { label, format } = readTags(field.annotations);
         const column: PublishColumn = {
            name: field.name,
            type: columnType(field.type),
            ...(label ? { label } : {}),
            ...(format ? { format } : {}),
         };
         return { index, column };
      })
      .filter(({ column }) => column.type !== "other");

   const records: Malloy.Cell[][] = [];
   const data = result.data;
   if (data?.kind === "record_cell") records.push(data.record_value);
   if (data?.kind === "array_cell") {
      for (const row of data.array_value) {
         if (row.kind === "record_cell") records.push(row.record_value);
      }
   }

   return {
      columns: columns.map(({ column }) => column),
      rows: records
         .slice(0, cap)
         .map((cells) =>
            Object.fromEntries(
               columns.map(({ index, column }) => [
                  column.name,
                  cells[index] ? cellValue(cells[index]) : null,
               ]),
            ),
         ),
      totalRows: records.length,
   };
}
