// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Entity, Ontology } from "../../../ontology/types";

export interface PromotionEntry {
   entity: Entity;
   doc: string;
}

/** One model file with descriptions written into it. */
export interface FileChange {
   path: string;
   before: string;
   after: string;
   entries: PromotionEntry[];
   /** This file's part of the unified diff. */
   patch: string;
   /** Whether the edit turns on `##! experimental.access_modifiers`. */
   addsFlag: boolean;
}

export interface Promotion {
   files: FileChange[];
   /** Entries that cannot be written in place, and why. */
   skipped: Array<PromotionEntry & { reason: string }>;
   /** Every file's diff, ready for `git apply` in the package directory. */
   patch: string;
}

const FLAG = "##! experimental.access_modifiers";
const FLAG_PATTERN = /^##!.*\baccess_modifiers\b/m;

/**
 * Where an entity's description would be written: above its own definition,
 * or, for a table column, in an `include` block on the source that reads the
 * table. `reason` says why it cannot be written, when it cannot.
 */
export function promotionTarget(
   ontology: Ontology,
   entity: Entity,
): { file: string; column?: Entity } | { reason: string } {
   const isColumn =
      entity.kind === "dimension" && !entity.formula && !entity.excerpt;
   const definedIn = entity.excerpt?.modelPath ?? entity.modelPath;
   if (!ontology.files.has(definedIn)) {
      return {
         reason: `Defined in ${definedIn}, which this package does not publish, so the dictionary cannot read or edit it.`,
      };
   }
   if (!isColumn) {
      if (!entity.excerpt) {
         return { reason: "No definition was found in the model text." };
      }
      const text = ontology.files.get(entity.excerpt.modelPath);
      if (text === undefined) {
         return { reason: "The model file's text is not available." };
      }
      if (
         text.split("\n")[entity.excerpt.startLine]?.trim() !==
         entity.excerpt.text.split("\n")[0].trim()
      ) {
         return {
            reason:
               "The definition has moved since the dictionary read the model.",
         };
      }
      return { file: entity.excerpt.modelPath };
   }
   const source = entity.sourceId
      ? ontology.entities.get(entity.sourceId)
      : undefined;
   const excerpt = source?.excerpt;
   const text = excerpt && ontology.files.get(excerpt.modelPath);
   if (!source || !excerpt || text === undefined) {
      return { reason: "The source that reads this column was not found." };
   }
   const header = text.split("\n")[excerpt.definitionLine] ?? "";
   if (!includeHeader(text.split("\n"), excerpt.definitionLine)) {
      return {
         reason: /\binclude\b/.test(header)
            ? `${source.name} already has an include block; add this #(doc) to it by hand.`
            : `${source.name}'s declaration spans several lines (a SQL query, for one), so there is no single line to add an include block to.`,
      };
   }
   return { file: excerpt.modelPath, column: source };
}

/**
 * The edit that writes each description into the model text the dictionary was
 * built from: a `#(doc)` line above each definition, and for table columns an
 * `include { #(doc) … column * }` block on their source, which needs the
 * `access_modifiers` experiment turned on in that file.
 */
