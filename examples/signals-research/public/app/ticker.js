// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The ticker terminal: one symbol, everything about it.
//
// Brief. Who: the same trader, once a name has caught their eye. The
// decision: is the setup on this chart one that has worked on this name
// before. What leads: the quote and the price chart with every research
// signal marked where it fired, beside that symbol's own record for each
// signal. Then positioning (dealer gamma, IV against realized, put/call),
// the event log, earnings and the thesis it is held on.
//
// State in the URL: `?symbol=NVDA&range=1y`. The symbol is bound as the
// TICKER given, so what a reader types is compared, never parsed as Malloy.

import { h, byId, color } from "./dom.js";
import { DASH, clock, compactTick, dayLabel, isoDay, monthsBefore, num, pct, points, price, signedPct, tone } from "./format.js";
import { barChart, candleChart, lineChart, volumeChart } from "./charts.js";
import { mountShell } from "./shell.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";

const MODEL = "ticker_app.malloy";
const RANGES = [
   ["3m", "3M", 3],
   ["6m", "6M", 6],
   ["1y", "1Y", 12],
   ["2y", "2Y", 24],
];

const params = new URLSearchParams(location.search);
const state = {
   symbol: (params.get("symbol") || "NVDA").toUpperCase().slice(0, 12),
   range: RANGES.some(([k]) => k === params.get("range")) ? params.get("range") : "1y",
   latest: null,
};
function writeUrl() {
   const p = new URLSearchParams({ symbol: state.symbol });
   if (state.range !== "1y") p.set("range", state.range);
   history.replaceState({}, "", `?${p}`);
}
const chartFrom = () => monthsBefore(state.latest, RANGES.find(([k]) => k === state.range)[2]);
const givens = (withRange = false) => (withRange ? { TICKER: state.symbol, CHART_FROM: chartFrom() } : { TICKER: state.symbol });
const labHref = (signalId) => `./lab.html?signal=${encodeURIComponent(signalId)}&symbol=${encodeURIComponent(state.symbol)}`;

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

const shell = mountShell("ticker");
const page = byId("page");

const picker = h("select", { class: "select", "aria-label": "Symbol", onchange: (e) => selectSymbol(e.target.value) });
const quotePanel = panel({ title: "Quote", source: "ticker_latest -> screener", flush: true, tools: [picker] });

const chartBox = (height) => h("div", { class: "chart", style: { "--h": height } }, h("canvas"));
const candleBox = chartBox("340px");
const volumeBox = chartBox("78px");
const rsiBox = chartBox("96px");
const legend = h("div", { class: "legend chart-key" });
const chartPanel = panel({
   title: "Price",
   note: "daily candles · SMA 20 / 50 / 200 · ▲▼ research signals",
   source: "ticker_sessions -> price_history + ticker_events -> event_log",
   span: 8,
   tools: [segmented(RANGES, state.range, (v) => ((state.range = v), writeUrl(), loadRanged()))],
});
const recordPanel = panel({
   title: "Signal record",
   note: "this name · click to mark",
   source: "ticker_events -> scorecard",
   span: 4,
   flush: true,
   scroll: true,
   height: "560px",
});
const gammaPanel = panel({ title: "Dealer net gamma", note: "per 1% move", source: "ticker_sessions -> positioning_history", span: 4 });
const volPanel = panel({ title: "Implied vs realized vol", note: "IV 30d · RV 21d", source: "ticker_sessions -> positioning_history", span: 4 });
const flowPanel = panel({ title: "Put/call volume ratio", source: "ticker_sessions -> positioning_history", span: 4 });
const eventsPanel = panel({ title: "Event log", note: "what followed each firing", source: "ticker_events -> event_log", span: 8, flush: true, scroll: true, height: "360px" });
const profilePanel = panel({ title: "Thesis & journal", source: "ticker_security + ticker_journal", span: 4 });
const earningsPanel = panel({ title: "Earnings", source: "ticker_earnings", span: 6, flush: true, scroll: true, height: "260px" });
const intradayPanel = panel({ title: "Latest session", note: "5-minute closes, New York time", source: "ticker_intraday -> session_path", span: 6 });

