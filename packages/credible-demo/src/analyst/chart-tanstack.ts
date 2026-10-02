// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A "tanstack" chart program as a TanStack Charts definition: its marks are
// the library's mark functions by name, called with the program's options,
// so any layering the grammar allows is available.

import {
   areaX,
   areaY,
   arrow,
   barX,
   barY,
   boxX,
   boxY,
   cell,
   crosshair,
   d3Curve,
   defineChart,
   differenceY,
   dot,
   frame,
   lineX,
   lineY,
   linearRegressionY,
   link,
   rect,
   ruleX,
   ruleY,
   text,
   tickX,
   tickY,
} from "@tanstack/charts";
import { colorLegend } from "@tanstack/charts/legend";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLog, scaleSqrt, scaleSymlog, scaleUtc } from "d3-scale";
import {
   curveBasis,
   curveCatmullRom,
   curveLinear,
   curveMonotoneX,
   curveMonotoneY,
   curveNatural,
   curveStep,
   curveStepAfter,
   curveStepBefore,
} from "d3-shape";
import {
   buildTables,
   ChartError,
   checkField,
   checkFormat,
   evaluate,
   formatValue,
   isConditional,
   resolveToken,
   tableRows,
   toDate,
   type BoundProgram,
   type ChartRow,
   type ChartTheme,
   type Expr,
} from "@malloy-publisher/app-manifest/analyst/chart-program";

type MarkFn = (data: Iterable<unknown>, options?: never) => unknown;

const MARKS: Record<string, MarkFn> = {
   lineY: lineY as never,
   lineX: lineX as never,
   areaY: areaY as never,
   areaX: areaX as never,
   barY: barY as never,
   barX: barX as never,
   rect: rect as never,
   cell: cell as never,
   dot: dot as never,
   ruleX: ruleX as never,
   ruleY: ruleY as never,
   tickX: tickX as never,
   tickY: tickY as never,
   text: text as never,
   link: link as never,
   arrow: arrow as never,
   differenceY: differenceY as never,
   boxY: boxY as never,
   boxX: boxX as never,
   linearRegressionY: linearRegressionY as never,
};
const DATALESS: Record<string, (options?: never) => unknown> = {
   frame: frame as never,
   crosshair: crosshair as never,
};
export const TANSTACK_MARKS = [...Object.keys(MARKS), ...Object.keys(DATALESS)];

/** Marks that draw one point per row, so an empty scene means a broken mark. */
export const POINT_MARKS = new Set([
   "lineY",
   "lineX",
   "areaY",
   "areaX",
   "barY",
   "barX",
   "dot",
   "rect",
   "cell",
]);

const CHANNELS = new Set([
   "x",
   "y",
   "x1",
   "x2",
   "y1",
   "y2",
   "z",
   "color",
   "key",
   "text",
   "r",
]);
const PAINTS = new Set(["fill", "stroke"]);
/** Marks whose fill and stroke are constants, not per-row channels. */
const CONSTANT_PAINT = new Set(["dot", "lineY", "lineX", "areaY", "areaX"]);
const VISUALS = new Set(["anchor", "rotate", "dx", "dy", "strokeDasharray"]);

const CURVES = {
   linear: curveLinear,
   monotoneX: curveMonotoneX,
   monotoneY: curveMonotoneY,
   natural: curveNatural,
   catmullRom: curveCatmullRom,
   basis: curveBasis,
   step: curveStep,
   stepAfter: curveStepAfter,
   stepBefore: curveStepBefore,
};

const SCALES = {
   linear: scaleLinear,
   band: scaleBand,
   point: scalePoint,
   utc: scaleUtc,
   time: scaleUtc,
   log: scaleLog,
   sqrt: scaleSqrt,
   symlog: scaleSymlog,
} as const;
export const SCALE_TYPES = Object.keys(SCALES);

type Spec = Record<string, unknown>;

const accessor =
   (e: Expr) =>
   (d: unknown): never =>
      evaluate(e, d as ChartRow) as never;

