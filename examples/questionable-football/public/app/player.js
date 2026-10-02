// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// One player, one season, after the site's player panel: the key figures,
// "Fantasy points by game" on a game clock, the game log, the plays that
// scored, the career, and what the 2026 market makes of him.
//
// The player and season are givens (player_app.malloy): `?player=` is bound
// as a string and `?season=` as a number, so neither is ever spliced into
// query text. An id the data does not have empties the tiles and says so.
//
// URL state: ?player=HurtJa00&season=2025&week=3

import { h, byId, color } from "./dom.js";
import { panel, run } from "./panel.js";
import { dataTable } from "./table.js";
import { mountShell, segmented, urlState } from "./shell.js";
import { loadTeams, teamChip, posCode } from "./identity.js";
import { barChart, gameFlowChart, posColor } from "./charts.js";
import { DASH, adp, num, pct, signed } from "./format.js";

const MODEL = "player_app.malloy";

const shell = mountShell("player");
const url = urlState({ player: "HurtJa00", season: "2025", week: "" });
const page = byId("page");

const kpis = panel({ title: "Season", span: 12, flush: true });
const flow = panel({ title: "Fantasy points by game", span: 8, source: "player_flow -> game_flow" });
const weekly = panel({ title: "Week by week", span: 4, source: "player_log -> game_log" });
const log = panel({ title: "Game log", span: 8, flush: true, source: "player_log -> game_log" });
const plays = panel({ title: "Scoring plays", span: 4, flush: true, source: "player_flow -> scoring_plays" });
const career = panel({ title: "Career", note: "2023-2025, weeks 1-17", span: 8, flush: true, source: "player_career -> career" });
const market = panel({ title: "2026 market", span: 4, flush: true, source: "player_market -> cheatsheet" });

let teams = new Map();
let seasons = [];
let games = [];
let events = [];
let scoring = [];
let profile = null;

if (!/^\d{4}$/.test(url.state.season)) url.state.season = "2025";
const givens = () => ({ PLAYER: url.state.player, SEASON: Number(url.state.season) });

// ── Header and search ──────────────────────────────────────────────────────

const heroHost = h("div", { class: "hero" });

function drawHero() {
   const team = teams.get(profile?.team);
   const tabs = seasons.length
      ? segmented(
           [...seasons].sort((a, b) => b.season - a.season).map((s) => ({ value: String(s.season), label: String(s.season) })),
           url.state.season,
           (value) => {
              url.set({ season: value, week: "" });
              loadSeason();
           },
           "Season",
        )
      : null;
   heroHost.replaceChildren(
      teamChip(profile?.team, teams, { large: true }),
      h(
         "div",
         {},
         h("h1", { text: profile?.full_name ?? "Unknown player" }),
         h(
            "div",
            { class: "sub" },
            profile ? posCode(profile.position) : null,
            profile ? ` · ${team?.full_name ?? profile.team ?? "Free agent"}` : `No player has the id "${url.state.player}". Search for one above.`,
         ),
      ),
      h("span", { class: "spacer", style: { flex: "1" } }),
      tabs,
   );
}

function searchBox() {
   const input = h("input", { class: "search", type: "search", placeholder: "Find a player…", "aria-label": "Find a player", autocomplete: "off" });
   const list = h("div", { class: "picker-list", hidden: true, role: "listbox" });
   let index = null;
   let active = 0;
   const ensure = () => (index ??= run("fantasy.malloy", "run: player_seasons -> player_index").then((r) => r.rows));
   const choose = (p) => {
      list.hidden = true;
      input.value = "";
      url.set({ player: p.player_id, season: String(p.last_season), week: "" });
      loadPlayer();
   };
   const draw = async () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
         list.hidden = true;
         return;
      }
      const matches = (await ensure()).filter((p) => p.full_name.toLowerCase().includes(q)).slice(0, 25);
      active = Math.min(active, Math.max(0, matches.length - 1));
      list.replaceChildren(
         ...(matches.length
            ? matches.map((p, i) =>
                 h(
                    "button",
                    { type: "button", class: "picker-item", role: "option", "aria-selected": String(i === active), onclick: () => choose(p) },
                    posCode(p.position),
                    h("span", { text: p.full_name }),
                    h("span", { class: "meta", text: `${p.last_season} · ${num(p.career_points, 0)} pts` }),
                 ),
              )
            : [h("div", { class: "empty", text: "No player by that name." })]),
      );
      list.hidden = false;
      list._matches = matches;
   };
   input.addEventListener("focus", ensure);
   input.addEventListener("input", () => {
      active = 0;
      draw();
   });
   input.addEventListener("keydown", (e) => {
      const matches = list._matches ?? [];
      if (e.key === "ArrowDown") active = Math.min(matches.length - 1, active + 1);
      else if (e.key === "ArrowUp") active = Math.max(0, active - 1);
      else if (e.key === "Enter" && matches[active]) return choose(matches[active]);
      else if (e.key === "Escape") return (list.hidden = true);
      else return;
      e.preventDefault();
      draw();
   });
   input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
   return h("div", { class: "picker" }, input, list);
}

