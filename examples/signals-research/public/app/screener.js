// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The screener: the pre-market glance.
//
// Brief. Who: a discretionary trader, every morning before the open. The
// decision: which names need attention today. What leads: the market regime
// and the signals that fired on the latest session, each shown next to its
// own track record, because a signal with no record is just a reading. Then
// the tape, the performance map and the full screener as supporting evidence.
// Depth: every symbol links to its ticker page, every signal to the lab.
//
// State in the URL: `?horizon=return_20d&universe=Equity`.

import { h, byId } from "./dom.js";
import { DASH, HEAT_SCALE, dayLabel, heatStep, isoDay, num, pct, points, price, signedPct, tone } from "./format.js";
import { sparkline } from "./charts.js";
import { mountShell } from "./shell.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";

const MODEL = "signals.malloy";
const Q = {
   screener: "run: sessions -> screener",
   closes: "run: sessions -> recent_closes",
   breadth: "run: sessions -> breadth",
   firing: "run: signal_events -> firing_now",
   scorecard: "run: signal_events -> scorecard",
   upcoming: "run: earnings -> upcoming",
};

const HORIZONS = [
   ["return_1d", "1D"],
   ["return_5d", "1W"],
   ["return_20d", "1M"],
   ["return_63d", "3M"],
   ["return_ytd", "YTD"],
   ["return_252d", "1Y"],
];
const UNIVERSES = [
   ["All", "All"],
   ["Equity", "Stocks"],
   ["ETF", "ETFs"],
];
// Tape order for the benchmark funds, then the heatmap's theme blocks in
// reading order: the AI supply chain first, the outliers last.
const TAPE = ["SPY", "QQQ", "IWM", "SMH", "DRAM", "UVIX"];
const THEMES = ["AI compute", "Memory", "Semis", "AI infrastructure", "Mega-cap", "Software", "Bitcoin", "Space", "Health tech", "Gaming"];

const params = new URLSearchParams(location.search);
const state = {
   horizon: HORIZONS.some(([k]) => k === params.get("horizon")) ? params.get("horizon") : "return_1d",
   universe: UNIVERSES.some(([k]) => k === params.get("universe")) ? params.get("universe") : "All",
};
function writeUrl() {
   const p = new URLSearchParams();
   if (state.horizon !== "return_1d") p.set("horizon", state.horizon);
   if (state.universe !== "All") p.set("universe", state.universe);
   history.replaceState({}, "", p.toString() ? `?${p}` : location.pathname);
}

const tickerHref = (symbol) => `./ticker.html?symbol=${encodeURIComponent(symbol)}`;
const labHref = (signalId) => `./lab.html?signal=${encodeURIComponent(signalId)}`;
const signed = (v, digits) => h("span", { class: tone(v), text: signedPct(v, digits) });

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

// ── Panels ──────────────────────────────────────────────────────────────────

const shell = mountShell("screener");
const page = byId("page");

const tapePanel = panel({ title: "Market tape", note: "last close · 1D · three months", source: "sessions -> recent_closes", flush: true });
const breadthPanel = panel({ title: "Regime & breadth", source: "sessions -> breadth", flush: true });
const firingPanel = panel({
   title: "Firing on the latest session",
   note: "each signal next to its two-year record",
   source: "signal_events -> firing_now + scorecard",
   span: 7,
   flush: true,
});
const heatPanel = panel({
   title: "Performance map",
   note: "by theme",
   source: "sessions -> screener",
   tools: [segmented(HORIZONS, state.horizon, (v) => ((state.horizon = v), writeUrl(), drawHeat()))],
});
const screenerPanel = panel({
   title: "Screener",
   note: "click a row for the ticker page",
   source: "sessions -> screener",
   flush: true,
   scroll: true,
   tools: [segmented(UNIVERSES, state.universe, (v) => ((state.universe = v), writeUrl(), drawScreener()))],
});
const earningsPanel = panel({ title: "Next earnings", source: "earnings -> upcoming", span: 5, flush: true, scroll: true });
const notesPanel = panel({ title: "How to read this" });

page.append(tapePanel.root, breadthPanel.root, heatPanel.root, firingPanel.root, earningsPanel.root, screenerPanel.root, notesPanel.root);

// ── Data ────────────────────────────────────────────────────────────────────

let screener = { rows: [], fields: [] };
const firingBySymbol = new Map();

