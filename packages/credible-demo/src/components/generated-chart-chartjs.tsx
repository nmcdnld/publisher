// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Chart, registerables, type ChartConfiguration } from "chart.js";
import { useEffect, useRef, useState } from "react";
import { chartJsConfig } from "@malloy-publisher/app-manifest/analyst/chart-chartjs";
import type { BoundProgram } from "@malloy-publisher/app-manifest/analyst/chart-program";
import { readChartTheme, useThemeVersion } from "@/components/chart-theme";
import { ChartFailure } from "@/components/chart-failure";

Chart.register(...registerables);

export default function ChartJsGeneratedChart({
   program,
   compact,
}: {
   program: BoundProgram;
   compact: boolean;
}) {
   const canvas = useRef<HTMLCanvasElement>(null);
   const themeVersion = useThemeVersion();
   const [error, setError] = useState<string>();

   useEffect(() => {
      const el = canvas.current;
      if (!el) return;
      let chart: Chart | undefined;
      try {
         const { config } = chartJsConfig(program, readChartTheme(), {
            compact,
         });
         chart = new Chart(el, config as unknown as ChartConfiguration);
         setError(undefined);
      } catch (e) {
         setError((e as Error).message);
      }
      return () => chart?.destroy();
   }, [program, compact, themeVersion]);

   return (
      <div className="relative h-full w-full">
         <canvas
            ref={canvas}
            aria-label={program.title ?? "Chart"}
            role="img"
         />
         {error && <ChartFailure message={error} />}
      </div>
   );
}
