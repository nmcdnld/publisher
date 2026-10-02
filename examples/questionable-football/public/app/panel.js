// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A panel is one tile: the site's tiny mono header strip (a title, an
// optional coloured dot, a meta note), a body, and the query it is drawn
// from, shown in the header as `source -> view`. That source line names the
// view in the package's models to read for the definition of every number.
//
// Each panel loads, empties and fails on its own, so one bad query never
// blanks the page, and each load carries a generation number so a slow
// response from an earlier selection cannot paint over a newer one.

import { h } from "./dom.js";
import { readResult } from "./result.js";

// Panels whose last load drew, in draw order. Charts are painted with the
// colours in effect when they were drawn, so a new theme (the host switched
// light/dark or workspace palette) redraws each from the rows it already has.
const drawn = new Set();

window.addEventListener("publisher:theme", () => {
   for (const p of [...drawn]) {
      if (p.root.isConnected) p.redraw();
      else drawn.delete(p);
   }
});

/** Run one query and read the envelope. `givens` are bound, never interpolated. */
export async function run(model, query, givens) {
   const envelope = await Publisher.queryFull(model, query, givens ? { givens } : undefined);
   return readResult(envelope);
}

export function panel({ title, note, source, span = 12, flush = false, scroll = false, tools, height, dot }) {
   const titleEl = h("span", { class: "panel-title" }, dot ? h("span", { class: `dot ${dot}` }) : null, h("span", { text: title }));
   const noteEl = h("span", { class: "panel-note", text: note ?? "" });
   const sourceEl = h("span", { class: "panel-source", text: source ?? "", title: source ?? "" });
   const toolsEl = h("span", { class: "panel-tools" }, tools ?? []);
   const body = h("div", {
      class: ["panel-body", flush && "flush", scroll && "scroll"].filter(Boolean).join(" "),
      style: height ? { "max-height": height } : undefined,
   });
   const root = h(
      "section",
      { class: "panel", style: { "--span": String(span) } },
      h("header", { class: "panel-head" }, titleEl, noteEl, toolsEl, sourceEl),
      body,
   );

   let generation = 0;
   let replay = null;

   const status = (text) => {
      body.querySelector(":scope > .panel-status")?.remove();
      if (text) body.prepend(h("div", { class: "panel-status", text }));
   };

   const self = {
      root,
      body,
      redraw() {
         if (!replay) return;
         for (const canvas of body.querySelectorAll("canvas")) Chart.getChart(canvas)?.destroy();
         body.replaceChildren();
         replay();
      },
      setTitle: (text) => (titleEl.lastChild.textContent = text),
      setNote: (text) => (noteEl.textContent = text ?? ""),
      setSource: (text) => {
         sourceEl.textContent = text ?? "";
         sourceEl.title = text ?? "";
      },
      /**
       * Run `work` (a promise-returning function) and hand its result to
       * `draw`. A result that arrives after a newer load started is dropped.
       */
      async load(work, draw, { empty = "No rows match the current selection." } = {}) {
         const mine = ++generation;
         root.dataset.state = "loading";
         if (!body.firstChild) status("Loading…");
         try {
            const result = await work();
            if (mine !== generation) return;
            body.replaceChildren();
            const rows = result?.rows ?? result;
            drawn.delete(self);
            replay = null;
            if (Array.isArray(rows) && rows.length === 0) status(empty);
            else {
               draw(result);
               replay = () => draw(result);
               drawn.add(self);
            }
            delete root.dataset.state;
         } catch (error) {
            if (mine !== generation) return;
            console.error(title, error);
            drawn.delete(self);
            replay = null;
            body.replaceChildren(h("div", { class: "err", text: error?.message ?? String(error) }));
            root.dataset.state = "error";
         }
      },
   };
   return self;
}