page.append(quotePanel.root, chartPanel.root, recordPanel.root, gammaPanel.root, volPanel.root, flowPanel.root, eventsPanel.root, profilePanel.root, earningsPanel.root, intradayPanel.root);

// ── Drawing ─────────────────────────────────────────────────────────────────

function drawQuote({ rows }) {
   const q = rows[0];
   state.latest = isoDay(q.session_date);
   document.title = `${q.symbol} · Signals Research`;
   shell.setMeta([q.symbol, `as of ${dayLabel(q.session_date)}`]);
   const stat = (label, value, cls = "") => h("div", { class: "stat" }, h("span", { text: label }), h("b", { class: cls, text: value }));
   quotePanel.body.replaceChildren(
      h(
         "div",
         { class: "quote" },
         h("div", {}, h("div", { class: "quote-sym", text: q.symbol }), h("div", { class: "quote-meta", text: q.asset_class === "ETF" ? "Benchmark ETF" : "Stock" })),
         h("div", {}, h("div", { class: "quote-name", text: q.name }), h("div", { class: "quote-meta", text: `${q.theme ?? q.sector} · ${q.trend ?? DASH} · RSI ${q.rsi_zone ?? DASH}` })),
         h("div", { style: { "margin-left": "auto" } }, h("span", { class: "quote-px", text: price(q.close) }), h("span", { class: `quote-chg ${tone(q.return_1d)}`, text: signedPct(q.return_1d, 2) })),
      ),
      h(
         "div",
         { class: "stats" },
         stat("1W", signedPct(q.return_5d), tone(q.return_5d)),
         stat("1M", signedPct(q.return_20d), tone(q.return_20d)),
         stat("3M", signedPct(q.return_63d), tone(q.return_63d)),
         stat("YTD", signedPct(q.return_ytd), tone(q.return_ytd)),
         stat("1Y", signedPct(q.return_252d), tone(q.return_252d)),
         stat("RSI 14", num(q.rsi_14, 1), q.rsi_14 >= 70 ? "down" : q.rsi_14 <= 30 ? "up" : ""),
         stat("vs SMA 50", signedPct(q.vs_sma_50), tone(q.vs_sma_50)),
         stat("vs SMA 200", signedPct(q.vs_sma_200), tone(q.vs_sma_200)),
         stat("52W range", pct(q.range_position_52w, 0)),
         stat("ATR 14", pct(q.atr_pct_14, 2)),
         stat("Rel volume", num(q.relative_volume, 2)),
         stat("Put/call", num(q.put_call_ratio, 2)),
         stat("Gamma", q.gamma_regime ?? DASH, q.gamma_regime === "Short gamma" ? "down" : q.gamma_regime ? "up" : ""),
         stat("IV rank", pct(q.iv_rank, 0)),
         stat("IV − RV", points(q.iv_rv_spread, 1)),
      ),
   );
}

// Which signal's firings the chart marks: one at a time, or all of them.
// Every firing at once is a hundred-plus triangles and reads as noise, so the
// chart opens on the strongest tested signal for this name.
let marked = null;
let lastPrice = null;

function defaultMarked(scorecard) {
   const tested = scorecard.rows.filter((r) => r.verdict_5d === "Holds" || r.verdict_5d === "Inverts");
   const pool = tested.length ? tested : scorecard.rows.filter((r) => r.verdict_5d !== "Thin");
   const best = pool.sort((a, b) => Math.abs(b.edge_t_5d ?? 0) - Math.abs(a.edge_t_5d ?? 0))[0] ?? scorecard.rows[0];
   return best?.signal ?? "all";
}

function markSignal(signal) {
   marked = signal;
   for (const tr of recordPanel.body.querySelectorAll("tbody tr")) tr.setAttribute("aria-selected", String(tr.dataset.signal === signal));
   if (lastPrice) drawPrice(lastPrice.history, lastPrice.events);
}

