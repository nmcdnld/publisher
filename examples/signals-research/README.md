<!--
Copyright (c) Credible Data Inc.
SPDX-License-Identifier: MIT
-->

# signals-research

A market-signals research package: two years of daily bars for 33 symbols, the options flow, dealer gamma and implied volatility behind them, and an event study that scores 21 classic trading signals against each symbol's own base rate. It is modeled on Folio (the `obj-stocks` watchlist and trading-diary app) and uses the same SignalForge features.

The universe is 27 stocks, each given a theme by this package (AI compute: NVDA, AMD, AVGO, MRVL, CBRS; Memory: MU, SNDK, SKHY; Semis: INTC, QCOM; AI infrastructure: NBIS, IREN, BE; Mega-cap: GOOGL, META, AAPL, TSLA; Software: PLTR, CRM, SNOW, NET, FSLY; and MSTR, SPCX, TWST, BFLY, TTWO), plus 6 benchmark funds: SPY, QQQ, IWM, SMH, DRAM and UVIX. The difference is that here every indicator and every verdict is defined in Malloy, where you can read it, instead of in application code.

Everything is DuckDB over files in `data/`, so it needs no credentials.

## What is in it

| Path | What it is |
| --- | --- |
| `market.malloy` | The raw grains, one source each: securities, daily and 5-minute bars, options flow, greek exposure, volatility, earnings, the screener snapshot, the journal, and the signal catalog. |
| `signals.malloy` | The research layer. `sessions` is one row per symbol per session with every causal feature (returns, SMAs, Cutler RSI, ATR, relative volume, flow z-scores) and the forward returns used as labels. `signal_events` is one row per signal firing, with the base rates it is judged against, and the scorecard measures. |
| `ticker_app.malloy`, `lab_app.malloy` | The scoped sources the Ticker and Lab pages query. Each file declares only the givens its own page sends. |
| `dashboards/market_tape.malloy`, `dashboards/signal_lab.malloy` | Two no-code dashboards over the same views, with filter controls. |
| `research.malloynb` | A notebook that walks the study question by question. |
| `public/index.html` | **Screener**, the morning glance: a tape of the six benchmark funds, regime and breadth, a Finviz-style performance map grouped by theme, the signals that fired on the latest session next to their two-year record, and a dense sortable screener. |
| `public/ticker.html` | **Ticker**, an OpenBB-style terminal for one symbol: quote and key stats; candles with SMA 20/50/200, volume and RSI; signal markers you isolate from the symbol's own record; dealer gamma, IV against realized, put/call; event log, earnings, thesis and journal, and the latest session's intraday path. |
| `public/lab.html` | **Signal Lab**: scope the population (universe, symbol, market regime, start date), read the scorecard, and drill into one signal by symbol, regime, month and individual firing. |
| `public/apps/*` | Two saved findings in the manifest format (`app.json`), each re-run live against `lab_app.malloy` with its givens. One is a replication failure: the put/call-spike edge found on the original five-stock universe did not hold on the 29 symbols added since. |
| `scripts/extract-folio-data.mjs` | Rebuilds `data/` from a Folio workspace's local D1 database. |
| `tests/` | `node --test` suites for the pure formatters and for the rules every page shares. |

## The design brief

The pages were designed against this brief before any tile was drawn.

- **Who opens it:** a discretionary trader who is also their own researcher. They open it daily before the open, and again whenever a name catches their eye.
- **The decision:** which names need attention today, and whether the setup on a chart has actually worked before. A signal with no track record is just a reading.
- **Archetype:** a workbench. Dense, light-mode, numbers-first. It takes Finviz's screener and heat map, and OpenBB's terminal layout with stacked price, volume and oscillator panes and a source line on every widget.
- **What leads:** on the Screener, the regime and the signals firing now, each beside its verdict. On the Ticker, the price chart with firings marked, beside that symbol's record for each signal. In the Lab, the scorecard's verdicts.
- **Depth:** every symbol links to its Ticker page and every signal to the Lab. In the Lab, a scorecard row opens a drill panel computed over the same population, so a drill number is always a slice of the row above it. All page state lives in the URL, so a view can be shared as a link.

