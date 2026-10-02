// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The chart layer. Every colour, font and size is read from the stylesheet's
// tokens at draw time (see style.css), so no config below carries a literal.
//
// Candles are Chart.js floating bars: a thin bar from low to high (the wick)
// under a wider one from open to close (the body), with `grouped: false` so
// the two share a slot. That keeps the vendored library to Chart.js itself,
// with no financial plugin to vendor beside it.

import { color, s, token } from "./dom.js";
import { shortDay } from "./format.js";

const charts = new WeakMap();

const px = (name) => Number.parseFloat(token(name)) || 11;

function theme() {
   return {
      text: color("--text"),
      text2: color("--text-2"),
      text3: color("--text-3"),
      grid: color("--grid"),
      border: color("--border"),
      up: color("--up"),
      down: color("--down"),
      upSoft: color("--up-soft"),
      downSoft: color("--down-soft"),
      flat: color("--flat"),
      accent: color("--accent"),
      brand: color("--brand"),
      panel: color("--panel"),
      sans: token("--font-sans"),
      mono: token("--font-mono"),
      fs1: px("--fs-1"),
      fs2: px("--fs-2"),
      fs3: px("--fs-3"),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => color(`--series-${i}`)),
   };
}

/** Width every y axis is fitted to, so stacked panels line their x axes up. */
const Y_WIDTH = 60;

export function release(canvas) {
   charts.get(canvas)?.destroy();
   charts.delete(canvas);
}

function draw(canvas, config) {
   release(canvas);
   const t = theme();
   Chart.defaults.font.family = t.sans;
   Chart.defaults.font.size = t.fs2;
   Chart.defaults.color = t.text3;
   const chart = new Chart(canvas, config);
   charts.set(canvas, chart);
   return chart;
}

function xAxis(t, labels, { show = true, maxTicks = 8, tick = shortDay } = {}) {
   return {
      type: "category",
      labels,
      offset: true,
      grid: { display: false },
      border: { color: t.border },
      ticks: {
         display: show,
         autoSkip: true,
         maxTicksLimit: maxTicks,
         maxRotation: 0,
         font: { family: t.mono, size: t.fs1 },
         callback(value) {
            return tick(this.getLabelForValue(value));
         },
      },
   };
}

/** Round-number ticks (1, 2, 2.5 or 5 × 10ⁿ apart) that fall inside [lo, hi]. */
export function niceTicks(lo, hi, count = 5) {
   if (!(hi > lo)) return [lo];
   const raw = (hi - lo) / Math.max(1, count - 1);
   const mag = 10 ** Math.floor(Math.log10(raw));
   const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
   const out = [];
   for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
   return out;
}

// `bounds: "data"` fits the axis to the series instead of rounding out to the
// next tick, which on a price chart can leave a third of the pane empty. Chart.js
// then counts ticks up from the data's minimum (293.35, 393.35, …), so the ticks
// are rebuilt on round numbers inside the fitted range. `levels` pins them to
// fixed values instead, for an oscillator's 30/50/70.
function yAxis(t, { format = (v) => v, position = "right", grace = "4%", min, max, ticks = 5, levels } = {}) {
   return {
      position,
      min,
      max,
      grace,
      beginAtZero: false,
      bounds: "data",
      grid: { color: t.grid, drawTicks: false },
      border: { display: false },
      ticks: { padding: 6, maxTicksLimit: ticks, font: { family: t.mono, size: t.fs1 }, callback: (v) => format(v) },
      afterBuildTicks(scale) {
         const values = levels ?? niceTicks(scale.min, scale.max, ticks + 1);
         scale.ticks = values.map((value) => ({ value }));
      },
      afterFit(scale) {
         scale.width = Y_WIDTH;
      },
   };
}

function tooltip(t, { title, label } = {}) {
   return {
      backgroundColor: t.text,
      titleColor: t.panel,
      bodyColor: t.panel,
      titleFont: { family: t.mono, size: t.fs2, weight: "600" },
      bodyFont: { family: t.mono, size: t.fs2 },
      padding: 8,
      cornerRadius: 3,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      callbacks: { title, label },
   };
}

const base = () => ({
   responsive: true,
   maintainAspectRatio: false,
   animation: { duration: 180 },
   interaction: { mode: "index", intersect: false },
   layout: { padding: { left: 4, right: 0, top: 6, bottom: 0 } },
   plugins: { legend: { display: false } },
});

/**
 * OHLC candles with moving-average overlays and signal markers.
 * bars: [{ day, open, high, low, close }], overlays: [{ label, values, color }],
 * markers: [{ index, bias: "Bullish" | "Bearish", label }]
 */
