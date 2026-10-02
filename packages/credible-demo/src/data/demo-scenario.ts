// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Demo content built for a workspace's own packages. What people open
// (Trending, Resume) is read off what the packages serve; the briefing,
// questions and topics are written by the Worker's scenario writer.

import type { Scenario, ScenarioRequest } from "@/analyst/scenario";
import { people } from "./fixtures";
import type {
   ResumeItem,
   TrendingItem,
   WorkspaceItem,
   WorkspacePackage,
} from "./types";

const HOUR = 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

/** A stable number from a string, so a refresh doesn't reshuffle the counts. */
function hash(s: string): number {
   let h = 2166136261;
   for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
   }
   return h >>> 0;
}

/** Takes from each package in turn, so one big package doesn't fill the row. */
function interleave<T>(lists: T[][], max: number): T[] {
   const out: T[] = [];
   for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
      for (const l of lists)
         if (i < l.length && out.length < max) out.push(l[i]);
   }
   return out;
}

const SHOWN: WorkspaceItem["kind"][] = ["dashboard", "data_app", "notebook"];

export function trendingFrom(packages: WorkspacePackage[]): TrendingItem[] {
   const others = people.slice(1);
   return interleave(
      packages.map((p) =>
         p.items
            .filter((i) => SHOWN.includes(i.kind))
            .map((i) => ({ pkg: p.name, item: i })),
      ),
      6,
   )
      .map(({ pkg, item }): TrendingItem => {
         const h = hash(`${pkg}/${item.id}`);
         const start = h % others.length;
         return {
            id: `tr-${pkg}-${item.id}`,
            title: item.title,
            kind: item.kind,
            views: 20 + (h % 220),
            viewerIds: Array.from(
               { length: 2 + (h % 3) },
               (_, k) => others[(start + k) % others.length].id,
            ),
            href: item.href,
         };
      })
      .sort((a, b) => b.views - a.views);
}

export function resumeFrom(packages: WorkspacePackage[]): ResumeItem[] {
   return interleave(
      packages.map((p) =>
         p.items
            .filter((i) => i.kind === "query" || i.kind === "dashboard")
            .map((i) => ({ pkg: p.name, item: i })),
      ),
      4,
   ).map(({ pkg, item }, n) => ({
      id: `rs-${pkg}-${item.id}`,
      title: item.title,
      kind: item.kind === "query" ? "query" : "exploration",
      context: `${pkg} · ${item.path}`,
      lastOpenedAt: hoursAgo(3 + n * 17 + (hash(item.id) % 9)),
      href: item.href,
   }));
}

export class ScenarioUnavailable extends Error {}

/** Asks the Worker's scenario writer for a briefing, questions and topics. */
export async function writeScenario(body: ScenarioRequest): Promise<Scenario> {
   let res: Response;
   try {
      res = await fetch("/api/analyst/scenario", {
         method: "POST",
         headers: { "content-type": "application/json" },
         body: JSON.stringify(body),
      });
   } catch {
      throw new ScenarioUnavailable("The scenario writer is unreachable");
   }
   const type = res.headers.get("content-type") ?? "";
   if (res.status === 404 || type.includes("text/html"))
      throw new ScenarioUnavailable("No scenario writer is deployed");
   const json = (await res.json().catch(() => ({}))) as Scenario & {
      error?: string;
   };
   if (res.status === 503) throw new ScenarioUnavailable(json.error);
   if (!res.ok)
      throw new Error(json.error ?? `The writer answered ${res.status}`);
   return json;
}
