// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Shared contract for serving and embedding in-package HTML data apps.
//
// Both the Publisher SPA host (DataAppViewer.tsx, Package.tsx) and the
// build-step-free browser runtime (packages/server/src/runtime/publisher.js)
// speak this protocol. publisher.js cannot import from here — it ships as
// standalone vanilla JS — so it carries a cross-reference comment pointing at
// this file as the single source of truth. Keep the two in sync.

/**
 * postMessage `type` an embedded data app emits to its host frame as its
 * content height changes, so the host can resize the iframe to avoid nested
 * scrollbars. Payload shape is {@link PublisherResizeMessage}.
 */
export const PUBLISHER_RESIZE_MESSAGE_TYPE = "publisher:resize";

/** Resize message posted by an embedded data app's publisher.js runtime. */
export interface PublisherResizeMessage {
   type: typeof PUBLISHER_RESIZE_MESSAGE_TYPE;
   /** Content height in CSS pixels. */
   height: number;
}

/** Type guard for a {@link PublisherResizeMessage} arriving via postMessage. */
export function isPublisherResizeMessage(
   data: unknown,
): data is PublisherResizeMessage {
   return (
      typeof data === "object" &&
      data !== null &&
      (data as { type?: unknown }).type === PUBLISHER_RESIZE_MESSAGE_TYPE &&
      typeof (data as { height?: unknown }).height === "number"
   );
}

/**
 * postMessage `type` a host sends an embedded data app with the host's
 * appearance, so the app can draw in the host's light or dark mode and
 * palette instead of its own. Payload shape is {@link PublisherThemeMessage}.
 * Sent when the app asks (see {@link PUBLISHER_THEME_REQUEST_MESSAGE_TYPE})
 * and again whenever the host's appearance changes.
 */
export const PUBLISHER_THEME_MESSAGE_TYPE = "publisher:theme";

/**
 * postMessage `type` an embedded data app's publisher.js runtime sends its
 * host once it is listening, asking for a {@link PublisherThemeMessage}. The
 * host cannot know when that is, so a theme posted before it would be lost.
 */
export const PUBLISHER_THEME_REQUEST_MESSAGE_TYPE = "publisher:theme-request";

/**
 * The tokens a host may send, named after the shadcn tokens most hosts
 * already carry. The runtime sets each one on the app's root as
 * `--publisher-<name>`. Every token is optional: an app falls back to its
 * own value for any the host leaves out.
 */
export const DATA_APP_THEME_TOKENS = [
   "background",
   "foreground",
   "card",
   "muted",
   "muted-foreground",
   "border",
   "ring",
   "primary",
   "primary-foreground",
   "accent",
   "accent-foreground",
   "positive",
   "negative",
   "chart-1",
   "chart-2",
   "chart-3",
   "chart-4",
   "chart-5",
   "font-sans",
] as const;

export type DataAppThemeToken = (typeof DATA_APP_THEME_TOKENS)[number];

/** A host's appearance, as an embedded data app receives it. */
export interface DataAppTheme {
   mode: "light" | "dark";
   /** CSS values: any color the browser parses, or a font-family list. */
   tokens: Partial<Record<DataAppThemeToken, string>>;
}

export interface PublisherThemeMessage extends DataAppTheme {
   type: typeof PUBLISHER_THEME_MESSAGE_TYPE;
}

/** Type guard for a theme request arriving from an embedded data app. */
export function isPublisherThemeRequest(data: unknown): boolean {
   return (
      typeof data === "object" &&
      data !== null &&
      (data as { type?: unknown }).type === PUBLISHER_THEME_REQUEST_MESSAGE_TYPE
   );
}

/**
 * Send `theme` to the data app in `frame`. The target origin is `*` because
 * the app may be served from a different origin than the host, and the
 * message carries only colors and fonts.
 */
export function postDataAppTheme(
   frame: HTMLIFrameElement | null | undefined,
   theme: DataAppTheme,
): void {
   const message: PublisherThemeMessage = {
      type: PUBLISHER_THEME_MESSAGE_TYPE,
      mode: theme.mode,
      tokens: theme.tokens,
   };
   frame?.contentWindow?.postMessage(message, "*");
}

/**
 * Derive the Publisher data origin (where static package files are served)
 * from the configured API base URL by stripping the trailing `/api/v0`.
 *
 * The static-file routes live off the server root, not under the API prefix,
 * and the data origin can differ from the SPA origin in multi-host
 * deployments — so a data app's standalone URL is `serverBaseUrl(server)`
 * joined with its root-relative `resource`.
 */
export function serverBaseUrl(server: string): string {
   return server.replace(/\/api\/v0\/?$/, "");
}

/**
 * Absolute URL of a file inside a package, as Publisher serves it:
 * `<data origin>/environments/<env>/packages/<pkg>/<path>`.
 *
 * The one home for this string. Both the data app viewer's iframe and the
 * "this is not a model" page point at it, and hand-building it in each place is
 * how the two drift.
 *
 * `path` is relative to the package's `public/` directory and is inserted as
 * given, since it may contain slashes. A leading `public/` is dropped, because
 * the served path does not include it and a caller passing a path a reader typed
 * would otherwise produce `public/public/<file>`, which 404s. The server's own
 * redirect drops it for the same reason.
 */
export function packageFileUrl({
   server,
   environmentName,
   packageName,
   path,
}: {
   server: string;
   environmentName: string;
   packageName: string;
   path: string;
}): string {
   const relative = path.startsWith("public/")
      ? path.slice("public/".length)
      : path;
   return (
      `${serverBaseUrl(server)}/environments/${encodeURIComponent(
         environmentName,
      )}/packages/${encodeURIComponent(packageName)}/` + relative
   );
}
