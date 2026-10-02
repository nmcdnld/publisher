// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// Renders a model-written chart program with the library it names. Both
// renderers load on first use and take their colors from the live theme, so
// a generated chart looks like the rest of the app.

import { Component, lazy, Suspense, type ReactNode } from "react";
import type { BoundProgram } from "@malloy-publisher/app-manifest/analyst/chart-program";
import { ChartFailure } from "@/components/chart-failure";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TanStackGeneratedChart = lazy(
   () => import("@/components/generated-chart-tanstack"),
);
const ChartJsGeneratedChart = lazy(
   () => import("@/components/generated-chart-chartjs"),
);

const HEIGHT = { compact: 112, full: 288 };

/** A program that builds can still throw while rendering; keep that inside the card. */
class ChartBoundary extends Component<
   { program: BoundProgram; children: ReactNode },
   { error?: Error }
> {
   state: { error?: Error } = {};
   static getDerivedStateFromError(error: Error) {
      return { error };
   }
   componentDidUpdate(prev: { program: BoundProgram }) {
      if (this.state.error && prev.program !== this.props.program)
         this.setState({ error: undefined });
   }
   render() {
      if (this.state.error)
         return <ChartFailure message={this.state.error.message} />;
      return this.props.children;
   }
}

export function GeneratedChart({
   program,
   compact = false,
   className,
}: {
   program: BoundProgram;
   compact?: boolean;
   className?: string;
}) {
   const height = compact ? HEIGHT.compact : HEIGHT.full;
   return (
      <div className={cn("relative w-full", className)} style={{ height }}>
         <ChartBoundary program={program}>
            <Suspense
               fallback={<Skeleton className="h-full w-full rounded-md" />}
            >
               {program.library === "chartjs" ? (
                  <ChartJsGeneratedChart program={program} compact={compact} />
               ) : (
                  <TanStackGeneratedChart
                     program={program}
                     compact={compact}
                     height={height}
                  />
               )}
            </Suspense>
         </ChartBoundary>
      </div>
   );
}