export function planPromotion(
   ontology: Ontology,
   entries: PromotionEntry[],
): Promotion {
   const skipped: Promotion["skipped"] = [];
   type FilePlan = {
      docs: PromotionEntry[];
      columns: Map<Entity, PromotionEntry[]>;
   };
   const byFile = new Map<string, FilePlan>();
   for (const entry of entries) {
      const target = promotionTarget(ontology, entry.entity);
      if ("reason" in target) {
         skipped.push({ ...entry, reason: target.reason });
         continue;
      }
      const plan: FilePlan = byFile.get(target.file) ?? {
         docs: [],
         columns: new Map(),
      };
      byFile.set(target.file, plan);
      if (target.column) {
         plan.columns.set(target.column, [
            ...(plan.columns.get(target.column) ?? []),
            entry,
         ]);
      } else {
         plan.docs.push(entry);
      }
   }

   const files = [...byFile].map(([path, plan]): FileChange => {
      const before = ontology.files.get(path)!;
      const lines = before.split("\n");
      const edits: Edit[] = [];
      for (const entry of plan.docs) {
         const excerpt = entry.entity.excerpt!;
         edits.push({
            at: excerpt.startLine,
            remove: 0,
            insert: [`${excerpt.indent}#(doc) ${entry.doc}`],
            rank: 1,
         });
      }
      for (const [source, columns] of plan.columns) {
         const at = source.excerpt!.definitionLine;
         const header = includeHeader(lines, at)!;
         const inner = `${header.indent}  `;
         edits.push({
            at,
            remove: 1,
            insert: [
               `${header.head} include {`,
               ...columns.flatMap((c) => [
                  `${inner}#(doc) ${c.doc}`,
                  `${inner}${fieldName(c.entity.name)}`,
               ]),
               `${inner}*`,
               `${header.indent}}${header.tail}`,
            ],
            rank: 2,
         });
      }
      const addsFlag = plan.columns.size > 0 && !FLAG_PATTERN.test(before);
      if (addsFlag) {
         edits.push({
            at: flagLine(lines),
            remove: 0,
            insert: [FLAG],
            rank: 0,
         });
      }
      const merged = mergeEdits(edits);
      return {
         path,
         before,
         after: applyEdits(lines, merged).join("\n"),
         entries: [...plan.docs, ...[...plan.columns.values()].flat()],
         patch: unifiedDiff(path, lines, merged),
         addsFlag,
      };
   });

   return {
      files,
      skipped,
      patch: files.map((f) => f.patch).join("\n") + (files.length ? "\n" : ""),
   };
}

/**
 * A source declaration that an `include` block can be spliced into: the part
 * before `extend {` and the rest of the line from it, or the whole line when
 * the source has no extend.
 */
