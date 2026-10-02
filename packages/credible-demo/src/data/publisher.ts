// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   appPaths,
   readManifest,
   slugOfAppPath,
   type AppManifest,
   type ManifestQuery,
} from "@malloy-publisher/app-manifest";
import type { Row } from "@malloy-publisher/app-manifest/analyst/schema";
import type {
   CompileProblem,
   DashboardFacts,
   DataAppFacts,
   DataAppQuery,
   FileFacts,
   JoinFacts,
   PackageGraph,
   SourceFacts,
   WorkspaceItem,
   WorkspacePackage,
} from "./types";

const API = (import.meta.env.VITE_PUBLISHER_API ?? "/api/v0").replace(
   /\/$/,
   "",
);
export const CONSOLE_URL = (
   import.meta.env.VITE_PUBLISHER_CONSOLE_URL ?? "http://localhost:4000"
).replace(/\/$/, "");
export const WORKSPACE_ENVIRONMENT =
   import.meta.env.VITE_PUBLISHER_ENVIRONMENT ?? "examples";

async function get<T>(path: string): Promise<T> {
   const response = await fetch(`${API}${path}`);
   if (!response.ok) {
      throw new Error(`Publisher answered ${response.status} for ${path}`);
   }
   return (await response.json()) as T;
}

/** A refusal from Publisher, in its own words, with the status it answered. */
export class PublisherError extends Error {
   constructor(
      message: string,
      readonly status: number,
   ) {
      super(message);
   }
}

/** A write, whose refusal carries Publisher's own explanation. */
async function send<T>(
   method: string,
   path: string,
   body: unknown,
): Promise<T> {
   const response = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
   });
   const json = (await response.json().catch(() => ({}))) as {
      message?: string;
   };
   if (!response.ok) {
      throw new PublisherError(
         json.message ?? `Publisher answered ${response.status} for ${path}`,
         response.status,
      );
   }
   return json as T;
}

const encodePath = (s: string) =>
   s.split("/").map(encodeURIComponent).join("/");

/**
 * A file a package serves, at the address the SDK's `packageFileUrl` builds;
 * repeated here so the Library can link one without loading the SDK.
 */
export const packageFileHref = (pkg: string, path: string) =>
   `${API.replace(/\/api\/v0$/, "")}/environments/${encodeURIComponent(WORKSPACE_ENVIRONMENT)}/packages/${encodeURIComponent(pkg)}/${encodePath(path.replace(/^public\//, ""))}`;

/** The Library, narrowed to one package: where a package itself is shown. */
export const libraryPackageRoute = (pkg: string) =>
   `/library?package=${encodeURIComponent(pkg)}`;

/** A Console page, the same address Publisher's own UI opens it at. */
export const consoleUrl = (...segments: string[]) =>
   [CONSOLE_URL, ...segments.map(encodePath)].join("/");

export type WorkspaceKind = WorkspaceItem["kind"];

const ROUTE_SEGMENT: Record<WorkspaceKind, string> = {
   dashboard: "dashboards",
   notebook: "notebooks",
   data_app: "apps",
   query: "models",
};

/**
 * Where this app shows a Publisher object. `path` is the dashboard's name for
 * a dashboard and the file's path in the package for everything else.
 */
export function workspaceRoute(
   pkg: string,
   kind?: WorkspaceKind,
   path?: string,
   givens?: Record<string, unknown>,
): string {
   if (!kind || !path) return libraryPackageRoute(pkg);
   return `/packages/${encodeURIComponent(pkg)}/${ROUTE_SEGMENT[kind]}/${encodePath(path)}${queryString(givens)}`;
}

/**
 * The URL parameter a model page opens its explorer on, here and in the
 * Console. Rides beside the givens, which ignore a name no model declares.
 */
export const OPEN_QUERY_PARAM = "query";

/** A model, open in the explorer on `malloy` with Run ready. */
export const modelQueryRoute = (pkg: string, model: string, malloy: string) =>
   workspaceRoute(pkg, "query", model, { [OPEN_QUERY_PARAM]: malloy });

/** The same, in the Publisher Console. */
export const modelQueryConsoleUrl = (
   pkg: string,
   model: string,
   malloy: string,
   env = WORKSPACE_ENVIRONMENT,
) =>
   workspaceConsoleUrl(
      pkg,
      "query",
      model,
      { [OPEN_QUERY_PARAM]: malloy },
      env,
   );

