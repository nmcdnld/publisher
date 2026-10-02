<!--
Copyright (c) Credible Data Inc.
SPDX-License-Identifier: MIT
-->

# questionable-football

A fantasy football package: three seasons of NFL play-by-play (2023-2025, 147,928 plays in 855 games), the half-PPR fantasy points every play earned, the 2025 draft market and how each pick actually finished, and the 2026 market (a draft board of 926 players with projections, the 272-game schedule with posted lines, and every team's futures). It is modeled on [Questionable Football](https://data.questionablefootball.com) (the `obj-football-pbp` project), and its pages take their light-mode look from that site's cheatsheet.

The difference is that here every rule (the scoring, the finish ranks, value over replacement, line-implied wins) is defined in Malloy, where you can read it, instead of in an export script.

Everything is DuckDB over files in `data/`, so it needs no credentials.

## What is in it

| Path | What it is |
| --- | --- |
| `football.malloy` | The NFL itself: `teams` (with colors), `roster`, `games`, `team_games` (one row per team per game, from that team's side) and `plays`. |
| `fantasy.malloy` | The fantasy layer. `fantasy_events` is one row per player per scoring play, with the half-PPR rules as dimensions. `player_games`, `player_seasons` roll it up to box scores and season finishes. `draft_board` is the 2026 market with value over replacement; `adp_2025` is the 2025 market beside how each pick finished. |
| `market.malloy` | The 2026 betting market: `schedule_2026` and `futures_2026`, `team_schedule_2026` (one row per team per game, with implied points and win probability), and `team_outlook`, which sets each team's win total beside the wins its posted lines imply and its 2025 results. |
| `player_app.malloy`, `leaders_app.malloy`, `team_app.malloy` | The scoped sources the Player, Leaders and Teams pages query. Each file declares only the givens its own page sends. |
| `dashboards/season_leaders.malloy`, `dashboards/draft_market.malloy`, `dashboards/team_outlook.malloy` | Three no-code dashboards with filter controls: the season leaderboard and scarcity, the 2026 market's steals and reaches beside the 2025 hit rates, and the league's win totals and schedules. |
| `research.malloynb` | A notebook that walks from 2025 scoring to the 2026 draft board, question by question. |
| `public/index.html` | **Cheatsheet**, the draft-day board: best available by ADP, pick-now-or-wait for your slot, market steals, position boards, breakouts, boom and floor plays, the smooth schedules, and a snake board you cross players off as they go. The crossed-off list is kept in the browser, the filters in the URL. |
| `public/leaders.html` | **Leaders**: one season's leaderboard with each player's week-by-week bars, positional scarcity, where the points come from, and the best single games. |
| `public/player.html` | **Player**: search any player, then their season, a game-flow chart of every game's points accumulating against the clock, the week-by-week bars, the game log and every scoring play, their career, and their 2026 market. |
| `public/teams.html` | **Teams**: the league board of win totals against line-implied wins, a 32-by-18 schedule grid shaded by win probability, and one team's outlook, slate, record, offense, fantasy scorers and draft-board players. |
| `public/apps/*` | Two saved findings in the manifest format (`app.json`), each re-run live: two of every three picks in rounds 1-9 finished below their price in 2025, and tight end has the steepest drop from elite to the next tier. |
| `scripts/build-data.mjs` | Rebuilds `data/` from an `obj-football-pbp` checkout. |
| `tests/` | `node --test` suites for the pure formatters (including the snake-draft math) and for the rules every page shares. |

## The design brief

The pages were designed against this brief before any tile was drawn.

- **Who opens it:** a fantasy manager in a 12-team, half-PPR league. They open the Cheatsheet on draft day and keep it open; the other pages are for the weeks before, when they are deciding who they believe in.
- **The decision:** who to take with this pick, and whether to take a position now or wait for the next turn. After the draft, whether a player's season is real.
- **Archetype:** a draft-day tool. Light, dense and scannable, after the site's cheatsheet: position color everywhere, value as a signed bar from a zero line, and every list sorted by the number that decides it.
- **What leads:** on the Cheatsheet, the best players still available, and how many picks until your next turn. On a Player page, the season's points and the game-flow chart. On Teams, the board of win totals against the lines.
- **Depth:** every player links to their page and every team to its own. A page's state (season, position, player, team, draft slot) lives in the URL, so a view can be shared as a link.

Every panel names the `source -> view` it was drawn from. All colors, fonts and sizes come from tokens in `public/app/style.css`, and the charts read those same tokens at draw time, so no page script contains a color.

## How the numbers work

- **Scoring is half-PPR over weeks 1-17**, the fantasy regular season: 1 point per 25 passing yards, 4 per passing touchdown, −2 per interception; 1 per 10 rushing or receiving yards, 6 per touchdown, 0.5 per catch; 3 per field goal and 1 per extra point made. The rules are dimensions on `fantasy_events`, so changing the scoring is an edit to one file.
- **A play is scored on its final ruling.** A replay review's overturned call, a touchdown nullified by a penalty, and a fumble the defense returns for a score are not the ball carrier's touchdown.
- **Finish** is a player's rank within their position that season by total points. "Top 6", "7th-12th" and so on are bands of that rank.
- **Value over replacement (VOR)** is a player's projected 2026 points minus the projected points of the last starter at their position in a 12-team league: QB12, RB30, WR36 and TE12.
- **A 2025 hit** is a pick that finished at or above the position rank it was drafted at. A player who never scored counts as a miss.
- **Line-implied wins** are the average win probability of a team's games that have posted lines, times 17. Lines are posted for weeks 1-6 and a handful of later games (112 of 272), so this is a read of the early schedule, set beside the season-long win total.

Read the numbers with these caveats:

- **Attribution is by name.** The play-by-play names players in free text ("J.Hurts pass short right to A.Brown"), and the build matches each play to roster players by first initial and surname. The guards are below; the matching is good enough to reproduce known seasons (Lamar Jackson's 2024: 414.3 points, 39 passing and 4 rushing touchdowns), but a player with a common name on a team with another can lose or gain a stray play.
- **Two-point conversions, return touchdowns and fumbles lost are not scored**, so totals can sit a few points off a provider's.
- **The roster is a 2026 snapshot.** Positions and current teams come from it; the team a player scored for in a past season comes from the plays.
- **The 2025 market** is FFToday's Aug. 29 half-PPR consensus (219 players), with MyFantasyLeague's PPR redraft ADP for the 65 players FFToday lacked (none earlier than pick 46).

## Data provenance

The files in `data/` were built from the `obj-football-pbp` project's checked-in data:

- **Play-by-play and games**, 2023-2025, the project's `plays.parquet` and `games.parquet`.
- **Players**, the nflverse `players.csv`.
- **The 2026 draft board and projections**, the project's `players.json`, from the Tank01 API.
- **The 2025 market**, the project's `adp/2025-expanded.json` (FFToday, with MyFantasyLeague rows marked `supplemental`).
- **The 2026 schedule, lines and futures**, the project's `schedule/2026-games.json` and `2026-futures.json`: Lee Sharpe's NFLGameData boards, with DraftKings and FanDuel lines and DraftKings futures.

The build converts these to Parquet with fixed types and runs the one step that is extraction rather than modelling: attributing each play to the players its description names. It is ported from the project's `app/scripts/export-data.sql`, and differs from it in these places, each of which changes a number:

- **Shared names on one team** (Bijan and Brian Robinson are both "B.Robinson" in Atlanta) give each play one owner, the player whose position fits the role, rather than crediting both.
- **Shared names across teams** give a token's plays on a third team to the colliding player with the most home-team plays over every season, rather than to the lowest id. The export gave Keenan Allen's 2024 season in Chicago to Kazmeir Allen.
- **Touchdowns are read from the final ruling**: the text after the last "REVERSED.", with "TOUCHDOWN NULLIFIED" and defensive fumble returns excluded. The export reads the whole description and credits all three, about 300 scoring events across the three seasons.
- **The Jets are in the AFC East.** The project's `teams.csv` files them in the NFC.
- **Team codes are normalized** to `teams.csv` (the Rams are `LA` in the play-by-play and the roster uses Pro Football Reference codes), and every player-bearing table carries a `name_key`, because the draft markets and the play-by-play use different player ids and the name is all they share.

Undrafted players whose projection is a cloned template (every undrafted QB at exactly 388 points, and so on) have it nulled, the same rule as the project's export, so they cannot outrank real starters.

To rebuild from a checkout of the project:

```bash
node examples/questionable-football/scripts/build-data.mjs /path/to/obj-football-pbp
```

## Running it

From a clone, `bun run start` serves this package alongside the other examples (it is registered in `packages/server/publisher.config.json`), and the pages are at:

- http://localhost:4000/environments/examples/packages/questionable-football/index.html
- …/leaders.html?season=2025&pos=RB
- …/player.html?player=HurtJa00
- …/teams.html?team=PHI

The dashboards and the notebook appear on the package's page in the Console at http://localhost:4000.

```bash
bun run test:examples   # includes tests/format.test.mjs and tests/conformance.test.mjs
bun run lint:examples   # includes this package's eslint.config.mjs
```
