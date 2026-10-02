// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// One fantasy season, ranked. Season and position are givens
// (leaders_app.malloy), so the tabs change bound values and never the query
// text.
//
// URL state: ?season=2025&pos=WR

import { h, byId, color } from "./dom.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";
import { mountShell, segmented, urlState } from "./shell.js";
import { loadTeams, identity, playerHref } from "./identity.js";
import { barChart, lineChart, posColor, sparkBars } from "./charts.js";
import { num, posClass } from "./format.js";

const MODEL = "leaders_app.malloy";
const SEASONS = [2025, 2024, 2023];
const POSITIONS = ["QB", "RB", "WR", "TE", "K"];

const shell = mountShell("leaders");
const url = urlState({ season: "2025", pos: "ALL" });
const page = byId("page");

const board = panel({ title: "Leaderboard", span: 8, flush: true, scroll: true, height: "760px", source: "season_leaders -> leaderboard" });
const scarcity = panel({ title: "Positional scarcity", note: "avg season pts by finish", span: 4, source: "season_leaders -> positional_scarcity" });
const mix = panel({ title: "Where the points come from", span: 4, source: "season_events -> scoring_mix" });
const best = panel({ title: "Best single games", span: 4, flush: true, scroll: true, height: "252px", source: "season_games -> top_games" });

let teams = new Map();
let leaders = { fields: [], rows: [] };
let weekly = new Map();

if (!SEASONS.map(String).includes(url.state.season)) url.state.season = "2025";
if (url.state.pos !== "ALL" && !POSITIONS.includes(url.state.pos)) url.state.pos = "ALL";

const givens = () => ({ SEASON: Number(url.state.season), POSITION: url.state.pos === "ALL" ? "" : url.state.pos });
const show = (p) => url.state.pos === "ALL" || p === url.state.pos;

function drawBoard() {
   const rows = leaders.rows;
   board.setNote(`${rows.length} players · weeks 1-17 · half-PPR`);
   const season = url.state.season;
   dataTable(board.body, {
      fields: leaders.fields,
      rows: rows.slice(0, 300),
      sortKey: "total_points",
      columns: [
         { key: "overall_finish", label: "#", num: true },
         {
            key: "full_name",
            render: (r) => identity({ name: r.full_name, team: r.team, position: r.position, href: playerHref(r.player_id, season) }, teams),
         },
         { key: "position_finish", label: "Pos rk", num: true, render: (r) => `${r.position}${r.position_finish}` },
         { key: "games_played", num: true },
         { key: "total_points", render: (r) => num(r.total_points, 1) },
         { key: "points_per_game" },
         {
            key: "weeks",
            label: "Weeks 1-17",
            sortable: false,
            render: (r) => {
               const byWeek = weekly.get(r.player_id) ?? new Map();
               return sparkBars(
                  Array.from({ length: 17 }, (_, i) => byWeek.get(i + 1) ?? null),
                  { mark: 20, color: `var(--pos-${POSITIONS.includes(r.position) ? r.position : "other"})` },
               );
            },
         },
         { key: "passing_points", render: (r) => num(r.passing_points, 0) },
         { key: "rushing_points", render: (r) => num(r.rushing_points, 0) },
         { key: "receiving_points", render: (r) => num(r.receiving_points, 0) },
         { key: "touchdowns_total", num: true },
         { key: "best_game" },
         { key: "boom_games", num: true },
      ],
      onRow: (r) => (location.href = playerHref(r.player_id, season)),
   });
}

function drawScarcity(result) {
   const bands = ["01-06", "07-12", "13-24", "25-36"];
   const positions = ["QB", "RB", "WR", "TE"].filter(show);
   const canvas = h("canvas");
   scarcity.body.append(h("div", { class: "chart-box", style: { "--h": "220px" } }, canvas));
   lineChart(canvas, {
      labels: bands,
      format: (v) => num(v, 0),
      series: positions.map((pos) => ({
         label: pos,
         color: posColor(pos),
         values: bands.map((b) => result.rows.find((r) => r.position === pos && r.finish_band === b)?.avg_season_points ?? null),
      })),
   });
   scarcity.body.append(
      h(
         "div",
         { class: "legend" },
         positions.map((p) => h("span", { class: `pos ${posClass(p)}` }, h("i", { style: { background: posColor(p) } }), p)),
      ),
   );
}

function drawMix(result) {
   const rows = result.rows.filter((r) => show(r.position));
   const canvas = h("canvas");
   mix.body.append(h("div", { class: "chart-box", style: { "--h": "240px" } }, canvas));
   const parts = [
      { key: "passing_total", label: "Passing", color: "--pos-QB" },
      { key: "rushing_total", label: "Rushing", color: "--pos-RB" },
      { key: "receiving_total", label: "Receiving", color: "--pos-WR" },
      { key: "kicking_total", label: "Kicking", color: "--pos-K" },
   ];
   barChart(canvas, {
      labels: rows.map((r) => r.position),
      format: (v) => num(v, 0),
      stacks: parts.map((p) => ({ label: p.label, color: color(p.color), values: rows.map((r) => r[p.key]) })),
   });
}

function drawBest(result) {
   dataTable(best.body, {
      fields: result.fields,
      rows: result.rows,
      columns: [
         { key: "game_week", label: "Wk" },
         { key: "full_name", label: "Player", render: (r) => identity({ name: r.full_name, team: r.team, position: r.position, href: playerHref(r.player_id, url.state.season) }, teams) },
         { key: "matchup" },
         { key: "result" },
         { key: "game_points" },
      ],
   });
}

function load() {
   const g = givens();
   board.load(
      () =>
         Promise.all([run(MODEL, "run: season_leaders -> leaderboard", g), run(MODEL, "run: season_games -> weekly_by_player", g)]).then(([l, w]) => {
            leaders = l;
            weekly = new Map(w.rows.map((r) => [r.player_id, new Map(r.by_week.map((x) => [x.game_week, x.points]))]));
            return l;
         }),
      drawBoard,
   );
   scarcity.load(() => run(MODEL, "run: season_leaders -> positional_scarcity", g), drawScarcity);
   mix.load(() => run(MODEL, "run: season_events -> scoring_mix", g), drawMix);
   best.load(() => run(MODEL, "run: season_games -> top_games", g), drawBest);
   shell.setMeta([`${url.state.season} season`, "half-PPR · weeks 1-17"]);
}

async function main() {
   teams = await loadTeams().catch(() => new Map());
   const seasonTabs = segmented(
      SEASONS.map((s) => ({ value: String(s), label: String(s) })),
      url.state.season,
      (value) => {
         url.set({ season: value });
         load();
      },
      "Season",
   );
   const posTabs = segmented(
      [{ value: "ALL", label: "All" }, ...POSITIONS.map((p) => ({ value: p, label: p }))],
      url.state.pos,
      (value) => {
         url.set({ pos: value });
         load();
      },
      "Position",
   );
   page.replaceChildren(
      h("div", { class: "toolbar" }, h("span", { class: "label-sm", text: "Season" }), seasonTabs, h("span", { class: "label-sm", text: "Position" }), posTabs),
      h(
         "main",
         {},
         h(
            "div",
            { class: "grid" },
            board.root,
            h("div", { class: "stack", style: { "--span": "4" } }, scarcity.root, mix.root, best.root),
         ),
      ),
   );
   load();
}

main();