/** A dashboard or model with nothing around it, for a preview frame. */
export const embedRoute = (
   pkg: string,
   kind: "dashboard" | "query",
   path: string,
) => `/embed${workspaceRoute(pkg, kind, path)}`;

/** Names a Publisher page in this app's own records, like its properties. */
export const pageKey = (
   pkg: string,
   kind: WorkspaceKind,
   id: string,
   env = WORKSPACE_ENVIRONMENT,
) => `${env}/${pkg}/${kind}/${id}`;

/** Names an analysis in the same records. */
export const analysisPageKey = (id: string) => `analysis/${id}`;

/** The same object's page in the Publisher Console. */
export function workspaceConsoleUrl(
   pkg: string,
   kind?: WorkspaceKind,
   path?: string,
   givens?: Record<string, unknown>,
   env = WORKSPACE_ENVIRONMENT,
): string {
   if (!kind || !path) return consoleUrl(env, pkg);
   const url =
      kind === "dashboard"
         ? consoleUrl(env, pkg, "dashboards", path)
         : kind === "data_app"
           ? consoleUrl(env, pkg, "data-apps", path)
           : consoleUrl(env, pkg, path);
   return url + queryString(givens);
}

function queryString(givens?: Record<string, unknown>): string {
   if (!givens) return "";
   const params = new URLSearchParams();
   for (const [k, v] of Object.entries(givens)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
   }
   const s = params.toString();
   return s ? `?${s}` : "";
}

/**
 * This app's route for a Console-style path (`/<env>/<pkg>/…`), the form a
 * notebook's own links take, or undefined when it names nothing this app
 * shows.
 */
export function routeForConsolePath(to: string): string | undefined {
   const [pathname, search = ""] = to.split("?");
   const [env, pkg, ...rest] = pathname
      .replace(/^\/+/, "")
      .split("/")
      .map(decodeURIComponent);
   if (env !== WORKSPACE_ENVIRONMENT || !pkg) return undefined;
   const query = search ? `?${search}` : "";
   if (rest.length === 0) return workspaceRoute(pkg);
   const [head, ...tail] = rest;
   if (head === "dashboards" && tail.length > 0) {
      return workspaceRoute(pkg, "dashboard", tail.join("/")) + query;
   }
   if (head === "data-apps" && tail.length > 0) {
      return workspaceRoute(pkg, "data_app", tail.join("/")) + query;
   }
   const file = rest.join("/");
   if (file.endsWith(".malloynb")) {
      return workspaceRoute(pkg, "notebook", file) + query;
   }
   if (file.endsWith(".malloy")) {
      return workspaceRoute(pkg, "query", file) + query;
   }
   return undefined;
}

interface ApiPackage {
   name: string;
   description?: string;
}
interface ApiModel {
   path: string;
   error?: string;
}
interface ApiNotebook {
   path: string;
   title?: string;
   description?: string;
}
interface ApiDashboard {
   name: string;
   path: string;
   title?: string;
   description?: string;
}
interface ApiDataApp {
   path: string;
   title?: string;
}

/**
 * Every package in the workspace's environment, with what each one serves.
 * Read live from Publisher, so a package added there appears here on the next
 * load with nothing to sync.
 */
