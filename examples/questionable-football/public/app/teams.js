// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The 2026 season as the betting market sees it. The league board and the
// schedule grid read market.malloy for all 32 teams; the section below them is
// about the team in `?team=`, bound as a given in team_app.malloy.
//
// URL state: ?team=PHI

import { h, byId } from "./dom.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";
import { mountShell, urlState } from "./shell.js";
import { loadTeams, teamChip, identity, playerHref } from "./identity.js";
import { DASH, num, pct, signed, adp, winStep } from "./format.js";

const TEAM_MODEL = "team_app.malloy";
const WEEKS = 18;

const shell = mountShell("teams");
const url = urlState({ team: "PHI" });
const page = byId("page");

const board = panel({ title: "League board", note: "2026 futures · lines posted so far · 2025 results", span: 12, flush: true, scroll: true, height: "430px", source: "team_outlook -> league_board" });
const grid = panel({ title: "Schedule", note: "win probability by week, from each team's side", span: 12, flush: true, source: "team_schedule_2026 -> slate" });
const card = panel({ title: "Outlook", span: 12, flush: true, source: "team_card -> league_board" });
const slate = panel({ title: "2026 slate", span: 4, flush: true, source: "team_slate -> slate" });
const record = panel({ title: "Record", note: "regular season", span: 4, flush: true, source: "team_record -> standings" });
const offense = panel({ title: "Offense", note: "regular season, EPA per play", span: 4, flush: true, source: "team_offense -> offense_by_team" });
const scorers = panel({ title: "2025 fantasy scorers", span: 6, flush: true, scroll: true, height: "330px", source: "team_fantasy -> leaderboard" });
const onBoard = panel({ title: "On the 2026 board", span: 6, flush: true, scroll: true, height: "330px", source: "team_board -> cheatsheet" });

let teams = new Map();
let outlook = { fields: [], rows: [] };
let schedule = [];

const givens = () => ({ TEAM: url.state.team });

function drawBoard() {
   dataTable(board.body, {
      fields: outlook.fields,
      rows: outlook.rows,
      sortKey: "win_total",
      columns: [
         { key: "full_name", render: (r) => h("span", { class: "ident" }, teamChip(r.team, teams), h("span", { class: "name", text: r.full_name })) },
         { key: "conference", label: "Div", render: (r) => `${r.conference} ${r.division}` },
         { key: "win_total" },
         { key: "line_implied_wins" },
         { key: "lines_vs_total", cellClass: (r) => (r.lines_vs_total > 0.5 ? "up" : r.lines_vs_total < -0.5 ? "down" : undefined) },
         { key: "playoff_prob" },
         { key: "division_prob" },
         { key: "super_bowl_prob", render: (r) => pct(r.super_bowl_prob, r.super_bowl_prob < 0.01 ? 1 : 0) },
         { key: "implied_ppg" },
         { key: "ppg_2025" },
         { key: "ppg_change", cellClass: (r) => (r.ppg_change > 1 ? "up" : r.ppg_change < -1 ? "down" : undefined) },
         { key: "wins_2025" },
         { key: "schedule_strength" },
      ],
      selected: (r) => r.team === url.state.team,
      onRow: (r) => select(r.team),
   });
}