function drawPrice(history, events) {
   lastPrice = { history, events };
   const bars = history.rows.map((r) => ({ ...r, day: isoDay(r.session_date) }));
   const index = new Map(bars.map((b, i) => [b.day, i]));
   const inView = events.rows.filter((e) => index.has(isoDay(e.session_date)));
   const markers = inView
      .filter((e) => marked === "all" || e.signal === marked)
      .map((e) => ({ index: index.get(isoDay(e.session_date)), bias: e.bias, label: e.signal }));
   const sma = (key) => bars.map((b) => b[key] ?? null);
   const overlays = [
      { label: "SMA 20", values: sma("sma_20"), color: color("--sma-20") },
      { label: "SMA 50", values: sma("sma_50"), color: color("--sma-50") },
      { label: "SMA 200", values: sma("sma_200"), color: color("--sma-200") },
   ];
   legend.replaceChildren(
      ...overlays.map((o) => h("span", { class: "key" }, h("i", { style: { background: o.color } }), o.label)),
      h("span", { class: "key up", text: "▲ bullish" }),
      h("span", { class: "key down", text: "▼ bearish" }),
      h(
         "span",
         { class: "key" },
         h("b", { text: marked === "all" ? "All signals" : marked ?? DASH }),
         ` · ${markers.length} of ${inView.length} firings in view · `,
         marked === "all"
            ? h("span", { class: "muted", text: "pick a row in the record to isolate one" })
            : h("a", { href: "#", text: "show all", onclick: (e) => (e.preventDefault(), markSignal("all")) }),
      ),
   );
   chartPanel.body.replaceChildren(legend, candleBox, volumeBox, rsiBox);
   candleChart(candleBox.firstChild, { bars, overlays, markers, format: price });
   volumeChart(volumeBox.firstChild, { bars, format: compactTick });
   lineChart(rsiBox.firstChild, {
      labels: bars.map((b) => b.day),
      series: [{ label: "RSI 14", values: sma("rsi_14"), color: color("--accent") }],
      guides: [
         { value: 70, label: "Overbought", color: color("--down") },
         { value: 30, label: "Oversold", color: color("--up") },
      ],
      format: (v) => num(v, 0),
      min: 0,
      max: 100,
      levels: [30, 50, 70],
   });
}

function verdictBadge(verdict) {
   return h("span", { class: `badge ${String(verdict ?? "noise").toLowerCase()}`, text: verdict ?? DASH });
}

function drawRecord(scorecard) {
   dataTable(recordPanel.body, {
      ...scorecard,
      sortKey: "event_count",
      selected: (r) => r.signal === marked,
      rowData: (r) => ({ signal: r.signal }),
      columns: [
         {
            key: "signal",
            render: (r) =>
               h("a", { href: labHref(r.signal_id), onclick: (e) => e.stopPropagation() }, h("span", { class: r.bias === "Bullish" ? "up" : "down", text: r.bias === "Bullish" ? "▲ " : "▼ " }), r.signal),
         },
         { key: "verdict_5d", label: "Record", render: (r) => verdictBadge(r.verdict_5d) },
         { key: "event_count", label: "N", num: true },
         { key: "hit_rate_5d", label: "Hit 5d", num: true, render: (r) => pct(r.hit_rate_5d, 0) },
         { key: "bias_edge_5d", label: "Edge", num: true, title: "Bias-signed five-session edge, percentage points", render: (r) => h("span", { class: tone(r.bias_edge_5d), text: points(r.bias_edge_5d) }) },
      ],
      onRow: (r) => markSignal(r.signal),
   });
}

const NO_OPTIONS = "No options history in this range: flow, gamma and IV start at the symbol's first cached session.";

function drawGamma({ rows }) {
   const box = chartBox("190px");
   gammaPanel.body.replaceChildren(box);
   barChart(box.firstChild, {
      labels: rows.map((r) => isoDay(r.session_date)),
      values: rows.map((r) => r.net_gamma),
      colors: rows.map((r) => ((r.net_gamma ?? 0) >= 0 ? color("--up") : color("--down"))),
      format: compactTick,
      dates: true,
   });
}

function drawVol({ rows }) {
   const box = chartBox("190px");
   volPanel.body.replaceChildren(box);
   lineChart(box.firstChild, {
      labels: rows.map((r) => isoDay(r.session_date)),
      series: [
         { label: "IV 30d", values: rows.map((r) => r.iv_30d), color: color("--accent") },
         { label: "RV 21d", values: rows.map((r) => r.rv_21d), color: color("--brand"), dashed: true },
      ],
      format: (v) => pct(v, 0),
   });
}