export async function listWorkspacePackages(): Promise<WorkspacePackage[]> {
   const env = WORKSPACE_ENVIRONMENT;
   const base = `/environments/${encodeURIComponent(env)}/packages`;
   const packages = await get<ApiPackage[]>(base);
   return Promise.all(
      packages.map(async (pkg): Promise<WorkspacePackage> => {
         const at = `${base}/${encodeURIComponent(pkg.name)}`;
         const [models, notebooks, dashboards, dataApps] = await Promise.all([
            get<ApiModel[]>(`${at}/models`).catch(() => []),
            get<ApiNotebook[]>(`${at}/notebooks`).catch(() => []),
            get<ApiDashboard[]>(`${at}/dashboards`).catch(() => []),
            get<ApiDataApp[]>(`${at}/data-apps`).catch(() => []),
         ]);
         const dashboardFiles = new Set(dashboards.map((d) => d.path));
         const item = (
            kind: WorkspaceKind,
            id: string,
            fields: Pick<WorkspaceItem, "title" | "description" | "path">,
         ): WorkspaceItem => ({
            kind,
            id,
            ...fields,
            href: workspaceRoute(pkg.name, kind, id),
            publisherUrl: workspaceConsoleUrl(pkg.name, kind, id),
         });
         const items: WorkspaceItem[] = [
            ...dashboards.map((d) =>
               item("dashboard", d.name, {
                  title: d.title ?? d.name,
                  description: d.description,
                  path: d.path,
               }),
            ),
            ...notebooks.map((n) =>
               item("notebook", n.path, {
                  title: n.title ?? n.path,
                  description: n.description,
                  path: n.path,
               }),
            ),
            ...(await Promise.all(
               dataApps.map(async (a) => {
                  const manifest = await readAppManifest(pkg.name, a.path);
                  return {
                     ...item("data_app", a.path, {
                        title: manifest?.title ?? a.title ?? a.path,
                        description: manifest?.description,
                        path: a.path,
                     }),
                     manifest,
                  };
               }),
            )),
            // A dashboard's file is listed as a model too; it is already above.
            ...models
               .filter((m) => !dashboardFiles.has(m.path))
               .map((m) =>
                  item("query", m.path, {
                     title: m.path,
                     description: m.error,
                     path: m.path,
                  }),
               ),
         ];
         return {
            environment: env,
            name: pkg.name,
            description: pkg.description ?? "",
            href: workspaceRoute(pkg.name),
            publisherUrl: workspaceConsoleUrl(pkg.name),
            items,
         };
      }),
   );
}

/**
 * The manifest beside a saved finding's page, or undefined for any other
 * page. One that does not parse leaves the page an ordinary data app.
 */
async function readAppManifest(
   pkg: string,
   pagePath: string,
): Promise<AppManifest | undefined> {
   const slug = slugOfAppPath(pagePath);
   if (!slug) return undefined;
   const url = `${FILE_ORIGIN}${packageAt(pkg)}/${encodePath(appPaths(slug).manifest)}`;
   const json = await fetch(url)
      .then((r) => (r.ok ? r.json() : undefined))
      .catch(() => undefined);
   if (json === undefined) return undefined;
   const read = readManifest(json);
   if (!read.ok) {
      console.warn(`${pkg}/${pagePath}: ${read.problem}`);
      return undefined;
   }
   return read.manifest;
}

// ── Relationships ──────────────────────────────────────────────────────

interface ApiModelDetail {
   malloyVersion?: string;
   sourceText?: string;
   sourceInfos?: string[];
   queries?: { name: string }[];
}
interface ApiNotebookDetail {
   notebookCells?: { type?: string; text?: string }[];
}
interface ApiDashboardDetail {
   name: string;
   path: string;
   dashboardColumns?: number;
   autorun?: boolean;
   givens?: { name: string; type?: string }[];
   tiles?: { label?: string; query: string }[];
}
interface StableField {
   kind: string;
   name: string;
   relationship?: string;
   annotations?: { value: string }[];
}
interface StableSource {
   name: string;
   annotations?: { value: string }[];
   schema?: { fields?: StableField[] };
}

const docOf = (annotations?: { value: string }[]) =>
   annotations
      ?.map((a) => a.value.match(/^#\(doc\)\s*([\s\S]*)$/)?.[1]?.trim())
      .find(Boolean);

/** Malloy text with `//` and `--` comments blanked, so prose can't match. */
const uncommented = (text: string) => text.replace(/(\/\/|--)[^\n]*/g, "");

/** A path relative to `from`'s directory, as a package path. */
function resolvePath(from: string, to: string): string {
   const parts = from.split("/").slice(0, -1);
   for (const seg of to.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg !== ".") parts.push(seg);
   }
   return parts.join("/");
}

function importsOf(path: string, text: string): string[] {
   const found = uncommented(text).matchAll(
      /\bimport\s*(?:\{[^}]*\}\s*from\s*)?["']([^"']+)["']/g,
   );
   return [...new Set([...found].map((m) => resolvePath(path, m[1])))];
}

