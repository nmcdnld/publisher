// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A dense, sortable table in the site's rankings style.
//
// Columns are declared as data: `{ key, label?, num?, render?, sort? }`. A
// column with no `label` takes the model's `# label` for that field, and one
// with no `render` formats by the model's own annotation, so the defaults
// come from the package's models and a page only says what it does differently.

import { h } from "./dom.js";
import { DASH, formatAs } from "./format.js";

export function dataTable(host, { fields = [], rows, columns, sortKey, sortDir = "desc", onRow, selected, rowData }) {
   const byName = new Map(fields.map((f) => [f.name, f]));
   const cols = (columns ?? fields.map((f) => ({ key: f.name }))).map((c) => {
      const field = byName.get(c.key);
      return {
         ...c,
         label: c.label ?? field?.label ?? c.key,
         num: c.num ?? (field ? field.isAggregate || ["percent", "decimal", "signed", "id"].includes(field.format) : false),
         render: c.render ?? ((row) => formatAs(row[c.key], field?.format, field?.digits)),
         sortValue: c.sort ?? ((row) => row[c.key]),
      };
   });

   let key = sortKey;
   let dir = sortDir;

   const table = h("table", { class: "data" });
   const thead = h("thead");
   const tbody = h("tbody");
   table.append(thead, tbody);

   const ordered = () => {
      if (!key) return rows;
      const col = cols.find((c) => c.key === key);
      if (!col) return rows;
      const factor = dir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
         const va = col.sortValue(a);
         const vb = col.sortValue(b);
         // Missing values sink to the bottom in both directions.
         if (va === null || va === undefined) return 1;
         if (vb === null || vb === undefined) return -1;
         return (va > vb ? 1 : va < vb ? -1 : 0) * factor;
      });
   };

   function drawHead() {
      const tr = h("tr");
      for (const col of cols) {
         const th = h("th", {
            class: [col.num && "num", col.sortable !== false && "sortable"].filter(Boolean).join(" "),
            title: col.title,
            text: col.label,
         });
         if (col.key === key) th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
         if (col.sortable !== false) {
            th.addEventListener("click", () => {
               if (key === col.key) dir = dir === "asc" ? "desc" : "asc";
               else {
                  key = col.key;
                  dir = col.num ? "desc" : "asc";
               }
               drawHead();
               drawBody();
            });
         }
         tr.append(th);
      }
      thead.replaceChildren(tr);
   }

   function drawBody() {
      tbody.replaceChildren();
      for (const row of ordered()) {
         const tr = h("tr", { class: onRow ? "clickable" : undefined, dataset: rowData?.(row) });
         if (selected && selected(row)) tr.setAttribute("aria-selected", "true");
         if (onRow) tr.addEventListener("click", () => onRow(row));
         for (const col of cols) {
            const out = col.render(row);
            const td = h("td", { class: col.num ? "num" : undefined });
            if (out instanceof Node) td.append(out);
            else td.textContent = out ?? DASH;
            if (col.cellClass) {
               const extra = col.cellClass(row);
               if (extra) td.classList.add(extra);
            }
            tr.append(td);
         }
         tbody.append(tr);
      }
   }

   drawHead();
   drawBody();
   host.replaceChildren(table);
}