function drawTape(closes) {
   const bySymbol = new Map();
   for (const r of closes.rows) {
      if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
      bySymbol.get(r.symbol).push(r.close);
   }
   const funds = screener.rows.filter((r) => TAPE.includes(r.symbol));
   funds.sort((a, b) => TAPE.indexOf(a.symbol) - TAPE.indexOf(b.symbol));
   const row = h("div", { class: "tape" });
   for (const r of funds) {
      row.append(
         h(
            "a",
            { class: "tape-cell", href: tickerHref(r.symbol), style: { color: "var(--text)", "text-decoration": "none" } },
            h("div", { class: "tape-top" }, h("span", { class: "tape-sym", text: r.symbol }), h("span", { class: `tape-chg ${tone(r.return_1d)}`, text: signedPct(r.return_1d, 2) })),
            h("div", { class: "tape-name", text: r.name }),
            h("div", { class: "tape-px", text: price(r.close) }),
            sparkline(bySymbol.get(r.symbol) ?? []),
         ),
      );
   }
   tapePanel.body.replaceChildren(row);
}

function drawBreadth(breadth) {
   const b = breadth.rows[0] ?? {};
   const spy = screener.rows.find((r) => r.symbol === "SPY");
   const riskOn = spy && spy.vs_sma_200 > 0;
   const firingCount = [...firingBySymbol.values()].reduce((n, list) => n + list.length, 0);
   const kpi = (label, value, sub, cls = "") =>
      h("div", { class: "kpi" }, h("div", { class: "kpi-label", text: label }), h("div", { class: `kpi-value ${cls}`, text: value }), h("div", { class: "kpi-sub", text: sub }));
   breadthPanel.body.replaceChildren(
      h(
         "div",
         { class: "kpis", style: { "--cols": "5" } },
         kpi("Market regime", spy ? (riskOn ? "Risk-on" : "Risk-off") : DASH, spy ? `SPY ${signedPct(spy.vs_sma_200)} vs its 200-day` : "", `lead ${riskOn ? "up" : "down"}`),
         kpi("Signals firing", String(firingCount), `on ${firingBySymbol.size} symbols, latest session`, "lead"),
         kpi("In uptrend", pct(b.uptrend_share, 0), `close > SMA 50 > SMA 200, of ${b.symbol_count ?? DASH}`),
         kpi("Above 200-day", pct(b.above_200d_share, 0), "share of symbols"),
         kpi("Avg RSI 14", num(b.avg_rsi, 1), "30 oversold · 70 overbought"),
      ),
   );
}

function verdictBadge(verdict) {
   return h("span", { class: `badge ${String(verdict ?? "noise").toLowerCase()}`, text: verdict ?? DASH });
}

function drawFiring(firing, scorecard) {
   const record = new Map(scorecard.rows.map((r) => [r.signal_id, r]));
   const rows = firing.rows.map((r) => ({ ...r, ...pickRecord(record.get(r.signal_id)) }));
   dataTable(firingPanel.body, {
      fields: firing.fields,
      rows,
      sortKey: "bias_edge_5d",
      columns: [
         { key: "symbol", label: "Ticker", render: (r) => h("a", { class: "ticker", href: tickerHref(r.symbol), text: r.symbol }) },
         { key: "signal", label: "Signal", render: (r) => h("a", { href: labHref(r.signal_id), text: r.signal }) },
         { key: "bias", label: "Bias", render: (r) => h("span", { class: `chip ${r.bias === "Bullish" ? "bull" : "bear"}`, text: r.bias === "Bullish" ? "▲ Bullish" : "▼ Bearish" }) },
         { key: "family", label: "Family" },
         { key: "verdict_5d", label: "Record", render: (r) => verdictBadge(r.verdict_5d) },
         { key: "event_count", label: "Events", num: true, render: (r) => String(r.event_count ?? DASH) },
         { key: "hit_rate_5d", label: "Hit 5d", num: true, render: (r) => pct(r.hit_rate_5d, 0) },
         { key: "bias_edge_5d", label: "Bias edge 5d", num: true, title: "Five-session edge signed by the signal's bias, in percentage points", render: (r) => h("span", { class: tone(r.bias_edge_5d), text: points(r.bias_edge_5d) }) },
      ],
      onRow: (r) => (location.href = labHref(r.signal_id)),
   });
}