Every panel names the `source -> view` it was drawn from. All colors, fonts and sizes come from tokens in `public/app/style.css`, and the charts read those same tokens at draw time, so no page script contains a color.

## How the event study works

The definitions live in `signals.malloy` and the catalog in `data/signal_catalog.csv`. Short version:

- **Features are causal and forward returns are labels.** Every indicator uses only data up to and including the session it is computed for. `fwd_return_1d/5d/20d` are the only columns that look ahead.
- **State signals fire on onsets.** "RSI oversold" fires on the session RSI first crosses below 30, not on every session it stays there.
- **The base rate is per symbol.** A signal's edge is its average forward return minus the average forward return of the same symbols over every session. A signal that only fires on a strong stock does not get credit for the stock's strength.
- **Bias edge** is the edge signed by the signal's direction, so a positive value always means the classic reading held.
- **Verdict:** Thin under 20 firings. Otherwise, Holds when the bias edge is positive at |t| ≥ 2, Inverts when it is negative at |t| ≥ 2, and Noise for everything else.

Read the verdicts with these caveats, which the pages repeat where they matter:

- **Overlapping windows.** Firings a few sessions apart on one symbol share most of their forward window, so the t-statistics are generous. Treat them as a ranking, not as significance.
- **Multiple comparisons.** 21 signals are tested at once, so roughly one should clear |t| ≥ 2 by chance.
- **Short regime history.** The market regime (SPY above or below its 200-day) is only known from Jul 18, 2025, once SPY has 200 sessions of history. Since then SPY has closed below its 200-day on only 13 sessions, so the Risk-off cells are thin.
- **RSI method.** RSI is Cutler's (simple averages), which can read a few points off Wilder's RSI on a charting platform.
- **Short histories.** DRAM listed in April 2026, CBRS in May, SPCX in June and SKHY in July, SNDK in February 2025 and NBIS in October 2024. Their 200-day reads stay empty until they have 200 sessions, and their signal records are short.
- **Options coverage.** Options flow, gamma and IV cover every symbol from its first session; IV rank covers the last year only.
- **Earnings.** The funds and SKHY have no earnings rows, and the recent listings have one or two reports. MU reported on the last session in the data and NBIS has no date set, so neither shows a next report.

## Data provenance

The files in `data/` were extracted from Folio's local D1 cache. Folio stored those payloads as it fetched them from the Unusual Whales API: daily candles, the latest session's 5-minute bars, screener quotes, options flow, greek exposure, volatility and earnings. The watchlist, thesis and journal are Folio's `default` user. The extraction only unpacks JSON into tables. It derives nothing, with one exception: UVIX's 1-for-10 reverse split on 2025-01-15 is applied, dividing prices and multiplying volumes before that date, so the series is continuous. The symbol list, its themes and a few display names are set in the script; names and sectors otherwise come from Folio's cached company lookups.

To rebuild from a Folio workspace, first make sure every symbol is in its cache (open each one's ticker page, or call `/api/lookup`, `/api/ticker/<symbol>/candles`, `/intraday`, `/exo` and `/api/quotes` on its dev server), then:

```bash
node examples/signals-research/scripts/extract-folio-data.mjs \
  /path/to/obj-stocks/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite
```

`data/signal_catalog.csv` is hand-written and the script leaves it alone.

## Running it

From a clone, `bun run start` serves this package alongside the other examples (it is registered in `packages/server/publisher.config.json`), and the pages are at:

- http://localhost:4000/environments/examples/packages/signals-research/index.html
- …/ticker.html?symbol=NVDA
- …/lab.html?signal=put_call_spike

The dashboards and the notebook appear on the package's page in the Console at http://localhost:4000.

```bash
bun run test:examples   # includes tests/format.test.mjs and tests/conformance.test.mjs
bun run lint:examples   # includes this package's eslint.config.mjs
```

Nothing here is investment advice.
