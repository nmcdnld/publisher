// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The site's player identity, in pieces every page shares: a team chip, the
// name, and the position code in its colour.
//
// The site paints team logos; these pages paint a chip in the team's primary
// colour instead, so nothing is fetched from off the server. The colour comes
// from the data (`teams -> palette` in football.malloy), never from script.

import { h } from "./dom.js";
import { run } from "./panel.js";
import { posClass } from "./format.js";

let palette;

/** Every team's name, division and colours, keyed by code. Loaded once per page. */
export function loadTeams() {
   palette ??= run("football.malloy", "run: teams -> palette").then(
      ({ rows }) => new Map(rows.map((r) => [r.team, r])),
   );
   return palette;
}

/** A team chip. `teams` is the map from `loadTeams`; a team it lacks draws grey. */
export function teamChip(code, teams, { large = false } = {}) {
   const team = teams?.get(code);
   return h("span", {
      class: large ? "chip lg" : "chip",
      title: team?.full_name ?? code ?? "",
      text: code ?? "FA",
      style: team?.primary_color ? { "--team": team.primary_color } : undefined,
   });
}

export function posCode(position) {
   return h("span", { class: `pos ${posClass(position)}`, text: position ?? "" });
}

/** Chip · name · position, the name optionally a link to the player page. */
export function identity({ name, team, position, href }, teams) {
   return h(
      "span",
      { class: "ident" },
      teamChip(team, teams),
      href ? h("a", { class: "name", href, text: name }) : h("span", { class: "name", text: name }),
      posCode(position),
   );
}

/** The player page for an id, keeping the season when one is given. */
export function playerHref(playerId, season) {
   const q = new URLSearchParams({ player: playerId });
   if (season) q.set("season", String(season));
   return `./player.html?${q}`;
}