export function candleChart(canvas, { bars, overlays = [], markers = [], format }) {
   const t = theme();
   const labels = bars.map((b) => b.day);
   const colorOf = (b) => (b.close >= b.open ? t.up : t.down);
   const markerAt = (bias) => {
      const out = new Array(bars.length).fill(null);
      const names = new Array(bars.length).fill(null);
      for (const m of markers) {
         if (m.bias !== bias || !bars[m.index]) continue;
         const b = bars[m.index];
         const span = b.high - b.low || b.close * 0.01;
         out[m.index] = bias === "Bullish" ? b.low - span * 0.9 : b.high + span * 0.9;
         names[m.index] = names[m.index] ? `${names[m.index]}, ${m.label}` : m.label;
      }
      return { out, names };
   };
   const bull = markerAt("Bullish");
   const bear = markerAt("Bearish");

   return draw(canvas, {
      data: {
         labels,
         datasets: [
            {
               type: "bar",
               label: "Range",
               data: bars.map((b) => [b.low, b.high]),
               backgroundColor: bars.map(colorOf),
               barThickness: 1,
               grouped: false,
               order: 3,
            },
            {
               type: "bar",
               label: "Body",
               data: bars.map((b) => {
                  const lo = Math.min(b.open, b.close);
                  const hi = Math.max(b.open, b.close);
                  return [lo, hi === lo ? hi + b.close * 0.0005 : hi];
               }),
               backgroundColor: bars.map(colorOf),
               categoryPercentage: 0.8,
               barPercentage: 0.9,
               maxBarThickness: 9,
               grouped: false,
               order: 2,
            },
            ...overlays.map((o) => ({
               type: "line",
               label: o.label,
               data: o.values,
               borderColor: o.color,
               borderWidth: 1.25,
               pointRadius: 0,
               spanGaps: true,
               order: 1,
            })),
            {
               type: "line",
               label: "Bullish signal",
               data: bull.out,
               showLine: false,
               pointStyle: "triangle",
               pointRadius: 5,
               pointBackgroundColor: t.up,
               pointBorderColor: t.panel,
               order: 0,
            },
            {
               type: "line",
               label: "Bearish signal",
               data: bear.out,
               showLine: false,
               pointStyle: "triangle",
               rotation: 180,
               pointRadius: 5,
               pointBackgroundColor: t.down,
               pointBorderColor: t.panel,
               order: 0,
            },
         ],
      },
      options: {
         ...base(),
         scales: { x: xAxis(t, labels, { show: false }), y: yAxis(t, { format }) },
         plugins: {
            legend: { display: false },
            tooltip: {
               ...tooltip(t, {
                  title: (items) => items[0]?.label,
                  label(item) {
                     const b = bars[item.dataIndex];
                     if (item.dataset.label === "Body")
                        return ` O ${format(b.open)}  H ${format(b.high)}  L ${format(b.low)}  C ${format(b.close)}`;
                     if (item.dataset.label === "Range") return null;
                     if (item.dataset.label === "Bullish signal") return ` ▲ ${bull.names[item.dataIndex]}`;
                     if (item.dataset.label === "Bearish signal") return ` ▼ ${bear.names[item.dataIndex]}`;
                     return ` ${item.dataset.label} ${format(item.parsed.y)}`;
                  },
               }),
               filter: (item) => item.raw !== null && item.dataset.label !== "Range",
            },
         },
      },
   });
}

/** Volume bars under the candles, coloured by the session's direction. */
export function volumeChart(canvas, { bars, format }) {
   const t = theme();
   const labels = bars.map((b) => b.day);
   return draw(canvas, {
      type: "bar",
      data: {
         labels,
         datasets: [
            {
               label: "Volume",
               data: bars.map((b) => b.volume),
               backgroundColor: bars.map((b) => (b.close >= b.open ? t.upSoft : t.downSoft)),
               borderColor: bars.map((b) => (b.close >= b.open ? t.up : t.down)),
               borderWidth: { top: 1, left: 0, right: 0, bottom: 0 },
               categoryPercentage: 0.8,
               barPercentage: 0.9,
               maxBarThickness: 9,
            },
         ],
      },
      options: {
         ...base(),
         scales: { x: xAxis(t, labels), y: { ...yAxis(t, { format, ticks: 3, grace: 0, min: 0 }), bounds: "ticks" } },
         plugins: {
            legend: { display: false },
            tooltip: tooltip(t, { title: (i) => i[0]?.label, label: (i) => ` Volume ${format(i.parsed.y)}` }),
         },
      },
   });
}

/**
 * Lines over a shared date axis. series: [{ label, values, color?, dashed?, fill? }]
 * guides: [{ value, label }] draw flat reference lines (RSI 30 and 70).
 */
