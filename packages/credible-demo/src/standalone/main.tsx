// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// /sdk/publisher-app.js: the renderer a manifest-backed data app
// (`public/apps/<slug>/`) loads beside /sdk/publisher.js, which it queries
// through and which sizes the frame and reports the theme. Built from this
// app's own components by `bun run build:standalone`.

import {
   APP_META,
   APPS_DIR,
   MANIFEST_FILE,
   withRows,
   type AppManifest,
   type ManifestHead,
} from "@malloy-publisher/app-manifest";
import type { Row } from "@malloy-publisher/app-manifest/analyst/schema";
import { loadTables } from "@malloy-publisher/app-manifest/runtime/load";
import { peekManifest } from "@malloy-publisher/app-manifest/runtime/peek";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { savedFinding } from "@/components/saved-finding";
import { TooltipProvider } from "@/components/ui/tooltip";
import css from "@/index.css?inline";
import { FindingPage } from "./finding-page";

interface PublisherTheme {
   mode: "light" | "dark";
   tokens: Record<string, string>;
   source: "system" | "host";
}

declare global {
   interface Window {
      Publisher?: {
         query(
            model: string,
            malloy: string,
            opts?: { givens?: Record<string, unknown> },
         ): Promise<Row[]>;
         context: { environment?: string; package?: string };
         theme?: PublisherTheme;
      };
   }
}

/** The tokens a host may send, which are this app's own variable names. */
const HOST_TOKENS = [
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
];

/** Light or dark as publisher.js reports it, in the host's palette when it sent one. */
function followTheme() {
   const html = document.documentElement;
   const apply = () => {
      const theme = window.Publisher?.theme;
      html.classList.toggle(
         "dark",
         (theme?.mode ?? html.dataset.theme) === "dark",
      );
      for (const name of HOST_TOKENS) {
         const value =
            theme?.source === "host" ? theme.tokens[name] : undefined;
         if (value) html.style.setProperty(`--${name}`, value);
         else html.style.removeProperty(`--${name}`);
      }
   };
   apply();
   window.addEventListener("publisher:theme", apply);
}

function unreadable(
   root: HTMLElement,
   head: ManifestHead | undefined,
   problem: string,
) {
   const note = document.createElement("p");
   note.textContent = `This finding cannot be drawn here: ${problem}`;
   if (head) {
      const h1 = document.createElement("h1");
      h1.textContent = head.title;
      root.replaceChildren(h1);
      if (head.description) {
         const p = document.createElement("p");
         p.textContent = head.description;
         root.append(p);
      }
   }
   root.append(note);
   root.dataset.state = "unreadable";
}

/** The app's slug, from `…/apps/<slug>/` in the page's own path. */
function slugOfPage() {
   const parts = location.pathname.split("/").filter(Boolean);
   const at = parts.lastIndexOf(APPS_DIR);
   return at >= 0 && parts[at + 1] ? parts[at + 1] : "";
}

async function start() {
   const root = document.getElementById("publisher-app");
   if (!root) return;
   const style = document.createElement("style");
   style.textContent = css;
   document.head.append(style);
   followTheme();

   const name =
      document
         .querySelector(`meta[name="${APP_META}"]`)
         ?.getAttribute("content") ?? MANIFEST_FILE;
   const url = new URL(name, location.href);
   if (url.origin !== location.origin) {
      return unreadable(root, undefined, "its manifest is on another site");
   }

   let json: unknown;
   try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${name} answered ${res.status}`);
      json = await res.json();
   } catch (e) {
      return unreadable(root, undefined, (e as Error).message);
   }
   const read = peekManifest(json);
   if (!read.ok) return unreadable(root, read.head, read.problem);

   const m: AppManifest = read.manifest;
   const publisher = window.Publisher;
   try {
      const loaded = await loadTables(m, async (q) => {
         if (!publisher) throw new Error("/sdk/publisher.js did not load");
         return publisher.query(q.model, q.malloy, { givens: q.givens });
      });
      const rows = Object.fromEntries(
         Object.entries(loaded.tables).map(([id, t]) => [id, t.rows]),
      );
      const finding = savedFinding(withRows(m, rows), {
         environment: publisher?.context.environment ?? "",
         package: publisher?.context.package ?? "",
         slug: slugOfPage(),
      });
      createRoot(root).render(
         <StrictMode>
            <TooltipProvider delayDuration={300}>
               <FindingPage
                  manifest={m}
                  finding={finding}
                  failed={Object.entries(loaded.failed)}
               />
            </TooltipProvider>
         </StrictMode>,
      );
      root.dataset.state = "ready";
   } catch (e) {
      unreadable(
         root,
         m,
         `its manifest is malformed (${(e as Error).message})`,
      );
   }
}

if (document.readyState === "loading") {
   document.addEventListener("DOMContentLoaded", () => void start());
} else {
   void start();
}
