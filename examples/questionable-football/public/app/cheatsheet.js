// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The 2026 draft cheatsheet, after data.questionablefootball.com/cheatsheet: a
// wall of dense tiles over ONE query (`draft_board -> cheatsheet`), each a
// different ranking of the players still on the board. Click a name as it
// comes off the board in your draft and every tile re-ranks without it.
//
// What is the model's and what is the page's: every number a tile shows (ADP,
// projection, value vs ADP, VOR, boom and bust rates, schedule rank, last
// season) is a field of the cheatsheet view in fantasy.malloy. The page owns
// only the draft in progress: which names are gone, in what order, and from
// that the pick on the clock, your roster and what is likely to be left by
// your next turn. That state is the reader's, so it lives in this browser
// (localStorage), and the filters live in the URL.

import { h, byId } from "./dom.js";
import { panel, run } from "./panel.js";
import { mountShell, segmented, urlState } from "./shell.js";
import { loadTeams, identity, teamChip, posCode, playerHref } from "./identity.js";
import { DASH, adp, num, pct, signed, posClass, shortName, slotOfPick, picksUntilTurn, pickLabel } from "./format.js";

const MODEL = "fantasy.malloy";
const QUERY = "run: draft_board -> cheatsheet";
const STORE = "qf.cheatsheet.crossed";
const TEAMS = 12;
const POSITIONS = ["QB", "RB", "WR", "TE"];
// Starting lineup for "My team": 1 QB, 2 RB, 3 WR, 1 TE and a flex.
const LINEUP = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX"];
const FLEX = new Set(["RB", "WR", "TE"]);
// The value bar's zero line sits at the right edge of the ADP column.
const ZERO_REM = 2.625;

const shell = mountShell("cheatsheet");
const url = urlState({ q: "", pos: "ALL", team: "ALL", slot: "" });
const page = byId("page");

let board = [];
let teams = new Map();
let crossed = readCrossed();
let resetArmed = false;

function readCrossed() {
   try {
      const ids = JSON.parse(localStorage.getItem(STORE) ?? "[]");
      return Array.isArray(ids) ? ids.map(String) : [];
   } catch {
      return [];
   }
}

function saveCrossed() {
   localStorage.setItem(STORE, JSON.stringify(crossed));
}

function take(id) {
   if (crossed.includes(id)) return;
   crossed.push(id);
   saveCrossed();
   paint();
}

function restore(id) {
   crossed = crossed.filter((x) => x !== id);
   saveCrossed();
   paint();
}

// ── Derived state ──────────────────────────────────────────────────────────

function derive() {
   const gone = new Set(crossed);
   const index = new Map(board.map((p) => [p.draft_id, p]));
   const available = board.filter((p) => !gone.has(p.draft_id));
   const q = url.state.q.trim().toLowerCase();
   const filtered = available.filter(
      (p) =>
         (url.state.pos === "ALL" || p.position === url.state.pos) &&
         (url.state.team === "ALL" || p.team === url.state.team) &&
         (!q || p.name.toLowerCase().includes(q)),
   );
   const vors = available.map((p) => p.vor).filter((v) => typeof v === "number");
   const taken = crossed.map((id) => index.get(id)).filter(Boolean);
   const slot = Number(url.state.slot) || null;
   const current = taken.length + 1;
   let horizon = TEAMS;
   if (slot) horizon = slotOfPick(current, TEAMS) === slot ? picksUntilTurn(current + 1, slot, TEAMS) + 1 : picksUntilTurn(current, slot, TEAMS);
   return {
      available,
      filtered,
      taken,
      slot,
      current,
      horizon,
      vorMax: Math.max(1, ...vors),
      vorNegMax: Math.max(1, ...vors.map((v) => -v)),
   };
}

// ── Rows ───────────────────────────────────────────────────────────────────

function valueBar(vor, d) {
   if (typeof vor !== "number") return null;
   if (vor > 0) {
      return h("span", {
         class: "bar",
         style: { left: `${ZERO_REM}rem`, width: `calc((100% - ${ZERO_REM}rem) * ${Math.min(1, vor / d.vorMax).toFixed(4)})` },
      });
   }
   if (vor < 0) {
      const frac = Math.log1p(Math.min(-vor, d.vorNegMax)) / Math.log1p(d.vorNegMax);
      return h("span", { class: "bar neg", style: { left: `${((1 - frac) * ZERO_REM).toFixed(3)}rem`, width: `${(frac * ZERO_REM).toFixed(3)}rem` } });
   }
   return null;
}