/** The renderer writes a dash pattern into an SVG attribute, so it must be a string. */
const dashPattern = (v: unknown) =>
   v == null ? undefined : Array.isArray(v) ? v.join(" ") : String(v);

function markOptions(
   mark: string,
   spec: Spec,
   rows: ChartRow[] | undefined,
   theme: ChartTheme,
   where: string,
) {
   const out: Record<string, unknown> = {};
   for (const [k, v] of Object.entries(spec)) {
      if (["mark", "data", "values", "filter", "format"].includes(k)) continue;
      const at = `${where}.${k}`;
      if (CHANNELS.has(k)) {
         if (typeof v === "string") {
            if (rows) checkField(rows, v, at);
            out[k] =
               k === "text" && typeof spec.format === "string"
                  ? (d: ChartRow) => formatValue(d[v], spec.format as string)
                  : v;
         } else if (typeof v === "number") out[k] = v;
         else if (Array.isArray(v) || (v && typeof v === "object")) {
            const f = accessor(v as Expr);
            out[k] =
               k === "text" && typeof spec.format === "string"
                  ? (d: ChartRow) => formatValue(f(d), spec.format as string)
                  : f;
         } else
            throw new ChartError(`${at}: a field name, number, or expression`);
      } else if (PAINTS.has(k)) {
         if (isConditional(v)) {
            if (CONSTANT_PAINT.has(mark))
               throw new ChartError(
                  `${at}: ${mark} takes one ${k} color; use a color channel, or split it into marks over filtered rows`,
               );
            out[k] = (d: ChartRow) =>
               resolveToken(evaluate(v, d), theme) as never;
         } else if (typeof v === "string") out[k] = resolveToken(v, theme);
         else
            throw new ChartError(
               `${at}: a color, token, or {"if", "then", "else"}`,
            );
      } else if (k === "strokeDasharray") {
         out[k] = isConditional(v)
            ? (d: ChartRow) => dashPattern(evaluate(v, d)) as never
            : dashPattern(v);
      } else if (VISUALS.has(k) && isConditional(v)) {
         out[k] = (d: ChartRow) => evaluate(v, d) as never;
      } else if (k === "curve") {
         const c = CURVES[v as keyof typeof CURVES];
         if (!c)
            throw new ChartError(
               `${at}: one of ${Object.keys(CURVES).join(", ")}`,
            );
         out.curve = d3Curve(c);
      } else if (k === "radius" && isConditional(v)) {
         out.radius = (d: ChartRow) => evaluate(v, d);
      } else if (
         v === null ||
         ["number", "boolean", "string"].includes(typeof v)
      ) {
         out[k] = v;
      } else if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
         out[k] = v;
      } else {
         throw new ChartError(
            `${at}: unsupported option value ${JSON.stringify(v)}`,
         );
      }
   }
   return out;
}

const formatter = (format: unknown) =>
   typeof format === "string"
      ? (v: unknown) => formatValue(v, format)
      : undefined;

