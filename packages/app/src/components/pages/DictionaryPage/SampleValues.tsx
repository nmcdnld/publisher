// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ResultPanel, useQueryResult } from "@malloy-publisher/sdk";
import type { ReactNode } from "react";
import { Skeleton } from "../../ui/misc";
import { useMalloyRows } from "../../../ontology/useOntology";
import type { Entity, Ontology } from "../../../ontology/types";
import {
   formatValue,
   MalloyBehind,
   QueryError,
   type Row,
   timeDimension,
} from "./liveData";
import { q } from "./shared";
import { SourceSummary } from "./SourceSummary";

/** The live-data panel for an entity, from queries generated off the model. */
export function SampleValues({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const source = entity.sourceId
      ? ontology.entities.get(entity.sourceId)
      : entity.kind === "source"
        ? entity
        : undefined;
   if (entity.kind === "source") {
      return <SourceSummary ontology={ontology} source={entity} />;
   }
   if (entity.kind === "view" && source) {
      return (
         <RenderedSample
            ontology={ontology}
            entity={entity}
            query={`run: ${q(source.name)} -> ${q(entity.name)}`}
         />
      );
   }
   if (entity.kind === "query" && !source) {
      return (
         <RenderedSample
            ontology={ontology}
            entity={entity}
            queryName={entity.name}
         />
      );
   }
   return <PlannedSample ontology={ontology} entity={entity} source={source} />;
}

/**
 * A view or named query drawn by the Malloy renderer, the way a dashboard or
 * notebook tile draws it, so its own `# bar_chart`, `# line_chart` and
 * friends decide the chart.
 */
function RenderedSample({
   ontology,
   entity,
   query,
   queryName,
}: {
   ontology: Ontology;
   entity: Entity;
   query?: string;
   queryName?: string;
}) {
   const state = useQueryResult({
      environmentName: ontology.environmentName,
      packageName: ontology.packageName,
      modelPath: entity.modelPath,
      query,
      queryName,
   });
   return (
      <div className="space-y-3">
         <div className="[&_.malloy-render]:w-full [&_.malloy-table]:w-full">
            <ResultPanel
               state={state}
               context={query ?? queryName ?? entity.modelPath}
               maxHeight={360}
            />
         </div>
         <MalloyBehind text={query ?? `run: ${q(queryName!)}`} />
      </div>
   );
}

function PlannedSample({
   ontology,
   entity,
   source,
}: {
   ontology: Ontology;
   entity: Entity;
   source: Entity | undefined;
}) {
   const plan = samplePlan(ontology, entity, source);
   const primary = useMalloyRows(
      ontology.environmentName,
      ontology.packageName,
      entity.modelPath,
      plan?.primary,
   );
   const secondary = useMalloyRows(
      ontology.environmentName,
      ontology.packageName,
      entity.modelPath,
      plan?.secondary,
   );
   if (!plan) return null;

   return (
      <div className="space-y-3">
         {primary.isLoading ? (
            <Skeleton className="h-24 w-full" />
         ) : primary.error ? (
            <QueryError error={primary.error} />
         ) : (
            plan.render(primary.data ?? [], secondary.data)
         )}
         <MalloyBehind
            text={[plan.primary, plan.secondary].filter(Boolean).join("\n\n")}
         />
      </div>
   );
}

interface Plan {
   primary: string;
   secondary?: string;
   render: (rows: Row[], extra?: Row[]) => ReactNode;
}

function samplePlan(
   ontology: Ontology,
   entity: Entity,
   source: Entity | undefined,
): Plan | undefined {
   if (!source) return undefined;
   const s = q(source.name);
   const f = q(entity.name);
   switch (entity.kind) {
      case "measure": {
         const time = timeDimension(ontology, source);
         return {
            primary: `run: ${s} -> { aggregate: ${f} }`,
            secondary: time
               ? `run: ${s} -> {\n  group_by: period is ${q(time.name)}.month\n  aggregate: ${f}\n  order_by: period\n  limit: 120\n}`
               : undefined,
            render: (rows, trend) => (
               <div className="flex flex-wrap items-end gap-6">
                  <BigNumber
                     value={rows[0]?.[entity.name]}
                     tags={entity.tags}
                     caption="across every row"
                  />
                  {trend && trend.length > 1 && (
                     <Sparkline
                        values={trend.map((r) => Number(r[entity.name]) || 0)}
                        caption={`by month of ${time!.name}`}
                        first={String(trend[0].period ?? "")}
                        last={String(trend[trend.length - 1].period ?? "")}
                     />
                  )}
               </div>
            ),
         };
      }
      case "dimension": {
         const numeric =
            entity.dataType === "number" ||
            entity.dataType === "date" ||
            entity.dataType === "timestamp";
         return {
            primary: `run: ${s} -> {\n  group_by: ${f}\n  aggregate: row_count is count()\n  order_by: row_count desc\n  limit: 6\n}`,
            secondary: `run: ${s} -> {\n  aggregate:\n    distinct_values is count(${f})\n    rows is count()\n    nulls is count() { where: ${f} is null }${
               numeric
                  ? `\n    lowest is min(${f})\n    highest is max(${f})`
                  : ""
            }\n}`,
            render: (rows, stats) => (
               <TopValues rows={rows} field={entity.name} stats={stats?.[0]} />
            ),
         };
      }
      default:
         return undefined;
   }
}

function BigNumber({
   value,
   caption,
   tags,
}: {
   value: unknown;
   caption: string;
   tags?: string[];
}) {
   return (
      <div>
         <div className="text-3xl font-semibold tabular-nums tracking-tight">
            {formatValue(value, tags)}
         </div>
         <div className="text-xs text-muted-foreground">{caption}</div>
      </div>
   );
}

function Sparkline({
   values,
   caption,
   first,
   last,
}: {
   values: number[];
   caption: string;
   first: string;
   last: string;
}) {
   const width = 260;
   const height = 56;
   const min = Math.min(...values);
   const max = Math.max(...values);
   const span = max - min || 1;
   const points = values
      .map(
         (v, i) =>
            `${(i / (values.length - 1)) * width},${
               height - 4 - ((v - min) / span) * (height - 8)
            }`,
      )
      .join(" ");
   return (
      <div>
         <svg
            width={width}
            height={height}
            className="overflow-visible text-primary"
            aria-label={caption}
         >
            <polyline
               points={`0,${height} ${points} ${width},${height}`}
               className="fill-primary/10 stroke-none"
            />
            <polyline
               points={points}
               fill="none"
               stroke="currentColor"
               strokeWidth={1.75}
               strokeLinejoin="round"
            />
         </svg>
         <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{first.slice(0, 7)}</span>
            <span>{caption}</span>
            <span>{last.slice(0, 7)}</span>
         </div>
      </div>
   );
}

function TopValues({
   rows,
   field,
   stats,
}: {
   rows: Row[];
   field: string;
   stats?: Row;
}) {
   const total =
      Number(stats?.rows) || rows.reduce((s, r) => s + Number(r.row_count), 0);
   const nullRate = stats ? Number(stats.nulls) / (Number(stats.rows) || 1) : 0;
   return (
      <div className="space-y-3">
         {stats && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
               <span>
                  <strong className="text-foreground tabular-nums">
                     {formatValue(stats.distinct_values)}
                  </strong>{" "}
                  distinct values
               </span>
               <span>
                  <strong className="text-foreground tabular-nums">
                     {(nullRate * 100).toFixed(
                        nullRate && nullRate < 0.01 ? 2 : 0,
                     )}
                     %
                  </strong>{" "}
                  null
               </span>
               {"lowest" in stats && (
                  <span>
                     range{" "}
                     <strong className="text-foreground tabular-nums">
                        {formatValue(stats.lowest)} –{" "}
                        {formatValue(stats.highest)}
                     </strong>
                  </span>
               )}
            </div>
         )}
         <div className="space-y-1.5">
            {rows.map((row, i) => {
               const share = Number(row.row_count) / (total || 1);
               return (
                  <div
                     key={i}
                     className="grid grid-cols-[minmax(0,12rem)_1fr_4rem] items-center gap-3 text-sm"
                  >
                     <span className="truncate font-mono text-xs">
                        {formatValue(row[field])}
                     </span>
                     <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                           className="h-full rounded-full bg-primary/70"
                           style={{ width: `${Math.max(share * 100, 1)}%` }}
                        />
                     </div>
                     <span className="text-right text-xs tabular-nums text-muted-foreground">
                        {(share * 100).toFixed(1)}%
                     </span>
                  </div>
               );
            })}
         </div>
      </div>
   );
}
