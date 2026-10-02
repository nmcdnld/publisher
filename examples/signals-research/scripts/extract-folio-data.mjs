// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Rebuild data/ from a Folio workspace's local D1 database.
//
//   node examples/signals-research/scripts/extract-folio-data.mjs <path-to-d1.sqlite>
//
// Folio (the watchlist + trading diary app this package is modelled on) caches
// every upstream market-data answer in D1 as JSON: daily candles, the latest
// session's 5-minute bars, screener quotes, and the per-session options, gamma
// and volatility series its SignalForge features read. This script flattens
// those payloads into one Parquet file per grain, plus a small CSV lookup of
// the securities themselves, so the Malloy model reads plain tables.
//
// Nothing is derived here beyond unpacking: indicators, signals and forward
// returns are computed in the model (signals.malloy), where a reader can see
// exactly how each one is defined. The D1 file is opened read-only from a
// temporary copy, because SQLite writes a shared-memory file beside a WAL
// database even to read it.
import { DuckDBInstance } from "@duckdb/node-api";
import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) {
   console.error("usage: extract-folio-data.mjs <path-to-folio-d1.sqlite>");
   process.exit(1);
}

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(PACKAGE_DIR, "data");
// Folio's anonymous visitors see the `default` user's records; its stage,
// conviction and thesis ride along for the symbols it tracks.
const USER = "default";

// The universe this package ships, in tape order. Every symbol must already be
// in Folio's cache (open its ticker page, or call its /api routes) before the
// extract; a symbol with no cached candles fails the run rather than vanishing.
// Themes are this package's own grouping; names and sectors come from Folio's
// cached company lookups.
const ETFS = {
   SPY: "Index",
   QQQ: "Index",
   IWM: "Index",
   SMH: "Semis",
   DRAM: "Memory",
   UVIX: "Volatility",
};
const EQUITIES = {
   NVDA: "AI compute",
   AMD: "AI compute",
   AVGO: "AI compute",
   MRVL: "AI compute",
   CBRS: "AI compute",
   MU: "Memory",
   SNDK: "Memory",
   SKHY: "Memory",
   INTC: "Semis",
   QCOM: "Semis",
   NBIS: "AI infrastructure",
   IREN: "AI infrastructure",
   BE: "AI infrastructure",
   GOOGL: "Mega-cap",
   META: "Mega-cap",
   AAPL: "Mega-cap",
   TSLA: "Mega-cap",
   PLTR: "Software",
   CRM: "Software",
   SNOW: "Software",
   NET: "Software",
   FSLY: "Software",
   MSTR: "Bitcoin",
   SPCX: "Space",
   TWST: "Health tech",
   BFLY: "Health tech",
   TTWO: "Gaming",
};
const UNIVERSE = new Set([...Object.keys(ETFS), ...Object.keys(EQUITIES)]);
// Folio title-cases upstream names, which mangles some brands, and a few
// cached names predate a rename.
const NAMES = {
   SPY: "SPDR S&P 500 ETF",
   QQQ: "Invesco QQQ Trust",
   IWM: "iShares Russell 2000 ETF",
   SMH: "VanEck Semiconductor ETF",
   UVIX: "2x Long VIX Futures ETF",
   MSTR: "Strategy",
   IREN: "IREN",
   SKHY: "SK hynix ADR",
   SPCX: "SpaceX",
   SNDK: "Sandisk",
   NBIS: "Nebius Group",
   TTWO: "Take-Two Interactive",
};

const exists = (p) =>
   access(p).then(
      () => true,
      () => false,
   );