function scaleOptions(
   spec: unknown,
   name: string,
   inferred: "utc" | "band" | "point" | "linear",
   compact: boolean,
): Spec | null {
   if (spec === null) return null;
   const s = (spec ?? {}) as Spec;
   const where = `scales.${name}`;
   const type = (s.type as keyof typeof SCALES) ?? inferred;
   const factory = SCALES[type];
   if (!factory)
      throw new ChartError(
         `${where}.type: one of ${Object.keys(SCALES).join(", ")}`,
      );
   checkFormat(s.format, `${where}.format`);
   const domain = Array.isArray(s.domain)
      ? type === "utc" || type === "time"
         ? s.domain.map((d) => toDate(d) ?? d)
         : s.domain
      : undefined;
   const padding = typeof s.padding === "number" ? s.padding : undefined;
   let scale: unknown;
   if (type === "band") {
      scale = () => {
         const b = scaleBand<string>().padding(padding ?? 0.24);
         return domain ? b.domain(domain as string[]) : b;
      };
   } else if (type === "point") {
      scale = () => {
         const p = scalePoint<string>().padding(padding ?? 0.5);
         return domain ? p.domain(domain as string[]) : p;
      };
   } else if (domain) {
      scale = (factory as () => { domain: (d: unknown[]) => unknown })().domain(
         domain as unknown[],
      );
   } else scale = factory;

   const axisSpec = s.axis;
   const label = compact ? undefined : (s.label as string | undefined);
   const format =
      formatter(s.format) ??
      (type === "utc" || type === "time"
         ? (v: unknown) => formatValue(v, "month_year")
         : undefined);
   const ticks = {
      ...(typeof s.ticks === "number" ? { count: s.ticks } : {}),
      ...(format ? { format } : {}),
   };
   return {
      scale,
      ...(typeof s.channel === "string" ? { channel: s.channel } : {}),
      ...(typeof s.side === "string" ? { side: s.side } : {}),
      nice: s.nice ?? (type === "linear" || type === "utc"),
      reverse: !!s.reverse,
      grid:
         s.grid === undefined
            ? name === "y" && type !== "band" && type !== "point"
            : !!s.grid,
      axis:
         axisSpec === false || s.hidden
            ? false
            : {
                 ...(label ? { label } : {}),
                 ticks,
                 ...(typeof s.rotate === "number"
                    ? { tickLabels: { rotate: s.rotate } }
                    : {}),
              },
   };
}

/** What a mark's first row puts on a channel decides the default scale. */
function inferScale(
   marks: { spec: Spec; rows?: ChartRow[] }[],
   channel: "x" | "y",
): "utc" | "band" | "point" | "linear" {
   for (const { spec, rows } of marks) {
      const bound = spec[`${channel}Scale`];
      if (bound && bound !== channel) continue;
      const field = spec[channel] ?? spec[`${channel}1`];
      if (!rows?.length || field === undefined) continue;
      const v =
         typeof field === "string"
            ? rows[0][field]
            : typeof field === "number"
              ? field
              : evaluate(field as Expr, rows[0]);
      if (v instanceof Date) return "utc";
      if (typeof v === "string")
         return spec.mark === "barY" ||
            spec.mark === "barX" ||
            spec.mark === "cell"
            ? "band"
            : "point";
      if (typeof v === "number") return "linear";
   }
   return "linear";
}

export interface TanStackBuild {
   /** Built from JSON, so its datum types are unknown until render. */
   definition: unknown;
   marks: { id: string; mark: string; rows: number }[];
}