function fileFacts(path: string, model: ApiModelDetail): FileFacts {
   const text = uncommented(model.sourceText ?? "");
   const defined = new Map<string, { base?: string; table?: string }>();
   for (const m of text.matchAll(
      /\bsource:\s*(\w+)\s+is\s+(?:(\w+)\.(?:table|sql)\(\s*["'`]([^"'`]+)|(\w+))/g,
   )) {
      defined.set(m[1], {
         table: m[2] ? `${m[2]} · ${m[3]}` : undefined,
         base: m[4],
      });
   }
   const sources: SourceFacts[] = [];
   for (const raw of model.sourceInfos ?? []) {
      let info: StableSource;
      try {
         info = JSON.parse(raw) as StableSource;
      } catch {
         continue;
      }
      const here = defined.get(info.name);
      if (!here) continue;
      const fields = info.schema?.fields ?? [];
      const count = (kind: string) =>
         fields.filter((f) => f.kind === kind).length;
      sources.push({
         name: info.name,
         doc: docOf(info.annotations),
         ...here,
         joins: fields
            .filter((f) => f.kind === "join")
            .map(
               (f): JoinFacts => ({
                  name: f.name,
                  relationship:
                     f.relationship === "many" || f.relationship === "cross"
                        ? f.relationship
                        : "one",
                  doc: docOf(f.annotations),
               }),
            ),
         dimensions: count("dimension"),
         measures: count("measure"),
         views: count("view"),
      });
   }
   return {
      path,
      sources,
      queries: (model.queries ?? []).map((q) => q.name),
      imports: importsOf(path, model.sourceText ?? ""),
      malloyVersion: model.malloyVersion,
   };
}

/** Files are served beside the API, from the same origin. */
const FILE_ORIGIN = new URL(API, window.location.origin).origin;

/**
 * Everything a package's pages say about each other: which file defines which
 * source, what each file imports, which sources a dashboard's tiles query,
 * and which models a data app's page calls. Read from Publisher each time, so
 * there is nothing to keep in sync.
 */
export async function getPackageGraph(
   pkg: WorkspacePackage,
): Promise<PackageGraph> {
   const at = `/environments/${encodeURIComponent(pkg.environment)}/packages/${encodeURIComponent(pkg.name)}`;
   const graph: PackageGraph = { files: {}, dashboards: {}, dataApps: {} };
   const modelPaths = new Set(
      pkg.items
         .filter((i) => i.kind === "query" || i.kind === "dashboard")
         .map((i) => i.path),
   );
   await Promise.all(
      pkg.items.map(async (item) => {
         if (item.kind === "query" || item.kind === "dashboard") {
            const facts = await get<ApiModelDetail>(
               `${at}/models/${encodePath(item.path)}`,
            )
               .then((m) => fileFacts(item.path, m))
               .catch(
                  (e: Error): FileFacts => ({
                     path: item.path,
                     sources: [],
                     queries: [],
                     imports: [],
                     error: e.message,
                  }),
               );
            graph.files[item.path] = facts;
         }
         if (item.kind === "dashboard") {
            const d = await get<ApiDashboardDetail>(
               `${at}/dashboards/${encodeURIComponent(item.id)}`,
            ).catch(() => undefined);
            if (d) graph.dashboards[item.id] = dashboardFacts(d);
         }
         if (item.kind === "notebook") {
            const nb = await get<ApiNotebookDetail>(
               `${at}/notebooks/${encodePath(item.path)}`,
            ).catch(() => undefined);
            const text = (nb?.notebookCells ?? [])
               .filter((c) => c.type !== "markdown")
               .map((c) => c.text ?? "")
               .join("\n");
            graph.files[item.path] = {
               path: item.path,
               sources: [],
               queries: [],
               imports: importsOf(item.path, text),
            };
         }
         if (item.kind === "data_app") {
            graph.dataApps[item.path] = item.manifest
               ? manifestFacts(item.manifest)
               : await pageFacts(`${FILE_ORIGIN}${at}`, item.path, modelPaths);
         }
      }),
   );
   return graph;
}

/** A saved finding names every query it runs in its `app.json`. */
function manifestFacts(manifest: AppManifest): DataAppFacts {
   const queries = Object.values(manifest.queries).map(
      (q): DataAppQuery => ({ source: q.source, view: q.view, model: q.model }),
   );
   return {
      models: [...new Set(queries.flatMap((q) => q.model ?? []))],
      queries: uniqueQueries(queries),
   };
}

const uniqueQueries = (queries: DataAppQuery[]) => [
   ...new Map(
      queries.map((q) => [`${q.model ?? ""}:${q.source}:${q.view ?? ""}`, q]),
   ).values(),
];

/** JS or HTML with its comments blanked; `://` in a URL is not a comment. */
const uncommentedScript = (text: string) =>
   text
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const MAX_SCRIPTS = 40;

/**
 * A hand-authored page's models and queries, read from the page and every
 * same-package script it loads or imports. A model counts when a string
 * literal names one the package serves; a query counts when it reads
 * `run: source -> view`, with `${NAME}` resolved from a `const NAME = "…"`
 * in the same file.
 */
async function pageFacts(
   origin: string,
   pagePath: string,
   served: Set<string>,
): Promise<DataAppFacts> {
   const models = new Set<string>();
   const queries: DataAppQuery[] = [];
   const seen = new Set<string>();
   const queue = [pagePath];
   while (queue.length > 0 && seen.size < MAX_SCRIPTS) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const raw = await fetch(`${origin}/${encodePath(path)}`)
         .then((r) => (r.ok ? r.text() : ""))
         .catch(() => "");
      const text = uncommentedScript(raw);

      for (const m of text.matchAll(
         /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']|\bimport\s*(?:[\w*{}\s,]+from\s*)?\(?\s*["']([^"']+\.m?js)["']/g,
      )) {
         const ref = m[1] ?? m[2];
         if (/^(\/|[a-z]+:)/i.test(ref)) continue;
         queue.push(resolvePath(path, ref));
      }

      for (const m of text.matchAll(
         /["'`]((?:\.{0,2}\/)*[\w./-]+\.malloy)["'`]/g,
      )) {
         const model = m[1].replace(/^(\.{0,2}\/)+/, "");
         if (served.has(model)) models.add(model);
      }

      const consts = new Map<string, string>();
      for (const m of text.matchAll(
         /\bconst\s+(\w+)\s*=\s*["'`]([^"'`$]+)["'`]/g,
      )) {
         consts.set(m[1], m[2]);
      }
      const name = (literal?: string, ref?: string) =>
         literal ?? (ref ? consts.get(ref) : undefined);
      for (const m of text.matchAll(
         /\brun:\s*(?:(\w+)|\$\{(\w+)\})\s*->\s*(?:(\w+)|\$\{(\w+)\})?/g,
      )) {
         const source = name(m[1], m[2]);
         if (!source) continue;
         const view = name(m[3], m[4]);
         queries.push({
            source,
            view: view && /^\w+$/.test(view) ? view : undefined,
         });
      }
   }
   return { models: [...models], queries: uniqueQueries(queries) };
}

function dashboardFacts(d: ApiDashboardDetail): DashboardFacts {
   return {
      name: d.name,
      path: d.path,
      columns: d.dashboardColumns ?? 12,
      autorun: d.autorun ?? true,
      filters: (d.givens ?? []).map((g) => ({
         name: g.name,
         type: g.type ?? "",
      })),
      tiles: (d.tiles ?? []).map((t) => {
         const [source = "", view = ""] = t.query
            .split("->")
            .map((s) => s.trim());
         return { label: t.label ?? view, source, view };
      }),
   };
}

// ── Writing back ───────────────────────────────────────────────────────

/** One model file as saved, with what the compiled package says it declares. */
export interface ModelSource {
   path: string;
   text: string;
   /** SHA-256 of `text`, what a write hands back as its precondition. */
   hash: string;
   /** Each source the model can see, with the views it declares. */
   views: Record<string, string[]>;
   queries: string[];
}

const packageAt = (pkg: string) =>
   `/environments/${encodeURIComponent(WORKSPACE_ENVIRONMENT)}/packages/${encodeURIComponent(pkg)}`;

async function sha256(text: string): Promise<string> {
   const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
   );
   return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
}

export async function getModelSource(
   pkg: string,
   path: string,
): Promise<ModelSource> {
   const model = await get<ApiModelDetail>(
      `${packageAt(pkg)}/models/${encodePath(path)}`,
   );
   const text = model.sourceText ?? "";
   const views: Record<string, string[]> = {};
   for (const raw of model.sourceInfos ?? []) {
      try {
         const info = JSON.parse(raw) as StableSource;
         views[info.name] = (info.schema?.fields ?? [])
            .filter((f) => f.kind === "view")
            .map((f) => f.name);
      } catch {
         // An unreadable source info names nothing to collide with.
      }
   }
   return {
      path,
      text,
      hash: await sha256(text),
      views,
      queries: (model.queries ?? []).map((q) => q.name),
   };
}

interface ApiProblem {
   severity: CompileProblem["severity"];
   message: string;
   at?: { range?: { start?: { line?: number; character?: number } } };
}

/**
 * Compile-checks Malloy against a package without running or saving it.
 * "append" checks new definitions against the model; "file" checks the text
 * as the whole file at `path`, which need not exist yet.
 */
export async function compileModel(
   pkg: string,
   path: string,
   source: string,
   scope: "append" | "file",
): Promise<CompileProblem[]> {
   const result = await send<{ problems?: ApiProblem[] }>(
      "POST",
      `${packageAt(pkg)}/models/${encodePath(path)}/compile`,
      { source, scope },
   );
   return (result.problems ?? []).map((p) => {
      const start = p.at?.range?.start;
      return {
         severity: p.severity,
         message: p.message,
         line: start?.line === undefined ? undefined : start.line + 1,
         column:
            start?.character === undefined ? undefined : start.character + 1,
      };
   });
}

/**
 * Writes `dashboards/<slug>.malloy` and reloads the package. Publisher
 * compiles it first and refuses a file that does not; with no `expectedHash`
 * it only creates, and refuses a path that already exists.
 */
export const writeDashboardFile = (
   pkg: string,
   path: string,
   source: string,
   expectedHash?: string,
) =>
   send<{ path: string; contentHash: string; created: boolean }>(
      "PUT",
      `${packageAt(pkg)}/models/${encodePath(path)}`,
      { source, expectedHash },
   );

/** A saved finding as its package holds it. */
export interface DataAppRead {
   path: string;
   /** SHA-256 of `app.json`, what a later write or delete hands back. */
   contentHash: string;
   /** Absent when the file is not a manifest this app reads; `problem` says why. */
   manifest?: AppManifest;
   problem?: string;
}

export interface DataAppWrite {
   resource: string;
   path: string;
   contentHash: string;
   created: boolean;
}

const dataAppAt = (pkg: string, slug: string) =>
   `${packageAt(pkg)}/data-apps/${encodeURIComponent(slug)}`;

/** Reads `public/apps/<slug>/app.json` with the hash a write needs. */
export async function getDataAppManifest(
   pkg: string,
   slug: string,
): Promise<DataAppRead | undefined> {
   const response = await fetch(`${API}${dataAppAt(pkg, slug)}`);
   if (response.status === 404) return undefined;
   if (!response.ok) {
      throw new Error(`Publisher answered ${response.status} for ${slug}`);
   }
   const body = (await response.json()) as DataAppRead & { manifest?: unknown };
   const read =
      body.manifest === undefined ? undefined : readManifest(body.manifest);
   return {
      path: body.path,
      contentHash: body.contentHash,
      manifest: read?.ok ? read.manifest : undefined,
      problem: read && !read.ok ? read.problem : body.problem,
   };
}

/**
 * Writes a saved finding into a package as `public/apps/<slug>/`. Publisher
 * compiles every query against that package first and refuses the write when
 * one does not compile there; with no `expectedHash` it only creates.
 */
export const writeDataApp = (
   pkg: string,
   slug: string,
   manifest: AppManifest,
   expectedHash?: string,
) =>
   send<DataAppWrite>("PUT", dataAppAt(pkg, slug), { manifest, expectedHash });

export const deleteDataApp = (
   pkg: string,
   slug: string,
   expectedHash: string,
) =>
   send<void>(
      "DELETE",
      `${dataAppAt(pkg, slug)}?expectedHash=${encodeURIComponent(expectedHash)}`,
      undefined,
   );

/** Runs one of a saved finding's queries against its package, for its live rows. */
export async function runManifestQuery(
   pkg: string,
   query: ManifestQuery,
): Promise<Row[]> {
   const { result } = await send<{ result: string }>(
      "POST",
      `${packageAt(pkg)}/models/${encodePath(query.model)}/query`,
      { query: query.malloy, compactJson: true },
   );
   return JSON.parse(result) as Row[];
}

/** Recompiles a package from its files, so a saved edit is served by name. */
export const reloadPackage = (pkg: string) =>
   get<unknown>(`${packageAt(pkg)}?reload=true`).then(() => undefined);
