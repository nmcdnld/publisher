<!--
Copyright (c) Credible Data Inc.
SPDX-License-Identifier: MIT
-->

# In-package HTML data apps

A package can ship a `public/` directory of plain web files next to its `.malloy`
files. Publisher serves that directory and exposes a small JavaScript runtime at
`/sdk/publisher.js` so the page can run Malloy queries against the package's
models and render whatever you like with the front-end tools you already know
(Chart.js, D3, plain DOM, or `<malloy-render>`). There is no build step, no npm
install, and no framework requirement. You write HTML, CSS, and JavaScript, and
Publisher serves it and answers its queries.

Ship any library you use inside the package's `public/` directory and load it
with a relative path, rather than from a CDN. The bundled examples put theirs in
`public/vendor/`. Two reasons: agent sandboxes and many corporate networks block
CDNs, and the failure is easy to miss, because the script never runs, so the page
comes up with empty charts and whatever renders after them; and a page's JavaScript runs with the viewing
user's data authority, so it is worth knowing exactly what you are loading.

> **What this is:** a self-contained dashboard written in plain HTML/CSS/JS, shipped *inside* a
> package and **served by Publisher** — no build step, no framework, no npm. It's the supported way to
> ship a custom UI. (For zero-code exploration, use the [Publisher Console](./console.md); to build
> against the data programmatically, see the [REST/MCP APIs](./api-overview.md).)

