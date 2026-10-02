<!--
Copyright (c) Credible Data Inc.
SPDX-License-Identifier: MIT
-->

# Saving Library content into a package: research, convention, and plan

_Design and planning doc for `packages/credible-demo`. Today the destination app
has two verbs where the person has one: **Save to Library** keeps an analysis,
thread, or Console result in the destination's own storage, and **Promote to a
package** copies only its Malloy into a model file or a one-tile dashboard. This
document records what the two paths do now, defines one conventional in-package
artifact, a **manifest-backed data app** under `public/apps/<slug>/`, that both
the Publisher Console and the destination open, and lays out the steps to make
"Save to the workspace" mean "write it into the package". The dashboard analogue
of this document is [dashboard-builder-plan.md](dashboard-builder-plan.md)._

Status as of 2026-09-30: phase 1 (§7) is in the tree, uncommitted:
`packages/app-manifest` with the schema, the page generator, the mappers and
their round-trip tests; one hand-written example at
`examples/storefront/public/apps/revenue-growth-by-year/`; and the destination
reading manifests back in `listWorkspacePackages`. Phase 2 is in the tree too:
the renderer at `/sdk/publisher-app.js`, its Playwright check, and the docs.
Phase 3 is in the tree: the `…/data-apps/{slug}` read, write and delete
endpoints. Phase 4 is in the tree: the destination's Save menu, the Save dialog
it opens, native rendering of saved findings, comments that follow them, and
reverse linking. §7.1 to §7.4 record where the implementation settled something
this document left open. Phase 5 has not started. The destination is an uncommitted prototype (`packages/credible-demo`,
fixtures in `localStorage`), the Console's Publish button and the SDK's
`PublishProvider` are uncommitted work in the same tree. The plan is sequenced so the
Console needs no change to _render_ the new artifact; it needs one server
endpoint to _write_ it.

## 1. Where things stand

### 1.1 What "Save to Library" is

A `LibraryItem` (`packages/credible-demo/src/data/types.ts`) is an index entry:
title, description, `kind` (`insight | query | dashboard | notebook | data_app`;
`thread` until §7.4), owner, `scope: "personal" | "workspace"`, collections, an `href`, and
optionally a `packageRef` naming the package file it stands for. The content it
points at is one of:

- an **Analysis** (`/analysis/:id`): narrative, details, `Evidence` (chart kind,
  x key, series, rows, format, an optional `visual` overlay and an optional
  chart-program `spec`), the Malloy, provenance, topics;
- a **Thread** (`/chat/:id`): messages, the last of which carries an
  `AnalystRecord` — datasets (each with its own Malloy and rows), metrics
  computed over them, and a `ReportSpec` of KPI / chart / table / insight blocks;
- a **Publisher page** (a route under `/packages/…`): a dashboard, notebook, model
  or data app the package already serves — nothing to promote, and
  `sync.ts` already marks these `synced`;
- a **Console result** arriving through `/publish#draft=…` (`data/handoff.ts`):
  Malloy, provenance, a flattened result table, givens.

All of it lives in `FIXTURES_STORAGE_KEY` in the browser. Publisher never sees
it, the Console cannot show it, an agent cannot find it, and it is not reviewed
or versioned with the model it was built on.

### 1.2 What "Promote to a package" is

`features/library/promote-wizard.tsx` takes the one `run: <source> -> <pipeline>`
behind an item (`promotableOf` in `data/sync.ts`) and offers three targets:

| Target                                | Who writes it                                                             | What survives                          |
| ------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `view:` on the source                 | the person, by hand (copy or download, then "reload and verify")          | the pipeline, a one-line `#(doc)`      |
| `query:` in the model                 | the person, by hand                                                       | the pipeline, a one-line `#(doc)`      |
| a one-tile `dashboards/<name>.malloy` | Publisher, through `PUT …/models/dashboards/<slug>.malloy` (compile, lock, write, reload, rollback) | the pipeline, a title, a doc comment |

Then `linkLibraryItem` records a `PackageRef` and the card shows "In
`<package>`". The narrative, the chart as drawn, the details, the topics, the
thread's whole report, and the discussion are all left behind. A promoted item
and its package file are therefore _related_, not _the same thing_, and the
Library has to carry a `SyncState` machine (`package | synced | unpromoted |
missing | unknown`) to keep them associated.

