// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { postAi } from "../../../ai/consoleAi";
import type { Entity, Ontology } from "../../../ontology/types";

/**
 * A description for an undocumented entity, kept in this browser until it is
 * promoted into the model. `drafted` is Opus's text as written; `doc` is what
 * will be promoted, which differs once someone edits it.
 */
export interface Draft {
   doc: string;
   drafted: string;
   status: "draft" | "accepted";
   at: number;
}

type Drafts = Record<string, Draft>;
type PackageRef = Pick<Ontology, "environmentName" | "packageName">;

const listeners = new Set<() => void>();
const cache = new Map<string, Drafts>();

function subscribe(listener: () => void) {
   listeners.add(listener);
   return () => {
      listeners.delete(listener);
   };
}

function notify() {
   listeners.forEach((l) => l());
}

function storageKey(ontology: PackageRef) {
   return `dictionary-drafts:${ontology.environmentName}/${ontology.packageName}`;
}

function read(key: string): Drafts {
   if (!cache.has(key)) {
      let stored: Record<string, Partial<Draft>> = {};
      try {
         stored = JSON.parse(localStorage.getItem(key) ?? "{}");
      } catch {
         // An unreadable store starts empty.
      }
      const drafts: Drafts = {};
      for (const [id, d] of Object.entries(stored)) {
         if (!d.doc) continue;
         drafts[id] = {
            doc: d.doc,
            drafted: d.drafted ?? d.doc,
            status: d.status ?? "draft",
            at: d.at ?? Date.now(),
         };
      }
      cache.set(key, drafts);
   }
   return cache.get(key)!;
}

function write(key: string, drafts: Drafts) {
   cache.set(key, drafts);
   try {
      localStorage.setItem(key, JSON.stringify(drafts));
   } catch {
      // Best effort: drafts are a convenience, not a record.
   }
   notify();
}

function update(key: string, change: (drafts: Drafts) => void) {
   const next = { ...read(key) };
   change(next);
   write(key, next);
}

function mergeInto(key: string, incoming: Array<{ id: string; doc: string }>) {
   update(key, (drafts) => {
      for (const d of incoming) {
         const doc = oneLine(d.doc);
         if (!doc) continue;
         drafts[d.id] = { doc, drafted: doc, status: "draft", at: Date.now() };
      }
   });
}

/** A `#(doc)` runs to the end of its line. */
function oneLine(text: string) {
   return text.replace(/\s+/g, " ").trim();
}

export function useDrafts(ontology: PackageRef) {
   const key = storageKey(ontology);
   const drafts = useSyncExternalStore(subscribe, () => read(key));
   const actions = useMemo(
      () => ({
         merge: (incoming: Array<{ id: string; doc: string }>) =>
            mergeInto(key, incoming),
         discard: (ids: string | string[]) =>
            update(key, (d) => {
               for (const id of [ids].flat()) delete d[id];
            }),
         edit: (id: string, doc: string) =>
            update(key, (d) => {
               if (d[id]) d[id] = { ...d[id], doc: oneLine(doc) || d[id].doc };
            }),
         setStatus: (ids: string | string[], status: Draft["status"]) =>
            update(key, (d) => {
               for (const id of [ids].flat()) {
                  if (d[id]) d[id] = { ...d[id], status };
               }
            }),
      }),
      [key],
   );
   return { drafts, ...actions };
}

/** Drafts whose entity still exists and still has no `#(doc)` in the model. */
export function liveDrafts(
   ontology: Ontology,
   drafts: Drafts,
): Array<{ entity: Entity; draft: Draft }> {
   return Object.entries(drafts)
      .map(([id, draft]) => ({ entity: ontology.entities.get(id), draft }))
      .filter(
         (d): d is { entity: Entity; draft: Draft } =>
            Boolean(d.entity) && !d.entity!.doc,
      );
}

export function undocumented(ontology: Ontology): Entity[] {
   return [...ontology.entities.values()].filter(
      (e) => !e.doc && e.kind !== "given",
   );
}

// ---------------------------------------------------------------------------
// Drafting runs. One per package, held outside React so a run keeps going, and
// stays visible, while the person moves around the dictionary.

export interface DraftRun {
   /** Every entity the run was asked to draft, in drafting order. */
   targets: string[];
   active: string[];
   finished: string[];
   failed: string[];
   error?: string;
   running: boolean;
   stopping: boolean;
}