Reach for an HTML data app when you want a self-contained, custom dashboard that ships with the model
and needs no toolchain. A page can also be *embedded* into another site as an auto-resizing iframe
with `Publisher.embed` (see [Embedding](#embedding)).

The bundled `storefront` package ships one, a four-tab Chart.js dashboard in
[`examples/storefront/public/index.html`](../examples/storefront/public/index.html) with its modules
in [`public/app/`](../examples/storefront/public/app/), backed by `Publisher.query` /
`Publisher.queryFull` calls against the model's views and filtered by the model's own
[givens](givens.md):

![The storefront HTML data app: a filter row, four KPI cards, revenue by month and by state, and a category performance table](screenshots/storefront-data-app.png)

Filters run new Malloy queries and repaint the KPIs, charts, and table in place — here in the bundled [`html-data-app`](../examples/html-data-app/) SaaS-subscriptions example:

![Selecting filters in an HTML data app re-queries and updates the KPIs, charts, and table live](screenshots/html-data-app-filtering.gif)

## How it fits together

```
my-package/
  publisher.json        # package manifest (name, version, description)
  subscriptions.malloy  # one or more models
  subscriptions.parquet # data the models read
  public/               # everything in here is web-served
    index.html          # can be one self-contained file, or split out css/js
    embed-test.html
    vendor/             # chart library, vendored rather than loaded from a CDN
      chart.umd.js
```

Publisher serves the contents of `public/` at:

```
/environments/<env>/packages/<pkg>/<file>
```

so `public/index.html` is the package's landing page and any other file under
`public/` loads at its relative path. Only `public/` is reachable over the web. The models, the data
files, and `publisher.json` live outside it and are never served; the page
reaches model data only through the query API, which goes through the same
governance (filters, access modifiers, authorize annotations) as any other
Publisher client.

Note the `/environments/.../packages/...` prefix. The web UI opens a model at the
shorter `/<env>/<pkg>/<file>.malloy`, so that form is an easy guess for a page
too, and it is a different route. A server running the built app redirects the
guess to the URL above rather than leaving you on an app page that cannot find
the file, once that environment and package are loaded; before that, and during a
cold start, you get a 404 page naming the URL, and following it loads them.
Running the Vite dev server instead, every unmatched path is handed to Vite, so
there you get the app shell and a page naming the URL to use.

A package becomes a data app simply by having a `public/` directory. There is no
flag to set in `publisher.json`.

## Quick start

Copy the worked example and run it with live reload:

```bash
mkdir -p /tmp/publisher-demo
cp -R examples/html-data-app /tmp/publisher-demo/
cat > /tmp/publisher-demo/publisher.config.json <<'JSON'
{
  "frozenConfig": false,
  "environments": [
    {
      "name": "demo",
      "packages": [{ "name": "html-data-app", "location": "./html-data-app" }],
      "connections": []
    }
  ]
}
JSON

SERVER_ROOT=/tmp/publisher-demo \
  bun run packages/server/src/server.ts --watch-env demo
```

Open `http://localhost:4000/environments/demo/packages/html-data-app/`. Edit a
file under `public/` and the open page reloads on its own; edit the `.malloy`
model and the package recompiles. The `--watch-env` part is what enables that
loop (see [Live reload](#live-reload) below).

The smallest page that talks to a model is:

```html
<!doctype html>
<title>Subscriptions</title>
<pre id="out"></pre>
<script src="/sdk/publisher.js"></script>
<script>
  Publisher.query("subscriptions.malloy", "run: subscriptions -> plan_mix").then((rows) => {
    document.getElementById("out").textContent = JSON.stringify(rows, null, 2);
  });
</script>
```

## The runtime

Load the runtime once per page with a root-relative script tag, so it resolves
through Publisher no matter which environment or package the page is served
under:

```html
<script src="/sdk/publisher.js"></script>
```

It attaches a single global, `window.Publisher`. The script has no dependencies
and adds nothing to the page's markup.

| Member | Signature | Returns |
|---|---|---|
| `Publisher.query` | `(modelPath, malloy?, opts?)` | `Promise<Array>` of row objects |
| `Publisher.queryFull` | `(modelPath, malloy?, opts?)` | `Promise<MalloyResult>` (full envelope) |
| `Publisher.embed` | `(selector, options)` | `{ iframe, destroy() }` |
| `Publisher.context` | property | `{ environment, package }` inferred from the URL |
| `Publisher.setToken` | `(token \| null)` | `undefined`; the token then applies to all later queries on the page |

### Querying

`Publisher.query(modelPath, malloy, opts)` runs a Malloy query against one model
in the current package and resolves to an array of plain row objects, ready to
feed a chart or a table.

```js
// Run a named view defined in the model.
const rows = await Publisher.query("subscriptions.malloy", "run: subscriptions -> plan_mix");
// rows -> [{ plan: "Pro", account_count: 272 }, { plan: "Starter", account_count: 255 }, ...]
```

`modelPath` is the model file's path within the package, with `/` separators
(here `"subscriptions.malloy"`; a nested model would be `"models/events.malloy"`). The
second argument is any Malloy query string. Build the model's queries the way you
would anywhere else: run a pre-built view, refine it, or write an ad-hoc query.

```js
// Refine a view with a filter at call time.
await Publisher.query("subscriptions.malloy", "run: subscriptions -> plan_mix + { where: plan = 'Pro' }");

// A single-row KPI view: read element [0].
const [kpis] = await Publisher.query("subscriptions.malloy", "run: subscriptions -> kpis");
document.getElementById("mrr").textContent = kpis.active_mrr;
```

Defining frontend-friendly views in the model (pre-aggregated, pre-sorted, one
per tile) keeps the page's query strings short and the work on the server. The
example's `subscriptions.malloy` does exactly this with `kpis`, `mrr_by_month`,
`plan_mix`, and `accounts`.

A dashboard usually issues several queries at once and renders them together:

```js
const [kpisRows, byMonth, planMix, accounts] = await Promise.all([
  Publisher.query("subscriptions.malloy", "run: subscriptions -> kpis"),
  Publisher.query("subscriptions.malloy", "run: subscriptions -> mrr_by_month"),
  Publisher.query("subscriptions.malloy", "run: subscriptions -> plan_mix"),
  Publisher.query("subscriptions.malloy", "run: subscriptions -> accounts"),
]);
```

> **See it working.** The example's
> [`public/index.html`](../examples/html-data-app/public/index.html) does exactly this in its
> `refresh()` — four `Publisher.query` calls fanned out with `Promise.all`, driving two Chart.js
> charts, a KPI row, and a filterable table, all from the views in
> [`subscriptions.malloy`](../examples/html-data-app/subscriptions.malloy).

The third argument, `opts`, is optional:

| Option | Type | Effect |
|---|---|---|
| `sourceName` | string | The source a `queryName` view hangs off. Not valid alone: `sourceName` without `queryName` is a 400 |
| `queryName` | string | Run a saved query or view by name. Pair with `sourceName` for a view on a source; alone it runs a model-level query |
| `environment`, `package` | string | Override the environment or package the query targets, for pages not served under `/environments/<env>/packages/<pkg>/` |
| `givens` | object | A name→value map bound as Malloy [`given:`](./givens.md) runtime parameters for this query. Safe parameterization, not string interpolation |

`queryName` (with `sourceName` for a view on a source) is the alternative to
passing a `run:` string as the second argument; use one path or the other, and
note `sourceName` on its own is a 400. For parameterized results, pass `givens`
alongside a model-defined view or query rather than assembling a `run:` string
on the page: Publisher binds those values as typed parameters server-side, so
they are never concatenated into query text.

**Do not interpolate free-text or otherwise untrusted input into the query
string.** Route it through `givens` instead. Two limits on that, both of which
matter:

- A `filter<T>`-typed given takes Malloy filter syntax _as its value_, so
  validate it against a known set like any other input. Scalar givens carry no
  syntax at all.
- `givens` is safe **parameterization**, not an authorization boundary. A
  client-supplied given is client-trusted unless a trusted tier upstream sets it
  from verified identity. Publisher has no per-package control that strips or
  finalizes one: identity-bound givens are a planned milestone, not a shipped
  feature. See [row-level-access.md](./row-level-access.md) and
  [authorize.md](./authorize.md).

Where you must build query text from input, constrain it to a known set and
escape it, or keep the filtering in model-defined views. The
`malloy-html-data-app-runtime` skill covers the same ground for an agent writing
the page.

`Publisher.queryFull(...)` takes the same arguments but resolves to the full
Malloy result envelope rather than just the rows. Use it when you want to hand
the result to `<malloy-render>` and let Malloy draw the chart; use `query` when
you want the raw rows to drive your own rendering.

On a failed query the returned promise rejects with an `Error` whose message is
prefixed `Publisher.query:`. The error carries `error.status` (the HTTP status)
and `error.response` (the parsed JSON body), so you can branch on a missing
filter, a compile error, or a permission failure.

### Context

`Publisher.context` is `{ environment, package }`, read from the page's own URL
(`/environments/<env>/packages/<pkg>/...`). `query`, `queryFull`, and the live
reload use it automatically, so a page served from inside its package does not
need to name its environment or package anywhere. If you serve the page from
somewhere else (for example a host page on another path that calls the API
directly), pass `environment` and `package` in `opts`.

### Auth

By default the runtime sends the browser's cookies with every request
(`credentials: "include"`) and adds no `Authorization` header, so a page served
to a logged-in user authenticates as that user with no extra code.

To authenticate with a bearer token instead, call `Publisher.setToken(token)`
before querying; pass `null` to clear it and fall back to cookies. This is the
hook a host application uses to pass a signed token into an embedded page (see
[Embedding](#embedding)).

What the Publisher server enforces on these routes is the package's own model
governance: filter and runtime-parameter (given) rules, access modifiers, and
`#(access_filter)` annotations are applied when the query compiles and runs. The static file, data-app-listing, and
events routes themselves are open; treat anything you put under `public/` as
world-readable to anyone who can reach the server, and keep secrets in the models
and the database, behind the query API, not in the page.

### Theme

The runtime tells a page which appearance to draw in, by attributes on `<html>`:

| Attribute | Value |
|---|---|
| `data-theme` | `light` or `dark` |
| `data-theme-source` | `host` when a host page sent its theme; absent otherwise |
| `--publisher-<token>` | one CSS custom property per token the host sent |

Standalone, `data-theme` follows the reader's OS setting and changes with it.
Inside a host that sends its theme, the page follows the host instead: the
Publisher Console's data app viewer sends its light/dark mode and palette, and a
workspace host sends its light/dark switch and workspace theme. The tokens a host
may send are `background`, `foreground`, `card`, `muted`, `muted-foreground`,
`border`, `ring`, `primary`, `primary-foreground`, `accent`, `accent-foreground`,
`positive`, `negative`, `chart-1` to `chart-5`, and `font-sans`; any may be
missing, so read each with a fallback to your own value.

The pattern that works is three token blocks at the top of the stylesheet: your
light palette on `:root`, your dark one on `:root[data-theme="dark"]`, and a
mapping onto the host's on `:root[data-theme-source="host"]`. Map your chrome
(surfaces, text, borders, accent, lead series) onto the host, and keep the colours
that carry meaning in your data, like a team's colour, as your own:

```css
:root[data-theme-source="host"] {
  --bg: var(--publisher-background, var(--own-bg));
  --panel: var(--publisher-card, var(--own-panel));
  --text: var(--publisher-foreground, var(--own-text));
  --accent: var(--publisher-primary, var(--own-accent));
}
```

Set `<meta name="color-scheme" content="light dark">` so form controls and
scrollbars follow too. A page that paints from script (a canvas chart) reads the
current theme from `Publisher.theme` (`{ mode, tokens, source }`) and repaints on
the `publisher:theme` window event, which fires whenever the appearance changes.
The `questionable-football` and `signals-research` example packages do both.

A host that is not a Publisher component can send a theme itself. The page asks
with a `{ type: "publisher:theme-request" }` message when it loads; answer, and
again on every change, with
`{ type: "publisher:theme", mode: "light" | "dark", tokens: { … } }` posted to
the iframe's window. The SDK's `useDataAppThemeBridge(iframeRef, theme)` does
this for a React host, and `DataAppViewer` takes the same value as its `theme`
prop.

## Embedding

A page can be embedded in another page as an auto-resizing iframe with
`Publisher.embed`:

```html
<script src="https://your-publisher/sdk/publisher.js"></script>
<div id="dashboard"></div>
<script>
  Publisher.embed("#dashboard", {
    src: "https://your-publisher/environments/demo/packages/html-data-app/index.html",
  });
</script>
```

`embed(selector, options)` mounts an iframe into the element matched by
`selector` (a CSS string or an element) and returns `{ iframe, destroy() }`. Call
`destroy()` to remove it and detach its listeners; calling `embed` again lets you
remount, which is handy when the host swaps dashboards.

Options:

| Option | Type | Effect |
|---|---|---|
| `src` | string (required) | URL of the page to embed |
| `token` | string | Appended to `src` as an `embed_token` query parameter for the embedded page to read |
| `height` | number or string | Fixed height (`number` is treated as pixels). Omit it to auto-size. |
| `allow` | string | Value for the iframe's `allow` attribute (permissions policy) |

The iframe is sandboxed with `allow-scripts allow-same-origin allow-forms`. When
you omit `height`, the embedded page measures its own content and posts its
height to the host, which resizes the iframe to match; the host only accepts
those messages from the iframe it created. You do not write any of that wiring,
it ships in the runtime. If your embedded page sets `body { min-height: 100vh }`
or similar, the runtime still measures the real content height rather than the
viewport, so the frame does not grow without bound.

For a same-origin or same-tenant embed, the browser's cookies authenticate the
iframe and you pass no token. For a cross-origin embed (your customer's app on a
different domain), mint a short-lived signed token on your server and pass it as `token`; the
embedded page reads `embed_token` and calls `Publisher.setToken(...)`. Mint the token server-side with
the same signing key the server verifies; never put a long-lived or admin token in client HTML.

**A cross-origin embed also needs the server to permit the framing itself**, which
is separate from authenticating it. Publisher sends `frame-ancestors 'self'` by
default, so the browser refuses a frame from another origin before any token is
read: the iframe renders blank, and nothing is logged server-side, which makes it
look like a broken page rather than a policy. Set `PUBLISHER_FRAME_ANCESTORS` to
the host page's origin on the deployment being embedded. If an embed is blank,
check the browser console first -- it names `frame-ancestors`.

## Live reload

When the server runs with `--watch-env <env>` (or `PUBLISHER_WATCH=<env>`),
Publisher mounts that environment's local-directory packages in place and watches
them. Editing a `.malloy` file recompiles the package; editing a file under
`public/` refreshes any open page. The runtime subscribes to a server-sent-events
stream and reloads the page when the package changes; this is automatic for any
page that loads `publisher.js` from inside its package.

The stream is `GET /api/v0/environments/<env>/packages/<pkg>/events`. It emits a
`hello` event on connection, a `mode` event reporting whether watch mode is on, a
`changed` event on each package change, and a periodic heartbeat. Without `--watch-env`, the stream
connects and reports `mode: disabled`, and no reloads fire, which is the expected
production posture.

One consequence for headless verification: because the runtime holds that stream open, a served
page never reaches network idle, so a Playwright or Puppeteer check that waits for `networkidle`
hangs. Wait on `load` plus a content selector instead. This holds with watch mode off too, since
the stream still connects to hear `mode: disabled`.

## Full-screen apps in the data app viewer

When you open a data app from inside the Publisher Console (the package's Data
Apps list), it is shown in an iframe wrapped in light chrome (a title and an
"open standalone" link). By default that iframe is sized to the page's content
height: the page's runtime measures how tall its content actually is and the
viewer matches it, so an ordinary dashboard never gets a nested scrollbar.

A full-screen app, such as a slide deck that sizes itself to `100vh`, has no
content height to measure, so the default sizing would clip it. Declare that the
page should fill the viewer instead with a single meta tag in the `<head>`:

```html
<meta name="publisher:fit" content="viewport" />
```

The viewer then makes the iframe fill the available height, so the page's own
`100vh` resolves against the real viewport and looks the same as it does opened
standalone. Because the viewer reads this tag from the page's markup, it works
even for a page that does not load `publisher.js`. The tag must sit near the top
of `<head>` (within the first 4KB, the same window the title is read from). Apps
without it keep content-height sizing, so marking one app full-screen does not
affect any other page, and opening a page directly at
`/environments/<env>/packages/<pkg>/<file>` is unaffected either way.

## Manifest-backed apps: a saved finding

Not every data app is hand-written. A finding saved from an analysis (a headline, the supporting
points, a chart, and the queries behind them) is stored as a data app whose page is generic and
whose content is data. It is a directory under `public/apps/`:

```
public/apps/revenue-growth-by-year/
├── app.json     # the manifest: title, prose, queries, a snapshot of their rows
└── index.html   # generated; the same few lines for every app
```

The page carries `<meta name="publisher:app" content="app.json">` and loads two scripts,
`/sdk/publisher.js` and `/sdk/publisher-app.js`. The second one is the renderer: it fetches the
manifest named by the meta tag, runs each of its queries through `Publisher.query`, and draws the
finding. Treat `index.html` as generated output: edit `app.json`, not the page. The page's body
holds the title and description as plain text, so it still says what it is if the renderer never
runs.

**Live numbers, pinned prose.** Charts and tables are drawn from the query results, so they move
with the data. The headline and bullet points are the text as written, against the data as of
`snapshot.asOf`, and the footer says so. The manifest also stores a snapshot of every query's rows
(at most 400 per query). The renderer draws the snapshot instead, and names why, when a query fails
(the model changed, the source was renamed, the caller lacks a given), when it no longer returns a
column the finding was written against, or when it returns no rows where the snapshot has some:
"Showing the rows as of Sep 30, 2026: a query could not be shown live (…)". A finding keeps its
evidence after the model moves on, and it is clear about which state you are looking at.

**Saving one.** `PUT /api/v0/environments/<env>/packages/<pkg>/data-apps/<slug>` with
`{"manifest": {…}}` writes `public/apps/<slug>/app.json` and generates its `index.html`. Publisher
validates the manifest and compiles every one of its queries against that package first, and
refuses the save, writing nothing, when one does not compile there. That check is what keeps a
finding in the package its data came from: its model paths are package-relative, so saved anywhere
else they would name models that are not there, or models of the same name that mean something
else. Omit `expectedHash` to create an app; to replace one, send the `contentHash` that
`GET …/data-apps/<slug>` returned, and a 409 means someone changed it since. `DELETE
…/data-apps/<slug>?expectedHash=…` removes it. An agent or a person can equally write the two files
by hand; the endpoint is the checked way.

The manifest's `kind` is `analysis` (one headline, its details, one evidence chart) or `report`
(a sequence of blocks: KPIs, charts, tables, insights, a summary). The renderer is built from the
Credible destination's own components, so a finding draws exactly as it did where it was saved:
its evidence `visual` (contribution, anomaly, divergence, waterfall), a `chartjs` or `tanstack`
chart program, and a report's blocks all render as written, in the light or dark mode and host
palette that `publisher.js` reports. A manifest the renderer cannot read (an unknown `version` or
`kind`, or no queries) renders a short notice saying why, rather than a blank page.

These apps are ordinary data apps in every other respect. They appear in the
[listing](#listing-a-packages-data-apps), open in the Console's viewer, embed with
`Publisher.embed`, and query through the same governed endpoint as a hand-written page. For a
headless check, wait for `#publisher-app[data-state="ready"]` and `[data-chart="drawn"]`, not
`networkidle` (see [Live reload](#live-reload)). The bundled example is
`http://localhost:4000/environments/examples/packages/storefront/apps/revenue-growth-by-year/`.

## Listing a package's data apps

`GET /api/v0/environments/<env>/packages/<pkg>/data-apps` returns the package's
HTML data apps, which the Publisher Console uses to show what a package offers.
Each entry is:

```json
{
  "resource": "/environments/examples/packages/html-data-app/index.html",
  "packageName": "html-data-app",
  "path": "index.html",
  "title": "SaaS Subscriptions"
}
```

`resource` is the root-relative URL to open the page (note it is not under
`/api/v0`), `path` is the file's path within `public/`, and `title` is taken from
the page's `<title>` tag, falling back to `path`. An entry also carries
`fit: "viewport"` when the page opts into filling the viewer with
`<meta name="publisher:fit" content="viewport">` (see
[Full-screen apps in the data app viewer](#full-screen-apps-in-the-data-app-viewer)), and
omits the field otherwise. The listing covers `.html` and `.htm` files up to
three directories deep and is empty for a package with no `public/` directory.

## The package manifest

`publisher.json` sits at the package root and is not web-served. No field in it is
data-app-specific (a package becomes a data app by having a `public/` directory);
the manifest field reference is [packages.md](packages.md).

```json
{
  "name": "html-data-app",
  "version": "0.0.1",
  "description": "SaaS subscriptions dashboard built as an in-package HTML data app."
}
```

## Security model

- Only `public/` is served. Requests are confined to that directory: path
  traversal (`..`) and names that resolve outside the package are rejected, and a
  symlink under `public/` that points outside it returns 403. Models, data, and
  `publisher.json` are never reachable over the web.
- Every document carries `Content-Security-Policy: frame-ancestors 'self'` by
  default, so a page is framable only from its own origin. To embed one
  elsewhere, set `PUBLISHER_FRAME_ANCESTORS` to the embedding origins (for
  example `https://app.example.com`, space-separated for several). The value is
  a CSP source list, and `*` restores framing from anywhere. The policy covers
  the Console as well as `public/` files, so setting the variable is the whole
  configuration rather than part of it. All responses carry
  `X-Content-Type-Options: nosniff`.
- The query API applies the model's governance (filters, access modifiers,
  authorize annotations). The static, data-apps, and events routes do not add
  their own auth, so do not place anything sensitive under `public/`.

## Reference

Endpoints used by an HTML data app:

| Method and path | Purpose |
|---|---|
| `GET /environments/<env>/packages/<pkg>/<file>` | Serve a file from `public/` |
| `GET /sdk/publisher.js` | The page runtime |
| `GET /sdk/publisher-app.js` | The renderer for [manifest-backed apps](#manifest-backed-apps-a-saved-finding) |
| `POST /api/v0/environments/<env>/packages/<pkg>/models/<model>/query` | Run a query (used by `Publisher.query`) |
| `GET /api/v0/environments/<env>/packages/<pkg>/data-apps` | List the package's data apps |
| `GET`, `PUT`, `DELETE /api/v0/environments/<env>/packages/<pkg>/data-apps/<slug>` | Read, save, or remove a [manifest-backed app](#manifest-backed-apps-a-saved-finding) |
| `GET /api/v0/environments/<env>/packages/<pkg>/events` | Live-reload stream |

See also:

- `examples/html-data-app/` for a complete worked package (filters, charts, KPIs,
  and an embed demo).
- [Givens (runtime parameters)](./givens.md) for declaring model parameters.
- [The React SDK](./embedded-data-apps.md) — advanced/internal, if you specifically need React components.