Two things about this path are worth keeping: the compile-before-write, hash
precondition, and rollback discipline of the dashboard write
(`controller/dashboard.controller.ts`, `environment.writeModelFileTransactional`);
and the "add its query to the model" idea itself, which is the right thing when
a finding should become part of the semantic model. It is the wrong thing as the
_only_ way to share a finding.

### 1.3 What a data app is, to Publisher

A package with a `public/` directory serves it at
`/environments/<env>/packages/<pkg>/<file>` ([html-data-apps.md](html-data-apps.md)).
`GET …/data-apps` lists every `.html` under `public/` up to three directories deep,
reading `<title>` and the `publisher:fit` meta from the first 4 KB. The Console
lists those under **Data Apps** (`sdk/src/components/Package/Package.tsx`) and
opens each in `DataAppViewer`, an iframe that auto-sizes from the runtime's
`publisher:resize` messages. The page loads `/sdk/publisher.js`, a runtime the
_server_ serves (not vendored), and calls `Publisher.query`.

The destination already mirrors all of this: `listWorkspacePackages` turns the
listing into `data_app` items, `LivePreview` iframes them on Library cards, and
`WorkspaceDataAppPage` wraps `DataAppViewer` in the destination's own chrome
(byline, status, comments). So a saved finding that _is_ a data app is shown in
both apps with no new rendering code on either side. What is missing is the
artifact, and a way to write it.

## 2. The decision

**One artifact, written by Publisher, read by both apps.** A saved finding
becomes a directory in the package:

```
public/apps/<slug>/
  app.json      # the manifest: everything the Library kept, minus the person's private bits
  index.html    # a generated stub: <title>, one meta tag, two <script> tags
```

- `app.json` is the source of truth. It carries the content (narrative, blocks,
  chart description, topics, author), the Malloy queries by package-relative
  model path, and a capped snapshot of the rows the finding was written against.
  It is JSON, so it is diffable, reviewable, and an agent can write one by hand.
- `index.html` exists so that the Console's existing `/data-apps` listing and
  `DataAppViewer` show the app with zero server or Console change. It contains
  no content of its own; a renderer the server serves at
  `/sdk/publisher-app.js` reads the manifest and draws it.
- The destination reads `app.json` directly and renders it with its own
  components (the same `EvidenceChart`, the same report blocks), so a
  package-backed analysis looks and acts like a local one: Remix, Ask a
  follow-up, Explore the model, collections, comments.

**"Save to the workspace" writes this directory.** The workspace scope of the
Library stops being a second `localStorage` bucket and becomes "in a package".
The personal scope stays local to the destination: it is a person's bookmarks,
not a package's content. The Library item for a workspace save is the index
entry (`packageRef`, collections) over content the package owns.

**The existing Promote targets survive as a secondary action**, "Also add its
query to the model", because a view on the source is a different deliverable
(reusable by name, findable by `get_context`) from a shared finding.

What this rules out, and why:

- _A JSON sidecar with no HTML._ The listing only sees `.html`; without a stub,
  the Console would not show the app until the listing is taught the manifest,
  and the point is that the Console works on day one.
- _Vendoring a renderer into every package._ Third-party libraries are vendored
  because CDNs are blocked in the places agents run; Publisher's own runtime is
  served by Publisher (`/sdk/publisher.js` is the precedent), which is how the
  renderer gets updated with the server rather than package by package.
- _Making every promotion a `dashboards/*.malloy`._ A dashboard is a Malloy
  query with layout tags; it has no place for a narrative, a report of blocks,
  a chart-program spec, or the rows a sentence was written about.
- _Putting personal saves in the package too_ (for example
  `public/apps/_users/<id>/`). Packages are reviewed, shared, versioned content;
  a person's bookmarks are not, and a package with a hundred drafts in it is
  worse for everyone including the agent indexing it.

## 3. The convention: a manifest-backed data app

### 3.1 `app.json`

Versioned, validated with zod on write and on read. The environment and package
are deliberately absent: they are wherever the file lives, which is what lets a
package move between environments, or be copied, without editing the manifest.

