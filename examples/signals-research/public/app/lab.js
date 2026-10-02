// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The signal lab: does a signal actually lead anything?
//
// Brief. Who: the trader as researcher, before trusting a signal with money.
// The decision: which signals deserve a place in the process, on which names,
// in which market. What leads: the scorecard, every signal's verdict and its
// bias-signed edge over the same symbols' base rate. Depth: pick a row and
// the drill panel opens that one signal under the same population, so every
// number below is a slice of the row above it, down to the individual
// firings, each a link to its ticker page.
//
// State in the URL: `?signal=put_call_spike&universe=Equity&symbol=All&regime=Risk-on&since=2025-01-01`.
// Every control is a given bound by the server; nothing the URL carries is
// pasted into Malloy.

import { h, byId, color } from "./dom.js";
import { DASH, dayLabel, isoDay, monthLabel, num, pct, points, price, signedPct, tone } from "./format.js";
import { barChart } from "./charts.js";
import { mountShell } from "./shell.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";

const MODEL = "lab_app.malloy";
const EARLIEST = "2024-09-30";
const UNIVERSES = [
   ["All", "All"],
   ["Equity", "Stocks"],
   ["ETF", "ETFs"],
];
const REGIMES = [
   ["All", "All"],
   ["Risk-on", "Risk-on"],
   ["Risk-off", "Risk-off"],
];

const params = new URLSearchParams(location.search);
const pick = (options, value, fallback) => (options.some(([k]) => k === value) ? value : fallback);
const validDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v : EARLIEST);
const state = {
   signal: params.get("signal") || "put_call_spike",
   universe: pick(UNIVERSES, params.get("universe"), "All"),
   symbol: (params.get("symbol") || "All").toUpperCase() === "ALL" ? "All" : params.get("symbol").toUpperCase().slice(0, 12),
   regime: pick(REGIMES, params.get("regime"), "All"),
   since: validDay(params.get("since")),
};
function writeUrl() {
   const p = new URLSearchParams({ signal: state.signal });
   if (state.universe !== "All") p.set("universe", state.universe);
   if (state.symbol !== "All") p.set("symbol", state.symbol);
   if (state.regime !== "All") p.set("regime", state.regime);
   if (state.since !== EARLIEST) p.set("since", state.since);
   history.replaceState({}, "", `?${p}`);
}
const givens = () => ({ SIGNAL: state.signal, UNIVERSE: state.universe, SYMBOL: state.symbol, REGIME: state.regime, SINCE: state.since });
const tickerHref = (symbol) => `./ticker.html?symbol=${encodeURIComponent(symbol)}`;

function segmented(options, current, onPick) {
   const seg = h("div", { class: "seg", role: "group" });
   const paint = (value) => {
      for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.value === value));
   };
   for (const [value, label] of options) {
      seg.append(h("button", { type: "button", dataset: { value }, text: label, onclick: () => (paint(value), onPick(value)) }));
   }
   paint(current);
   return seg;
}
// A <label> only around a form control: wrapped round a button group it would
// make the whole caption click, and name, the group's first button.
const field = (label, control) => {
   if (control.matches("select, input")) return h("label", { class: "field" }, h("span", { text: label }), control);
   control.setAttribute("aria-label", label);
   return h("div", { class: "field" }, h("span", { text: label, "aria-hidden": "true" }), control);
};
const verdictBadge = (v) => h("span", { class: `badge ${String(v ?? "noise").toLowerCase()}`, text: v ?? DASH });
const biasMark = (bias) => h("span", { class: bias === "Bullish" ? "up" : "down", text: bias === "Bullish" ? "▲ " : "▼ " });
const signedPts = (v) => h("span", { class: tone(v), text: points(v) });

function edgeBar(v, scale) {
   const bar = h("span", { class: "inline-bar diverging", title: `${points(v)} pts` });
   if (typeof v === "number") {
      const w = Math.min(1, Math.abs(v) / scale) * 50;
      bar.append(h("i", { style: { left: v >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? "var(--up)" : "var(--down)" } }));
   }
   return bar;
}

// ── Panels ──────────────────────────────────────────────────────────────────

