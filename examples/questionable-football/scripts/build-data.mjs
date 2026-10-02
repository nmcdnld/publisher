#!/usr/bin/env node
// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Rebuilds data/ from a Questionable Football (obj-football-pbp) checkout.
//
//   node examples/questionable-football/scripts/build-data.mjs /path/to/obj-football-pbp
//
// Two jobs, and only two. It converts the project's CSV and JSON files to
// Parquet with fixed types, and it runs the ONE step that is extraction rather
// than modelling: attributing each play to the players named in its
// description, which is a fuzzy match over free text and belongs in a pipeline
// rather than in a query. Everything that is a rule (fantasy scoring, team
// records, value against ADP) is left to the Malloy files, where it can be read.
//
// Two identity fixes are applied here so every join in the model is a plain
// equality, and the README lists them:
//   - Team codes are normalised to teams.csv: the Rams are `LA` in the
//     play-by-play and `LAR` everywhere else, and the roster snapshot uses
//     Pro Football Reference codes (GNB, KAN, ...).
//   - Every player-bearing table carries `name_key`, a lowercase letters-only
//     name with any Jr./Sr./II-V suffix dropped, because the draft market and
//     the play-by-play use different player ids and the name is all they share.

import { DuckDBInstance } from "@duckdb/node-api";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source || !existsSync(join(source, "data/plays.parquet"))) {
   console.error("usage: build-data.mjs /path/to/obj-football-pbp");
   process.exit(1);
}
const SRC = resolve(source);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data");
mkdirSync(OUT, { recursive: true });

const src = (path) => `'${join(SRC, path).replaceAll("'", "''")}'`;
const out = (path) => `'${join(OUT, path).replaceAll("'", "''")}'`;

const db = await DuckDBInstance.create(":memory:");
const conn = await db.connect();
const run = (sql) => conn.run(sql);

// PFR roster codes, and the play-by-play's `LA`, to the codes teams.csv uses.
const TEAM_CODE = (col) => `CASE ${col}
   WHEN 'GNB' THEN 'GB' WHEN 'KAN' THEN 'KC' WHEN 'LVR' THEN 'LV' WHEN 'NOR' THEN 'NO'
   WHEN 'NWE' THEN 'NE' WHEN 'SFO' THEN 'SF' WHEN 'TAM' THEN 'TB' WHEN 'LA' THEN 'LAR'
   ELSE ${col} END`;
const NAME_KEY = (col) =>
   `regexp_replace(lower(regexp_replace(trim(${col}), ' (Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i')), '[^a-z]', '', 'g')`;