```jsonc
{
  "version": 1,
  "kind": "analysis", // "analysis" | "report"
  "title": "Refunds spiked in March",
  "description": "Refunds rose 41% MoM in March, all of it in Apparel.",
  "author": { "id": "p_alex", "name": "Alex Kim" }, // optional; the destination's person id
  "createdAt": "2026-09-30T18:02:11Z",
  "updatedAt": "2026-09-30T18:02:11Z",
  "topics": ["finance", "returns"],
  // Where it came from, so the destination re-links after storage loss and
  // a re-save updates rather than duplicates.
  "origin": { "app": "destination", "kind": "analysis", "id": "an_0412" },

  // Every query the content reads, by id. Model paths are package-relative.
  "queries": {
    "q1": {
      "model": "storefront.malloy",
      "source": "order_items",
      "malloy": "run: order_items -> refunds_by_month",
      "givens": {}
    }
  },

  // The rows the finding was written against. Capped (400 rows per query,
  // the same cap `storedRecord` applies); the renderer runs live and falls
  // back to these when a query fails or the model has changed.
  "snapshot": {
    "asOf": "2026-09-30T18:02:11Z",
    "columns": { "q1": [{ "name": "month", "type": "date" }, { "name": "refunds", "type": "number", "unit": "currency" }] },
    "rows": { "q1": [ /* … */ ] }
  },

  // kind = analysis: the destination's Analysis, less what moved up.
  "analysis": {
    "details": ["Apparel accounts for 92% of the increase.", "Electronics was flat."],
    "evidence": {
      "query": "q1",
      "kind": "line",
      "xKey": "month",
      "series": [{ "key": "refunds", "label": "Refunds" }],
      "format": "currency",
      "highlight": "2026-03",
      "visual": { "kind": "anomaly", "series": "refunds", "normal": [12000, 18000], "normalLabel": "Typical month", "polarity": "down_is_good" },
      "program": null // a chart program (analyst/chart-program.ts) when the analysis drew one
    }
  },

  // kind = report: a thread's answer as the analyst produced it.
  "report": {
    "question": "Why did refunds spike?",
    "metrics": [ /* Metric definitions from analyst/schema.ts, referencing queries by id */ ],
    "spec": { "title": "…", "answer": "Refunds rose {{metric:m1}} …", "sections": [ /* ReportSpec */ ] }
  }
}
```

Mapping rules, which live in one module and are tested as round-trips:

- `Analysis → manifest`: `evidence.rows` become `snapshot.rows.q1`; `malloy` and
  `provenance.model/source` become `queries.q1`; everything else copies across.
  `manifest → Analysis` reverses it, with `provenance.environment/package` filled
  from where the file was read. A package-backed analysis renders on the
  existing `AnalysisPage` unchanged.
- `Thread → manifest`: the last assistant message's `AnalystRecord`. Each
  `Dataset` becomes a query (`dataset.source.model`, `dataset.query`) and a
  snapshot; `metrics` and `report` (the grounded `ReportSpec`) copy across. The
  question is the message before it. Findings and trace (admin-only) are not
  written.
- `DestinationDraft → manifest`: `kind: analysis` when `draftEvidence` can chart
  it (the same rule `publishDraft` uses today), with the flattened result as the
  snapshot; a dashboard draft is not a manifest, it is a Library item pointing
  at the dashboard, as now.

### 3.2 `index.html`

Generated by the server from the manifest, never edited by hand, regenerated on
every save:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Refunds spiked in March</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Refunds rose 41% MoM in March, all of it in Apparel." />
  <meta name="publisher:app" content="app.json" />
  <script src="/sdk/publisher.js"></script>
  <script src="/sdk/publisher-app.js" defer></script>
</head>
<body><main id="publisher-app"></main></body>
</html>
```

`<title>` is what the listing shows in both apps today. `publisher:app` is the
one new signal: it names the manifest, sits in the first 4 KB like
`publisher:fit`, and is what lets the listing (§4.2) and the destination tell a
manifest-backed app from a hand-written page without fetching it.

### 3.3 `/sdk/publisher-app.js`

A renderer the server serves beside `publisher.js`. On load it reads the
`publisher:app` meta, fetches the manifest relative to the page, runs each query
with `Publisher.query(model, malloy, { givens })`, computes the report's metrics,
and draws the content into `#publisher-app`: title, narrative or answer, KPI
blocks, charts, tables, insight blocks, a provenance line, and an "as of" note
when it is showing the snapshot because a query failed. `publisher.js` already
posts the resize messages `DataAppViewer` listens for, so the page auto-sizes in
the Console.

It is built, not hand-written: a bundle whose logic is the shared package in §6
(schema, mappers, metric arithmetic, the chart-program evaluator) plus a small
DOM renderer and Chart.js. Charts: `chartjs` programs render as written
(`analyst/chart-chartjs.ts` is already the pure half of that); `tanstack`
programs and `visual` overlays fall back to the plain chart of the rows in the
first release, which is the same rows the destination draws, minus the overlay.
Closing that gap is a later phase (§7), and it is a fidelity gap, not a
correctness one: the numbers are the same query.