mountShell("lab").setMeta(["21 signals", "33 symbols", "event study"]);
const page = byId("page");

const symbolSelect = h("select", { "aria-label": "Symbol", onchange: (e) => setPopulation({ symbol: e.target.value }) }, h("option", { value: "All", text: "All symbols" }));
const sinceInput = h("input", { type: "date", value: state.since, min: EARLIEST, "aria-label": "Events since", onchange: (e) => setPopulation({ since: validDay(e.target.value) }) });
const controls = panel({ title: "Population", note: "who the scorecard counts", source: "lab_app.malloy givens" });
controls.body.append(
   h(
      "div",
      { class: "toolbar", style: { "margin-bottom": "0" } },
      field("Universe", segmented(UNIVERSES, state.universe, (v) => setPopulation({ universe: v }))),
      field("Symbol", symbolSelect),
      field("Market regime", segmented(REGIMES, state.regime, (v) => setPopulation({ regime: v }))),
      field("Events since", sinceInput),
      h("p", { class: "muted", style: { margin: "0", "max-width": "46ch" } }, "Risk-on means SPY closed above its 200-day average on the session the signal fired; the regime is known only from Jul 18, 2025, and SPY spent just 13 sessions below it, so Risk-off cells are thin. Edge is against the same symbols' return over every session."),
   ),
);

const kpiPanel = panel({ title: "Scorecard summary", source: "lab_events -> scorecard", flush: true });
const scorePanel = panel({ title: "Scorecard", note: "click a signal to drill in", source: "lab_events -> scorecard", span: 8, flush: true, scroll: true, height: "620px" });
const edgePanel = panel({ title: "Bias edge, 5 sessions", note: "pts · right = worked", source: "lab_events -> scorecard", span: 4 });
const drillPanel = panel({ title: "Signal", source: "lab_signal -> summary + signal_definitions", flush: true });
const distPanel = panel({ title: "5-session returns after", note: "2-point buckets", source: "lab_signal -> fwd_5d_distribution", span: 4 });
const symbolPanel = panel({ title: "By symbol", source: "lab_signal -> edge_by_symbol", span: 4, flush: true, scroll: true, height: "260px" });
const regimePanel = panel({ title: "By market regime", source: "lab_signal -> scorecard_by_regime", span: 4, flush: true });
const monthPanel = panel({ title: "Edge by month", note: "steady, or one lucky month?", source: "lab_signal -> edge_by_month", span: 6 });
const logPanel = panel({ title: "Firings", note: "newest first · click for the chart", source: "lab_signal -> event_log", span: 6, flush: true, scroll: true, height: "300px" });

page.append(controls.root, kpiPanel.root, scorePanel.root, edgePanel.root, drillPanel.root, distPanel.root, symbolPanel.root, regimePanel.root, monthPanel.root, logPanel.root);

// ── Population: scorecard, summary, edge chart ──────────────────────────────

let scorecard = { rows: [], fields: [] };

function drawKpis() {
   const rows = scorecard.rows;
   const holds = rows.filter((r) => r.verdict_5d === "Holds");
   const inverts = rows.filter((r) => r.verdict_5d === "Inverts");
   const events = rows.reduce((n, r) => n + (r.event_count ?? 0), 0);
   const tested = rows.filter((r) => r.verdict_5d !== "Thin");
   const best = [...tested].sort((a, b) => (b.bias_edge_5d ?? -Infinity) - (a.bias_edge_5d ?? -Infinity))[0];
   const kpi = (label, value, sub, cls = "") =>
      h("div", { class: "kpi" }, h("div", { class: "kpi-label", text: label }), h("div", { class: `kpi-value ${cls}`, text: value }), h("div", { class: "kpi-sub", text: sub }));
   kpiPanel.body.replaceChildren(
      h(
         "div",
         { class: "kpis", style: { "--cols": "5" } },
         kpi("Signals that hold", String(holds.length), holds.map((r) => r.signal).join(", ") || "none at |t| ≥ 2", "lead up"),
         kpi("Signals that invert", String(inverts.length), inverts.map((r) => r.signal).join(", ") || "none at |t| ≥ 2", inverts.length ? "lead down" : "lead"),
         kpi("Best tested edge", best ? points(best.bias_edge_5d) : DASH, best ? `${best.signal}, ${best.event_count} events` : "", tone(best?.bias_edge_5d)),
         kpi("Events counted", events.toLocaleString("en-US"), `${tested.length} of ${rows.length} signals have 20+`),
         kpi("Population", state.symbol !== "All" ? state.symbol : UNIVERSES.find(([k]) => k === state.universe)[1], `${state.regime === "All" ? "any regime" : state.regime} · since ${dayLabel(state.since)}`),
      ),
   );
}

