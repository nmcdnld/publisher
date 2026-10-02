// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Publisher runtime helper for in-package HTML dashboards.
// Served by the Publisher server at /sdk/publisher.js. Hand-authored vanilla
// JS — no bundler. Loaded via <script src="/sdk/publisher.js">.
//
// Exposes window.Publisher with:
//   - Publisher.query(model, malloy, opts?)     → Promise<rows[]>
//   - Publisher.queryFull(model, malloy, opts?) → Promise<MalloyResult>  (envelope for <malloy-render>)
//       opts: { environment?, package?, sourceName?, queryName?, filterParams?,
//               bypassFilters?, givens? }. givens is a name→value map bound as
//               Malloy given: runtime parameters for this query (safe parameterization,
//               not string interpolation) — see the malloy-html-data-app-runtime skill.
//   - Publisher.embed(selector, { src, height?, token? })
//   - Publisher.context  ({ environment, package } inferred from URL)
//   - Publisher.setToken(token)  (override Bearer token; default uses cookies)
//   - Publisher.theme    ({ mode, tokens, source }: the appearance in effect)
//
// Theme: the runtime sets data-theme="light"|"dark" and color-scheme on
// <html>, following the OS setting standalone. Inside a host that sends a
// "publisher:theme" message, it follows the host instead: it also sets
// data-theme-source="host" and one --publisher-<token> custom property per
// token sent (background, foreground, card, primary, chart-1, ...). Pages
// style off those in CSS, and redraw anything painted from script (canvas
// charts) on the "publisher:theme" window event.
//
// When loaded inside an iframe served from /environments/<env>/packages/<pkg>/...,
// the runtime auto-subscribes to a Server-Sent Events live-reload stream
// (GET .../events) and reloads the page on file changes. It also posts size
// updates to the parent window so Publisher.embed() in the host can resize
// the iframe.
//
// The "publisher:resize", "publisher:theme" and "publisher:theme-request"
// postMessage protocols below are the SAME contract the SPA host speaks. Their
// canonical definition lives in packages/sdk/src/utils/dataAppEmbed.ts. This
// file is build-step-free vanilla JS and can't import it, so keep the message
// types/shapes here in sync with that module.