function tip(p) {
   const lines = [
      `${p.name} · ${p.position} · ${p.team ?? "FA"}${p.bye_week ? ` · bye ${p.bye_week}` : ""}`,
      `ADP ${adp(p.adp)} (${p.draft_slot}, ${p.position}${p.adp_position_rank})`,
      `Proj ${num(p.projected_points, 0)} pts (${p.position}${p.projected_position_rank ?? DASH}) · VOR ${signed(p.vor)}`,
      `Boom ${pct(p.boom_rate)} · Bust ${pct(p.bust_rate)} · SOS #${p.sos_rank ?? DASH}`,
      p.finish_label ? `2025: ${p.finish_label}, ${num(p.total_points, 1)} pts (${num(p.points_per_game, 1)}/g)` : "2025: no fantasy points",
      "Click to cross off",
   ];
   return lines.join("\n");
}

function row(p, d, { right, tone } = {}) {
   const el = h(
      "div",
      {
         class: `row ${posClass(p.position)}`,
         role: "button",
         tabindex: "0",
         title: tip(p),
         onclick: () => take(p.draft_id),
         onkeydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
               e.preventDefault();
               take(p.draft_id);
            }
         },
      },
      typeof p.vor === "number" ? h("span", { class: "zero" }) : null,
      valueBar(p.vor, d),
      h("span", { class: "adp", text: adp(p.adp) }),
      teamChip(p.team, teams),
      h("span", { class: "name", text: p.name }),
      posCode(p.position),
      right !== undefined ? h("span", { class: `right ${tone ?? ""}`, text: right }) : null,
      p.player_id
         ? h("a", {
              class: "open",
              href: playerHref(p.player_id, 2025),
              title: `${p.name}'s 2025 season`,
              text: "↗",
              onclick: (e) => e.stopPropagation(),
           })
         : h("span", { class: "open" }),
   );
   return el;
}

function rowList(players, d, opts = {}, { limit = 80, maxH } = {}) {
   const list = h("div", { class: "rows", style: maxH ? { "--max-h": maxH } : undefined });
   for (const p of players.slice(0, limit)) list.append(row(p, d, typeof opts === "function" ? opts(p) : opts));
   return list;
}

function tile({ title, note, span = 1, dot, body, empty, source }) {
   const t = panel({ title, note, span, dot, flush: true, source });
   const nodes = body();
   const has = nodes && !(nodes.classList?.contains("rows") && nodes.childElementCount === 0);
   t.body.append(has ? nodes : h("div", { class: "empty", text: empty }));
   return t.root;
}

const byAdp = (a, b) => (a.adp ?? 999) - (b.adp ?? 999);
const projRight = (p) => ({ right: num(p.projected_points, 0) });

// ── Tiles ──────────────────────────────────────────────────────────────────

function bestAvailable(d) {
   return tile({
      title: "Best available · ADP",
      note: `${d.filtered.length} available`,
      span: 2,
      source: "draft_board -> cheatsheet",
      empty: "No names match.",
      body: () => rowList([...d.filtered].sort(byAdp), d, projRight, { limit: 200, maxH: "468px" }),
   });
}

function pickNowVsWait(d) {
   const ordered = [...d.available].sort(byAdp);
   const later = new Set(ordered.slice(d.horizon).map((p) => p.draft_id));
   const best = (list) => list.reduce((top, p) => (typeof p.vor === "number" && (!top || p.vor > top.vor) ? p : top), null);
   const lines = POSITIONS.map((pos) => {
      const pool = d.available.filter((p) => p.position === pos);
      return { pos, now: best(pool), wait: best(pool.filter((p) => later.has(p.draft_id))) };
   }).filter((r) => r.now);
   const values = lines.flatMap((r) => [r.now.vor, r.wait?.vor ?? 0]);
   const lo = Math.min(0, ...values);
   const hi = Math.max(1, ...values);
   const at = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
   const body = h(
      "div",
      { class: "ladder" },
      lines.map((r) => {
         const drop = r.now.vor - (r.wait?.vor ?? lo);
         return h(
            "div",
            {
               class: `ladder-row ${posClass(r.pos)}`,
               title: `Now: ${r.now.name} (VOR ${signed(r.now.vor)})\nIn ${d.horizon} picks: ${r.wait ? `${r.wait.name} (VOR ${signed(r.wait.vor)})` : "nobody left"}`,
            },
            posCode(r.pos),
            h(
               "div",
               { class: "track" },
               h("span", { class: "gap", style: { left: at(r.wait?.vor ?? lo), width: `calc(${at(r.now.vor)} - ${at(r.wait?.vor ?? lo)})` } }),
               r.wait ? h("span", { class: "mark later", style: { left: at(r.wait.vor) } }) : null,
               h("span", { class: "mark", style: { left: at(r.now.vor) } }),
            ),
            h("span", { class: `drop ${drop >= 25 ? "big" : ""}`, text: signed(-drop) }),
         );
      }),
      h("p", {
         class: "foot",
         text: `Filled dot: the best value over replacement on the board now. Ring: the best likely left after the next ${d.horizon} picks go by ADP. A long gap says take the position now.`,
      }),
   );
   return tile({ title: "Pick now vs. wait", note: `next pick ≈ ${d.horizon} away`, span: 1, body: () => body, empty: "No projections left to compare." });
}