function drawScorecard() {
   const scale = Math.max(0.01, ...scorecard.rows.map((r) => Math.abs(r.bias_edge_5d ?? 0)));
   dataTable(scorePanel.body, {
      ...scorecard,
      sortKey: "bias_edge_5d",
      selected: (r) => r.signal_id === state.signal,
      rowData: (r) => ({ signal: r.signal_id }),
      columns: [
         { key: "signal", render: (r) => h("span", {}, biasMark(r.bias), r.signal) },
         { key: "family" },
         { key: "style" },
         { key: "verdict_5d", label: "Verdict", render: (r) => verdictBadge(r.verdict_5d), sort: (r) => ({ Holds: 3, Inverts: 2, Noise: 1, Thin: 0 })[r.verdict_5d] ?? 0 },
         { key: "event_count", label: "N", num: true },
         { key: "symbol_count", label: "Syms", num: true },
         { key: "hit_rate_5d", label: "Hit 5d", num: true, title: "Share of firings followed by a five-session gain", render: (r) => h("span", {}, pct(r.hit_rate_5d, 0), h("span", { class: "muted", text: ` / ${pct(r.base_hit_rate_5d, 0)}` })) },
         { key: "bias_edge_5d", label: "Bias edge 5d", num: true, title: "Five-session edge over base, signed by the signal's bias, in points", render: (r) => h("span", {}, edgeBar(r.bias_edge_5d, scale), " ", signedPts(r.bias_edge_5d)) },
         { key: "edge_t_5d", label: "t 5d", num: true, render: (r) => h("span", { class: Math.abs(r.edge_t_5d ?? 0) >= 2 ? "" : "muted", text: num(r.edge_t_5d, 1) }) },
         { key: "edge_20d", label: "Edge 20d", num: true, render: (r) => signedPts(r.edge_20d) },
         { key: "edge_t_20d", label: "t 20d", num: true, render: (r) => h("span", { class: Math.abs(r.edge_t_20d ?? 0) >= 2 ? "" : "muted", text: num(r.edge_t_20d, 1) }) },
      ],
      onRow: (r) => selectSignal(r.signal_id),
   });
}

function drawEdgeChart() {
   const rows = [...scorecard.rows].sort((a, b) => (b.bias_edge_5d ?? 0) - (a.bias_edge_5d ?? 0));
   const box = h("div", { class: "chart", style: { "--h": `${Math.max(240, rows.length * 24)}px` } }, h("canvas"));
   edgePanel.body.replaceChildren(box);
   barChart(box.firstChild, {
      labels: rows.map((r) => r.signal),
      values: rows.map((r) => (r.bias_edge_5d ?? 0) * 100),
      colors: rows.map((r) => {
         if (r.verdict_5d === "Thin") return color("--border-strong");
         return (r.bias_edge_5d ?? 0) >= 0 ? color(r.verdict_5d === "Holds" ? "--up" : "--up-soft") : color(r.verdict_5d === "Inverts" ? "--down" : "--down-soft");
      }),
      format: (v) => `${v > 0 ? "+" : ""}${num(v, 2)} pts`,
      axisFormat: (v) => num(v, 1),
      horizontal: true,
      onClick: (i) => selectSignal(rows[i].signal_id),
   });
}

function markSelected() {
   for (const tr of scorePanel.body.querySelectorAll("tbody tr")) tr.setAttribute("aria-selected", String(tr.dataset.signal === state.signal));
}

