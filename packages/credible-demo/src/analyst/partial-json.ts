// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

/** Closers for whatever is still open at the end of `src`, and whether a string is. */
function scan(src: string) {
   const stack: string[] = [];
   const cuts: number[] = [];
   let inString = false;
   for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inString) {
         if (c === "\\") i++;
         else if (c === '"') inString = false;
         continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") {
         stack.push(c === "{" ? "}" : "]");
         cuts.push(i + 1);
      } else if (c === "}" || c === "]") {
         stack.pop();
         cuts.push(i + 1);
      } else if (c === ",") cuts.push(i);
   }
   return { closers: stack.reverse().join(""), inString, cuts };
}

/**
 * Parses the longest usable prefix of JSON that is still streaming in: an open
 * string is closed where it stands, open arrays and objects are closed, and a
 * dangling key is cut back to the last complete member. Returns undefined
 * until there is a value to show.
 */
export function parsePartialJson(text: string): unknown {
   const src = text.trim();
   if (!src) return undefined;
   try {
      return JSON.parse(src);
   } catch {
      // Repair below.
   }
   const { closers, inString, cuts } = scan(src);
   const head = (inString ? src.replace(/\\$/, "") + '"' : src).replace(
      /[,:]\s*$/,
      "",
   );
   try {
      return JSON.parse(head + closers);
   } catch {
      // Cut back to a structural boundary.
   }
   for (let k = cuts.length - 1; k >= 0; k--) {
      const prefix = src.slice(0, cuts[k]).replace(/,\s*$/, "");
      try {
         return JSON.parse(prefix + scan(prefix).closers);
      } catch {
         // Try the one before.
      }
   }
   return undefined;
}
