// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

const TOKEN = /\{\{metric:([\w.-]+)\}\}/g;

export type TextPart = { text: string } | { metricId: string };

/** Splits prose into plain runs and `{{metric:ID}}` tokens. */
export function splitTokens(text: string): TextPart[] {
   const parts: TextPart[] = [];
   let last = 0;
   for (const m of text.matchAll(TOKEN)) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ metricId: m[1] });
      last = m.index + m[0].length;
   }
   if (last < text.length) parts.push({ text: text.slice(last) });
   return parts;
}

export const tokenIds = (text: string) =>
   [...text.matchAll(TOKEN)].map((m) => m[1]);

export const stripTokens = (text: string) => text.replace(TOKEN, " ");

/** Runs of digits a text carries outside its tokens. */
export function bareNumbers(text: string): string[] {
   return [...stripTokens(text).matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]);
}