// ── Drill: one signal ───────────────────────────────────────────────────────

function drawDrill({ summary, profile }) {
   const s = summary.rows[0] ?? {};
   const p = profile.rows[0] ?? {};
   drillPanel.setTitle(p.signal ?? state.signal);
   const kpi = (label, value, sub, cls = "") =>
      h("div", { class: "kpi" }, h("div", { class: "kpi-label", text: label }), h("div", { class: `kpi-value ${cls}`, text: value }), h("div", { class: "kpi-sub", text: sub }));
   drillPanel.body.replaceChildren(
      h(
         "div",
         { class: "quote", style: { "align-items": "center" } },
         h("div", {}, verdictBadge(s.verdict_5d)),
         h(
            "div",
            { class: "definition", style: { flex: "1" } },
            h("b", {}, biasMark(p.bias), `${p.bias ?? ""} · ${p.family ?? ""} · ${p.style ?? ""}. `),
            p.definition ?? "",
         ),
      ),
      h(
         "div",
         { class: "kpis", style: { "--cols": "6" } },
         kpi("Bias edge 5d", points(s.bias_edge_5d), `t = ${num(s.edge_t_5d, 2)}`, `lead ${tone(s.bias_edge_5d)}`),
         kpi("Firings", String(s.event_count ?? 0), `on ${s.symbol_count ?? 0} symbols`),
         kpi("Hit rate 5d", pct(s.hit_rate_5d, 1), `base ${pct(s.base_hit_rate_5d, 1)}`),
         kpi("Avg return 5d", signedPct(s.avg_fwd_5d, 2), `base ${signedPct(s.base_fwd_5d, 2)}`, tone(s.avg_fwd_5d)),
         kpi("Edge 1d", points(s.edge_1d), "next session, vs base", tone(s.edge_1d)),
         kpi("Edge 20d", points(s.edge_20d), `t = ${num(s.edge_t_20d, 2)}`, tone(s.edge_20d)),
      ),
   );
}

function drawDistribution({ rows }) {
   const box = h("div", { class: "chart", style: { "--h": "220px" } }, h("canvas"));
   distPanel.body.replaceChildren(box);
   const label = (b) => `${b > 0 ? "+" : b < 0 ? "−" : ""}${Math.abs(b)}%`;
   barChart(box.firstChild, {
      labels: rows.map((r) => label(r.fwd_5d_bucket)),
      values: rows.map((r) => r.event_count),
      colors: rows.map((r) => (r.fwd_5d_bucket >= 0 ? color("--up") : color("--down"))),
      format: (v) => `${v} firings`,
      axisFormat: (v) => num(v, 0),
   });
}

function drawBySymbol(result) {
   dataTable(symbolPanel.body, {
      ...result,
      sortKey: "edge_5d",
      columns: [
         { key: "symbol", render: (r) => h("a", { class: "ticker", href: tickerHref(r.symbol), text: r.symbol, onclick: (e) => e.stopPropagation() }) },
         { key: "event_count", label: "N", num: true },
         { key: "hit_rate_5d", label: "Hit 5d", num: true, render: (r) => pct(r.hit_rate_5d, 0) },
         { key: "edge_5d", label: "Edge 5d", num: true, render: (r) => signedPts(r.edge_5d) },
         { key: "edge_20d", label: "Edge 20d", num: true, render: (r) => signedPts(r.edge_20d) },
      ],
      onRow: (r) => setPopulation({ symbol: r.symbol }),
   });
}

function drawByRegime(result) {
   dataTable(regimePanel.body, {
      ...result,
      sortKey: "market_regime",
      sortDir: "asc",
      columns: [
         { key: "market_regime", label: "Regime" },
         { key: "event_count", label: "N", num: true },
         { key: "hit_rate_5d", label: "Hit 5d", num: true, render: (r) => pct(r.hit_rate_5d, 0) },
         { key: "edge_5d", label: "Edge 5d", num: true, render: (r) => signedPts(r.edge_5d) },
         { key: "edge_20d", label: "Edge 20d", num: true, render: (r) => signedPts(r.edge_20d) },
      ],
   });
}

