// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "react";
import type { ChartTheme } from "@malloy-publisher/app-manifest/analyst/chart-program";

/** Any CSS color as rgb(a), since canvas gradients and alpha math can't read oklch. */
function toRgb(color: string, ctx: CanvasRenderingContext2D) {
   ctx.clearRect(0, 0, 1, 1);
   ctx.fillStyle = "#000";
   ctx.fillStyle = color;
   ctx.fillRect(0, 0, 1, 1);
   const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
   return a === 255
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`;
}

/** The live theme as chart colors, read from the app's CSS variables. */
export function readChartTheme(): ChartTheme {
   const css = getComputedStyle(document.documentElement);
   const canvas = document.createElement("canvas");
   canvas.width = canvas.height = 1;
   const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
   const v = (name: string) => toRgb(css.getPropertyValue(name).trim(), ctx);
   const series = [1, 2, 3, 4, 5].map((i) => v(`--chart-${i}`));
   const theme = {
      series,
      positive: v("--positive"),
      negative: v("--negative"),
      foreground: v("--foreground"),
      muted: v("--muted-foreground"),
      grid: v("--border"),
      background: v("--background"),
      font: getComputedStyle(document.body).fontFamily,
   };
   const tokens: Record<string, string> = {
      "@positive": theme.positive,
      "@negative": theme.negative,
      "@muted": theme.muted,
      "@foreground": theme.foreground,
      "@grid": theme.grid,
      "@background": theme.background,
   };
   series.forEach((c, i) => (tokens[`@series${i + 1}`] = c));
   return { ...theme, tokens };
}

/** Bumps when the theme changes: the .dark class or the workspace theme style. */
export function useThemeVersion() {
   const [version, setVersion] = useState(0);
   useEffect(() => {
      const bump = () => setVersion((v) => v + 1);
      const obs = new MutationObserver(bump);
      obs.observe(document.documentElement, {
         attributes: true,
         attributeFilter: ["class", "style"],
      });
      obs.observe(document.head, {
         childList: true,
         characterData: true,
         subtree: true,
      });
      return () => obs.disconnect();
   }, []);
   return version;
}
