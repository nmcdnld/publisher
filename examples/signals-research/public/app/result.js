// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Reading a Malloy result envelope into `{ fields, rows }`.
//
// The pages call `Publisher.queryFull` rather than `Publisher.query` because
// the envelope carries each field's annotations, which is where the model says
// what a column is called (`# label`) and how it reads (`# percent`,
// `# currency`, `# number`). A table built from these takes its headings from
// signals.malloy, so relabelling a field there relabels every page.

function cellValue(cell) {
   if (!cell || typeof cell !== "object") return null;
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

const texts = (field) => (field.annotations ?? []).map((a) => String(a.value ?? ""));

function readLabel(lines) {
   for (const line of lines) {
      const match = /^#\s+label\s*=\s*"([^"]*)"/.exec(line);
      if (match) return match[1];
   }
   return undefined;
}

function readFormat(lines, field) {
   for (const line of lines) {
      if (/^#\s+currency\b/.test(line)) return "currency";
      if (/^#\s+percent\b/.test(line)) return "percent";
      if (/^#\s+number\s*=/.test(line)) return "decimal";
   }
   const kind = field.type?.kind;
   if (kind === "date_type" || kind === "timestamp_type") return "date";
   return undefined;
}

export function readResult(envelope) {
   const fields = (envelope?.schema?.fields ?? []).map((field) => {
      const lines = texts(field);
      return {
         name: field.name,
         label: readLabel(lines) ?? field.name,
         format: readFormat(lines, field),
         isAggregate: lines.some((t) => /^#\(malloy\)[^\n]*\bcalculation\b/.test(t)),
      };
   });
   const rows = (envelope?.data?.array_value ?? []).map((record) => {
      const cells = record.record_value ?? [];
      const row = {};
      fields.forEach((field, i) => {
         row[field.name] = cellValue(cells[i]);
      });
      return row;
   });
   return { fields, rows };
}