Size budget: under 250 KB minified (Chart.js is ~200 KB of that; the storefront
example already vendors it). It loads only on manifest-backed pages.

### 3.4 What "interchangeable" means, precisely

| Surface                                | Reads                                        | Renders with                                      | Can write                     |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Publisher Console, package page        | `/data-apps` listing                         | title (+ description once §4.2 lands)             | —                             |
| Publisher Console, `DataAppViewer`     | `index.html` in an iframe                    | `/sdk/publisher-app.js`                           | —                             |
| Destination, Library card and page     | `app.json` (falls back to the iframe)        | its own components (`EvidenceChart`, report blocks) | `PUT …/data-apps/<slug>`     |
| An agent or a person                   | `app.json`                                   | —                                                 | the file, or the endpoint     |

The contract both sides hold to: the manifest is the only place content lives;
`index.html` carries nothing that is not derivable from it; a renderer that does
not understand a manifest's `version` shows the title, description and the
"open standalone" link rather than failing.

## 4. Server: writing and listing

### 4.1 `PUT /api/v0/environments/{env}/packages/{pkg}/data-apps/{slug}`

Body `{ "manifest": { … }, "expectedHash"?: "<sha256 of the app.json text the caller read>" }`.
Answers `201` for a new app, `200` for a replaced one, with
`{ resource, path, contentHash, created }` in the shape of
`ModelSourceWriteResult`. In order:

1. Refuse under `frozenConfig` (`FrozenConfigError`, as the dashboard write).
2. Refuse a package whose registered `location` is a `github`/`gs://`/`s3://`
   URL: a reload of such a package re-fetches and would discard the write. Say
   so in the message rather than writing something the next reload deletes.
3. Validate `slug` against `^[a-z0-9][a-z0-9-]{0,63}$`, and reserve `_` prefixes.
4. Validate the manifest with the shared zod schema; refuse with the path of the
   first problem.
5. Compile-check every query: `environment.compileSource(pkg, query.model, query.malloy, …, "append")`
   for each, refusing with `CompileRefusedError` and the formatted problems
   when any has an error. A `run:` statement is valid append text, and this is
   what keeps a manifest from being saved against a source that no longer
   exists. No query is executed.
6. Under the package lock: check the precondition (`expectedHash` absent means
   create, and an existing `app.json` is a `WriteConflictError`; present and
   different is a conflict too), write `app.json` and the generated `index.html`
   into a temp directory beside the target and rename it over, so a reader never
   sees one file without the other.
7. Emit the package's `changed` event so an open page reloads under watch mode.
   No package reload: `public/` is not compiled.

`DELETE …/data-apps/{slug}` with `expectedHash` removes the directory under the
same rules. `GET …/data-apps/{slug}` answers the manifest with its
`contentHash`, so a client need not hash the static file itself (the destination
can, the way `getModelSource` does, until this lands).

The controller reuses `assertSafeRelativeModelPath`, `contentHashOf`, the error
types, and the write-metrics pattern from `dashboard.controller.ts`; the
transactional write in `environment.ts` gains a directory form, or the
controller holds the same lock and does the two-file rename itself. Tests
mirror `dashboard.controller.write.spec.ts`: frozen config, foreign location,
bad slug, schema refusal, compile refusal, create-conflict, stale-hash conflict,
a successful create that then appears in `/data-apps`, a replace that
regenerates `index.html`, and a delete.

### 4.2 `/data-apps` learns the manifest

The listing already reads the head of each page. Add: when
`<meta name="publisher:app">` is present, the entry carries
`manifest: "apps/<slug>/app.json"` and `description` from the description meta.
The `DataApp` schema in the repo-root `api-doc.yaml` gains the two optional fields. This is what
lets the Console show a description on the card and lets the destination find
manifest-backed apps in one request instead of probing every `apps/*/` directory.
The destination works without it (it probes), so it is not a blocker.

### 4.3 MCP

Not in the first release. When it comes, a `write_data_app` tool is a thin
wrapper over §4.1, and `get_context` could index manifests as a `finding`
entity so an agent answering a question can cite what a colleague already found.
Recorded here so the schema is designed with it in mind (the `description` and
`queries` fields are what such an index would read); not scheduled.