function drawByMonth({ rows }) {
   const box = h("div", { class: "chart", style: { "--h": "220px" } }, h("canvas"));
   monthPanel.body.replaceChildren(box);
   barChart(box.firstChild, {
      labels: rows.map((r) => isoDay(r.event_month)),
      values: rows.map((r) => (r.edge_5d ?? 0) * 100),
      colors: rows.map((r) => ((r.edge_5d ?? 0) >= 0 ? color("--up") : color("--down"))),
      format: (v) => `${v > 0 ? "+" : ""}${num(v, 2)} pts`,
      axisFormat: (v) => num(v, 0),
      tickLabel: (d) => monthLabel(d).replace(/ (\d{2})(\d{2})$/, " ’$2"),
   });
}

function drawLog(result) {
   const ret = (key) => ({ key, num: true, render: (r) => h("span", { class: tone(r[key]), text: signedPct(r[key]) }) });
   dataTable(logPanel.body, {
      ...result,
      sortKey: "session_date",
      columns: [
         { key: "session_date", label: "Session", render: (r) => dayLabel(r.session_date), sort: (r) => isoDay(r.session_date) },
         { key: "symbol", render: (r) => h("a", { class: "ticker", href: tickerHref(r.symbol), text: r.symbol, onclick: (e) => e.stopPropagation() }) },
         { key: "close", num: true, render: (r) => price(r.close) },
         ret("fwd_return_1d"),
         ret("fwd_return_5d"),
         ret("fwd_return_20d"),
         { key: "excess_return_5d", label: "vs base 5d", num: true, render: (r) => signedPts(r.excess_return_5d) },
      ],
      onRow: (r) => (location.href = tickerHref(r.symbol)),
   });
}

// ── Loading ─────────────────────────────────────────────────────────────────

function loadPopulation() {
   const scoreP = run(MODEL, "run: lab_events -> scorecard", givens()).then((r) => (scorecard = r));
   kpiPanel.load(() => scoreP, drawKpis, { empty: "No signal fired in this population." });
   scorePanel.load(() => scoreP, drawScorecard, { empty: "No signal fired in this population." });
   edgePanel.load(() => scoreP, drawEdgeChart, { empty: "No signal fired in this population." });
}

let definitionsP;

function loadDrill() {
   const g = givens();
   const none = "This signal never fired in the current population.";
   drillPanel.load(
      async () => {
         const [summary, definitions] = await Promise.all([run(MODEL, "run: lab_signal -> summary", g), (definitionsP ??= run("signals.malloy", "run: signal_definitions"))]);
         return { summary, profile: { rows: definitions.rows.filter((r) => r.signal_id === state.signal) } };
      },
      drawDrill,
   );
   distPanel.load(() => run(MODEL, "run: lab_signal -> fwd_5d_distribution", g), drawDistribution, { empty: none });
   symbolPanel.load(() => run(MODEL, "run: lab_signal -> edge_by_symbol", g), drawBySymbol, { empty: none });
   regimePanel.load(() => run(MODEL, "run: lab_signal -> scorecard_by_regime", g), drawByRegime, { empty: none });
   monthPanel.load(() => run(MODEL, "run: lab_signal -> edge_by_month", g), drawByMonth, { empty: none });
   logPanel.load(() => run(MODEL, "run: lab_signal -> event_log", g), drawLog, { empty: none });
}

function selectSignal(signalId) {
   state.signal = signalId;
   writeUrl();
   markSelected();
   loadDrill();
   drillPanel.root.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setPopulation(change) {
   Object.assign(state, change);
   if (change.symbol !== undefined) symbolSelect.value = state.symbol;
   writeUrl();
   loadPopulation();
   loadDrill();
}

async function loadSymbols() {
   const { rows } = await run("signals.malloy", "run: symbol_suggest");
   for (const r of rows) symbolSelect.append(h("option", { value: r.symbol, text: `${r.symbol} · ${r.name}` }));
   symbolSelect.value = state.symbol;
}

writeUrl();
loadSymbols().catch((e) => console.error("symbol list", e));
loadPopulation();
loadDrill();
