// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The rules every page in public/ is meant to share, checked against all of
// them at once rather than against whichever page a bug surfaced through.
//
// Three of these are source-shape checks and say so: they read the files as
// text. The last two mount the shared DOM helpers in happy-dom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Window } from "happy-dom";

const ROOT = new URL("../", import.meta.url);
const APP = new URL("public/app/", ROOT);
const read = (url) => readFile(url, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const appFiles = (await readdir(APP)).filter((f) => f.endsWith(".js"));
const sources = Object.fromEntries(await Promise.all(appFiles.map(async (f) => [f, stripComments(await read(new URL(f, APP)))])));

test("no page builds markup from strings", () => {
   for (const [file, src] of Object.entries(sources)) {
      assert.doesNotMatch(src, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/, file);
   }
});

test("no colour is written in script: charts read the stylesheet's tokens", () => {
   for (const [file, src] of Object.entries(sources)) {
      assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b(?![\w-])/, `${file} carries a hex colour`);
      assert.doesNotMatch(src, /\brgba?\(/, `${file} carries an rgb() colour`);
   }
});

// The token blocks are the leading :root rules: light, dark, and the host's.
const tokenBlocksEnd = (css) => {
   let end = 0;
   for (const m of css.matchAll(/:root[^{]*\{[^}]*\}/g)) end = m.index + m[0].length;
   return end;
};

test("the stylesheet keeps raw colours and font sizes inside its token blocks", async () => {
   const css = await read(new URL("style.css", APP));
   const after = css.slice(tokenBlocksEnd(css)).replace(/\/\*[\s\S]*?\*\//g, "");
   assert.doesNotMatch(after, /#[0-9a-fA-F]{3,8}\b/, "a hex colour outside :root");
   assert.doesNotMatch(after, /\brgba?\(/, "an rgb() colour outside :root");
   assert.doesNotMatch(after, /font-size:\s*\d/, "a raw font-size outside the type scale");
});

test("the stylesheet draws in light, dark, and a host's theme", async () => {
   const css = await read(new URL("style.css", APP));
   assert.match(css, /:root\[data-theme="dark"\]\s*\{/, "a dark palette");
   assert.match(css, /:root\[data-theme-source="host"\]\s*\{[^}]*var\(--publisher-background/, "the host's tokens map onto the page");
   for (const page of ["index.html", "ticker.html", "lab.html"]) {
      const html = await read(new URL(`public/${page}`, ROOT));
      assert.match(html, /<meta name="color-scheme" content="light dark"/, `${page} declares both schemes`);
   }
});

// Every `run: <source> -> <view>` a page sends must name a source and view the
// package declares, so renaming a view in the model fails here rather than as
// an error tile in the browser.
test("every query a page runs names a source and view the models declare", async () => {
   const models = await Promise.all(["market.malloy", "signals.malloy", "ticker_app.malloy", "lab_app.malloy"].map((f) => read(new URL(f, ROOT))));
   const text = models.join("\n");
   const sourcesDeclared = new Set([...text.matchAll(/^source:\s*(\w+)\s+is/gm)].map((m) => m[1]));
   const queriesDeclared = new Set([...text.matchAll(/^query:\s*(\w+)\s+is/gm)].map((m) => m[1]));
   const viewsDeclared = new Set([...text.matchAll(/^\s*view:\s*(\w+)\s+is/gm)].map((m) => m[1]));
   let checked = 0;
   for (const [file, src] of Object.entries(sources)) {
      for (const [, name, view] of src.matchAll(/run:\s*(\w+)(?:\s*->\s*(\w+|\{))?/g)) {
         checked++;
         if (view === undefined) {
            assert.ok(queriesDeclared.has(name), `${file}: query "${name}" is not declared`);
            continue;
         }
         assert.ok(sourcesDeclared.has(name), `${file}: source "${name}" is not declared`);
         if (view !== "{") assert.ok(viewsDeclared.has(view), `${file}: view "${view}" is not declared`);
      }
   }
   assert.ok(checked > 20, `found the pages' queries (${checked})`);
});

test("every page loads the runtime and the vendored chart library before its module", async () => {
   for (const page of ["index.html", "ticker.html", "lab.html"]) {
      const html = await read(new URL(`public/${page}`, ROOT));
      const at = (s) => html.indexOf(s);
      assert.ok(at('src="/sdk/publisher.js"') > 0, `${page} loads the runtime`);
      assert.ok(at('src="./vendor/chart.umd.js"') > at('src="/sdk/publisher.js"'), `${page} loads Chart.js`);
      assert.ok(at('type="module"') > at('src="./vendor/chart.umd.js"'), `${page} loads its module last`);
      assert.doesNotMatch(html, /https?:\/\/(?!localhost)/, `${page} reaches off the server`);
   }
});

const window = new Window({ url: "http://localhost/" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
const { h } = await import(new URL("dom.js", APP));
const { dataTable } = await import(new URL("table.js", APP));

const { niceTicks } = await import(new URL("charts.js", APP));

test("axis ticks land on round numbers inside a fitted range", () => {
   assert.deepEqual(niceTicks(293.35, 502.86, 6), [300, 350, 400, 450, 500]);
   assert.deepEqual(niceTicks(-2.4, 2.0, 6), [-2, -1, 0, 1, 2]);
   assert.deepEqual(niceTicks(0.44, 1.14, 6), [0.6, 0.8, 1]);
   assert.deepEqual(niceTicks(5, 5), [5]);
});

test("h() lands every value as text, so markup in data renders as text", () => {
   const el = h("div", { title: '"><img src=x>' }, "<b>bold</b>", null, false, ["a", h("i", { text: "<i>" })]);
   assert.equal(el.querySelector("b"), null);
   assert.equal(el.querySelector("img"), null);
   assert.equal(el.textContent, "<b>bold</b>a<i>");
   assert.equal(el.getAttribute("title"), '"><img src=x>');
});

test("the data table sorts, sinks missing values, and marks the sorted column", () => {
   const host = document.createElement("div");
   const rows = [
      { symbol: "AAPL", edge: 0.01 },
      { symbol: "NVDA", edge: null },
      { symbol: "TSLA", edge: 0.03 },
   ];
   dataTable(host, { rows, columns: [{ key: "symbol" }, { key: "edge", num: true }], sortKey: "edge" });
   const order = () => [...host.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent);
   assert.deepEqual(order(), ["TSLA", "AAPL", "NVDA"]);
   const [, edgeHead] = host.querySelectorAll("th");
   assert.equal(edgeHead.getAttribute("aria-sort"), "descending");
   edgeHead.click();
   assert.deepEqual(order(), ["AAPL", "TSLA", "NVDA"], "missing values sink in both directions");
});
