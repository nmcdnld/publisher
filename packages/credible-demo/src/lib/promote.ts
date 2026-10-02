// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

/** A saved `run: <source> -> <pipeline>`, split into what a definition needs. */
export interface RunParts {
   source: string;
   pipeline: string;
}

export function parseRun(malloy: string): RunParts | undefined {
   const m = malloy.trim().match(/^run:\s*([A-Za-z_]\w*)\s*->\s*([\s\S]+)$/);
   return m ? { source: m[1], pipeline: m[2].trim() } : undefined;
}

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A Malloy name for a title: `Refunds spiked in March` → `refunds_spiked_in_march`. */
export function toIdentifier(title: string): string {
   const words = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
   let name = "";
   for (const w of words) {
      if (name && name.length + w.length + 1 > 40) break;
      name = name ? `${name}_${w}` : w;
   }
   if (!name) return "promoted";
   return /^\d/.test(name) ? `q_${name}` : name;
}

/**
 * The text with strings, comments and annotation lines blanked to spaces, so
 * a brace or keyword inside any of them can't be mistaken for code. Same
 * length as the input, so offsets carry over.
 */
export function codeOnly(text: string): string {
   const out = text.split("");
   const blank = (from: number, to: number) => {
      for (let k = from; k < to && k < out.length; k++) {
         if (out[k] !== "\n") out[k] = " ";
      }
   };
   let i = 0;
   while (i < text.length) {
      const two = text.slice(i, i + 2);
      let end = -1;
      if (two === "//" || two === "--" || text[i] === "#") {
         end = text.indexOf("\n", i);
         if (end === -1) end = text.length;
      } else if (two === "/*") {
         end = text.indexOf("*/", i + 2);
         end = end === -1 ? text.length : end + 2;
      } else if (text.startsWith('"""', i)) {
         end = text.indexOf('"""', i + 3);
         end = end === -1 ? text.length : end + 3;
      } else if (text[i] === '"' || text[i] === "'" || text[i] === "`") {
         const q = text[i];
         let k = i + 1;
         while (k < text.length && text[k] !== q && text[k] !== "\n") {
            k += text[k] === "\\" ? 2 : 1;
         }
         end = k + 1;
      }
      if (end === -1) {
         i++;
      } else {
         blank(i, end);
         i = end;
      }
   }
   return out.join("");
}

/** Where `source: <name> is … extend {` opens and closes its block. */
export function findSourceBlock(
   text: string,
   source: string,
): { open: number; close: number } | undefined {
   const code = codeOnly(text);
   const head = new RegExp(`\\bsource:\\s*${source}\\s+is\\b`).exec(code);
   if (!head) return undefined;
   const rest = code.slice(head.index + head[0].length);
   const statement = rest.search(
      /\b(?:source|query|run|import)\s*:|\bimport\b/,
   );
   const brace = rest.indexOf("{");
   if (brace === -1 || (statement !== -1 && statement < brace))
      return undefined;
   if (!/\bextend\s*$/.test(rest.slice(0, brace))) return undefined;
   const open = head.index + head[0].length + brace;
   let depth = 0;
   for (let k = open; k < code.length; k++) {
      if (code[k] === "{") depth++;
      else if (code[k] === "}" && --depth === 0) return { open, close: k };
   }
   return undefined;
}

/** Every source the file defines itself, which is all another file can import from it. */
export function definedSources(text: string): string[] {
   const names = [
      ...codeOnly(text).matchAll(/\bsource:\s*([A-Za-z_]\w*)\s+is\b/g),
   ].map((m) => m[1]);
   return [...new Set(names)];
}

/** Every source the file defines with an `extend { }` a view can go in. */
export const extendableSources = (text: string) =>
   definedSources(text).filter((n) => findSourceBlock(text, n));

/** Whether the file already declares something by this name. */
export function declares(text: string, name: string): boolean {
   return new RegExp(
      `\\b(?:source|query|view|dimension|measure|join_one|join_many|join_cross):\\s*${name}\\b`,
   ).test(codeOnly(text));
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

const indentLines = (s: string, indent: string) =>
   s
      .split("\n")
      .map((line, i) => (i === 0 || !line ? line : indent + line))
      .join("\n");

export interface Edit {
   /** The whole file after the edit. */
   text: string;
   /** Just what was added, for review. */
   added: string;
   /** 1-based line the addition starts on. */
   line: number;
}

const lineOf = (text: string, offset: number) =>
   text.slice(0, offset).split("\n").length;

/** Adds `view: <name> is <pipeline>` as the last thing in the source's block. */
export function addView(
   text: string,
   source: string,
   def: { name: string; doc: string; pipeline: string },
): Edit | undefined {
   const block = findSourceBlock(text, source);
   if (!block) return undefined;
   const body = text.slice(block.open + 1, block.close);
   const indent = body.match(/\n([ \t]+)\S/)?.[1] ?? "  ";
   const lineStart = text.lastIndexOf("\n", block.close - 1) + 1;
   const closeOnOwnLine = /^[ \t]*$/.test(text.slice(lineStart, block.close));
   const at = closeOnOwnLine ? lineStart : block.close;
   const lines = [
      def.doc && `${indent}#(doc) ${oneLine(def.doc)}`,
      `${indent}view: ${def.name} is ${indentLines(def.pipeline, indent)}`,
   ].filter(Boolean);
   const added = lines.join("\n");
   const insert = `\n${added}\n${closeOnOwnLine ? "" : "\n"}`;
   const next = text.slice(0, at) + insert + text.slice(at);
   return { text: next, added, line: lineOf(next, at) + 1 };
}

/** Appends `query: <name> is <source> -> <pipeline>` to the end of the file. */
export function addQuery(
   text: string,
   def: { name: string; doc: string; source: string; pipeline: string },
): Edit {
   const head = text.trimEnd();
   const added = [
      def.doc && `#(doc) ${oneLine(def.doc)}`,
      `query: ${def.name} is ${def.source} -> ${def.pipeline}`,
   ]
      .filter(Boolean)
      .join("\n");
   const next = `${head}\n\n${added}\n`;
   return { text: next, added, line: lineOf(next, head.length) + 2 };
}

const tagString = (s: string) => oneLine(s).replace(/"/g, "'");

/**
 * A one-tile dashboard file: `dashboards/<name>.malloy`, importing the source
 * from its model and naming the promoted pipeline as its only view.
 */
export function dashboardFile(def: {
   name: string;
   title: string;
   doc: string;
   modelPath: string;
   source: string;
   pipeline: string;
}): { path: string; text: string } {
   const tiles = `${def.name}_tiles`;
   const lines = [
      ...(def.doc
         ? def.doc
              .trim()
              .split(/\n+/)
              .map((l) => `##" ${l.trim()}`)
         : []),
      `## artifact { title="${tagString(def.title)}" tiles=["${tiles} -> ${def.name}"] } dashboard { columns=12 }`,
      `import { ${def.source} } from "../${def.modelPath}"`,
      "",
      `source: ${tiles} is ${def.source} extend {`,
      "  # colspan=12",
      `  # label="${tagString(def.title)}"`,
      `  view: ${def.name} is ${indentLines(def.pipeline, "  ")}`,
      "}",
      "",
   ];
   return { path: `dashboards/${def.name}.malloy`, text: lines.join("\n") };
}