async function openCopy(tmp) {
   const target = join(tmp, "folio.sqlite");
   await copyFile(source, target);
   for (const suffix of ["-wal", "-shm"]) {
      if (await exists(source + suffix))
         await copyFile(source + suffix, target + suffix);
   }
   return new DatabaseSync(target);
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isoTs = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function cached(db, key) {
   const row = db.prepare("SELECT payload FROM uw_cache WHERE key = ?").get(key);
   return row ? JSON.parse(row.payload) : null;
}

function keysLike(db, pattern) {
   return db
      .prepare("SELECT key FROM uw_cache WHERE key LIKE ? ORDER BY key")
      .all(pattern)
      .map((r) => r.key);
}

async function writeTable(con, tmp, outPath, rows, columns, format) {
   const jsonPath = join(tmp, `${outPath.replace(/[/]/g, "_")}.json`);
   await writeFile(jsonPath, JSON.stringify(rows));
   const colSpec = Object.entries(columns)
      .map(([c, t]) => `'${c}': '${t}'`)
      .join(", ");
   const order = Object.keys(columns).slice(0, 2).join(", ");
   await con.run(
      `COPY (SELECT * FROM read_json('${jsonPath.replace(/'/g, "''")}', ` +
         `format='array', columns={${colSpec}}) ORDER BY ${order}) ` +
         `TO '${join(DATA_DIR, outPath)}' (FORMAT ${format})`,
   );
   console.log(`  ${outPath}: ${rows.length} rows`);
}

function securities(db) {
   const tracked = new Map(
      db
         .prepare(
            "SELECT symbol, stage, conviction, tags, thesis FROM tickers WHERE user_id = ?",
         )
         .all(USER)
         .map((t) => [t.symbol, t]),
   );
   const lists = db
      .prepare(
         `SELECT m.symbol, w.name FROM watchlist_members m
          JOIN watchlists w ON w.id = m.watchlist_id
          WHERE m.user_id = ? ORDER BY w.position, m.position`,
      )
      .all(USER);
   const listsBy = new Map();
   for (const { symbol, name } of lists)
      listsBy.set(symbol, [...(listsBy.get(symbol) ?? []), name]);

   const row = (symbol, assetClass, theme) => {
      const company = cached(db, `lookup:v1:${symbol}`);
      if (!company) throw new Error(`${symbol}: no cached lookup in Folio`);
      const t = tracked.get(symbol);
      const tags = JSON.parse(t?.tags || "[]");
      return {
         symbol,
         name: NAMES[symbol] ?? company.name.trim(),
         asset_class: assetClass,
         sector: assetClass === "ETF" ? "Fund" : company.sector || "Other",
         theme,
         stage: t?.stage ?? (assetClass === "ETF" ? "benchmark" : "research"),
         conviction: t?.conviction ?? null,
         tags: tags.join(", "),
         watchlists: [
            assetClass === "ETF" ? "Market tape" : "Research",
            ...(listsBy.get(symbol) ?? []),
         ].join(", "),
         thesis: t?.thesis ?? "",
      };
   };
   return [
      ...Object.entries(ETFS).map(([s, theme]) => row(s, "ETF", theme)),
      ...Object.entries(EQUITIES).map(([s, theme]) => row(s, "Equity", theme)),
   ];
}

// The cached candles are NOT split-adjusted. Every split inside the window has
// to be listed here, or a return across it reads as a real move: UVIX's
// 1-for-10 reverse split prints as a +789% session and tops every forward-
// return ranking. `ratio` is new shares per old share, so bars before `date`
// have their prices divided by it and their volume multiplied by it. To find
// a new one, look for an open more than 40% away from the prior close and
// check it against the issuer's notice; an earnings gap looks the same.
const SPLITS = [{ symbol: "UVIX", date: "2025-01-15", ratio: 0.1 }];

function splitFactor(symbol, day) {
   return SPLITS.filter((s) => s.symbol === symbol && day < s.date).reduce(
      (f, s) => f * s.ratio,
      1,
   );
}

function dailyBars(db) {
   const rows = [];
   for (const symbol of UNIVERSE) {
      const candles = cached(db, `candles:v1:${symbol}:1D`);
      if (!candles?.length) throw new Error(`${symbol}: no cached daily candles in Folio`);
      for (const b of candles) {
         const day = isoDay(b.t);
         const f = splitFactor(symbol, day);
         rows.push({
            symbol,
            session_date: day,
            open: b.o / f,
            high: b.h / f,
            low: b.l / f,
            close: b.c / f,
            volume: Math.round(b.v * f),
         });
      }
   }
   return rows;
}

function intradayBars(db) {
   const rows = [];
   for (const key of keysLike(db, "intraday:v1:%:5m")) {
      const payload = cached(db, key);
      if (!UNIVERSE.has(payload.symbol)) continue;
      for (const b of payload.bars) {
         rows.push({
            symbol: payload.symbol,
            bar_time: isoTs(b.t),
            session_date: payload.session,
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
            volume: b.v,
         });
      }
   }
   return rows;
}

/**
 * One row per (symbol, session) out of an `exo:v1:<kind>:<symbol>[:range]` map,
 * kept only for sessions the symbol has a daily bar for: a new listing's
 * gamma series can reach back past its first trade.
 */
function exoRows(db, kind, fields, sessions) {
   const rows = [];
   for (const key of keysLike(db, `exo:v1:${kind}:%`)) {
      const symbol = key.split(":")[3];
      if (!UNIVERSE.has(symbol)) continue;
      const { byDate = {} } = cached(db, key);
      for (const [date, values] of Object.entries(byDate)) {
         if (!sessions.has(`${symbol}|${date}`)) continue;
         const row = { symbol, session_date: date };
         for (const f of fields) row[f] = num(values[f]);
         rows.push(row);
      }
   }
   return rows;
}

function earnings(db) {
   const rows = [];
   for (const key of keysLike(db, "exo:v1:earnings:%")) {
      const symbol = key.split(":")[3];
      if (!UNIVERSE.has(symbol)) continue;
      const { byDate = {} } = cached(db, key);
      for (const [date, e] of Object.entries(byDate)) {
         rows.push({
            symbol,
            report_date: date,
            is_upcoming: e.upcoming === 1,
            is_premarket: e.premarket === 1,
            expected_move_pct: num(e.expected_move_pct),
            eps_estimate: num(e.estimate),
            eps_actual: num(e.actual_eps),
            surprise_pct: num(e.surprise_pct),
         });
      }
   }
   return rows;
}

/** The newest cached quote for each symbol, across every batch that carried it. */
function screener(db) {
   const newest = new Map();
   for (const key of keysLike(db, "quotes:v1:%")) {
      for (const q of cached(db, key)) {
         if (!UNIVERSE.has(q.symbol)) continue;
         if ((newest.get(q.symbol)?.asOf ?? -1) < q.asOf) newest.set(q.symbol, q);
      }
   }
   return [...newest.values()].map((q) => {
      const s = q.stats ?? {};
      return {
         symbol: q.symbol,
         as_of: isoTs(q.asOf),
         price: num(q.price),
         change_pct: num(q.changePct),
         high_52w: num(s.high52),
         low_52w: num(s.low52),
         volume: num(s.volume),
         avg_volume_30d: num(s.avgVolume),
         relative_volume: num(s.relVolume),
         rsi_14: num(s.rsi),
         atr_14: num(s.atr),
         sma_50: num(s.sma50),
         sma_200: num(s.sma200),
         iv_30d: num(s.iv) === null ? null : s.iv / 100,
         iv_rank: num(s.ivRank) === null ? null : s.ivRank / 100,
         expected_move_pct: num(s.expectedMove),
         call_volume: num(s.callVolume),
         put_volume: num(s.putVolume),
         market_cap: num(s.marketCap),
         next_earnings: s.nextEarnings ?? null,
      };
   });
}

function journal(db) {
   return db
      .prepare(
         "SELECT id, symbol, kind, body, price_at, created_at FROM entries WHERE user_id = ? ORDER BY created_at",
      )
      .all(USER)
      .filter((e) => UNIVERSE.has(e.symbol))
      .map((e) => ({
         entry_id: e.id,
         symbol: e.symbol,
         kind: e.kind,
         body: e.body,
         price_at: e.price_at,
         created_at: isoTs(e.created_at),
      }));
}

async function main() {
   const tmp = await mkdtemp(join(tmpdir(), "signals-research-"));
   try {
      const db = await openCopy(tmp);

      const inst = await DuckDBInstance.create(":memory:");
      const con = await inst.connect();
      console.log(`Extracting from ${source}`);

      await writeTable(con, tmp, "securities.csv", securities(db), {
         symbol: "VARCHAR",
         name: "VARCHAR",
         asset_class: "VARCHAR",
         sector: "VARCHAR",
         theme: "VARCHAR",
         stage: "VARCHAR",
         conviction: "INTEGER",
         tags: "VARCHAR",
         watchlists: "VARCHAR",
         thesis: "VARCHAR",
      }, "CSV, HEADER");

      const bar = {
         open: "DOUBLE",
         high: "DOUBLE",
         low: "DOUBLE",
         close: "DOUBLE",
         volume: "BIGINT",
      };
      const daily = dailyBars(db);
      const sessions = new Set(daily.map((b) => `${b.symbol}|${b.session_date}`));
      await writeTable(con, tmp, "daily_bars.parquet", daily, {
         symbol: "VARCHAR",
         session_date: "DATE",
         ...bar,
      }, "PARQUET");
      await writeTable(con, tmp, "intraday_bars.parquet", intradayBars(db), {
         symbol: "VARCHAR",
         bar_time: "TIMESTAMP",
         session_date: "DATE",
         ...bar,
      }, "PARQUET");

      const optionFields = [
         "call_volume",
         "put_volume",
         "call_premium",
         "put_premium",
         "net_call_premium",
         "net_put_premium",
         "bullish_premium",
         "bearish_premium",
         "call_volume_ask_side",
         "call_volume_bid_side",
         "put_volume_ask_side",
         "put_volume_bid_side",
         "call_open_interest",
         "put_open_interest",
      ];
      await writeTable(con, tmp, "options_flow.parquet", exoRows(db, "options", optionFields, sessions), {
         symbol: "VARCHAR",
         session_date: "DATE",
         ...Object.fromEntries(optionFields.map((f) => [f, "DOUBLE"])),
      }, "PARQUET");

      const greekFields = [
         "call_gamma",
         "put_gamma",
         "call_delta",
         "put_delta",
         "call_vanna",
         "put_vanna",
         "call_charm",
         "put_charm",
      ];
      await writeTable(con, tmp, "greek_exposure.parquet", exoRows(db, "gex", greekFields, sessions), {
         symbol: "VARCHAR",
         session_date: "DATE",
         ...Object.fromEntries(greekFields.map((f) => [f, "DOUBLE"])),
      }, "PARQUET");

      await writeTable(con, tmp, "volatility.parquet", exoRows(db, "iv", ["iv_rank", "iv", "rv"], sessions).map(
         ({ iv, rv, ...rest }) => ({ ...rest, iv_30d: iv, rv_21d: rv }),
      ), {
         symbol: "VARCHAR",
         session_date: "DATE",
         iv_rank: "DOUBLE",
         iv_30d: "DOUBLE",
         rv_21d: "DOUBLE",
      }, "PARQUET");

      await writeTable(con, tmp, "earnings.parquet", earnings(db), {
         symbol: "VARCHAR",
         report_date: "DATE",
         is_upcoming: "BOOLEAN",
         is_premarket: "BOOLEAN",
         expected_move_pct: "DOUBLE",
         eps_estimate: "DOUBLE",
         eps_actual: "DOUBLE",
         surprise_pct: "DOUBLE",
      }, "PARQUET");

      await writeTable(con, tmp, "screener_snapshot.parquet", screener(db), {
         symbol: "VARCHAR",
         as_of: "TIMESTAMP",
         price: "DOUBLE",
         change_pct: "DOUBLE",
         high_52w: "DOUBLE",
         low_52w: "DOUBLE",
         volume: "DOUBLE",
         avg_volume_30d: "DOUBLE",
         relative_volume: "DOUBLE",
         rsi_14: "DOUBLE",
         atr_14: "DOUBLE",
         sma_50: "DOUBLE",
         sma_200: "DOUBLE",
         iv_30d: "DOUBLE",
         iv_rank: "DOUBLE",
         expected_move_pct: "DOUBLE",
         call_volume: "DOUBLE",
         put_volume: "DOUBLE",
         market_cap: "DOUBLE",
         next_earnings: "DATE",
      }, "PARQUET");

      await writeTable(con, tmp, "journal.parquet", journal(db), {
         entry_id: "VARCHAR",
         symbol: "VARCHAR",
         kind: "VARCHAR",
         body: "VARCHAR",
         price_at: "DOUBLE",
         created_at: "TIMESTAMP",
      }, "PARQUET");

      db.close();
   } finally {
      await rm(tmp, { recursive: true, force: true });
   }
}

await main();
