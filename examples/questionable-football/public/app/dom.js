// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The only way these pages build markup. Every value lands through
// `textContent` or an attribute, never `innerHTML`, so a player name or a
// play description containing markup renders as text.

const SVG_NS = "http://www.w3.org/2000/svg";

function apply(node, props) {
   for (const [key, value] of Object.entries(props ?? {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.setAttribute("class", value);
      else if (key === "text") node.textContent = String(value);
      else if (key === "style") {
         for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
      } else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : String(value));
   }
}

function append(node, children) {
   for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
   }
}

/** `h("td", { class: "num" }, "1.2%")` */
export function h(tag, props, ...children) {
   const node = document.createElement(tag);
   apply(node, props);
   append(node, children);
   return node;
}

/** The SVG counterpart of `h`, for sparklines and the brand mark. */
export function s(tag, props, ...children) {
   const node = document.createElementNS(SVG_NS, tag);
   apply(node, props);
   append(node, children);
   return node;
}

export const byId = (id) => document.getElementById(id);

/** Read one design token off :root, so script-drawn colour follows the stylesheet. */
export const token = (name) =>
   getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let probe;
let pixel;

/**
 * A colour token as #rrggbbaa. A host theme can hand over oklch() or
 * color-mix() values, which Chart.js cannot parse for its hover shades, so
 * the browser resolves the colour and one painted pixel reads it back.
 */
export function color(name) {
   const value = token(name);
   if (!value) return value;
   probe ??= document.documentElement.appendChild(h("i", { hidden: true }));
   probe.style.color = value;
   pixel ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
   if (!pixel) return value;
   pixel.clearRect(0, 0, 1, 1);
   pixel.fillStyle = "transparent";
   pixel.fillStyle = getComputedStyle(probe).color;
   pixel.fillRect(0, 0, 1, 1);
   const bytes = pixel.getImageData(0, 0, 1, 1).data;
   return `#${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