// ── Tiles ──────────────────────────────────────────────────────────────────

function drawKpis() {
   const s = seasons.find((x) => String(x.season) === url.state.season);
   kpis.setTitle(`${url.state.season} season`);
   const cells = [
      { k: "Fantasy pts", v: num(s?.total_points, 1), sub: s ? `${s.games_played} games` : "" },
      { k: "Pts / game", v: num(s?.points_per_game, 1), sub: "half-PPR" },
      { k: "Finish", v: s?.finish_label ?? DASH, sub: s ? `#${s.overall_finish} overall` : "" },
      { k: "Best game", v: num(s?.best_game, 1), sub: "single-game high" },
      { k: "20+ games", v: s ? String(s.boom_games) : DASH, sub: s ? pct(s.boom_games / s.games_played) + " of games" : "" },
      { k: "Sub-8 games", v: s ? String(s.bust_games) : DASH, sub: s ? pct(s.bust_games / s.games_played) + " of games" : "" },
   ];
   kpis.body.replaceChildren(
      h(
         "div",
         { class: "kpis", style: { "--n": String(cells.length) } },
         cells.map((c) => h("div", { class: "kpi" }, h("div", { class: "k", text: c.k }), h("div", { class: "v", text: c.v }), h("div", { class: "s", text: c.sub }))),
      ),
   );
}

function selectedWeek() {
   const w = Number(url.state.week);
   if (games.some((g) => g.game_week === w)) return w;
   return games.reduce((best, g) => (!best || g.game_points > best.game_points ? g : best), null)?.game_week ?? null;
}

function pickWeek(week) {
   url.set({ week: String(week) });
   drawFlow();
   drawWeekly();
   drawLog();
   drawPlays();
}

function drawFlow() {
   const week = selectedWeek();
   const byWeek = new Map();
   for (const e of events) {
      if (!byWeek.has(e.game_week)) byWeek.set(e.game_week, []);
      byWeek.get(e.game_week).push(e);
   }
   const series = [...byWeek.entries()].map(([w, rows]) => {
      let cum = 0;
      const g = games.find((x) => x.game_week === w);
      return {
         key: w,
         label: `Wk ${w} ${g?.matchup ?? ""}  ${g ? num(g.game_points, 1) : ""} pts`,
         points: rows.sort((a, b) => a.seconds_elapsed - b.seconds_elapsed).map((r) => ({ t: r.seconds_elapsed, cum: (cum += r.fantasy_points) })),
      };
   });
   const ppg = games.length ? games.reduce((s, g) => s + g.game_points, 0) / games.length : null;
   const g = games.find((x) => x.game_week === week);
   flow.setNote(g ? `Wk ${week} ${g.matchup} · ${g.result} · ${num(g.game_points, 1)} pts · dashed line: ${num(ppg, 1)} per game` : "");
   flow.body.replaceChildren();
   const canvas = h("canvas");
   flow.body.append(h("div", { class: "chart-box", style: { "--h": "260px" } }, canvas));
   gameFlowChart(canvas, { games: series, highlight: week, ppg, color: posColor(profile?.position), onPick: pickWeek });
}

function drawWeekly() {
   const week = selectedWeek();
   weekly.body.replaceChildren();
   const canvas = h("canvas");
   weekly.body.append(h("div", { class: "chart-box", style: { "--h": "260px" } }, canvas));
   const on = posColor(profile?.position);
   const off = color("--g7");
   barChart(canvas, {
      labels: games.map((g) => String(g.game_week)),
      values: games.map((g) => g.game_points),
      colors: games.map((g) => (g.game_week === week ? on : off)),
      format: (v) => num(v, 1),
      axisFormat: (v) => num(v, 0),
      onClick: (i) => pickWeek(games[i].game_week),
   });
}

function drawLog(result) {
   if (result) games = result.rows;
   const week = selectedWeek();
   dataTable(log.body, {
      fields: log._fields ?? (log._fields = result?.fields ?? []),
      rows: games,
      columns: [
         { key: "game_week" },
         { key: "game_date" },
         { key: "matchup" },
         { key: "result", cellClass: (r) => (String(r.result).startsWith("W") ? "up" : String(r.result).startsWith("L") ? "down" : undefined) },
         { key: "pass_pts" },
         { key: "rush_pts" },
         { key: "recv_pts" },
         { key: "tds" },
         { key: "game_points", render: (r) => h("b", { text: num(r.game_points, 1) }) },
      ],
      selected: (r) => r.game_week === week,
      onRow: (r) => pickWeek(r.game_week),
   });
}

