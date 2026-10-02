// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The rules every page in public/ is meant to share, checked against all of
// them at once rather than against whichever page a bug surfaced through.
//
// The first five are source-shape checks and say so: they read the files as
// text. The rest mount the shared DOM helpers in happy-dom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Window } from "happy-dom";

const ROOT = new URL("../", import.meta.url);
const APP = new URL("public/app/", ROOT);
const read = (url) => readFile(url, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const MODELS = ["football.malloy", "fantasy.malloy", "market.malloy", "player_app.malloy", "leaders_app.malloy", "team_app.malloy"];
const PAGES = ["index.html", "leaders.html", "player.html", "teams.html"];

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
   assert.doesNotMatch(after, /oklch\(/, "an oklch() colour outside :root");
   assert.doesNotMatch(after, /font-size:\s*\d/, "a raw font-size outside the type scale");
   assert.doesNotMatch(css, /color-mix\(in oklch/, "oklch mixes toward white drift the hue; mix in oklab");
});

test("the stylesheet draws in light, dark, and a host's theme", async () => {
   const css = await read(new URL("style.css", APP));
   assert.match(css, /:root\[data-theme="dark"\]\s*\{/, "a dark palette");
   assert.match(css, /:root\[data-theme-source="host"\]\s*\{[^}]*var\(--publisher-background/, "the host's tokens map onto the page");
   for (const page of PAGES) {
      const html = await read(new URL(`public/${page}`, ROOT));
      assert.match(html, /<meta name="color-scheme" content="light dark"/, `${page} declares both schemes`);
   }
});

// Every `run: <source> -> <view>` a page sends must name a source and view the
// package declares, so renaming a view in the model fails here rather than as
// an error tile in the browser.
test("every query a page runs names a source and view the models declare", async () => {
   const text = (await Promise.all(MODELS.map((f) => read(new URL(f, ROOT))))).join("\n");
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
   assert.ok(checked > 15, `found the pages' queries (${checked})`);
});

// A page's filter state reaches a query as a bound given, never spliced into
// the query text, so a crafted URL cannot change what runs.
test("no page interpolates a value into Malloy text", () => {
   for (const [file, src] of Object.entries(sources)) {
      assert.doesNotMatch(src, /`run:[^`]*\$\{/, `${file} builds a query from a template`);
   }
});

test("every page loads the runtime and the vendored chart library before its module", async () => {
   for (const page of PAGES) {
      const html = await read(new URL(`public/${page}`, ROOT));
      const at = (s) => html.indexOf(s);
      assert.ok(at('src="/sdk/publisher.js"') > 0, `${page} loads the runtime`);
      assert.ok(at('src="./vendor/chart.umd.js"') > at('src="/sdk/publisher.js"'), `${page} loads Chart.js`);
      assert.ok(at('type="module"') > at('src="./vendor/chart.umd.js"'), `${page} loads its module last`);
      assert.doesNotMatch(html, /https?:\/\/(?!localhost)/, `${page} reaches off the server`);
   }
});

test("every saved finding's queries name the models and views this package declares", async () => {
   const apps = new URL("public/apps/", ROOT);
   const slugs = await readdir(apps);
   assert.ok(slugs.length >= 2, "the package ships its saved findings");
   for (const slug of slugs) {
      const manifest = JSON.parse(await read(new URL(`${slug}/app.json`, apps)));
      for (const [id, q] of Object.entries(manifest.queries)) {
         const model = await read(new URL(q.model, ROOT));
         assert.match(model, new RegExp(`^source:\\s*${q.source}\\s+is`, "m"), `${slug}/${id}: source ${q.source}`);
         if (q.view) assert.match(model, new RegExp(`view:\\s*${q.view}\\s+is`), `${slug}/${id}: view ${q.view}`);
         assert.ok(manifest.snapshot.rows[id]?.length > 0, `${slug}/${id} carries snapshot rows`);
      }
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
const { readResult } = await import(new URL("result.js", APP));

test("axis ticks land on round numbers inside a fitted range", () => {
   assert.deepEqual(niceTicks(293.35, 502.86, 6), [300, 350, 400, 450, 500]);
   assert.deepEqual(niceTicks(0, 44.2, 5), [0, 20, 40]);
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
      { name: "Hurts", points: 308.6 },
      { name: "Rookie", points: null },
      { name: "Jackson", points: 414.28 },
   ];
   dataTable(host, { rows, columns: [{ key: "name" }, { key: "points", num: true }], sortKey: "points" });
   const order = () => [...host.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent);
   assert.deepEqual(order(), ["Jackson", "Hurts", "Rookie"]);
   const [, pointsHead] = host.querySelectorAll("th");
   assert.equal(pointsHead.getAttribute("aria-sort"), "descending");
   pointsHead.click();
   assert.deepEqual(order(), ["Hurts", "Jackson", "Rookie"], "missing values sink in both directions");
});

test("a result envelope reads into labelled fields and rows, nests included", () => {
   const envelope = {
      schema: {
         fields: [
            { name: "full_name", type: { kind: "string_type" }, annotations: [{ value: '# label="Player"\n' }] },
            { name: "hit_rate", type: { kind: "number_type" }, annotations: [{ value: "# percent\n" }] },
            { name: "vor", type: { kind: "number_type" }, annotations: [{ value: '# number="+0;-0"\n' }] },
            {
               name: "by_week",
               type: {
                  kind: "array_type",
                  element_type: { kind: "record_type", fields: [{ name: "game_week", type: { kind: "number_type" }, annotations: [{ value: "# number=id\n" }] }] },
               },
            },
         ],
      },
      data: {
         array_value: [
            {
               record_value: [
                  { kind: "string_cell", string_value: "Jalen Hurts" },
                  { kind: "number_cell", number_value: 0.5 },
                  { kind: "number_cell", number_value: 12 },
                  { kind: "array_cell", array_value: [{ record_value: [{ kind: "number_cell", number_value: 1 }] }] },
               ],
            },
         ],
      },
   };
   const { fields, rows } = readResult(envelope);
   assert.deepEqual(
      fields.map((f) => [f.name, f.label, f.format, f.digits]),
      [
         ["full_name", "Player", undefined, undefined],
         ["hit_rate", "hit_rate", "percent", undefined],
         ["vor", "vor", "signed", 0],
         ["by_week", "by_week", undefined, undefined],
      ],
   );
   assert.equal(fields[3].children[0].format, "id");
   assert.deepEqual(rows, [{ full_name: "Jalen Hurts", hit_rate: 0.5, vor: 12, by_week: [{ game_week: 1 }] }]);
});