function drawFlow({ rows }) {
   const box = chartBox("190px");
   flowPanel.body.replaceChildren(box);
   lineChart(box.firstChild, {
      labels: rows.map((r) => isoDay(r.session_date)),
      series: [{ label: "Put/call", values: rows.map((r) => r.put_call_ratio), color: color("--series-5") }],
      guides: [{ value: 1, label: "Parity" }],
      format: (v) => num(v, 2),
   });
}

function drawEvents(events) {
   const ret = (key) => ({ key, num: true, render: (r) => h("span", { class: tone(r[key]), text: signedPct(r[key]) }) });
   dataTable(eventsPanel.body, {
      ...events,
      sortKey: "session_date",
      columns: [
         { key: "session_date", label: "Session", render: (r) => dayLabel(r.session_date), sort: (r) => isoDay(r.session_date) },
         { key: "signal", render: (r) => h("span", {}, h("span", { class: r.bias === "Bullish" ? "up" : "down", text: r.bias === "Bullish" ? "▲ " : "▼ " }), r.signal) },
         { key: "close", num: true, render: (r) => price(r.close) },
         ret("fwd_return_1d"),
         ret("fwd_return_5d"),
         ret("fwd_return_20d"),
         { key: "excess_return_5d", label: "vs base 5d", num: true, render: (r) => h("span", { class: tone(r.excess_return_5d), text: points(r.excess_return_5d) }) },
      ],
   });
}

function drawProfile(security, journal) {
   const s = security.rows[0];
   const out = [];
   if (s) {
      const facts = [s.theme && `Theme: ${s.theme}`, s.stage && `Stage: ${s.stage}`, s.conviction && `Conviction ${"●".repeat(s.conviction)}${"○".repeat(Math.max(0, 5 - s.conviction))}`, s.watchlists && `Lists: ${s.watchlists}`].filter(Boolean);
      out.push(h("div", { class: "callout", text: s.thesis || "No thesis recorded for this symbol." }));
      if (facts.length) out.push(h("p", { class: "muted", style: { "margin-top": "var(--sp-4)" }, text: facts.join(" · ") }));
   }
   for (const e of journal.rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
      out.push(
         h(
            "div",
            { class: "entry" },
            h("div", { class: "entry-head" }, h("span", { class: `chip ${e.kind === "sell" ? "bear" : e.kind === "buy" ? "bull" : ""}`, text: e.kind }), h("span", { text: dayLabel(e.created_at) }), e.price_at ? h("span", { text: `@ ${price(e.price_at)}` }) : null),
            h("div", { class: "prose", text: e.body }),
         ),
      );
   }
   if (out.length === 0) out.push(h("p", { class: "muted", text: "No thesis or journal entries for this symbol." }));
   profilePanel.body.replaceChildren(...out);
}

function drawEarnings(earnings) {
   const history = earnings.rows.filter((r) => !r.is_upcoming).length;
   if (history === 0) earningsPanel.setNote("only the next report is in Folio's cache for this symbol");
   else earningsPanel.setNote(`${history} past reports`);
   dataTable(earningsPanel.body, {
      ...earnings,
      sortKey: "report_date",
      columns: [
         { key: "report_date", label: "Report", render: (r) => h("span", {}, dayLabel(r.report_date), r.is_upcoming ? h("span", { class: "chip", text: "next" }) : null), sort: (r) => isoDay(r.report_date) },
         { key: "result", render: (r) => h("span", { class: r.result === "Beat" ? "up" : r.result === "Miss" ? "down" : "muted", text: r.result ?? DASH }) },
         { key: "eps_estimate", label: "Estimate", num: true, render: (r) => num(r.eps_estimate, 2) },
         { key: "eps_actual", label: "Actual", num: true, render: (r) => num(r.eps_actual, 2) },
         { key: "surprise_pct", label: "Surprise", num: true, render: (r) => h("span", { class: tone(r.surprise_pct), text: typeof r.surprise_pct === "number" ? `${r.surprise_pct > 0 ? "+" : ""}${num(r.surprise_pct, 1)}%` : DASH }) },
         { key: "expected_move_pct", label: "Implied move", num: true, render: (r) => (typeof r.expected_move_pct === "number" ? `±${num(r.expected_move_pct, 1)}%` : DASH) },
      ],
   });
}