function marketSteals(d) {
   const steals = d.filtered.filter((p) => p.value_vs_adp > 0 && p.adp <= 160).sort((a, b) => b.value_vs_adp - a.value_vs_adp || byAdp(a, b));
   return tile({
      title: "Market steals",
      note: "proj rank beats ADP",
      body: () => rowList(steals, d, (p) => ({ right: signed(p.value_vs_adp), tone: "up" }), { maxH: "236px" }),
      empty: "No mispriced names left.",
   });
}

function draftFlow(d) {
   const n = d.taken.length;
   const counts = POSITIONS.map((pos) => ({ pos, n: d.taken.filter((p) => p.position === pos).length }));
   const top = Math.max(1, ...counts.map((c) => c.n));
   const body = n
      ? h(
           "div",
           { class: "flow" },
           counts.map((c) =>
              h(
                 "div",
                 { class: `flow-row ${posClass(c.pos)}` },
                 posCode(c.pos),
                 h("div", { class: "flow-bar" }, h("span", { style: { width: `${(c.n / top) * 100}%` } })),
                 h("span", { class: "n", text: c.n }),
              ),
           ),
           h("div", { class: "label-sm", text: "Last 12 picks" }),
           h(
              "div",
              { class: "run" },
              d.taken.slice(-12).map((p) => h("span", { class: posClass(p.position), text: p.position, title: `${pickLabel(d.taken.indexOf(p) + 1)} ${p.name}` })),
           ),
        )
      : null;
   return tile({
      title: "Draft flow",
      note: n ? `${n} picks · round ${Math.ceil((n + 1) / TEAMS)}` : undefined,
      body: () => body,
      empty: "Position run tracker — fills in as names get crossed off.",
   });
}

function myTeam(d) {
   const select = h(
      "select",
      {
         class: "select",
         "aria-label": "Your pick slot",
         onchange: (e) => {
            url.set({ slot: e.target.value });
            paint();
         },
      },
      h("option", { value: "", text: "—" }),
      Array.from({ length: TEAMS }, (_, i) => h("option", { value: String(i + 1), text: `Pick ${i + 1}`, selected: d.slot === i + 1 })),
   );
   const setup = h("div", { class: "team-setup" }, h("span", { text: "Your slot" }), select);
   if (!d.slot) {
      return tile({
         title: "My team",
         body: () => h("div", {}, setup, h("div", { class: "empty", text: "Pick your draft slot — names crossed off at your picks become your roster." })),
      });
   }
   const mine = d.taken.map((p, i) => ({ p, pick: i + 1 })).filter((x) => slotOfPick(x.pick, TEAMS) === d.slot);
   const left = [...mine];
   const lineup = LINEUP.map((slotPos) => {
      const i = left.findIndex((x) => (slotPos === "FLEX" ? FLEX.has(x.p.position) : x.p.position === slotPos));
      return { slotPos, pick: i >= 0 ? left.splice(i, 1)[0] : null };
   });
   const bench = left.map((pick) => ({ slotPos: "BN", pick }));
   const onClock = slotOfPick(d.current, TEAMS) === d.slot;
   return tile({
      title: "My team",
      note: onClock ? "you're on the clock" : `next pick in ${picksUntilTurn(d.current, d.slot, TEAMS)}`,
      body: () =>
         h(
            "div",
            {},
            setup,
            h(
               "div",
               { class: "slots" },
               [...lineup, ...bench].map(({ slotPos, pick }) =>
                  h(
                     "div",
                     { class: "slot-row" },
                     h("span", { class: "slot", text: slotPos }),
                     pick ? identity({ name: pick.p.name, team: pick.p.team, position: pick.p.position }, teams) : h("span", { class: "open-slot" }),
                     pick ? h("span", { class: "pick", text: pickLabel(pick.pick) }) : null,
                  ),
               ),
            ),
         ),
   });
}

