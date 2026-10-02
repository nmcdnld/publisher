// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

const MIRRORED = [
   "boxSizing",
   "width",
   "paddingTop",
   "paddingRight",
   "paddingBottom",
   "paddingLeft",
   "borderTopWidth",
   "borderRightWidth",
   "borderBottomWidth",
   "borderLeftWidth",
   "fontFamily",
   "fontSize",
   "fontWeight",
   "fontStyle",
   "letterSpacing",
   "lineHeight",
   "textTransform",
   "wordSpacing",
   "tabSize",
] as const;

/**
 * Where the character at `index` sits inside a textarea, relative to its
 * top-left corner, measured with an off-screen copy that wraps the same way.
 */
export function caretOffset(
   el: HTMLTextAreaElement,
   index: number,
): { top: number; left: number; height: number } {
   const style = getComputedStyle(el);
   const mirror = document.createElement("div");
   for (const p of MIRRORED) mirror.style[p] = style[p];
   Object.assign(mirror.style, {
      position: "absolute",
      visibility: "hidden",
      top: "0",
      left: "-9999px",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
   });
   mirror.textContent = el.value.slice(0, index);
   const marker = document.createElement("span");
   marker.textContent = el.value.slice(index) || ".";
   mirror.appendChild(marker);
   document.body.appendChild(mirror);
   const lineHeight = parseFloat(style.lineHeight) || 20;
   const result = {
      top: marker.offsetTop - el.scrollTop,
      left: marker.offsetLeft - el.scrollLeft,
      height: lineHeight,
   };
   mirror.remove();
   return result;
}

/**
 * The `@query` being typed at the caret, if any: an `@` at the start of the
 * text or after whitespace, with no whitespace between it and the caret.
 */
export function mentionAt(
   text: string,
   caret: number,
): { start: number; query: string } | null {
   const before = text.slice(0, caret);
   const match = before.match(/(^|\s)@([^\s@]*)$/);
   if (!match) return null;
   return { start: caret - match[2].length - 1, query: match[2] };
}

export const escapeRegExp = (s: string) =>
   s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches `@handle` for any of the handles, as a whole token. */
export function mentionPattern(handles: string[]): RegExp | null {
   if (handles.length === 0) return null;
   const alternatives = [...handles]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");
   return new RegExp(`(^|\\s)(@(?:${alternatives}))(?=$|[\\s.,;:!?)])`, "g");
}
