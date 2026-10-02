// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The top bar every page shares: the mark, the four pages, and a meta line.

import { h, s } from "./dom.js";

const PAGES = [
   { href: "./index.html", label: "Cheatsheet", id: "cheatsheet" },
   { href: "./leaders.html", label: "Leaders", id: "leaders" },
   { href: "./player.html", label: "Players", id: "player" },
   { href: "./teams.html", label: "Teams", id: "teams" },
];

/** A football with laces, drawn in the text colour. */
function mark() {
   return s(
      "svg",
      { width: 20, height: 20, viewBox: "0 0 20 20", "aria-hidden": "true" },
      s("ellipse", { cx: 10, cy: 10, rx: 8.5, ry: 5.6, transform: "rotate(-35 10 10)", fill: "var(--text)" }),
      s("path", { d: "M7.2 12.8 L12.8 7.2", stroke: "var(--panel)", "stroke-width": 1.2, "stroke-linecap": "round" }),
      s("path", {
         d: "M8.4 10.2 L9.8 11.6 M9.6 9 L11 10.4 M10.8 7.8 L12.2 9.2",
         stroke: "var(--panel)",
         "stroke-width": 1,
         "stroke-linecap": "round",
      }),
   );
}

/** Mount the bar; `setMeta` takes strings or nodes for the right-hand side. */
export function mountShell(current) {
   const metaHost = h("div", { class: "topbar-meta" });
   const bar = h(
      "header",
      { class: "topbar" },
      h("a", { class: "brand", href: "./index.html" }, mark(), "Questionable Football", h("small", { text: "Publisher" })),
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
         metaHost.replaceChildren(...items.map((item) => (item instanceof Node ? item : h("span", { text: item }))));
      },
   };
}

/** A segmented toggle: options [{ value, label }], the pressed one `current`. */
export function segmented(options, current, onPick, label) {
   const host = h("div", { class: "seg", role: "group", "aria-label": label });
   const paint = (value) => {
      for (const b of host.children) b.setAttribute("aria-pressed", String(b.dataset.value === String(value)));
   };
   for (const o of options) {
      host.append(
         h("button", {
            type: "button",
            text: o.label,
            dataset: { value: String(o.value) },
            onclick: () => {
               paint(o.value);
               onPick(o.value);
            },
         }),
      );
   }
   paint(current);
   return host;
}

/** Read and write page state in the URL, so every view is a link. */
export function urlState(defaults) {
   const params = new URLSearchParams(location.search);
   const state = { ...defaults };
   for (const key of Object.keys(defaults)) if (params.has(key)) state[key] = params.get(key);
   return {
      state,
      set(patch) {
         Object.assign(state, patch);
         const q = new URLSearchParams();
         for (const [k, v] of Object.entries(state)) if (v !== "" && v !== null && v !== undefined && String(v) !== String(defaults[k])) q.set(k, String(v));
         const qs = q.toString();
         history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
      },
   };
}
