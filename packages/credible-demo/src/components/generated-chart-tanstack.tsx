// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Chart } from "@tanstack/charts/react";
import { useMemo } from "react";
import type { BoundProgram } from "@malloy-publisher/app-manifest/analyst/chart-program";
import { tanstackDefinition } from "@/analyst/chart-tanstack";
import { readChartTheme, useThemeVersion } from "@/components/chart-theme";
import { ChartFailure } from "@/components/chart-failure";

export default function TanStackGeneratedChart({
   program,
   compact,
   height,
}: {
   program: BoundProgram;
   compact: boolean;
   height: number;
}) {
   const themeVersion = useThemeVersion();
   const built = useMemo(() => {
      try {
         const theme = readChartTheme();
         return {
            theme,
            definition: tanstackDefinition(program, theme, { compact })
               .definition,
         };
      } catch (e) {
         return { error: (e as Error).message };
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [program, compact, themeVersion]);

   if ("error" in built) return <ChartFailure message={built.error!} />;
   return (
      <Chart
         definition={built.definition as never}
         height={height}
         ariaLabel={typeof program.title === "string" ? program.title : "Chart"}
         className={compact ? "text-[9px]" : "text-[11px]"}
         style={{ color: built.theme.muted }}
      />
   );
}