async function write(name, sql) {
   await run(`COPY (${sql}) TO ${out(name)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
   const rows = await conn.runAndReadAll(`SELECT count(*) AS n FROM read_parquet(${out(name)})`);
   const n = Number(rows.getRowObjects()[0].n);
   const kb = Math.round(statSync(join(OUT, name)).size / 1024);
   console.log(`${name.padEnd(28)} ${String(n).padStart(7)} rows  ${String(kb).padStart(5)} KB`);
}

// ── Reference ─────────────────────────────────────────────────────────────────

// The project's teams.csv files the Jets in the NFC East; they are AFC East.
await write(
   "teams.parquet",
   `SELECT team, location, name, CASE WHEN team = 'NYJ' THEN 'AFC' ELSE conference END AS conference,
      division, primary_color, secondary_color
    FROM read_csv_auto(${src("data/teams.csv")}, header = true) ORDER BY team`,
);

await write(
   "roster.parquet",
   `SELECT player_id, full_name, position, ${TEAM_CODE("team")} AS team, ${NAME_KEY("full_name")} AS name_key
    FROM read_csv_auto(${src("data/players.csv")}, header = true)
    WHERE full_name IS NOT NULL ORDER BY team, position, full_name`,
);

// ── Results: 2023-2025 ────────────────────────────────────────────────────────

await write(
   "games.parquet",
   `SELECT game_id, season, game_week, game_type, CAST(game_date AS DATE) AS game_date, weekday, gametime,
           ${TEAM_CODE("away_team")} AS away_team, ${TEAM_CODE("home_team")} AS home_team,
           away_score, home_score, result, total, overtime = 1 AS is_overtime, stadium, roof, surface
    FROM read_parquet(${src("data/games.parquet")}) ORDER BY game_date, game_id`,
);

await write(
   "plays.parquet",
   `SELECT game_id, play_seq, season, game_week, CAST(play_quarter AS INTEGER) AS game_quarter, clock,
           CAST(down AS INTEGER) AS down, CAST(to_go AS INTEGER) AS to_go, yardline_100,
           ${TEAM_CODE("posteam")} AS offense, ${TEAM_CODE("defteam")} AS defense,
           play_type, yards_gained, detail, ep, epa, wp
    FROM read_parquet(${src("data/plays.parquet")}) ORDER BY game_id, play_seq`,
);

// ── Fantasy events: who each play belongs to ─────────────────────────────────
//
// Ported from the project's app/scripts/export-data.sql. A play is matched to
// a player when the play description contains the player's first-initial and
// surname token ("j.hurts"), then classified as passing, receiving, rushing or
// kicking by where the name sits relative to the word "pass". The guards:
//   - a token inside a longer one ("j.smith" in "j.smith-njigba") never claims it;
//   - when two players share a token, the one on the play's team claims it,
//     and plays on a third team go to the one colliding player who has no
//     home-team plays that season (the one who changed teams);
//   - a player-season keeps only the team where most of its events occurred,
//     which drops a defender's name in tackle text;
//   - two players sharing a token and a team get one owner per play, and a
//     token's plays on a third team go to its most established player (both
//     below). These two are where the output differs from the project's export.
// Weeks 1-17 only: the fantasy regular season.

await run(`CREATE TEMP TABLE fantasy_events AS
WITH player_tokens AS (
  SELECT player_id, full_name, position, ${TEAM_CODE("team")} AS snapshot_team,
    lower(substr(trim(full_name), 1, 1) || '.' || replace(regexp_replace(regexp_replace(trim(full_name), '^[^ ]+ ', ''), ' (Jr\\.?|Sr\\.?|II|III|IV|V)$', '', 'i'), ' ', '')) AS token
  FROM read_csv_auto(${src("data/players.csv")}, header = true)
  WHERE full_name IS NOT NULL
),
tokens AS (SELECT *, count(*) OVER (PARTITION BY token) AS token_players FROM player_tokens),
token_conflicts AS (
  SELECT a.token, b.token AS longer_token
  FROM (SELECT DISTINCT token FROM tokens) a
  JOIN (SELECT DISTINCT token FROM tokens) b ON a.token <> b.token AND contains(b.token, a.token)
),
plays_norm AS (
  SELECT game_id, play_seq, season, game_week, play_quarter, clock, play_type, yards_gained, detail,
    ${TEAM_CODE("posteam")} AS team,
    lower(regexp_replace(coalesce(detail, ''), '\\s+', '', 'g')) AS norm
  FROM read_parquet(${src("data/plays.parquet")})
  WHERE play_type <> 'no_play' AND game_week BETWEEN 1 AND 17
),
token_teams AS (SELECT DISTINCT token, snapshot_team FROM tokens),
home_plays AS (
  SELECT t.player_id, p.season, count(*) AS n
  FROM plays_norm p JOIN tokens t ON t.token_players > 1 AND p.team = t.snapshot_team AND contains(p.norm, t.token)
  WHERE NOT EXISTS (SELECT 1 FROM token_conflicts c WHERE c.token = t.token AND contains(p.norm, c.longer_token))
  GROUP BY t.player_id, p.season
),
snapshot_home AS (SELECT DISTINCT player_id, season FROM home_plays),
career_home AS (SELECT player_id, sum(n) AS n FROM home_plays GROUP BY player_id),
-- The colliding player with no home-team plays that season claims the
-- token's plays on other teams. When several qualify (Keenan, Kazmeir and
-- Kaytron Allen are all "k.allen"), the one with the most home-team plays over
-- every season is taken: the established player, not the practice-squad one.
-- The project's export takes the lowest id instead, which gave Keenan Allen's
-- 2024 season in Chicago to Kazmeir Allen.
orphan_claimant AS (
  SELECT player_id, season FROM (
    SELECT t.player_id, s.season,
      row_number() OVER (
        PARTITION BY t.token, s.season
        ORDER BY coalesce(c.n, 0) DESC, CASE WHEN t.player_id LIKE '00-%' THEN 1 ELSE 0 END, lower(t.player_id)
      ) AS rk
    FROM tokens t CROSS JOIN (SELECT DISTINCT season FROM plays_norm) s
    LEFT JOIN career_home c ON c.player_id = t.player_id
    WHERE t.token_players > 1
      AND NOT EXISTS (SELECT 1 FROM snapshot_home h WHERE h.player_id = t.player_id AND h.season = s.season)
  ) WHERE rk = 1
),
matches AS (
  SELECT p.*, t.player_id, t.full_name, t.position, t.token
  FROM plays_norm p
  JOIN tokens t ON contains(p.norm, t.token) AND (
    t.token_players = 1
    OR p.team = t.snapshot_team
    OR (EXISTS (SELECT 1 FROM orphan_claimant o WHERE o.player_id = t.player_id AND o.season = p.season)
        AND NOT EXISTS (SELECT 1 FROM token_teams tt WHERE tt.token = t.token AND tt.snapshot_team = p.team))
  )
  WHERE NOT EXISTS (SELECT 1 FROM token_conflicts c WHERE c.token = t.token AND contains(p.norm, c.longer_token))
),
classified AS (
  SELECT *, CASE
    WHEN play_type = 'pass' AND strpos(norm, token) < strpos(norm, 'pass') THEN 'passing'
    WHEN play_type = 'pass' AND position IN ('WR', 'TE', 'RB', 'FB') AND strpos(norm, token) > strpos(norm, 'pass')
      AND norm NOT LIKE '%incomplete%' AND norm NOT LIKE '%intercepted%' THEN 'receiving'
    WHEN play_type = 'run' AND position IN ('QB', 'WR', 'TE', 'RB', 'FB') THEN 'rushing'
    WHEN play_type = 'field_goal' AND position = 'K' THEN 'field_goal'
    WHEN play_type = 'extra_point' AND position = 'K' THEN 'extra_point'
  END AS role
  FROM matches
),
-- Two players who share a token AND a snapshot team (Bijan and Brian Robinson
-- are both "b.robinson" on ATL) cannot be told apart by the text, and crediting
-- both double-counts the play. One owner per play and role: the player whose
-- position fits the role, then a PFR id over a newer GSIS id, then the lower
-- id, which in every such pair on the roster is the established player.
owned AS (
  SELECT * FROM classified
  WHERE role IS NOT NULL
  QUALIFY row_number() OVER (
    PARTITION BY game_id, play_seq, token, role
    ORDER BY
      CASE WHEN (role = 'passing' AND position = 'QB') OR (role = 'receiving' AND position IN ('WR', 'TE', 'RB', 'FB'))
             OR (role = 'rushing' AND position IN ('RB', 'FB', 'QB')) THEN 0 ELSE 1 END,
      CASE WHEN player_id LIKE '00-%' THEN 1 ELSE 0 END,
      lower(player_id)
  ) = 1
),
events AS (SELECT * FROM owned),
season_team AS (
  SELECT player_id, season, team FROM (
    SELECT player_id, season, team, row_number() OVER (PARTITION BY player_id, season ORDER BY count(*) DESC, team) AS rk
    FROM events GROUP BY player_id, season, team
  ) WHERE rk = 1
)
SELECT e.* FROM events e JOIN season_team s USING (player_id, season, team)`);

// A play is scored on its final ruling. A replay review writes the original
// call, "the play was REVERSED.", then the call that stands, so only the text
// after the last REVERSED is read; a "TOUCHDOWN NULLIFIED" by penalty is no
// touchdown; and a fumble the defense recovers and returns for a score is not
// the ball carrier's touchdown. The project's export reads the whole text and
// credits all three, about 300 scoring events across the three seasons.
await run(`CREATE TEMP TABLE ruled AS
SELECT *,
  ${TEAM_CODE("regexp_extract(ruling, '.*RECOVERED by ([A-Z]{2,3})-', 1)")} AS recovered_by
FROM (
  SELECT *, CASE WHEN detail LIKE '%REVERSED.%' THEN regexp_replace(detail, '^.*REVERSED\\.', '') ELSE detail END AS ruling
  FROM fantasy_events
)`);

await write(
   "fantasy_events.parquet",
   `SELECT game_id, play_seq, season, game_week, CAST(play_quarter AS INTEGER) AS game_quarter, clock,
           -- Seconds of regulation left when the play started: 3600 at kickoff, 0 at the final whistle.
           CAST((4 - play_quarter) * 900 + coalesce(try_cast(substr(clock, 1, 2) AS INTEGER), 0) * 60
                + coalesce(try_cast(substr(clock, 4, 2) AS INTEGER), 0) AS INTEGER) AS seconds_left,
           team, player_id, full_name, CASE WHEN position = 'FB' THEN 'RB' ELSE position END AS position,
           role, play_type, coalesce(yards_gained, 0) AS yards,
           upper(ruling) LIKE '%TOUCHDOWN%' AND upper(ruling) NOT LIKE '%TOUCHDOWN NULLIFIED%'
             AND NOT (ruling LIKE '%FUMBLES%' AND recovered_by <> '' AND recovered_by <> team) AS has_touchdown,
           upper(ruling) LIKE '%INTERCEPTED%' AS is_intercepted,
           upper(ruling) LIKE '%IS GOOD%' AS is_good,
           detail
    FROM ruled ORDER BY season, game_id, play_seq, player_id`,
);

// ── Draft market ──────────────────────────────────────────────────────────────

// Players with no ADP often share a cloned projection template (every
// undrafted QB at exactly 388, and so on); those projections are nulled so
// they cannot outrank real starters. Same rule as the project's export.
await write(
   "draft_board_2026.parquet",
   `WITH raw AS (
      SELECT *, CASE WHEN projectedStats IS NULL THEN NULL ELSE position || '|' || json(projectedStats)::VARCHAR END AS fp
      FROM read_json_auto(${src("data/players.json")})
    ),
    clones AS (SELECT fp FROM raw WHERE fp IS NOT NULL GROUP BY fp HAVING count(*) >= 3),
    stat AS (
      SELECT id, s.label, try_cast(replace(s.value, ',', '') AS DOUBLE) AS v
      FROM (SELECT id, unnest(projectedStats) AS s FROM raw)
    ),
    proj AS (
      SELECT id,
        max(v) FILTER (WHERE label = 'PASS YDS') AS proj_pass_yards,
        max(v) FILTER (WHERE label = 'PASS TD') AS proj_pass_tds,
        max(v) FILTER (WHERE label = 'INT') AS proj_interceptions,
        max(v) FILTER (WHERE label = 'RUSH YDS') AS proj_rush_yards,
        max(v) FILTER (WHERE label = 'RUSH TD') AS proj_rush_tds,
        max(v) FILTER (WHERE label = 'TGT') AS proj_targets,
        max(v) FILTER (WHERE label = 'REC') AS proj_receptions,
        max(v) FILTER (WHERE label = 'REC YDS') AS proj_rec_yards,
        max(v) FILTER (WHERE label = 'TD') AS proj_rec_tds
      FROM stat GROUP BY id
    )
    SELECT r.id AS draft_id, r.name, ${NAME_KEY("r.name")} AS name_key, r.position, ${TEAM_CODE("r.nflTeam")} AS team,
      nullif(r.adp, 0) AS adp, nullif(r.averageRound, 0) AS average_round, r.byeWeek AS bye_week, r.age,
      r.positionRank AS position_rank,
      CASE WHEN c.fp IS NOT NULL AND coalesce(r.adp, 0) <= 0 THEN NULL ELSE r.projectedPoints END AS projected_points,
      r.advanced.boomRate AS boom_rate, r.advanced.bustRate AS bust_rate, r.advanced.consistency AS consistency,
      r.advanced.strengthOfSchedule AS sos_rank, r.advanced.playoffSOS AS playoff_sos_rank,
      r.advanced.matchupRating AS week1_matchup,
      CASE WHEN c.fp IS NOT NULL AND coalesce(r.adp, 0) <= 0 THEN NULL ELSE p.proj_pass_yards END AS proj_pass_yards,
      p.proj_pass_tds, p.proj_interceptions, p.proj_rush_yards, p.proj_rush_tds,
      p.proj_targets, p.proj_receptions, p.proj_rec_yards, p.proj_rec_tds
    FROM raw r LEFT JOIN clones c USING (fp) LEFT JOIN proj p USING (id)
    WHERE r.position IN ('QB', 'RB', 'WR', 'TE')
    ORDER BY r.adp IS NULL OR r.adp = 0, r.adp, r.name`,
);

await write(
   "adp_2025.parquet",
   `SELECT source_player_id AS adp_id, name, ${NAME_KEY("name")} AS name_key, position, ${TEAM_CODE("team")} AS team,
      draft_season, scoring, teams AS league_size, source, source_tier, source_format,
      try_cast(sample_start_date::VARCHAR AS DATE) AS sample_start, sample_end_date AS sample_end,
      total_drafts, adp, adp_formatted, overall_rank, position_rank, times_drafted, high_pick, low_pick,
      try_cast(standard_deviation::VARCHAR AS DOUBLE) AS adp_stdev
    FROM read_json_auto(${src("data/adp/2025-expanded.json")}) ORDER BY adp`,
);

// ── 2026 market: schedule, lines, futures ─────────────────────────────────────

await write(
   "schedule_2026.parquet",
   `SELECT game_id, season, week AS game_week, weekday, game_date, kickoff_et,
      ${TEAM_CODE("away_team")} AS away_team, ${TEAM_CODE("home_team")} AS home_team, location, is_neutral, roof,
      has_lines, home_spread, total_line, CAST(home_moneyline AS INTEGER) AS home_moneyline,
      CAST(away_moneyline AS INTEGER) AS away_moneyline, implied_home_score, implied_away_score,
      home_win_prob, away_win_prob, lines_book
    FROM read_json_auto(${src("data/schedule/2026-games.json")}) ORDER BY game_week, game_date, kickoff_et, game_id`,
);

await write(
   "futures_2026.parquet",
   `SELECT season, ${TEAM_CODE("team")} AS team, win_total, playoff_prob, division_prob, conference_prob,
      super_bowl_prob, futures_book
    FROM read_json_auto(${src("data/schedule/2026-futures.json")}) ORDER BY team`,
);

conn.closeSync();