export function tanstackDefinition(
   program: BoundProgram,
   theme: ChartTheme,
   { compact = false }: { compact?: boolean } = {},
): TanStackBuild {
   if (!Array.isArray(program.marks) || !program.marks.length)
      throw new ChartError('A tanstack chart needs "marks": [...]');
   const tables = buildTables(program);
   const resolved = (program.marks as Spec[]).map((spec, i) => {
      const where = `marks[${i}]`;
      const mark = spec.mark as string;
      if (!(mark in MARKS) && !(mark in DATALESS))
         throw new ChartError(
            `${where}.mark: "${mark}" is not a mark (marks: ${TANSTACK_MARKS.join(", ")})`,
         );
      let rows: ChartRow[] | undefined;
      let values: number[] | undefined;
      if (mark in MARKS) {
         if (Array.isArray(spec.values)) {
            if (
               !["ruleX", "ruleY", "tickX", "tickY"].includes(mark) ||
               !spec.values.every((v) => typeof v === "number")
            )
               throw new ChartError(
                  `${where}.values: only rule and tick marks take constant numbers; read rows with "data"`,
               );
            values = spec.values as number[];
         } else {
            rows = tableRows(tables, spec.data, `${where}.data`);
            if (spec.filter !== undefined)
               rows = rows.filter((r) => evaluate(spec.filter as Expr, r));
         }
      }
      return { spec, mark, rows, values, where, id: `m${i}` };
   });

   const marks = resolved.map(({ spec, mark, rows, values, where, id }) => {
      const options: Spec = {
         id,
         ...markOptions(mark, spec, rows, theme, where),
      };
      if (mark in DATALESS) return DATALESS[mark](options as never);
      if (rows && !options.key && POINT_MARKS.has(mark))
         options.key = (_: unknown, c: { index: number }) => c.index;
      return MARKS[mark]((values ?? rows)!, options as never);
   });

   const scaleSpecs = (program.scales ?? {}) as Spec;
   const scales: Spec = {
      x: scaleOptions(scaleSpecs.x, "x", inferScale(resolved, "x"), compact),
      y: scaleOptions(scaleSpecs.y, "y", inferScale(resolved, "y"), compact),
   };
   for (const [name, s] of Object.entries(scaleSpecs)) {
      if (name === "x" || name === "y") continue;
      const ch = (s as Spec | null)?.channel;
      if (ch !== "x" && ch !== "y")
         throw new ChartError(
            `scales.${name}: a named scale needs "channel": "x" or "y"`,
         );
      scales[name] = scaleOptions(s, name, "linear", compact);
   }

   const colorSpec = program.color as Spec | undefined;
   const color = colorSpec
      ? {
           ...(Array.isArray(colorSpec.domain)
              ? { domain: colorSpec.domain }
              : {}),
           ...(Array.isArray(colorSpec.range)
              ? {
                   range: colorSpec.range.map((c) =>
                      String(resolveToken(c, theme)),
                   ),
                }
              : {}),
           ...(colorSpec.legend && !compact
              ? {
                   legend: colorLegend({
                      ...(typeof colorSpec.legend === "object"
                         ? (colorSpec.legend as { label?: string })
                         : {}),
                      placement: "top",
                   }),
                }
              : {}),
        }
      : undefined;

   const fmtOf = (name: "x" | "y") =>
      (scaleSpecs[name] as Spec | undefined)?.format as string | undefined;
   const items = Array.isArray(program.tooltip)
      ? (program.tooltip as Spec[]).map((t, i) => {
           checkFormat(t.format, `tooltip[${i}].format`);
           const fmt = t.format as string | undefined;
           if (t.channel === "x" || t.channel === "y") {
              const ch = t.channel;
              return {
                 channel: ch,
                 ...(t.label ? { label: String(t.label) } : {}),
                 text: (p: { xValue: unknown; yValue: unknown }) =>
                    formatValue(ch === "x" ? p.xValue : p.yValue, fmt),
              };
           }
           if (typeof t.field !== "string")
              throw new ChartError(
                 `tooltip[${i}]: give a "field" or "channel": "x" | "y"`,
              );
           const field = t.field;
           return {
              id: `t${i}`,
              label: String(t.label ?? field),
              text: (p: { datum: unknown }) => {
                 const d = p.datum as ChartRow | null;
                 return d && field in d ? formatValue(d[field], fmt) : null;
              },
           };
        })
      : [
           {
              channel: "x",
              text: (p: { xValue: unknown }) =>
                 formatValue(
                    p.xValue,
                    fmtOf("x") ??
                       (p.xValue instanceof Date ? "date" : undefined),
                 ),
           },
           {
              channel: "y",
              text: (p: { yValue: unknown }) =>
                 formatValue(
                    p.yValue,
                    fmtOf("y") ??
                       (p.yValue instanceof Date ? "date" : undefined),
                 ),
           },
        ];

   const focus = [
      "nearest",
      "nearest-x",
      "nearest-y",
      "group-x",
      "group-y",
   ].includes(program.focus as string)
      ? program.focus
      : "nearest";

   const definition = defineChart({
      marks,
      scales,
      ...(color ? { color } : {}),
      ...(typeof program.margin === "number" ||
      typeof program.margin === "object"
         ? { margin: program.margin }
         : {}),
      clip: program.clip === true,
      theme: {
         foreground: theme.foreground,
         muted: theme.muted,
         grid: theme.grid,
         background: "transparent",
         palette: theme.series,
      },
      focus,
      tooltip: { use: tooltip, items },
   } as never);

   return {
      definition,
      marks: resolved.map((m) => ({
         id: m.id,
         mark: m.mark,
         rows: m.rows?.length ?? m.values?.length ?? 0,
      })),
   };
}