## 5. Destination: one verb

### 5.1 Save

`useLibrarySave` (`components/analysis-actions.tsx`) becomes a **Save** menu on
every card and page that has the verb today (analysis actions, the analysis page,
thread messages, the Console publish page):

- **Save for me** — a personal `LibraryItem`, exactly today's behavior.
- **Save to the workspace** — opens a small dialog: package (default: the
  finding's `provenance.package`), slug (from `toIdentifier`-style slugging of
  the title, editable), title and description as they will be written, an
  "also add its query to the model as a view / query" checkbox that opens the
  existing wizard afterwards. Confirming calls `client.writeDataApp`, then
  creates or updates the Library item with
  `packageRef: { package, kind: "data_app", id: "apps/<slug>/index.html", path: "apps/<slug>/app.json" }`
  and `scope: "workspace"`.

When the target package cannot be written (frozen, foreign location, Publisher
down), the dialog says so and offers "keep it in the Library only", which is the
current workspace-scope behavior and keeps the `unpromoted` badge meaningful.

The Console's `/publish` page (`pages/publish.tsx`) maps its "Keep in the
Library" select onto the same two options, so a result published from the
Console lands in the package when the person picks Workspace.

### 5.2 Reading it back

- `data/publisher.ts` `listWorkspacePackages`: for each `data_app` under
  `apps/`, read the manifest (from the listing's `manifest` field when present,
  otherwise by fetching `apps/<slug>/app.json`) and attach it as
  `WorkspaceItem.manifest`. `title`/`description` come from the manifest.
- `data/sync.ts`: a `packageRef` of kind `data_app` matches as now. Add reverse
  linking: a manifest whose `origin.id` names a local analysis or thread the
  viewer has, with no item pointing at it, is offered "This is in
  `<package>` — link it" rather than shown as two things.
- Library facets: a manifest-backed app shows under its content kind
  ("Analysis" / "Report"), not "Data app". `PackageFileCard` for one renders the
  native card (narrative, `EvidenceChart` from the snapshot, provenance, topics,
  byline from `author`) instead of the iframe preview.
- `WorkspaceDataAppPage`: when the item has a manifest of a version the app
  understands, render `analysisFromManifest` on the existing `AnalysisPage`
  body, or the report on the existing thread report renderer; otherwise
  `DataAppViewer` as now. "Open standalone" and "Open in Publisher" stay in the
  menu.
- Remix on a package-backed analysis saves a new manifest with `expectedHash`,
  so an edit is a diff in the package. A concurrent edit is a 409 the dialog
  explains ("changed in the package since you opened it"), as the dashboard
  builder does.
- Comments: `CommentSection` is keyed by `analysis/<id>` or a `pageKey`. On
  save-to-workspace, re-key the analysis's comments to the app's page key so
  the discussion follows the finding; on read, look up both keys for a
  transition period.

### 5.3 What the Library stops doing

- The **All / In a package / Not in one** tabs stay, but "Not in one" is now the
  exception list (items whose package could not be written) rather than the
  default state of everything shared.
- The `SyncState` machine stays; `missing` now also covers a deleted
  `apps/<slug>/` directory, and the card offers "Save it again" from the local
  copy when the destination still has one.
- `PromoteWizard` keeps its view / query / dashboard targets and loses its
  role as the way to share; it is reached from the Save dialog's checkbox and
  from the item menu as "Add its query to the model".

## 6. Where the shared code lives

A new workspace package, `packages/app-manifest` (`@malloy-publisher/app-manifest`),
with no React and no server-only imports, consumed by the server (validate,
generate `index.html`), the destination (mappers, types), and the
`/sdk/publisher-app.js` bundle:

- `schema.ts` — the zod schema and TypeScript types for the manifest, versioned.
- `html.ts` — `indexHtmlFor(manifest)`; one function so the stub has one shape.
- `analyst/` — moved from `packages/credible-demo/src/analyst`: `schema.ts`,
  `compute.ts`, `format.ts`, `chart-program.ts`, `chart-chartjs.ts`, and the
  schema half of `blocks.ts` (the React registry stays in the destination).
  These already say "nothing here imports React or a server-only module".
- `mappers.ts` — `manifestFromAnalysis`, `manifestFromThread`,
  `manifestFromDraft`, `analysisFromManifest`, `recordFromManifest`, `slugOf`.

