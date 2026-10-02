// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The chart layer. Every colour, font and size is read from the stylesheet's
// tokens at draw time (see style.css), so no config below carries a literal.

import { color, s, token } from "./dom.js";
import { gameClock } from "./format.js";

const charts = new WeakMap();

const px = (name) => Number.parseFloat(token(name)) || 11;

function theme() {
   return {
      text: color("--text"),
      text2: color("--text-2"),
      text3: color("--text-3"),
      text4: color("--text-4"),
      grid: color("--grid"),
      border: color("--border"),
      up: color("--up"),
      down: color("--down"),
      panel: color("--panel"),
      sans: token("--font-sans"),
      mono: token("--font-mono"),
      fs1: px("--fs-1"),
      fs2: px("--fs-2"),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => color(`--series-${i}`)),
   };
}

/** A position's colour token: QB purple, RB green, WR orange, TE blue. */
export const posColor = (position) => color(["QB", "RB", "WR", "TE", "K"].includes(position) ? `--pos-${position}` : "--pos-other");

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

/** Round-number ticks (1, 2, 2.5 or 5 × 10ⁿ apart) that fall inside [lo, hi]. */
export function niceTicks(lo, hi, count = 5) {
   if (!(hi > lo)) return [lo];
   const raw = (hi - lo) / Math.max(1, count - 1);
   const mag = 10 ** Math.floor(Math.log10(raw));
   const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw);
   const out = [];
   for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
   return out;
}

function valueAxis(t, { format = (v) => v, position = "left", min, max, ticks = 5, zeroLine = false, grace = "6%" } = {}) {
   return {
      position,
      min,
      max,
      beginAtZero: true,
      grace,
      grid: { color: (ctx) => (zeroLine && ctx.tick?.value === 0 ? t.text3 : t.grid), drawTicks: false },
      border: { display: false },
      ticks: { padding: 6, maxTicksLimit: ticks, font: { family: t.mono, size: t.fs1 }, callback: (v) => format(v) },
      afterBuildTicks(scale) {
         scale.ticks = niceTicks(scale.min, scale.max, ticks + 1).map((value) => ({ value }));
      },
   };
}

function categoryAxis(t, { tick, mono = true, autoSkip = true } = {}) {
   return {
      type: "category",
      grid: { display: false },
      border: { color: t.border },
      ticks: {
         autoSkip,
         maxRotation: 0,
         font: { family: mono ? t.mono : t.sans, size: t.fs1 },
         callback(value) {
            const label = this.getLabelForValue(value);
            return tick ? tick(label) : label;
         },
      },
   };
}

function tooltip(t, { title, label } = {}) {
   return {
      backgroundColor: t.panel,
      borderColor: t.border,
      borderWidth: 1,
      titleColor: t.text,
      bodyColor: t.text2,
      titleFont: { family: t.sans, size: t.fs2, weight: "600" },
      bodyFont: { family: t.mono, size: t.fs2 },
      padding: 8,
      cornerRadius: 6,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
      boxPadding: 4,
      callbacks: { title, label },
   };
}

const base = () => ({
   responsive: true,
   maintainAspectRatio: false,
   animation: { duration: 160 },
   interaction: { mode: "index", intersect: false },
   layout: { padding: { left: 0, right: 4, top: 6, bottom: 0 } },
   plugins: { legend: { display: false } },
});

/**
 * Bars on a category axis. `colors` is one per bar or one for all; `stacks`
 * draws several datasets stacked instead: [{ label, values, color }].
 */
export function barChart(canvas, { labels, values, colors, stacks, format, axisFormat = format, horizontal = false, tick, onClick }) {
   const t = theme();
   const datasets = stacks
      ? stacks.map((st) => ({ label: st.label, data: st.values, backgroundColor: st.color, stack: "all", borderRadius: 1, maxBarThickness: 28 }))
      : [{ label: "", data: values, backgroundColor: colors ?? t.series[0], borderRadius: 1, maxBarThickness: 26, categoryPercentage: 0.8, barPercentage: 0.9 }];
   const vAxis = { ...valueAxis(t, { format: axisFormat, position: horizontal ? "bottom" : "left", zeroLine: true }), stacked: Boolean(stacks) };
   const cAxis = { ...categoryAxis(t, { tick, mono: !horizontal, autoSkip: !horizontal }), stacked: Boolean(stacks) };
   return draw(canvas, {
      type: "bar",
      data: { labels, datasets },
      options: {
         ...base(),
         indexAxis: horizontal ? "y" : "x",
         interaction: { mode: "index", intersect: false, axis: horizontal ? "y" : "x" },
         onClick: onClick ? (_e, el) => el[0] && onClick(el[0].index) : undefined,
         onHover: onClick ? (e, el) => (e.native.target.style.cursor = el.length ? "pointer" : "default") : undefined,
         scales: horizontal ? { y: cAxis, x: vAxis } : { x: cAxis, y: vAxis },
         plugins: {
            legend: { display: false },
            tooltip: tooltip(t, {
               title: (i) => (tick ? tick(i[0]?.label) : i[0]?.label),
               label: (i) => ` ${i.dataset.label ? `${i.dataset.label} ` : ""}${format(horizontal ? i.parsed.x : i.parsed.y)}`,
            }),
         },
      },
   });
}