function includeHeader(lines: string[], at: number) {
   const line = lines[at] ?? "";
   if (/\binclude\b/.test(line)) return undefined;
   const indent = line.match(/^\s*/)![0];
   const extend = line.match(
      /^(\s*source:\s*\S+\s+is\s+.+?)\s+(extend\s*\{.*)$/,
   );
   if (extend) {
      return { indent, head: extend[1], tail: ` ${extend[2]}` };
   }
   const bare = /^\s*source:\s*\S+\s+is\s+\S.*$/.test(line);
   const next = lines.slice(at + 1).find((l) => l.trim() !== "");
   const balanced =
      (line.match(/\(/g) ?? []).length === (line.match(/\)/g) ?? []).length;
   if (bare && balanced && !/^\s*(extend|include|\+)/.test(next ?? "")) {
      return { indent, head: line.trimEnd(), tail: "" };
   }
   return undefined;
}

/** Quoted, because a column may be named like a keyword (`source`, `name`). */
function fieldName(name: string) {
   return `\`${name}\``;
}

/** After any leading comments and `##!` lines, before the first statement. */
function flagLine(lines: string[]) {
   const i = lines.findIndex((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("//") && !t.startsWith("##!");
   });
   return i < 0 ? lines.length : i;
}

interface Edit {
   /** 0-based line in the original text. */
   at: number;
   remove: number;
   insert: string[];
   /** Order among edits at the same line. */
   rank: number;
}

function mergeEdits(edits: Edit[]): Edit[] {
   const byLine = new Map<number, Edit[]>();
   for (const e of edits) byLine.set(e.at, [...(byLine.get(e.at) ?? []), e]);
   return [...byLine]
      .sort(([a], [b]) => a - b)
      .map(([at, group]) => {
         group.sort((a, b) => a.rank - b.rank);
         return {
            at,
            remove: Math.max(...group.map((e) => e.remove)),
            insert: group.flatMap((e) => e.insert),
            rank: 0,
         };
      });
}

function applyEdits(lines: string[], edits: Edit[]): string[] {
   const out = [...lines];
   for (const e of [...edits].reverse()) {
      out.splice(e.at, e.remove, ...e.insert);
   }
   return out;
}

/** A diff with one line of trailing context per hunk, touching edits sharing a hunk. */
function unifiedDiff(path: string, lines: string[], edits: Edit[]): string {
   const real = lines.at(-1) === "" ? lines.slice(0, -1) : lines;
   const out = [`--- a/${path}`, `+++ b/${path}`];
   let delta = 0;
   let i = 0;
   while (i < edits.length) {
      const start = edits[i].at;
      let cursor = start;
      const body: string[] = [];
      let added = 0;
      while (i < edits.length && edits[i].at === cursor) {
         const e = edits[i++];
         for (let k = 0; k < e.remove; k++) body.push(`-${real[e.at + k]}`);
         for (const line of e.insert) body.push(`+${line}`);
         added += e.insert.length - e.remove;
         cursor = e.at + e.remove;
      }
      let oldStart = start + 1;
      if (cursor < real.length) {
         body.push(` ${real[cursor]}`);
      } else if (start > 0) {
         body.unshift(` ${real[start - 1]}`);
         oldStart = start;
      }
      const context = body.filter((l) => l.startsWith(" ")).length;
      const oldCount = cursor - start + context;
      const newCount = oldCount + added;
      out.push(
         `@@ -${oldStart},${oldCount} +${oldStart + delta},${newCount} @@`,
         ...body,
      );
      delta += added;
   }
   return out.join("\n");
}

export interface CompileProblem {
   message: string;
   severity: string;
   /** 1-based. */
   line?: number;
}

export interface FileCheck {
   ok: boolean;
   problems: CompileProblem[];
}

/**
 * Compile each changed file as it would be after promotion, through the
 * package's compile endpoint at `file` scope, without writing anything.
 */
export async function checkPromotion(
   server: string,
   ontology: Ontology,
   promotion: Promotion,
): Promise<Record<string, FileCheck>> {
   const results = await Promise.all(
      promotion.files.map(async (file): Promise<[string, FileCheck]> => {
         const url = `${server}/environments/${encodeURIComponent(
            ontology.environmentName,
         )}/packages/${encodeURIComponent(ontology.packageName)}/models/${file.path
            .split("/")
            .map(encodeURIComponent)
            .join("/")}/compile`;
         const failed = (message: string): [string, FileCheck] => [
            file.path,
            { ok: false, problems: [{ message, severity: "error" }] },
         ];
         try {
            const response = await fetch(url, {
               method: "POST",
               headers: { "content-type": "application/json" },
               body: JSON.stringify({ source: file.after, scope: "file" }),
            });
            const body = (await response.json()) as {
               message?: string;
               problems?: Array<{
                  message: string;
                  severity: string;
                  at?: { range?: { start?: { line?: number } } };
               }>;
            };
            if (!response.ok) {
               return failed(body.message ?? `HTTP ${response.status}`);
            }
            const problems = (body.problems ?? []).map((p) => ({
               message: p.message,
               severity: p.severity,
               line:
                  p.at?.range?.start?.line !== undefined
                     ? p.at.range.start.line + 1
                     : undefined,
            }));
            return [
               file.path,
               { ok: !problems.some((p) => p.severity === "error"), problems },
            ];
         } catch (error) {
            return failed(
               error instanceof Error ? error.message : String(error),
            );
         }
      }),
   );
   return Object.fromEntries(results);
}

/**
 * Writing a promotion into the package. Not built yet: Publisher has no
 * endpoint that writes a model file. When there is one, this writes each
 * file's `after` text and reloads the package; the promoted entities then
 * come back documented, which retires their drafts.
 */
export const writeBack = {
   available: false,
   async write(_promotion: Promotion): Promise<void> {
      throw new Error("Writing to the model is not available yet.");
   },
};
