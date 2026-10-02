// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The top bar every page shares: the mark, the three pages, and the as-of line.

import { h, s } from "./dom.js";

const PAGES = [
   { href: "./index.html", label: "Screener", id: "screener" },
   { href: "./ticker.html", label: "Ticker", id: "ticker" },
   { href: "./lab.html", label: "Signal Lab", id: "lab" },
];

function mark() {
   return s(
      "svg",
      { class: "brand-mark", width: 22, height: 22, viewBox: "0 0 22 22", "aria-hidden": "true" },
      s("rect", { x: 1, y: 1, width: 20, height: 20, rx: 3, fill: "var(--text)" }),
      s("polyline", {
         points: "4,15 8,11 11,13 17,6",
         fill: "none",
         stroke: "var(--brand)",
         "stroke-width": 2,
         "stroke-linecap": "round",
         "stroke-linejoin": "round",
      }),
      s("circle", { cx: 17, cy: 6, r: 1.6, fill: "var(--brand)" }),
   );
}

/** Mount the bar; `meta` is a list of strings or nodes for the right-hand side. */
export function mountShell(current) {
   const metaHost = h("div", { class: "topbar-meta" });
   const bar = h(
      "header",
      { class: "topbar" },
      h("a", { class: "brand", href: "./index.html", style: { color: "var(--text)" } }, mark(), "Signals Research", h("small", { text: "Publisher" })),
      h(
         "nav",
         { class: "nav", "aria-label": "Pages" },
         PAGES.map((p) => h("a", { href: p.href, text: p.label, "aria-current": p.id === current ? "page" : undefined })),
      ),
      metaHost,
   );
   document.body.prepend(bar);
   return {
      setMeta(items) {
         metaHost.replaceChildren(...items.map((item) => (item instanceof Node ? item : h("span", { class: "pill", text: item }))));
      },
   };
}