const runs = new Map<string, DraftRun>();

function setRun(key: string, change: (run: DraftRun) => DraftRun) {
   const run = runs.get(key);
   if (!run) return;
   runs.set(key, change(run));
   notify();
}

export function useDraftRun(ontology: PackageRef): DraftRun | undefined {
   const key = storageKey(ontology);
   return useSyncExternalStore(subscribe, () => runs.get(key));
}

const BATCH_SIZE = 12;
const CONCURRENCY = 3;

/**
 * Draft descriptions for `targets` in batches, a few batches at a time, merging
 * each batch into the drafts as it lands. Does nothing while a run is going.
 */
export function startDraftRun(ontology: Ontology, targets: Entity[]) {
   const key = storageKey(ontology);
   if (runs.get(key)?.running || targets.length === 0) return;
   const ordered = draftingOrder(targets);
   runs.set(key, {
      targets: ordered.map((e) => e.id),
      active: [],
      finished: [],
      failed: [],
      running: true,
      stopping: false,
   });
   notify();

   const batches: Entity[][] = [];
   for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
      batches.push(ordered.slice(i, i + BATCH_SIZE));
   }
   let next = 0;
   const worker = async () => {
      while (next < batches.length && !runs.get(key)?.stopping) {
         const batch = batches[next++];
         const ids = batch.map((e) => e.id);
         setRun(key, (r) => ({ ...r, active: [...r.active, ...ids] }));
         try {
            const drafts = await requestDrafts(ontology, batch);
            mergeInto(key, drafts);
            const got = new Set(drafts.map((d) => d.id));
            setRun(key, (r) => ({
               ...r,
               active: r.active.filter((id) => !ids.includes(id)),
               finished: [...r.finished, ...ids.filter((id) => got.has(id))],
               failed: [...r.failed, ...ids.filter((id) => !got.has(id))],
            }));
         } catch (error) {
            setRun(key, (r) => ({
               ...r,
               active: r.active.filter((id) => !ids.includes(id)),
               failed: [...r.failed, ...ids],
               error: error instanceof Error ? error.message : String(error),
            }));
         }
      }
   };
   void Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() =>
      setRun(key, (r) => ({ ...r, running: false, stopping: false })),
   );
}

/** Let the batches in flight land, and start no more. */
export function stopDraftRun(ontology: PackageRef) {
   setRun(storageKey(ontology), (r) =>
      r.running ? { ...r, stopping: true } : r,
   );
}

export function clearDraftRun(ontology: PackageRef) {
   const key = storageKey(ontology);
   if (runs.get(key)?.running) return;
   runs.delete(key);
   notify();
}

/** Draft one entity now, outside any run. */
export function useDraftOne(ontology: Ontology) {
   const key = storageKey(ontology);
   return useCallback(
      async (entity: Entity) =>
         mergeInto(key, await requestDrafts(ontology, [entity])),
      [key, ontology],
   );
}

/** Sources first, each followed by its own fields, so a run fills in source by source. */
export function draftingOrder(targets: Entity[]): Entity[] {
   const rank: Record<string, number> = {
      source: 0,
      measure: 1,
      dimension: 2,
      join: 3,
      view: 4,
      query: 5,
   };
   return [...targets].sort(
      (a, b) =>
         (a.sourceName ?? a.name).localeCompare(b.sourceName ?? b.name) ||
         (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) ||
         a.name.localeCompare(b.name),
   );
}

async function requestDrafts(
   ontology: Ontology,
   batch: Entity[],
): Promise<Array<{ id: string; doc: string }>> {
   const result = await postAi<{
      drafts: Array<{ id: string; doc: string }>;
   }>("/dictionary/draft-docs", {
      scope: {
         environment: ontology.environmentName,
         package: ontology.packageName,
      },
      domain: ontology.description,
      entities: batch.map((e) => ({
         id: e.id,
         kind: e.kind,
         name: e.name,
         source: e.sourceName,
         type: e.dataType,
         formula: e.formula ?? e.excerpt?.text,
         neighbors: [...e.uses, ...e.usedBy]
            .map((id) => ontology.entities.get(id))
            .filter(Boolean)
            .slice(0, 8)
            .map((n) => `${n!.name}${n!.doc ? `: ${n!.doc}` : ""}`),
      })),
   });
   return result.drafts.filter((d) => batch.some((e) => e.id === d.id));
}
