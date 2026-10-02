// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

/*
 * Reads the shape of a single `run:` query well enough to draw it as pills:
 * the source, an optional view it refines, and each clause's fields. It is
 * not a Malloy parser; anything it can't read comes back null and the caller
 * shows the code instead.
 */

export const CLAUSES = [
   "where",
   "having",
   "group_by",
   "aggregate",
   "calculate",
   "select",
   "nest",
   "order_by",
   "limit",
   "top",
] as const;

export type ClauseKind = (typeof CLAUSES)[number];

export interface QueryField {
   /** The name it is given with `is`, when it has one. */
   name?: string;
   expr: string;
   /** A `{ where: … }` refinement on the field. */
   filter?: string;
}

export interface QueryClause {
   kind: ClauseKind;
   fields: QueryField[];
}

export interface ParsedQuery {
   source: string;
   view?: string;
   clauses: QueryClause[];
}

const TIMEFRAME =
   /(^|\.)(year|quarter|month|week|day|date|hour|minute)$|_(at|date)$/;

/** Whether a field name or expression reads as a time, by Malloy's timeframe naming. */
export function isTimeField(expr: string) {
   return TIMEFRAME.test(expr);
}

const CLAUSE_AT = new RegExp(`^(${CLAUSES.join("|")})\\s*:`);

/** Splits at depth 0 wherever `isBreak` says, ignoring brackets and strings. */
function splitTopLevel(
   text: string,
   isBreak: (text: string, i: number) => number,
): { at: number; len: number }[] {
   const breaks: { at: number; len: number }[] = [];
   let depth = 0;
   let quote: string | null = null;
   for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
         if (c === "\\") i++;
         else if (c === quote) quote = null;
         continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if ("{([".includes(c)) depth++;
      else if ("})]".includes(c)) depth--;
      else if (depth === 0) {
         const len = isBreak(text, i);
         if (len > 0) breaks.push({ at: i, len });
      }
   }
   return breaks;
}

function parseField(raw: string): QueryField {
   const named = /^([A-Za-z_]\w*)\s+is\s+([\s\S]+)$/.exec(raw);
   const name = named?.[1];
   let expr = (named ? named[2] : raw).trim();
   let filter: string | undefined;
   const refined = /^([\s\S]*?)\s*\{\s*where\s*:\s*([\s\S]*?)\s*\}$/.exec(expr);
   if (refined) {
      expr = refined[1].trim();
      filter = refined[2].trim();
   }
   return { name, expr, filter };
}

function parseBody(body: string): QueryClause[] | null {
   const starts = splitTopLevel(body, (text, i) => {
      const prev = text[i - 1];
      if (i > 0 && !/[\s;{,]/.test(prev)) return 0;
      const m = CLAUSE_AT.exec(text.slice(i));
      return m ? m[0].length : 0;
   });
   if (starts.length === 0) return body.trim() ? null : [];
   if (body.slice(0, starts[0].at).trim()) return null;

   return starts.map((s, n) => {
      const kind = body
         .slice(s.at, s.at + s.len)
         .replace(/\s*:$/, "") as ClauseKind;
      const content = body.slice(
         s.at + s.len,
         starts[n + 1]?.at ?? body.length,
      );
      const cuts = splitTopLevel(content, (text, i) =>
         /[,\n;]/.test(text[i]) ? 1 : 0,
      );
      const fields: QueryField[] = [];
      let from = 0;
      for (const cut of [...cuts, { at: content.length, len: 0 }]) {
         const piece = content.slice(from, cut.at).trim();
         if (piece) fields.push(parseField(piece));
         from = cut.at + cut.len;
      }
      return { kind, fields };
   });
}

const stripComments = (text: string) =>
   text
      .split("\n")
      .map((line) => line.replace(/\s*(\/\/|--).*$/, ""))
      .join("\n");

export function parseMalloyQuery(text: string): ParsedQuery | null {
   const head = /^\s*run\s*:\s*([A-Za-z_][\w.]*)\s*->\s*([\s\S]*?)\s*$/.exec(
      stripComments(text),
   );
   if (!head) return null;
   const [, source, rest] = head;

   const refined = /^([A-Za-z_]\w*)(?:\s*\+\s*(\{[\s\S]*\}))?$/.exec(rest);
   const view = refined?.[1];
   const block = refined ? refined[2] : rest;
   if (!block) return view ? { source, view, clauses: [] } : null;
   if (!block.startsWith("{") || !block.endsWith("}")) return null;

   const clauses = parseBody(block.slice(1, -1));
   return clauses ? { source, view, clauses } : null;
}