(function () {
   "use strict";

   // --- Context inference -------------------------------------------------
   // URL shape: /environments/<env>/packages/<pkg>/<file>
   //
   // location.pathname is URL-encoded, so we MUST decode the captured
   // segments here. Without this step, a name with a space (e.g.
   // "demo env") would arrive as "demo%20env" — and the encodeURIComponent
   // we apply when building API URLs (below) would produce "demo%2520env",
   // which Publisher then 404s on.
   var pathMatch = location.pathname.match(
      /^\/environments\/([^/]+)\/packages\/([^/]+)\//,
   );
   function safeDecode(s) {
      try {
         return decodeURIComponent(s);
      } catch (_e) {
         return s;
      }
   }
   var ctx = pathMatch
      ? {
           environment: safeDecode(pathMatch[1]),
           package: safeDecode(pathMatch[2]),
        }
      : {};

   var apiBase = location.origin + "/api/v0";
   var bearerToken = null;

   function authHeaders() {
      return bearerToken ? { Authorization: "Bearer " + bearerToken } : {};
   }

   // --- Query helpers -----------------------------------------------------
   function resolveTarget(opts) {
      var env = (opts && opts.environment) || ctx.environment;
      var pkg = (opts && opts.package) || ctx.package;
      if (!env || !pkg) {
         throw new Error(
            "Publisher: no environment/package; either serve the page from " +
               "/environments/<env>/packages/<pkg>/... or pass { environment, package } in opts.",
         );
      }
      return { env: env, pkg: pkg };
   }

   async function rawQuery(modelPath, malloyQuery, opts, compactJson) {
      opts = opts || {};
      var target = resolveTarget(opts);
      var url =
         apiBase +
         "/environments/" +
         encodeURIComponent(target.env) +
         "/packages/" +
         encodeURIComponent(target.pkg) +
         "/models/" +
         // Encode the whole model path as ONE path segment (slashes -> %2F). A model
         // in a subfolder ("model/x.malloy") must not become two URL segments: some
         // servers only match a single-segment {path} and would 405 a multi-segment
         // path. This matches the typed SDK (encodeURIComponent) and the server's
         // encoded-slash handling.
         encodeURIComponent(modelPath) +
         "/query";
      var body = { compactJson: compactJson };
      if (malloyQuery) body.query = malloyQuery;
      if (opts.sourceName) body.sourceName = opts.sourceName;
      if (opts.queryName) body.queryName = opts.queryName;
      if (opts.filterParams) body.filterParams = opts.filterParams;
      if (opts.bypassFilters) body.bypassFilters = true;
      if (opts.givens) body.givens = opts.givens;

      var headers = Object.assign(
         { "content-type": "application/json" },
         authHeaders(),
      );
      var res = await fetch(url, {
         method: "POST",
         credentials: "include",
         headers: headers,
         body: JSON.stringify(body),
      });
      var json;
      try {
         json = await res.json();
      } catch (_e) {
         throw new Error(
            "Publisher: server returned non-JSON response (" + res.status + ")",
         );
      }
      if (!res.ok) {
         var msg = (json && json.message) || res.statusText || "Query failed";
         var err = new Error("Publisher.query: " + msg);
         err.response = json;
         err.status = res.status;
         throw err;
      }
      // The server's QueryResult always has `result` as a JSON-encoded string.
      // Parse it before handing it back so callers see real JS values.
      return JSON.parse(json.result);
   }

   function query(modelPath, malloyQuery, opts) {
      return rawQuery(modelPath, malloyQuery, opts, true);
   }
   function queryFull(modelPath, malloyQuery, opts) {
      return rawQuery(modelPath, malloyQuery, opts, false);
   }

   // --- Embed helper (host page) -----------------------------------------
   function embed(selector, options) {
      options = options || {};
      var host =
         typeof selector === "string"
            ? document.querySelector(selector)
            : selector;
      if (!host) {
         throw new Error("Publisher.embed: selector did not match an element");
      }
      if (!options.src) {
         throw new Error("Publisher.embed: opts.src is required");
      }
      var iframe = document.createElement("iframe");
      iframe.src = options.token
         ? options.src +
           (options.src.indexOf("?") === -1 ? "?" : "&") +
           "embed_token=" +
           encodeURIComponent(options.token)
         : options.src;
      iframe.style.border = "0";
      iframe.style.width = "100%";
      iframe.style.display = "block";
      if (options.height) {
         iframe.style.height =
            typeof options.height === "number"
               ? options.height + "px"
               : options.height;
      } else {
         iframe.style.height = "0px"; // will be sized via postMessage
      }
      if (options.allow) iframe.allow = options.allow;
      iframe.setAttribute(
         "sandbox",
         "allow-scripts allow-same-origin allow-forms",
      );

      // Resize listener
      function onMessage(e) {
         if (!e.data || e.data.type !== "publisher:resize") return;
         if (e.source !== iframe.contentWindow) return;
         if (typeof e.data.height === "number") {
            iframe.style.height = Math.max(0, e.data.height) + "px";
         }
      }
      window.addEventListener("message", onMessage);
      // Best-effort cleanup if the host removes the iframe
      var observer = new MutationObserver(function () {
         if (!host.contains(iframe)) {
            window.removeEventListener("message", onMessage);
            observer.disconnect();
         }
      });
      observer.observe(host, { childList: true, subtree: false });

      host.appendChild(iframe);
      return {
         iframe: iframe,
         destroy: function () {
            window.removeEventListener("message", onMessage);
            observer.disconnect();
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
         },
      };
   }

   // --- When this runtime is itself inside an iframe ---------------------
   // Post size updates upstream + listen for live-reload SSE events.
   function setUpEmbeddedSelfBehaviors() {
      var inIframe = (function () {
         try {
            return window.self !== window.top;
         } catch (_e) {
            return true; // cross-origin parent — assume embedded
         }
      })();

      if (inIframe) {
         var lastHeight = -1;
         function measureContentHeight() {
            // We want the "ink height" — where the last piece of visible
            // content ends. NOT document.body.scrollHeight: any rule like
            // `body { min-height: 100vh }` (extremely common in dashboards
            // that look nice standalone) inflates scrollHeight to match
            // whatever the iframe's current viewport is, creating a
            // feedback loop where the iframe ratchets up but never shrinks.
            //
            // Sum the lowest bottom edge across body's children, in
            // document coordinates. This ignores body padding, min-height,
            // and CSS that just fills the viewport.
            var body = document.body;
            if (!body) return document.documentElement.scrollHeight;
            var maxBottom = 0;
            var kids = body.children;
            for (var i = 0; i < kids.length; i++) {
               var rect = kids[i].getBoundingClientRect();
               if (rect.bottom > maxBottom) maxBottom = rect.bottom;
            }
            if (maxBottom <= 0) {
               // Fallback for empty body / hidden children
               return document.documentElement.scrollHeight;
            }
            var scrollTop =
               window.scrollY ||
               document.documentElement.scrollTop ||
               document.body.scrollTop ||
               0;
            // Add body bottom padding (rect.bottom is content-box bottom,
            // body padding isn't part of any child's rect).
            var bodyStyle = window.getComputedStyle(body);
            var pad = parseFloat(bodyStyle.paddingBottom) || 0;
            return Math.ceil(maxBottom + scrollTop + pad);
         }
         // Smallest SHRINK worth reporting. measureContentHeight already ceils,
         // so nothing sub-pixel reaches here; what this absorbs is a 1-2px
         // rounding flip-flop between two layout passes, which the host cannot
         // act on without the resize itself becoming a layout change inside this
         // frame — the feedback loop.
         //
         // Applied to shrinks ONLY, deliberately. A frame a few pixels too tall
         // shows dead space; a few pixels too short CLIPS, and the frame has no
         // internal scrollbar. The asymmetry also stops the two sides' bands
         // compounding: the host runs its own epsilon against ITS height, which
         // its MIN clamp guarantees can differ from lastHeight here, so two
         // symmetric 8px bands leave a dead zone wider than either. Growing at
         // 1px precision keeps the host's band the only one that applies.
         var RESIZE_EPSILON = 8;
         var resizePending = false;

         function emitSize() {
            var h = measureContentHeight();
            if (h < lastHeight && lastHeight - h < RESIZE_EPSILON) return;
            if (h === lastHeight) return;
            lastHeight = h;
            try {
               window.parent.postMessage(
                  { type: "publisher:resize", height: h },
                  "*",
               );
            } catch (_e) {
               /* ignore */
            }
         }

         // Coalesce a burst into one message per frame.
         //
         // ResizeObserver on documentElement fires on EVERY layout change, so a
         // dashboard whose tiles resolve one by one used to post a height per
         // tile. The host resized on each, which is what made an embedded app
         // visibly jitter while it loaded. Same `pending`-flag idiom as the SSE
         // reload debounce below; rAF rather than a timeout because the next
         // paint is exactly when a coalesced layout is worth measuring.
         //
         // Trailing edge, not leading: the last measurement in a burst is the
         // settled one, and reporting the first would send a stale height.
         function postSize() {
            if (resizePending) return;
            resizePending = true;
            var schedule =
               typeof requestAnimationFrame === "function"
                  ? requestAnimationFrame
                  : function (fn) {
                       setTimeout(fn, 16);
                    };
            schedule(function () {
               resizePending = false;
               emitSize();
            });
         }
         // Initial + observe content changes
         // The first report goes out synchronously: the host shows a
         // MIN_EMBED_HEIGHT placeholder until one arrives, so deferring it by a
         // frame would leave a collapsed frame for no benefit. Only the bursts
         // that follow need coalescing.
         if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", emitSize);
         } else {
            emitSize();
         }
         window.addEventListener("load", emitSize);
         if (typeof ResizeObserver !== "undefined") {
            var ro = new ResizeObserver(postSize);
            // Observe documentElement so we catch any layout change
            ro.observe(document.documentElement);
         } else {
            // Fallback: poll once a second
            setInterval(postSize, 1000);
         }
      }
   }

   // --- Theme ------------------------------------------------------------
   var inFrame = (function () {
      try {
         return window.self !== window.top;
      } catch (_e) {
         return true;
      }
   })();
   // The last host theme, so a page navigated to inside the same frame paints
   // in it at once instead of flashing the OS mode until the host answers.
   var THEME_CACHE_KEY = "publisher:host-theme";
   var TOKEN_NAME = /^[a-z0-9-]+$/;
   var darkQuery = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
   var theme = null;
   var themeTokensSet = [];

   function systemTheme() {
      return {
         mode: darkQuery && darkQuery.matches ? "dark" : "light",
         tokens: {},
         source: "system",
      };
   }

   function readHostTheme(data) {
      if (!data || (data.mode !== "light" && data.mode !== "dark")) return null;
      var tokens = {};
      var given = data.tokens || {};
      for (var name in given) {
         var value = given[name];
         if (!Object.prototype.hasOwnProperty.call(given, name)) continue;
         if (!TOKEN_NAME.test(name) || typeof value !== "string") continue;
         // Colors and fonts only: a url() would fetch from wherever it names.
         if (/url\(/i.test(value)) continue;
         tokens[name] = value;
      }
      return { mode: data.mode, tokens: tokens, source: "host" };
   }

   function publicTheme() {
      return {
         mode: theme.mode,
         tokens: Object.assign({}, theme.tokens),
         source: theme.source,
      };
   }

   function applyTheme(next) {
      if (
         theme &&
         theme.mode === next.mode &&
         theme.source === next.source &&
         JSON.stringify(theme.tokens) === JSON.stringify(next.tokens)
      ) {
         return;
      }
      var first = theme === null;
      var root = document.documentElement;
      for (var i = 0; i < themeTokensSet.length; i++) {
         root.style.removeProperty("--publisher-" + themeTokensSet[i]);
      }
      themeTokensSet = Object.keys(next.tokens);
      for (var j = 0; j < themeTokensSet.length; j++) {
         var key = themeTokensSet[j];
         root.style.setProperty("--publisher-" + key, next.tokens[key]);
      }
      root.setAttribute("data-theme", next.mode);
      root.style.colorScheme = next.mode;
      if (next.source === "host") {
         root.setAttribute("data-theme-source", "host");
      } else {
         root.removeAttribute("data-theme-source");
      }
      theme = next;
      if (!first && typeof CustomEvent === "function") {
         window.dispatchEvent(
            new CustomEvent("publisher:theme", { detail: publicTheme() }),
         );
      }
   }

   function setUpTheme() {
      var cached = null;
      if (inFrame) {
         try {
            cached = readHostTheme(
               JSON.parse(sessionStorage.getItem(THEME_CACHE_KEY) || "null"),
            );
         } catch (_e) {
            cached = null;
         }
      }
      applyTheme(cached || systemTheme());

      if (darkQuery) {
         var onSystemChange = function () {
            if (theme.source === "system") applyTheme(systemTheme());
         };
         if (darkQuery.addEventListener) {
            darkQuery.addEventListener("change", onSystemChange);
         } else if (darkQuery.addListener) {
            darkQuery.addListener(onSystemChange);
         }
      }

      if (!inFrame) return;
      window.addEventListener("message", function (e) {
         if (e.source !== window.parent) return;
         if (!e.data || e.data.type !== "publisher:theme") return;
         var next = readHostTheme(e.data);
         if (!next) return;
         try {
            sessionStorage.setItem(THEME_CACHE_KEY, JSON.stringify(next));
         } catch (_e) {
            /* storage may be blocked; the cache is only an optimization */
         }
         applyTheme(next);
      });
      try {
         window.parent.postMessage({ type: "publisher:theme-request" }, "*");
      } catch (_e) {
         /* ignore */
      }
   }

   // --- SSE live reload --------------------------------------------------
   function setUpLiveReload() {
      if (!ctx.environment || !ctx.package) return;
      if (typeof EventSource === "undefined") return;
      var url =
         apiBase +
         "/environments/" +
         encodeURIComponent(ctx.environment) +
         "/packages/" +
         encodeURIComponent(ctx.package) +
         "/events";
      try {
         var es = new EventSource(url, { withCredentials: true });
         var pending = false;
         es.addEventListener("changed", function () {
            if (pending) return;
            pending = true;
            // Tiny debounce to coalesce a flurry of saves
            setTimeout(function () {
               location.reload();
            }, 100);
         });
         es.onerror = function () {
            // Browser will auto-reconnect; nothing to do.
         };
      } catch (_e) {
         // SSE may be blocked (e.g. corp proxy) — non-fatal.
      }
   }

   // --- Public API --------------------------------------------------------
   window.Publisher = {
      query: query,
      queryFull: queryFull,
      embed: embed,
      context: ctx,
      setToken: function (token) {
         bearerToken = token || null;
      },
   };
   Object.defineProperty(window.Publisher, "theme", {
      enumerable: true,
      get: publicTheme,
   });

   // Auto-init the theme, the in-iframe behaviors and the live-reload
   // subscription. Each is a no-op where it does not apply.
   setUpTheme();
   setUpEmbeddedSelfBehaviors();
   setUpLiveReload();
})();