function drawIntraday({ rows }) {
   const box = chartBox("190px");
   intradayPanel.body.replaceChildren(box);
   const first = rows[0]?.last_close;
   const last = rows.at(-1)?.last_close;
   intradayPanel.setNote(`${dayLabel(rows[0]?.bar_time)} · 5-minute closes, New York time · ${signedPct(first ? last / first - 1 : null, 2)} open to close`);
   const up = (last ?? 0) >= (first ?? 0);
   lineChart(box.firstChild, {
      labels: rows.map((r) => r.bar_time),
      series: [{ label: state.symbol, values: rows.map((r) => r.last_close), color: color(up ? "--up" : "--down"), fill: color(up ? "--up-soft" : "--down-soft") }],
      guides: first ? [{ value: first, label: "Open" }] : [],
      format: price,
      xLabel: clock,
   });
}

// ── Loading ─────────────────────────────────────────────────────────────────

let eventsP;
let scorecardP;

function loadRanged() {
   const history = run(MODEL, "run: ticker_sessions -> price_history", givens(true));
   chartPanel.load(async () => {
      const [h0, events, scorecard] = await Promise.all([history, eventsP, scorecardP]);
      marked ??= defaultMarked(scorecard);
      return { rows: h0.rows, h0, events };
   }, ({ h0, events }) => drawPrice(h0, events));
   const positioning = run(MODEL, "run: ticker_sessions -> positioning_history", givens(true));
   gammaPanel.load(() => positioning, drawGamma, { empty: NO_OPTIONS });
   volPanel.load(() => positioning, drawVol, { empty: NO_OPTIONS });
   flowPanel.load(() => positioning, drawFlow, { empty: NO_OPTIONS });
}

async function selectSymbol(symbol) {
   state.symbol = symbol;
   writeUrl();
   await loadAll();
}

async function loadAll() {
   marked = null;
   lastPrice = null;
   eventsP = run(MODEL, "run: ticker_events -> event_log", givens());
   scorecardP = run(MODEL, "run: ticker_events -> scorecard", givens());
   recordPanel.load(
      async () => {
         const scorecard = await scorecardP;
         marked ??= defaultMarked(scorecard);
         return scorecard;
      },
      drawRecord,
      { empty: "No research signal has fired on this symbol." },
   );
   eventsPanel.load(() => eventsP, drawEvents, { empty: "No research signal has fired on this symbol." });
   profilePanel.load(async () => {
      const [security, journal] = await Promise.all([run(MODEL, "run: ticker_security -> { select: * }", givens()), run(MODEL, "run: ticker_journal -> { select: * }", givens())]);
      return { security, journal };
   }, ({ security, journal }) => drawProfile(security, journal));
   earningsPanel.load(() => run(MODEL, "run: ticker_earnings -> { select: * order_by: report_date desc limit: 16 }", givens()), drawEarnings, { empty: "No earnings reports for this symbol (ETFs do not report)." });
   intradayPanel.load(() => run(MODEL, "run: ticker_intraday -> session_path", givens()), drawIntraday, { empty: "No intraday bars cached for this symbol." });

   state.latest = null;
   await quotePanel.load(() => run(MODEL, "run: ticker_latest -> screener", givens()), drawQuote, { empty: `No data for "${state.symbol}". Pick a symbol from the list.` });
   if (state.latest) loadRanged();
   else for (const p of [chartPanel, gammaPanel, volPanel, flowPanel]) p.load(async () => [], () => {}, { empty: "No sessions for this symbol." });
}

async function loadPicker() {
   const { rows } = await run("signals.malloy", "run: symbol_suggest");
   const groups = new Map();
   for (const r of rows) {
      const label = r.asset_class === "ETF" ? "Benchmark funds" : r.theme;
      if (!groups.has(label)) groups.set(label, h("optgroup", { label }));
      groups.get(label).append(h("option", { value: r.symbol, text: `${r.symbol} · ${r.name}` }));
   }
   picker.replaceChildren(...groups.values());
   picker.value = state.symbol;
}

writeUrl();
loadPicker().catch((e) => console.error("symbol list", e));
loadAll();