function drawGrid() {
   const order = [...outlook.rows].sort((a, b) => b.win_total - a.win_total || a.team.localeCompare(b.team)).map((r) => r.team);
   const byTeam = new Map(order.map((t) => [t, new Map()]));
   for (const g of schedule) byTeam.get(g.team)?.set(g.game_week, g);
   const host = h("div", { class: "sched", style: { "grid-template-columns": `5.5rem repeat(${WEEKS}, minmax(2.1rem, 1fr))` } });
   host.append(h("span", { class: "hdr" }));
   for (let w = 1; w <= WEEKS; w++) host.append(h("span", { class: "hdr", text: String(w) }));
   for (const team of order) {
      const mine = team === url.state.team;
      const wins = outlook.rows.find((r) => r.team === team)?.win_total;
      host.append(
         h(
            "button",
            { type: "button", class: `team-cell ${mine ? "selected" : ""}`, onclick: () => select(team), title: teams.get(team)?.full_name ?? team },
            teamChip(team, teams),
            h("span", { class: "muted", text: num(wins, 1) }),
         ),
      );
      for (let w = 1; w <= WEEKS; w++) {
         const g = byTeam.get(team).get(w);
         if (!g) {
            host.append(h("span", { class: `cell bye ${mine ? "selected" : ""}`, text: "BYE" }));
            continue;
         }
         const step = g.has_lines ? winStep(g.win_prob) : null;
         host.append(
            h("span", {
               class: ["cell", g.has_lines && "lined", step !== null && `w${step}`, mine && "selected"].filter(Boolean).join(" "),
               text: `${g.is_home ? "" : "@"}${g.opponent}`,
               title: g.has_lines
                  ? `Wk ${w} ${g.matchup} · spread ${signed(g.spread, 1)} · win ${pct(g.win_prob)} · implied ${num(g.implied_points_for, 1)} pts`
                  : `Wk ${w} ${g.matchup} · no line posted yet`,
            }),
         );
      }
   }
   grid.body.replaceChildren(
      host,
      h(
         "div",
         { class: "foot legend" },
         h("span", {}, h("i", { class: "sw-up" }), "likely win"),
         h("span", {}, h("i", { class: "sw-down" }), "likely loss"),
         h("span", {}, h("i", { class: "sw-none" }), "no line posted yet"),
         h("span", { text: "Lines are posted a few weeks ahead; deeper shading is a bigger favourite or underdog." }),
      ),
   );
}

function drawCard(result) {
   const r = result.rows[0];
   const team = teams.get(url.state.team);
   card.setTitle(`${team?.full_name ?? url.state.team} · 2026 outlook`);
   const cells = [
      { k: "Win total", v: num(r.win_total, 1), s: `${num(r.wins_2025, 0)} wins in 2025` },
      { k: "Line-implied wins", v: num(r.line_implied_wins, 1), s: `${signed(r.lines_vs_total, 1)} vs total · ${r.posted_games} lined games` },
      { k: "Playoffs", v: pct(r.playoff_prob), s: `division ${pct(r.division_prob)}` },
      { k: "Super Bowl", v: pct(r.super_bowl_prob, r.super_bowl_prob < 0.01 ? 1 : 0), s: "vig removed" },
      { k: "Implied PPG", v: num(r.implied_ppg, 1), s: `${signed(r.ppg_change, 1)} vs 2025's ${num(r.ppg_2025, 1)}` },
      { k: "Opp win total", v: num(r.schedule_strength, 1), s: "avg of 17 opponents" },
   ];
   card.body.replaceChildren(
      h(
         "div",
         { class: "kpis", style: { "--n": String(cells.length) } },
         cells.map((c) => h("div", { class: "kpi" }, h("div", { class: "k", text: c.k }), h("div", { class: "v", text: c.v }), h("div", { class: "s", text: c.s }))),
      ),
   );
}

function drawSlate(result) {
   dataTable(slate.body, {
      fields: result.fields,
      rows: result.rows,
      columns: [
         { key: "game_week" },
         { key: "matchup" },
         { key: "spread", render: (r) => (r.has_lines ? signed(r.spread, 1) : DASH) },
         { key: "win_prob", render: (r) => (r.has_lines ? pct(r.win_prob) : DASH), cellClass: (r) => (r.has_lines ? (r.win_prob >= 0.5 ? "up" : "down") : "muted") },
         { key: "implied_points_for", render: (r) => (r.has_lines ? num(r.implied_points_for, 1) : DASH) },
      ],
   });
}

function drawRecord(result) {
   dataTable(record.body, {
      fields: result.fields,
      rows: [...result.rows].sort((a, b) => b.season - a.season),
      columns: [
         { key: "season" },
         { key: "wins", label: "W-L", num: true, render: (r) => `${r.wins}-${r.losses}` },
         { key: "points_for_per_game", label: "PF/g" },
         { key: "points_against_per_game", label: "PA/g" },
         { key: "point_differential", label: "Diff", cellClass: (r) => (r.point_differential > 0 ? "up" : r.point_differential < 0 ? "down" : undefined) },
      ],
   });
}