/** Lines over a category axis. series: [{ label, values, color, dashed? }] */
export function lineChart(canvas, { labels, series, format, tick }) {
   const t = theme();
   return draw(canvas, {
      type: "line",
      data: {
         labels,
         datasets: series.map((sr, i) => ({
            label: sr.label,
            data: sr.values,
            borderColor: sr.color ?? t.series[i % t.series.length],
            backgroundColor: sr.color ?? t.series[i % t.series.length],
            borderWidth: 1.75,
            borderDash: sr.dashed ? [4, 3] : undefined,
            pointRadius: 2.5,
            pointHoverRadius: 4,
            tension: 0,
            spanGaps: true,
         })),
      },
      options: {
         ...base(),
         scales: { x: categoryAxis(t, { tick, autoSkip: false }), y: valueAxis(t, { format }) },
         plugins: {
            legend: { display: false },
            tooltip: tooltip(t, { title: (i) => (tick ? tick(i[0]?.label) : i[0]?.label), label: (i) => ` ${i.dataset.label} ${format(i.parsed.y)}` }),
         },
      },
   });
}

const CLOCK_MARKS = [0, 900, 1800, 2700, 3600];

/**
 * The site's "Fantasy points by game": each game's points accumulating over
 * the game clock, Kick-Off to Final, as a step line. Every game is drawn
 * faintly; `highlight` (a game key) is drawn in the position's colour on top,
 * and `ppg` is a dashed reference line at the season's points per game.
 * games: [{ key, label, points: [{ t, cum }] }] with t in seconds elapsed.
 */
export function gameFlowChart(canvas, { games, highlight, ppg, color, onPick }) {
   const t = theme();
   const end = Math.max(3600, ...games.flatMap((g) => g.points.map((p) => p.t)));
   const all = games.flatMap((g) => g.points.map((p) => p.cum));
   const lo = Math.min(0, Math.floor(Math.min(0, ...all) / 5) * 5);
   const hi = Math.ceil(Math.max(5, ...all, Number.isFinite(ppg) ? ppg : 0) / 5) * 5;
   const datasets = games.map((g) => {
      const on = g.key === highlight;
      return {
         label: g.label,
         key: g.key,
         data: [{ x: 0, y: 0 }, ...g.points.map((p) => ({ x: p.t, y: p.cum })), { x: end, y: g.points.at(-1)?.cum ?? 0 }],
         borderColor: on ? color : t.border,
         borderWidth: on ? 2.25 : 1,
         stepped: "before",
         pointRadius: 0,
         pointHoverRadius: on ? 3 : 0,
         order: on ? 0 : 1,
      };
   });
   if (Number.isFinite(ppg)) {
      datasets.push({
         label: "Pts / game",
         guide: true,
         data: [
            { x: 0, y: ppg },
            { x: end, y: ppg },
         ],
         borderColor: t.text3,
         borderWidth: 1,
         borderDash: [4, 4],
         pointRadius: 0,
         order: 2,
      });
   }
   return draw(canvas, {
      type: "line",
      data: { datasets },
      options: {
         ...base(),
         interaction: { mode: "nearest", intersect: false, axis: "xy" },
         onClick: onPick
            ? (_e, el) => {
                 const ds = el[0] && datasets[el[0].datasetIndex];
                 if (ds && !ds.guide) onPick(ds.key);
              }
            : undefined,
         scales: {
            x: {
               type: "linear",
               min: 0,
               max: end,
               grid: { color: (ctx) => (CLOCK_MARKS.includes(ctx.tick?.value) ? t.grid : "transparent"), drawTicks: false },
               border: { color: t.border },
               afterBuildTicks(scale) {
                  scale.ticks = CLOCK_MARKS.map((value) => ({ value }));
               },
               ticks: { padding: 6, font: { family: t.mono, size: t.fs1 }, callback: (v) => gameClock(v) },
            },
            y: valueAxis(t, { format: (v) => String(v), min: lo, max: hi, grace: 0, zeroLine: true }),
         },
         plugins: {
            legend: { display: false },
            tooltip: {
               ...tooltip(t, {
                  title: (items) => items[0]?.dataset.label,
                  label: (item) => ` ${gameClock(item.parsed.x)}  ${item.parsed.y.toFixed(1)} pts`,
               }),
               filter: (item) => !item.dataset.guide,
            },
         },
      },
   });
}

/** A tiny bar sparkline of weekly points; bars at or above `mark` use the position colour. */
export function sparkBars(values, { width = 96, height = 20, mark, color = "var(--text-3)" } = {}) {
   const svg = s("svg", { class: "spark", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", "aria-hidden": "true" });
   const hi = Math.max(1, ...values.filter((v) => typeof v === "number"));
   const step = width / Math.max(1, values.length);
   values.forEach((v, i) => {
      if (typeof v !== "number") return;
      const bh = Math.max(1, (v / hi) * (height - 1));
      svg.append(
         s("rect", {
            x: (i * step + 0.6).toFixed(1),
            y: (height - bh).toFixed(1),
            width: Math.max(1, step - 1.2).toFixed(1),
            height: bh.toFixed(1),
            rx: 0.6,
            fill: mark !== undefined && v >= mark ? color : "var(--g7)",
         }),
      );
   });
   return svg;
}