The renderer bundle is a second entry in that package (`runtime/main.ts` +
`runtime/render.ts`), built with Bun into `packages/server/src/runtime/publisher-app.js`
as part of the server build, and served by a route beside `/sdk/publisher.js`
with the same headers. The server keeps serving `publisher.js` as the
hand-written file it is.

The destination's `Evidence`, `Analysis`, `Thread` types stay in the
destination; the mappers are the boundary.

## 7. Phases

Each phase ships on its own and leaves the previous behavior working. Nothing in
the Console is on the critical path for phases 1–3.

**Phase 1 — the convention, hand-written.** _Done; see §7.1._ `packages/app-manifest` with the
schema, mappers, and round-trip tests (`Analysis → manifest → Analysis` equal
under `provenance` fill-in; a fixture thread's record likewise). Write one
manifest by hand into `examples/storefront/public/apps/` with its stub, confirm
the Console lists and opens it (blank body until phase 2, title and standalone
link work), and confirm the destination reads it back as a synced Library item
by probing `apps/*/app.json`. Deliverable: the format, proven on both readers.

### 7.1 What phase 1 settled

- **A chart program is stored without its rows.** A destination analysis
  keeps a _bound_ program, whose `sources` carry rows from datasets the
  analysis has no Malloy for. The manifest keeps `evidence.program` with
  `sources` removed, `evidence.tables` naming the snapshot entries that were
  its sources, and those rows in `snapshot`. So a snapshot key need not be a
  query: one that is not is rows the finding carries but cannot re-run. The
  schema checks that every name resolves (evidence query, program tables,
  metric and block datasets, block metrics).
- **A query carries `view`, `title` and `grain`** when it has them, so an
  analysis's `provenance.view` and a thread dataset's title and grain survive
  the round trip; `snapshot.rowCounts` keeps a capped dataset's full count.
- **No `manifestFromDraft`.** `publishDraft` already turns a chartable Console
  draft into an `Analysis`, so `manifestFromAnalysis` covers it.
- **The page's body carries the title and description**, which the renderer
  replaces. They are derivable from the manifest, so the contract in §3.4
  holds, and until phase 2 lands they are what the Console shows.
- **Only the zod-only analyst modules moved** (`schema`, `blocks`, `tokens`,
  `format`, `compute`), imported in the destination as
  `@malloy-publisher/app-manifest/analyst/*`. `chart-program` and
  `chart-chartjs` import `@tanstack/charts`, so they move with the renderer
  in phase 2 rather than pulling it into the server now.
- **A manifest with no `author` reads back as `authorId: "ai"`**, the
  destination's only unattributed author.
- **For phase 3:** the server depends on zod 3 and this package on zod 4.
  Each resolves its own and the server's bundle takes both, but the server's
  write validation must call this package's `readManifest`, not re-declare
  the schema.

**Phase 2 — the renderer.** _Done; see §7.2._ `/sdk/publisher-app.js`: fetch, run, compute,
draw; snapshot fallback with the "as of" note; Chart.js for plain charts and
`chartjs` programs. A Playwright check opens the storefront example page and
waits on a rendered chart (not `networkidle`; the events stream never idles).
Docs: a section in [html-data-apps.md](html-data-apps.md) and a paragraph in
[choosing-a-surface.md](choosing-a-surface.md) placing "a saved finding" among
the surfaces.

### 7.2 What phase 2 settled

- **Metrics are pinned, not recomputed.** A stored `Metric` carries its value
  and definition but not the arguments `compute` was called with, so the
  renderer shows the value as written, like the prose. Charts and tables are
  live. Recomputing needs the args in the manifest, which is a version-1
  addition (optional field) whenever it is wanted.
- **The renderer does not bundle zod.** It checks the outline only
  (`runtime/peek.ts`: version, kind, title, queries or snapshot) and draws
  what it can, and the zod-free constants moved to `paths.ts` so importing them
  does not pull the schema in. Full validation is the write path's job (phase
  3). An unreadable manifest renders a notice saying why, over the page's own
  title and description.
- **Every chart is a `chartjs` program.** Plain evidence and report chart
  blocks are converted into one (`runtime/charts.ts`) and drawn through
  `chartJsConfig`, so there is one drawing path. Numeric x values are
  stringified, because Chart.js's category scale reads a number as an index. A
  `tanstack` program, a program that fails `parseChartProgram`, and `visual`
  overlays fall back to the plain chart of the evidence.
