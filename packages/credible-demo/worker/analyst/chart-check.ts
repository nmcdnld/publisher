// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// A model-written chart is built and rendered headless before it is kept, so a
// program that would break in the card is caught here, with the error to
// repair: TanStack programs compile to a scene, Chart.js programs run in a
// real Chart on a canvas that draws nothing.

import { createChartScene } from "@tanstack/charts";
import { renderChartSvg } from "@tanstack/charts/svg";
import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { chartJsConfig } from "@malloy-publisher/app-manifest/analyst/chart-chartjs";
import {
   HEADLESS_THEME,
   type BoundProgram,
} from "@malloy-publisher/app-manifest/analyst/chart-program";
import {
   POINT_MARKS,
   tanstackDefinition,
} from "../../src/analyst/chart-tanstack";

Chart.register(...registerables);

/** A 2D context that accepts every call and measures text roughly. */
function stubContext() {
   const state: Record<PropertyKey, unknown> = {};
   return new Proxy(state, {
      get(t, k) {
         if (k in t) return t[k];
         switch (k) {
            case "measureText":
               return (s: unknown) => ({
                  width: String(s ?? "").length * 6,
                  actualBoundingBoxAscent: 8,
                  actualBoundingBoxDescent: 2,
               });
            case "getLineDash":
               return () => [];
            case "isPointInPath":
            case "isPointInStroke":
               return () => false;
            case "createLinearGradient":
            case "createRadialGradient":
            case "createConicGradient":
            case "createPattern":
               return () => ({ addColorStop() {} });
            case "getTransform":
               return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
            default:
               return () => {};
         }
      },
      set(t, k, v) {
         t[k] = v;
         return true;
      },
   });
}

function tanstackIssues(program: BoundProgram): string[] {
   const { definition, marks } = tanstackDefinition(program, HEADLESS_THEME);
   const scene = createChartScene(definition as never, {
      width: 640,
      height: 300,
   });
   renderChartSvg(scene, {
      ariaLabel: typeof program.title === "string" ? program.title : "Chart",
   });
   const drawn = new Set(scene.points.map((p) => p.markId));
   const issues = marks
      .filter((m) => POINT_MARKS.has(m.mark) && !drawn.has(m.id))
      .map((m) =>
         m.rows
            ? `${m.mark} (marks[${m.id.slice(1)}]) drew nothing from ${m.rows} rows: check its x and y fields and scales`
            : `${m.mark} (marks[${m.id.slice(1)}]) has no rows: check its table's steps and filter`,
      );
   if (!scene.nodes.length) issues.push("The chart drew nothing");
   return issues;
}

function chartJsIssues(program: BoundProgram): string[] {
   const { config, datasets } = chartJsConfig(program, HEADLESS_THEME);
   const ctx = stubContext();
   const canvas = { width: 640, height: 300, style: {}, getContext: () => ctx };
   (ctx as Record<string, unknown>).canvas = canvas;
   const chart = new Chart(
      canvas as never,
      {
         ...config,
         options: { ...config.options, responsive: false, animation: false },
      } as unknown as ChartConfiguration,
   );
   try {
      return datasets.flatMap((d, i) => {
         const meta = chart.getDatasetMeta(i);
         const values = meta.data.length;
         if (!d.rows) return [`data.datasets[${i}] (${d.label}) has no rows`];
         if (!values)
            return [
               `data.datasets[${i}] (${d.label}) drew nothing from ${d.rows} rows: check its parsing keys`,
            ];
         return [];
      });
   } finally {
      chart.destroy();
   }
}

/** Build and render errors for a program with its rows already bound. */
export function chartRunIssues(program: BoundProgram): string[] {
   try {
      return program.library === "chartjs"
         ? chartJsIssues(program)
         : tanstackIssues(program);
   } catch (e) {
      return [`The chart fails to build: ${(e as Error).message}`];
   }
}