function drawPlays() {
   const week = selectedWeek();
   const rows = scoring.filter((p) => p.game_week === week && Math.abs(p.points) >= 1);
   plays.setNote(week ? `week ${week} · plays worth a point or more` : "");
   plays.body.replaceChildren(
      rows.length
         ? h(
              "div",
              { class: "plays" },
              rows.map((p) =>
                 h(
                    "div",
                    { class: "play" },
                    h("span", { class: "when", text: `${p.quarter_label} ${p.clock ?? ""}` }),
                    h("span", { class: "what", text: p.detail }),
                    h("span", { class: `pts ${p.points < 0 ? "down" : ""}`, text: signed(p.points, 1) }),
                 ),
              ),
           )
         : h("div", { class: "empty", text: "No play worth a point or more that week." }),
   );
}

function drawCareer(result) {
   dataTable(career.body, {
      fields: result.fields,
      rows: result.rows,
      selected: (r) => String(r.season) === url.state.season,
      onRow: (r) => {
         url.set({ season: String(r.season), week: "" });
         loadSeason();
      },
   });
}

function drawMarket([board, price]) {
   const p = board.rows[0];
   const was = price.rows[0];
   const items = [];
   const head = (text) => h("div", { class: "kv-head label-sm", text });
   if (p) {
      items.push(
         head("2026 draft"),
         ...kv("ADP", `${adp(p.adp)} · ${p.draft_slot}`),
         ...kv("Position rank by ADP", `${p.position}${p.adp_position_rank}`),
         ...kv("Projected points", `${num(p.projected_points, 0)} · ${p.position}${p.projected_position_rank ?? DASH}`),
         ...kv("Value vs ADP", signed(p.value_vs_adp), p.value_vs_adp > 0 ? "up" : p.value_vs_adp < 0 ? "down" : ""),
         ...kv("VOR", signed(p.vor)),
         ...kv("Boom / bust", `${pct(p.boom_rate)} / ${pct(p.bust_rate)}`),
         ...kv("Schedule (SOS rank)", `#${p.sos_rank ?? DASH} · ${p.sos_tier ?? DASH}`),
         ...kv("Week 1 matchup", `${p.week1_matchup ?? DASH} · ${p.week1_tier ?? DASH}`),
         ...kv("Bye", p.bye_week ?? DASH),
      );
   }
   if (was) {
      items.push(
         head("2025 price, graded"),
         ...kv("2025 ADP", `${adp(was.adp)} · ${was.position}${was.position_rank}`),
         ...kv("Finished", was.position_finish ? `${was.position}${was.position_finish}` : "did not score"),
         ...kv("Finish vs ADP", signed(was.finish_vs_adp), was.finish_vs_adp >= 0 ? "up" : "down"),
      );
   }
   market.body.replaceChildren(
      items.length ? h("dl", { class: "kv" }, items) : h("div", { class: "empty", text: "Not on the 2026 board or the 2025 draft market." }),
   );
}

function kv(label, value, tone) {
   return [h("dt", { text: label }), h("dd", { class: tone || undefined, text: value })];
}

// ── Loading ────────────────────────────────────────────────────────────────

function loadSeason() {
   const g = givens();
   drawHero();
   drawKpis();
   log.load(
      () =>
         Promise.all([run(MODEL, "run: player_log -> game_log", g), run(MODEL, "run: player_flow -> game_flow", g), run(MODEL, "run: player_flow -> scoring_plays", g)]).then(
            ([l, f, sp]) => {
               log._fields = l.fields;
               events = f.rows;
               scoring = sp.rows;
               return l;
            },
         ),
      (result) => {
         drawLog(result);
         drawFlow();
         drawWeekly();
         drawPlays();
      },
      { empty: `No games in ${url.state.season}.` },
   );
   shell.setMeta([profile?.full_name ?? url.state.player, `${url.state.season} season`]);
}

async function loadPlayer() {
   const g = givens();
   const [prof, car] = await Promise.all([run(MODEL, "run: player_profile -> { select: player_id, full_name, position, team }", g), run(MODEL, "run: player_career -> career", g)]).catch(
      () => [{ rows: [] }, { fields: [], rows: [] }],
   );
   profile = prof.rows[0] ?? null;
   seasons = car.rows;
   if (seasons.length && !seasons.some((s) => String(s.season) === url.state.season)) {
      url.set({ season: String(Math.max(...seasons.map((s) => s.season))) });
   }
   career.load(async () => car, drawCareer, { empty: "No fantasy seasons on record." });
   market.load(() => Promise.all([run(MODEL, "run: player_market -> cheatsheet", g), run(MODEL, "run: player_price_2025 -> pick_results", g)]), drawMarket);
   loadSeason();
}

async function main() {
   teams = await loadTeams().catch(() => new Map());
   page.replaceChildren(
      h("div", { class: "toolbar" }, searchBox(), h("span", { class: "spacer" }), h("a", { class: "btn", href: "./leaders.html", text: "Season leaders →", style: { "line-height": "26px", "text-decoration": "none" } })),
      h(
         "main",
         {},
         heroHost,
         h("div", { class: "grid", style: { "margin-top": "8px" } }, kpis.root, flow.root, weekly.root, log.root, plays.root, career.root, market.root),
      ),
   );
   loadPlayer();
}

main();