function pickRecord(r) {
   if (!r) return {};
   return { verdict_5d: r.verdict_5d, event_count: r.event_count, hit_rate_5d: r.hit_rate_5d, bias_edge_5d: r.bias_edge_5d };
}

function heatColor(step) {
   const name = step === 0 ? "--heat-0" : step > 0 ? `--heat-p${step}` : `--heat-n${-step}`;
   return `var(${name})`;
}

function drawHeat() {
   const key = state.horizon;
   const scale = HEAT_SCALE[key];
   const map = h("div", { class: "heatmap" });
   const groups = [
      ["Benchmark funds", (r) => r.asset_class === "ETF"],
      ...THEMES.map((theme) => [theme, (r) => r.asset_class !== "ETF" && r.theme === theme]),
      ["Other", (r) => r.asset_class !== "ETF" && !THEMES.includes(r.theme)],
   ];
   for (const [label, inGroup] of groups) {
      const members = screener.rows.filter(inGroup).sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
      if (members.length === 0) continue;
      const tiles = h("div", { class: "heat-tiles" });
      map.append(h("div", { class: "heat-group", style: { "--n": String(members.length) } }, h("div", { class: "heat-group-label", text: label }), tiles));
      for (const r of members) {
         const step = heatStep(r[key], scale);
         tiles.append(
            h(
               "a",
               {
                  class: `heat${Math.abs(step) >= 2 ? " strong" : ""}`,
                  href: tickerHref(r.symbol),
                  style: { background: heatColor(step), "text-decoration": "none" },
                  title: `${r.name}: ${signedPct(r[key], 2)}`,
               },
               h("b", { text: r.symbol }),
               h("span", { text: signedPct(r[key], 1) }),
               h("small", { text: r.name }),
            ),
         );
      }
   }
   const legend = h("div", { class: "legend", style: { "margin-top": "var(--sp-4)" } }, h("span", { text: signedPct(-scale, 0) }));
   for (let step = -3; step <= 3; step++) legend.append(h("i", { style: { background: heatColor(step) } }));
   legend.append(h("span", { text: signedPct(scale, 0) }));
   heatPanel.body.replaceChildren(map, legend);
}

function range52(r) {
   const pos = r.range_position_52w;
   if (typeof pos !== "number") return DASH;
   return h("span", { class: "range52", title: `${pct(pos, 0)} of the 52-week range` }, h("i", { style: { left: `${Math.max(0, Math.min(1, pos)) * 100}%` } }));
}

function rsiCell(r) {
   const v = r.rsi_14;
   const cls = v >= 70 ? "down" : v <= 30 ? "up" : "";
   return h("span", { class: cls, text: num(v, 1) });
}

function signalChips(r) {
   const list = firingBySymbol.get(r.symbol) ?? [];
   if (list.length === 0) return h("span", { class: "muted", text: DASH });
   return h(
      "span",
      {},
      list.map((f) => h("a", { class: `chip link ${f.bias === "Bullish" ? "bull" : "bear"}`, href: labHref(f.signal_id), text: f.signal, onclick: (e) => e.stopPropagation() })),
   );
}

function drawScreener() {
   const rows = screener.rows.filter((r) => state.universe === "All" || r.asset_class === state.universe);
   const ret = (key) => ({ key, num: true, render: (r) => signed(r[key], key === "return_1d" ? 2 : 1) });
   dataTable(screenerPanel.body, {
      fields: screener.fields,
      rows,
      sortKey: "symbol",
      sortDir: "asc",
      columns: [
         { key: "symbol", label: "Ticker", render: (r) => h("a", { class: "ticker", href: tickerHref(r.symbol), text: r.symbol, onclick: (e) => e.stopPropagation() }) },
         { key: "name" },
         { key: "theme" },
         { key: "close", num: true, render: (r) => price(r.close) },
         ret("return_1d"),
         ret("return_5d"),
         ret("return_20d"),
         ret("return_63d"),
         ret("return_ytd"),
         ret("return_252d"),
         { key: "rsi_14", num: true, render: rsiCell },
         { key: "trend", render: (r) => h("span", { class: r.trend === "Uptrend" ? "up" : r.trend === "Downtrend" ? "down" : "muted", text: r.trend ?? DASH }) },
         { key: "vs_sma_50", num: true, render: (r) => signed(r.vs_sma_50) },
         { key: "vs_sma_200", num: true, render: (r) => signed(r.vs_sma_200) },
         { key: "range_position_52w", num: true, render: range52 },
         { key: "atr_pct_14", num: true, render: (r) => pct(r.atr_pct_14, 2) },
         { key: "relative_volume", num: true, render: (r) => h("span", { class: r.relative_volume >= 1.5 ? "up" : "", text: num(r.relative_volume, 2) }) },
         { key: "put_call_ratio", num: true, render: (r) => num(r.put_call_ratio, 2) },
         { key: "gamma_regime", label: "Gamma", render: (r) => h("span", { class: r.gamma_regime === "Short gamma" ? "down" : r.gamma_regime ? "up" : "muted", text: r.gamma_regime ?? DASH }) },
         { key: "iv_rank", num: true, render: (r) => pct(r.iv_rank, 0) },
         { key: "signals", label: "Signals today", sortable: false, render: signalChips },
      ],
      onRow: (r) => (location.href = tickerHref(r.symbol)),
   });
}