- **`chart-program` and `chart-chartjs` moved into the package** with the
  renderer, as §7.1 anticipated; the destination imports them from
  `@malloy-publisher/app-manifest/analyst/*`.
- **Size: 253 KB minified, 86 KB gzipped, against a 275 KB budget.** The build
  (`scripts/build-runtime.ts`) fails over budget. §3.3's 250 KB was Chart.js
  plus a guess; the chart-program evaluator and the format helpers are the
  difference.
- **The bundle is built, not committed.** The server build and `start:dev` run
  `build:runtime`; `packages/server/src/runtime/publisher-app.js` is
  gitignored; the route answers 404 with a console message when it has not
  been built. The Dockerfile copies `packages/app-manifest` for the build.
- **The Playwright check stubs a failed query with `page.route`** rather than
  writing a broken manifest into the package, so the fallback test does not
  race the other specs over package files.

### 7.3 What phase 3 settled

- **A finding saves only into its home package, checked on both sides.** The
  wizard computes the home (`homeOf` in `mappers.ts`: the one package every
  query came from, in the workspace environment) and offers no choice; a
  finding whose data spans packages, or has no query, says why it cannot be
  saved. The server compiles every query against the target package before
  writing and refuses with each failure, so a client that skips the rule still
  cannot save a manifest whose models are not there. A missing model is named
  as such rather than as a compile error.
- **No refusal for remote package locations.** §4.1's step 2 is moot: a reload
  recompiles from the `publisher_data/` copy and does not re-fetch, and
  `public/` is not compiled at all, so the write never reloads. The copy is
  what the server serves; a remote package's source of truth does not see the
  save, which is the same as a dashboard write.
- **Status codes follow the dashboard write.** A compile refusal is 400 (not
  422), a stale or missing precondition 409, frozen config 403. `GET` of an
  app whose `app.json` does not parse answers 200 with `problem` and its hash,
  so a client can still replace or delete it. `DELETE` takes `expectedHash` as
  a required query parameter.
- **The directory is replaced whole.** The new `app.json` and `index.html` are
  written to a sibling directory and swapped in by rename under the package
  lock, so a replace also removes any other file a previous save left.
- **Compile runs before the lock**, because `withPackageLock` is not
  reentrant and compiling takes it. The precondition is checked under it.
- **The live-or-snapshot rule is wider than "the query failed".** Saving the
  Outerwear finding showed a query can succeed and still not be the finding:
  its month filter returned no rows, and another shape returned different
  columns. The renderer now falls back, and says so, when live rows lack a
  column the snapshot has, or are empty where the snapshot is not.
- **The wizard compile-checks each query at `append` scope** and shows the
  diagnostics by query title, without line numbers (append-scope positions are
  offsets into model plus text). A refusal Malloy gives for the text as
  written (the reserved word `quarter` as a bare name, for one) is shown as is.
- **No write metrics yet.** The dashboard write records none either.

**Phase 3 — the write endpoint.** Done; §7.3. §4.1 with its spec file; the `DestinationClient`
gains `writeDataApp` / `deleteDataApp` / `getDataAppManifest`; `data/publisher.ts`
implements them. The Save dialog (§5.1) lands behind the existing Promote entry
point first ("Save to `<package>` as a data app" becomes the recommended target
in the wizard's first step), so the flow is exercised before the verb moves.

**Phase 4 — one verb.** _Done; see §7.4._ Save menu replaces Save + Promote everywhere; workspace
scope means "in a package"; `/publish` maps onto it; native rendering of
manifest-backed items on cards and the detail page; comment re-keying; reverse
linking. Release note under the destination.

### 7.4 What phase 4 settled

- **One `SaveButton`, one `useFindingSave`** (`components/save-menu.tsx`) on
  the analysis card menu, the analysis page, the thread header and the Library
  item menu. The menu has two entries, "Save for me" and one package entry
  whose label says what it will do: "Save to `<pkg>`…", "Update in `<pkg>`…"
  when the workspace item already points at an app there, "Save again to
  `<pkg>`…" when that app is gone. The button reads "Saved" or "In `<pkg>`".
  A thread with no query still gets "Save for me".
- **The Save dialog is its own component** (`features/library/save-app-dialog.tsx`),
  not a wizard step. It offers only the home package, compile-checks each
  query at `append` scope, reads the previous app's hash once at open so an
  update is a replace, and explains a 409 in its own words. "Keep in the
  Library only" is offered when there is no home package, the package is not
  served, Publisher is down, the write is forbidden, or the failure is not
  Publisher's; that is the only way left to make a workspace item that is not
  in a package.
- **The wizard only adds a query to the model.** Its app target is gone; it is
  "Add its query to the model", reached from the dialog's switch (after the
  save) and from the Library item menu.