export function lineChart(canvas, { labels, series, format, guides = [], showX = true, min, max, levels, xLabel = shortDay }) {
   const t = theme();
   const datasets = series.map((sr, i) => ({
      type: "line",
      label: sr.label,
      data: sr.values,
      borderColor: sr.color ?? t.series[i % t.series.length],
      backgroundColor: sr.fill ?? "transparent",
      fill: sr.fill ? "origin" : false,
      borderWidth: sr.width ?? 1.5,
      borderDash: sr.dashed ? [4, 3] : undefined,
      pointRadius: 0,
      spanGaps: false,
      tension: 0,
   }));
   for (const g of guides) {
      datasets.push({
         type: "line",
         label: g.label,
         data: labels.map(() => g.value),
         borderColor: g.color ?? t.text3,
         borderWidth: 1,
         borderDash: [2, 3],
         pointRadius: 0,
         guide: true,
      });
   }
   return draw(canvas, {
      data: { labels, datasets },
      options: {
         ...base(),
         scales: { x: xAxis(t, labels, { show: showX, tick: xLabel }), y: yAxis(t, { format, min, max, levels }) },
         plugins: {
            legend: { display: false },
            tooltip: {
               ...tooltip(t, {
                  title: (i) => xLabel(i[0]?.label),
                  label: (i) => ` ${i.dataset.label} ${format(i.parsed.y)}`,
               }),
               filter: (item) => !item.dataset.guide && item.raw !== null,
            },
         },
      },
   });
}

/**
 * Bars on a category axis. `colors` is one per bar; `horizontal` ranks
 * categories down the page. `zero` draws the axis line at 0 for a diverging
 * chart, so negative and positive read as two directions from one origin.
 */
export function barChart(canvas, { labels, values, colors, format, horizontal = false, axisFormat = format, tickLabel, onClick, dates = false }) {
   const t = theme();
   const valueAxis = {
      ...yAxis(t, { format: axisFormat, position: horizontal ? "bottom" : "right", grace: "6%" }),
      bounds: "ticks",
      beginAtZero: true,
      grid: {
         color: (ctx) => (ctx.tick?.value === 0 ? t.text3 : t.grid),
         drawTicks: false,
      },
   };
   if (horizontal) delete valueAxis.afterFit;
   const catAxis = {
      type: "category",
      grid: { display: false },
      border: { color: t.border },
      ticks: {
         autoSkip: !horizontal,
         maxRotation: 0,
         font: { family: horizontal ? t.sans : t.mono, size: t.fs1 },
         callback(value) {
            const label = this.getLabelForValue(value);
            return tickLabel ? tickLabel(label) : dates ? shortDay(label) : label;
         },
      },
   };
   return draw(canvas, {
      type: "bar",
      data: {
         labels,
         datasets: [
            {
               data: values,
               backgroundColor: colors ?? t.accent,
               categoryPercentage: 0.82,
               barPercentage: 0.92,
               maxBarThickness: 26,
               borderRadius: 1,
            },
         ],
      },
      options: {
         ...base(),
         indexAxis: horizontal ? "y" : "x",
         interaction: { mode: "nearest", intersect: horizontal ? false : true, axis: horizontal ? "y" : "x" },
         onClick: onClick
            ? (_e, elements) => {
                 if (elements[0]) onClick(elements[0].index);
              }
            : undefined,
         onHover: onClick
            ? (e, elements) => {
                 e.native.target.style.cursor = elements.length ? "pointer" : "default";
              }
            : undefined,
         scales: horizontal ? { y: catAxis, x: valueAxis } : { x: catAxis, y: valueAxis },
         plugins: {
            legend: { display: false },
            tooltip: tooltip(t, {
               title: (i) => (tickLabel ? tickLabel(i[0]?.label) : i[0]?.label),
               label: (i) => ` ${format(horizontal ? i.parsed.x : i.parsed.y)}`,
            }),
         },
      },
   });
}

/** Read a series colour token for script-built swatches. */
export const seriesColor = (i) => color(`--series-${(i % 8) + 1}`);

/** A tiny SVG polyline, coloured by whether the series ended above where it began. */
export function sparkline(values, { width = 120, height = 26 } = {}) {
   const clean = values.filter((v) => typeof v === "number");
   const svg = s("svg", { class: "spark", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", "aria-hidden": "true" });
   if (clean.length < 2) return svg;
   const lo = Math.min(...clean);
   const hi = Math.max(...clean);
   const span = hi - lo || 1;
   const step = width / (clean.length - 1);
   const pts = clean.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`);
   const stroke = clean.at(-1) >= clean[0] ? "var(--up)" : "var(--down)";
   const soft = clean.at(-1) >= clean[0] ? "var(--up-soft)" : "var(--down-soft)";
   svg.append(
      s("polygon", { points: `0,${height} ${pts.join(" ")} ${width},${height}`, fill: soft, opacity: 0.7 }),
      s("polyline", { points: pts.join(" "), fill: "none", stroke, "stroke-width": 1.25, "vector-effect": "non-scaling-stroke" }),
   );
   return svg;
}