function drawOffense(result) {
   dataTable(offense.body, {
      fields: result.fields,
      rows: [...result.rows].sort((a, b) => b.season - a.season),
      columns: [{ key: "season" }, { key: "epa_per_play" }, { key: "pass_rate" }, { key: "success_rate" }, { key: "explosive_rate", label: "Explosive" }],
   });
}

function drawScorers(result) {
   dataTable(scorers.body, {
      fields: result.fields,
      rows: result.rows,
      columns: [
         { key: "full_name", render: (r) => identity({ name: r.full_name, team: r.team, position: r.position, href: playerHref(r.player_id, 2025) }, teams) },
         { key: "position_finish", label: "Finish", num: true, render: (r) => `${r.position}${r.position_finish}` },
         { key: "games_played", num: true },
         { key: "total_points", render: (r) => num(r.total_points, 1) },
         { key: "points_per_game" },
      ],
      onRow: (r) => (location.href = playerHref(r.player_id, 2025)),
   });
}

function drawOnBoard(result) {
   dataTable(onBoard.body, {
      fields: result.fields,
      rows: result.rows,
      columns: [
         { key: "adp", label: "ADP", num: true, render: (r) => adp(r.adp) },
         { key: "name", label: "Player", render: (r) => identity({ name: r.name, team: r.team, position: r.position, href: r.player_id ? playerHref(r.player_id, 2025) : undefined }, teams) },
         { key: "draft_slot", label: "Pick" },
         { key: "projected_points" },
         { key: "vor" },
         { key: "value_vs_adp", label: "Value", cellClass: (r) => (r.value_vs_adp > 0 ? "up" : r.value_vs_adp < 0 ? "down" : undefined) },
      ],
   });
}

function loadTeam() {
   const g = givens();
   card.load(() => run(TEAM_MODEL, "run: team_card -> league_board", g), drawCard, { empty: `No team has the code "${url.state.team}".` });
   slate.load(() => run(TEAM_MODEL, "run: team_slate -> slate", g), drawSlate);
   record.load(() => run(TEAM_MODEL, "run: team_record -> standings", g), drawRecord);
   offense.load(() => run(TEAM_MODEL, "run: team_offense -> offense_by_team", g), drawOffense);
   scorers.load(() => run(TEAM_MODEL, "run: team_fantasy -> leaderboard + { where: season = 2025; limit: 12 }", g), drawScorers);
   onBoard.load(() => run(TEAM_MODEL, "run: team_board -> cheatsheet", g), drawOnBoard, { empty: "No drafted players." });
   shell.setMeta([teams.get(url.state.team)?.full_name ?? url.state.team, "2026 market"]);
}

const picker = h("select", { class: "select", "aria-label": "Team", onchange: (e) => select(e.target.value) });

function select(team) {
   url.set({ team });
   picker.value = team;
   if (outlook.rows.length) drawBoard();
   if (schedule.length) drawGrid();
   loadTeam();
}

async function main() {
   teams = await loadTeams().catch(() => new Map());
   picker.append(...[...teams.values()].map((t) => h("option", { value: t.team, text: `${t.team} · ${t.full_name}`, selected: t.team === url.state.team })));
   page.replaceChildren(
      h("div", { class: "toolbar" }, h("span", { class: "label-sm", text: "Team" }), picker),
      h("main", {}, h("div", { class: "grid" }, board.root, grid.root, card.root, slate.root, record.root, offense.root, scorers.root, onBoard.root)),
   );
   board.load(
      () => run("market.malloy", "run: team_outlook -> league_board"),
      (result) => {
         outlook = result;
         drawBoard();
         if (schedule.length) drawGrid();
      },
   );
   grid.load(
      () => run("market.malloy", "run: team_schedule_2026 -> slate"),
      (result) => {
         schedule = result.rows;
         if (outlook.rows.length) drawGrid();
      },
   );
   loadTeam();
}

main();