- **The workspace item is upserted by the finding's href** (`keepInWorkspace`),
  so saving twice updates one item instead of making two, and the item links
  to the app by `dataAppRef`.
- **Reverse linking uses `manifest.origin`** (`manifestOrigin` in `mappers.ts`).
  An app whose origin names a finding the Library already holds, when no item
  links to it, marks that item `linkable`: one card with "In `<pkg>`, link it",
  not the item plus a package file.
- **Native rendering reuses the renderer's loader.** `loadTables` (exported as
  `@malloy-publisher/app-manifest/runtime/load`) runs each query through the
  destination's Publisher client, `withRows` swaps the live rows into the
  manifest, and the mappers turn that back into an `Analysis` or a report
  record. So the Library card, the detail page and `/sdk/publisher-app.js`
  apply one fallback rule and word it the same way.
- **Comments move at save time and are read under both keys.** Saving an
  analysis moves its comments to the app's page key; the analysis page and the
  app page read the page key with the analysis id as `formerly`, so nothing
  already written disappears during the transition.
- **`/publish` defaults to "In `<pkg>`, for everyone"** for a query draft with
  evidence in the workspace environment, and asks for the address. It
  publishes the analysis first and writes the app second, so a refused write
  leaves the analysis in the Library and says to use Save on it.
- **Deferred to phase 5: Remix in place.** Remix on a saved finding opens the
  original analysis with `?remix=1` and edits a local copy; writing the edit
  back to the manifest with `expectedHash` is not built.
- **A fixture turned out not to compile.** "Q3 margin bridge" names a field
  `quarter`, which is reserved, so its Save dialog reports the compile error.
  That is the check working; the fixture is left as is.
- **A chat answer is saved, not its thread.** Save sits under each answer,
  not in the thread header, and the thread's own Save and Publish are gone.
  The first save keeps the answer as an `Analysis` (`keepResponse`, recorded
  on the message as `analysisId`): its text as the narrative, its lead chart
  and query as evidence, and the analyst's whole report in `report`, which
  the analysis page and Library card draw in place of the single chart. So it
  is an insight like any other: the button saves it to the viewer's Library,
  and the menu beside it writes it to its package. An analysis with a report
  is written as a `report` manifest (`manifestFromReport`) whose origin is
  the analysis, so reverse linking and comment re-keying work the way they do
  for any analysis. `thread` is no longer a Library content kind; a stored
  thread item becomes its last answer, kept as an insight, the next time the
  store loads.

**Phase 5 — polish and reach.** `/data-apps` carries `manifest` and
`description` (§4.2) and the Console card shows them; `tanstack` programs and
`visual` overlays in the renderer; a `write_data_app` MCP tool; `get_context`
indexing findings.

## 8. Decisions taken here, and what is open

Taken:

- **Live numbers, pinned prose.** The renderer runs the queries every time and
  shows the snapshot only when a query fails, with an "as of" note. A narrative
  can drift from live data; the snapshot's `asOf` is displayed beside the chart
  so a reader can tell, and the "Remix" path is how someone updates the words.
  A "show as written" toggle is cheap to add later and is not needed to ship.
- **Slugs are the identity.** Re-saving the same finding overwrites its slug
  with `expectedHash`; saving a remix as a new finding gets a new slug. There
  is no numeric id in the package.
- **No auth on the write.** The endpoint is as open as the dashboard write and
  every other API route; the deployment's gateway is the boundary
  ([security-posture.md](security-posture.md)). `author` in the manifest is
  what the client says it is.
- **A finding saves into the package its data came from, and nowhere else.**
  A manifest's model paths are package-relative, so restricting is correct by
  construction; the wizard offers only the home package and the server's
  compile check enforces it (§7.3).

Open:

- **Whether the personal Library should ever move server-side.** Out of scope
  here; the split in §2 does not depend on where personal items live.
- **The name.** "Data app" is what Publisher calls anything under `public/`, so
  a manifest-backed one is a data app by definition and shows as one in the
  Console. The destination shows it as an Analysis or a Report. Whether the
  manifest `kind` vocabulary should be user-facing in the Console (a "Finding"
  section beside "Data Apps") is a Console question for phase 5.
