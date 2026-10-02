// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Reading a Malloy result envelope into `{ fields, rows }`.
//
// The pages call `Publisher.queryFull` rather than `Publisher.query` because
// the envelope carries each field's annotations, which is where the model says
// what a column is called (`# label`) and how it reads (`# percent`,
// `# number`). A table built from these takes its headings from the models,
// so relabelling a field there relabels every page.
//
// A nested view (`nest:`) arrives as an array cell of records; it is read into
// an array of plain row objects with the same rules, so `row.by_week` is a
// list a sparkline can draw.

const texts = (field) => (field.annotations ?? []).map((a) => String(a.value ?? ""));

function readLabel(lines) {
   for (const line of lines) {
      const match = /^#\s+label\s*=\s*"([^"]*)"/.exec(line);
      if (match) return match[1];
   }
   return undefined;
}

function readFormat(lines, type) {
   for (const line of lines) {
      if (/^#\s+percent\b/.test(line)) return "percent";
      if (/^#\s+number\s*=\s*id\b/.test(line)) return "id";
      const fixed = /^#\s+number\s*=\s*"([^"]*)"/.exec(line);
      if (fixed) return fixed[1].startsWith("+") ? "signed" : "decimal";
   }
   const kind = type?.kind;
   if (kind === "date_type" || kind === "timestamp_type") return "date";
   return undefined;
}

/** "0.0" -> 1, "#,##0" -> 0, "+0.0;-0.0" -> 1: the digits a `# number` asks for. */
function readDigits(lines) {
   for (const line of lines) {
      const fixed = /^#\s+number\s*=\s*"([^";]*)/.exec(line);
      if (fixed) {
         const dot = fixed[1].indexOf(".");
         return dot < 0 ? 0 : fixed[1].length - dot - 1;
      }
   }
   return undefined;
}

function readFields(schemaFields) {
   return (schemaFields ?? []).map((field) => {
      const lines = texts(field);
      const nested = field.type?.kind === "array_type" && field.type.element_type?.kind === "record_type";
      return {
         name: field.name,
         label: readLabel(lines) ?? field.name,
         format: readFormat(lines, field.type),
         digits: readDigits(lines),
         isAggregate: lines.some((t) => /^#\(malloy\)[^\n]*\bcalculation\b/.test(t)),
         children: nested ? readFields(field.type.element_type.fields) : undefined,
      };
   });
}

function cellValue(cell, field) {
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
      case "array_cell":
         return field?.children ? readRows(cell.array_value, field.children) : null;
      default:
         return null;
   }
}

function readRows(records, fields) {
   return (records ?? []).map((record) => {
      const cells = record.record_value ?? [];
      const row = {};
      fields.forEach((field, i) => {
         row[field.name] = cellValue(cells[i], field);
      });
      return row;
   });
}

export function readResult(envelope) {
   const fields = readFields(envelope?.schema?.fields);
   return { fields, rows: readRows(envelope?.data?.array_value, fields) };
}