function positionBoard(pos, d) {
   const players = d.filtered.filter((p) => p.position === pos).sort(byAdp);
   return tile({
      title: pos,
      dot: posClass(pos),
      note: `${players.length} available`,
      body: () => rowList(players, d, projRight, { limit: 80, maxH: "320px" }),
      empty: "Position cleaned out.",
   });
}

function ranked(title, note, players, right, empty, span = 1) {
   return (d) =>
      tile({
         title,
         note,
         span,
         body: () => rowList(players(d), d, right, { maxH: "300px" }),
         empty,
      });
}

const inPlay = (p) => p.adp <= 180;

const breakouts = ranked(
   "Breakouts",
   "proj vs 2025",
   // Eight or more 2025 games, so a backup's three spot starts are not a baseline.
   (d) => d.filtered.filter((p) => inPlay(p) && p.games_played >= 8 && p.projected_points).sort((a, b) => b.projected_points - b.total_points - (a.projected_points - a.total_points)),
   (p) => ({ right: signed(p.projected_points - p.total_points), tone: "up" }),
   "No breakout projections left.",
   2,
);
const boom = ranked(
   "Boom upside",
   "boom rate",
   (d) => d.filtered.filter((p) => inPlay(p) && typeof p.boom_rate === "number").sort((a, b) => b.boom_rate - a.boom_rate || byAdp(a, b)),
   (p) => ({ right: pct(p.boom_rate), tone: "up" }),
   "No boom profiles left.",
);
const floors = ranked(
   "Steady floors",
   "bust rate",
   (d) => d.filtered.filter((p) => inPlay(p) && typeof p.bust_rate === "number").sort((a, b) => a.bust_rate - b.bust_rate || byAdp(a, b)),
   (p) => ({ right: pct(p.bust_rate) }),
   "No safe floors left.",
);
const schedule = ranked(
   "Smooth schedule",
   "SOS rank",
   (d) => d.filtered.filter((p) => inPlay(p) && typeof p.sos_rank === "number").sort((a, b) => a.sos_rank - b.sos_rank || byAdp(a, b)),
   (p) => ({ right: `#${p.sos_rank}`, tone: p.sos_tier === "Easy" ? "up" : p.sos_tier === "Hard" ? "down" : "" }),
   "No easy schedules left.",
);
const overpriced = ranked(
   "Overpriced",
   "ADP beats proj rank",
   (d) => d.filtered.filter((p) => p.value_vs_adp < 0 && p.adp <= 160).sort((a, b) => a.value_vs_adp - b.value_vs_adp || byAdp(a, b)),
   (p) => ({ right: signed(p.value_vs_adp), tone: "down" }),
   "No overpriced names left.",
);

function crossedOff(d) {
   const n = d.taken.length;
   if (!n) return tile({ title: "Crossed off", span: 6, body: () => null, empty: "Nobody drafted yet — click names as they come off the board." });
   const rounds = Math.ceil(n / TEAMS);
   const grid = h("div", { class: "board", style: { "grid-template-columns": `1.75rem repeat(${TEAMS}, minmax(4.75rem, 1fr))` } });
   grid.append(h("span", { class: "hdr" }));
   for (let slot = 1; slot <= TEAMS; slot++) grid.append(h("span", { class: `hdr ${slot === d.slot ? "mine" : ""}`, text: slot === d.slot ? "YOU" : String(slot) }));
   for (let r = 1; r <= rounds; r++) {
      grid.append(h("span", { class: "hdr", text: `R${r}` }));
      const cells = new Array(TEAMS).fill(null);
      for (let pick = (r - 1) * TEAMS + 1; pick <= r * TEAMS; pick++) cells[slotOfPick(pick, TEAMS) - 1] = pick;
      for (const pick of cells) {
         const p = d.taken[pick - 1];
         if (!p) {
            grid.append(h("span", { class: "card empty-card", "aria-hidden": "true" }));
            continue;
         }
         grid.append(
            h(
               "button",
               {
                  type: "button",
                  class: `card ${posClass(p.position)} ${slotOfPick(pick, TEAMS) === d.slot ? "mine" : ""}`,
                  title: `Restore to board: ${p.name} (ADP ${adp(p.adp)})`,
                  onclick: () => restore(p.draft_id),
               },
               h("span", { class: "meta" }, h("span", { text: pickLabel(pick) }), h("b", { text: p.position })),
               h("span", { class: "who", text: shortName(p.name) }),
            ),
         );
      }
   }
   return tile({ title: "Crossed off", note: `${n} gone · ${TEAMS}-team board`, span: 6, body: () => grid });
}