function drawEarnings(upcoming) {
   dataTable(earningsPanel.body, {
      ...upcoming,
      sortKey: "report_date",
      sortDir: "asc",
      columns: [
         { key: "symbol", render: (r) => h("a", { class: "ticker", href: tickerHref(r.symbol), text: r.symbol }) },
         { key: "report_date", render: (r) => dayLabel(r.report_date) },
         { key: "timing" },
         { key: "implied_move", num: true, render: (r) => (typeof r.implied_move === "number" ? `±${num(r.implied_move, 1)}%` : DASH) },
         { key: "estimate", num: true, render: (r) => num(r.estimate, 2) },
      ],
   });
}

function drawNotes() {
   notesPanel.body.replaceChildren(
      h(
         "div",
         { class: "prose" },
         h("p", {}, h("b", { text: "Record" }), " is each signal's verdict over two years of these 33 symbols, from the Signal Lab: ", h("b", { text: "Holds" }), " when the five sessions after it went the signal's way clearly (|t| ≥ 2), ", h("b", { text: "Inverts" }), " when they went the other way as clearly, ", h("b", { text: "Thin" }), " under 20 events, ", h("b", { text: "Noise" }), " otherwise."),
         h("p", {}, h("b", { text: "Bias edge" }), " is the average five-session return after the signal minus the same symbols' return over every session, in percentage points, signed so positive means the signal's classic reading held."),
         h("p", { class: "muted" }, "Prices are daily closes from Folio's Unusual Whales cache; options, gamma and IV cover every symbol from its first session, and IV rank the last year only. DRAM, CBRS, SPCX and SKHY listed in 2026, so their records are short and their 200-day reads stay empty. RSI is Cutler's 14-session RSI, so it can read a few points off a charting platform. Nothing here is investment advice."),
      ),
   );
}

function main() {
   drawNotes();
   // Several panels read the same screener rows and firing list; fetch each once.
   const screenerP = run(MODEL, Q.screener).then((result) => {
      screener = result;
      const asOf = result.rows.reduce((max, r) => (isoDay(r.session_date) > max ? isoDay(r.session_date) : max), "");
      if (asOf) shell.setMeta([`${result.rows.length} symbols`, `daily bars to ${dayLabel(asOf)}`]);
      return result;
   });
   const firingP = run(MODEL, Q.firing).then((firing) => {
      firingBySymbol.clear();
      for (const f of firing.rows) {
         if (!firingBySymbol.has(f.symbol)) firingBySymbol.set(f.symbol, []);
         firingBySymbol.get(f.symbol).push(f);
      }
      return firing;
   });
   const scorecardP = run(MODEL, Q.scorecard);

   screenerPanel.load(async () => (await Promise.allSettled([firingP]), screenerP), drawScreener);
   heatPanel.load(() => screenerP, drawHeat);
   firingPanel.load(
      async () => {
         const [firing, scorecard] = await Promise.all([firingP, scorecardP]);
         return { firing, scorecard, rows: firing.rows };
      },
      ({ firing, scorecard }) => drawFiring(firing, scorecard),
      { empty: "No research signal fired on the latest session." },
   );
   tapePanel.load(async () => (await screenerP, run(MODEL, Q.closes)), drawTape);
   breadthPanel.load(async () => (await Promise.all([screenerP, firingP]), run(MODEL, Q.breadth)), drawBreadth);
   earningsPanel.load(() => run("market.malloy", Q.upcoming), drawEarnings, { empty: "No scheduled reports." });
}

main();