// ── Toolbar ────────────────────────────────────────────────────────────────

function toolbar() {
   const search = h("input", {
      class: "search",
      type: "search",
      placeholder: "Search players  ( / )",
      "aria-label": "Search players",
      value: url.state.q,
      oninput: (e) => {
         url.set({ q: e.target.value });
         paint();
      },
   });
   document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== search) {
         e.preventDefault();
         search.focus();
      }
   });
   const pos = segmented(
      [{ value: "ALL", label: "All" }, ...POSITIONS.map((p) => ({ value: p, label: p }))],
      url.state.pos,
      (value) => {
         url.set({ pos: value });
         paint();
      },
      "Filter by position",
   );
   const team = h(
      "select",
      {
         class: "select",
         "aria-label": "Filter by team",
         onchange: (e) => {
            url.set({ team: e.target.value });
            paint();
         },
      },
      h("option", { value: "ALL", text: "All teams" }),
      [...teams.keys()].sort().map((code) => h("option", { value: code, text: code, selected: code === url.state.team })),
   );
   const undo = h("button", {
      class: "btn",
      type: "button",
      text: "Undo last",
      onclick: () => {
         crossed.pop();
         saveCrossed();
         paint();
      },
   });
   const reset = h("button", {
      class: "btn",
      type: "button",
      text: "Reset board",
      onclick: () => {
         if (!resetArmed) {
            resetArmed = true;
            reset.textContent = "Click again to reset";
            return;
         }
         resetArmed = false;
         reset.textContent = "Reset board";
         crossed = [];
         saveCrossed();
         paint();
      },
      onblur: () => {
         resetArmed = false;
         reset.textContent = "Reset board";
      },
   });
   return h("div", { class: "toolbar" }, search, pos, team, h("span", { class: "spacer" }), undo, reset);
}

// ── Paint ──────────────────────────────────────────────────────────────────

const wallHost = h("div");

function paint() {
   const d = derive();
   const scroll = [...wallHost.querySelectorAll(".rows")].map((el) => el.scrollTop);
   wallHost.replaceChildren(
      h(
         "div",
         { class: "wall" },
         bestAvailable(d),
         h("div", { class: "stack", style: { "--span": "3" } }, pickNowVsWait(d), h("div", { class: "stack two" }, marketSteals(d), draftFlow(d))),
         myTeam(d),
      ),
      h("div", { class: "wall boards" }, POSITIONS.filter((p) => url.state.pos === "ALL" || p === url.state.pos).map((p) => positionBoard(p, d))),
      h("div", { class: "wall" }, breakouts(d), boom(d), floors(d), schedule(d), overpriced(d)),
      h("div", { class: "wall" }, crossedOff(d)),
      h("p", {
         class: "foot",
         text:
            "Every tile re-ranks one query, draft_board -> cheatsheet in fantasy.malloy: 2026 ADP from 12-team half-PPR drafts, season projections, and each player's 2025 season matched from the play-by-play. " +
            "The bar behind a name is value over replacement (VOR): projected points above the last starter at the position (QB12, RB30, WR36, TE12). Crossed-off names are kept in this browser only.",
      }),
   );
   [...wallHost.querySelectorAll(".rows")].forEach((el, i) => (el.scrollTop = scroll[i] ?? 0));
   shell.setMeta([`${d.available.length} on the board`, `pick ${pickLabel(d.current)}`]);
}

async function main() {
   page.replaceChildren(h("div", { class: "empty", text: "Loading the 2026 board…" }));
   try {
      const [result, teamMap] = await Promise.all([run(MODEL, QUERY), loadTeams()]);
      board = result.rows;
      teams = teamMap;
      const known = new Set(board.map((p) => p.draft_id));
      crossed = crossed.filter((id) => known.has(id));
      page.replaceChildren(toolbar(), h("main", {}, wallHost));
      paint();
   } catch (error) {
      console.error(error);
      page.replaceChildren(h("div", { class: "err", text: error?.message ?? String(error) }));
   }
}

main();
