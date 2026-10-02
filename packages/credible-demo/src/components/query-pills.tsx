// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowDown,
   ArrowUp,
   CalendarDays,
   Database,
   Filter,
   Layers,
   ListTree,
   Sigma,
   Type,
   type LucideIcon,
} from "lucide-react";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Provenance } from "@/data/types";
import {
   isTimeField,
   type ClauseKind,
   type ParsedQuery,
   type QueryField,
} from "@/lib/malloy-query";
import { cn } from "@/lib/utils";

/** Dimensions and measures share their colors with the results grid's headers. */
type FieldTone = "dimension" | "measure" | "view" | "filter" | "neutral";

const toneClasses: Record<FieldTone, string> = {
   dimension: "border-chart-1/25 bg-chart-1/8 [&_svg]:text-chart-1",
   measure: "border-chart-3/35 bg-chart-3/10 [&_svg]:text-chart-3",
   view: "border-chart-4/25 bg-chart-4/8 [&_svg]:text-chart-4",
   filter: "border-chart-2/30 bg-chart-2/8 [&_svg]:text-chart-2",
   neutral: "border-border bg-card [&_svg]:text-muted-foreground",
};

const clauseMeta: Record<
   ClauseKind,
   { label: string; tone: FieldTone; icon: LucideIcon }
> = {
   where: { label: "Filter", tone: "filter", icon: Filter },
   having: { label: "Having", tone: "filter", icon: Filter },
   group_by: { label: "Group by", tone: "dimension", icon: Type },
   select: { label: "Select", tone: "dimension", icon: Type },
   aggregate: { label: "Aggregate", tone: "measure", icon: Sigma },
   calculate: { label: "Calculate", tone: "measure", icon: Sigma },
   nest: { label: "Nest", tone: "view", icon: ListTree },
   order_by: { label: "Order by", tone: "neutral", icon: ArrowUp },
   limit: { label: "Limit", tone: "neutral", icon: ListTree },
   top: { label: "Top", tone: "neutral", icon: ListTree },
};

function Pill({
   tone,
   icon: Icon,
   children,
   className,
}: {
   tone: FieldTone;
   icon?: LucideIcon;
   children: React.ReactNode;
   className?: string;
}) {
   return (
      <span
         className={cn(
            "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs text-foreground",
            toneClasses[tone],
            className,
         )}
      >
         {Icon && <Icon className="size-3.5 shrink-0" />}
         {children}
      </span>
   );
}

/** "created_at ? @2026-09 for 2 weeks" as the field, then its condition. */
function Condition({ expr }: { expr: string }) {
   const m = /^([A-Za-z_][\w.]*)\s*([\s\S]*)$/.exec(expr);
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span className="min-w-0 truncate">
               {m ? (
                  <>
                     <span className="font-medium">{m[1]}</span>{" "}
                     <span className="text-muted-foreground">{m[2]}</span>
                  </>
               ) : (
                  expr
               )}
            </span>
         </TooltipTrigger>
         <TooltipContent className="font-mono">{expr}</TooltipContent>
      </Tooltip>
   );
}

function FieldPill({ kind, field }: { kind: ClauseKind; field: QueryField }) {
   const meta = clauseMeta[kind];

   if (meta.tone === "filter") {
      return (
         <Pill tone="filter" icon={Filter} className="max-w-md">
            <Condition expr={field.expr} />
         </Pill>
      );
   }

   if (kind === "order_by") {
      const [name, dir] = field.expr.split(/\s+/);
      return (
         <Pill tone="neutral" icon={dir === "desc" ? ArrowDown : ArrowUp}>
            {name}
            <span className="text-muted-foreground">{dir ?? "asc"}</span>
         </Pill>
      );
   }

   if (kind === "limit" || kind === "top") {
      return <Pill tone="neutral">{field.expr}</Pill>;
   }

   const icon =
      meta.tone === "dimension" && isTimeField(field.expr)
         ? CalendarDays
         : meta.icon;
   const derived = field.name && field.name !== field.expr;

   return (
      <Pill tone={meta.tone} icon={icon} className={cn(field.filter && "pr-1")}>
         <span className="font-medium">{field.name ?? field.expr}</span>
         {derived && (
            <span className="truncate text-muted-foreground">
               <span className="font-sans">=</span> {field.expr}
            </span>
         )}
         {field.filter && (
            <span className="ml-0.5 inline-flex h-5 min-w-0 max-w-56 items-center gap-1 rounded-full border border-chart-2/30 bg-card px-2 text-[11px] [&_svg]:text-chart-2">
               <Filter className="size-3 shrink-0" />
               <Condition expr={field.filter} />
            </span>
         )}
      </Pill>
   );
}

function Row({
   label,
   children,
}: {
   label: string;
   children: React.ReactNode;
}) {
   return (
      <div className="grid grid-cols-[5.5rem_1fr] items-start gap-3 py-2 @xl:grid-cols-[6.5rem_1fr]">
         <span className="pt-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {label}
         </span>
         <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {children}
         </div>
      </div>
   );
}

/** A query drawn as the clauses a person would click together in an explorer. */
export function QueryPills({
   query,
   provenance,
}: {
   query: ParsedQuery;
   provenance: Provenance;
}) {
   return (
      <div className="@container divide-y divide-dashed">
         <Row label="From">
            <Tooltip>
               <TooltipTrigger asChild>
                  <span>
                     <Pill tone="neutral" icon={Database}>
                        <span className="font-medium">{query.source}</span>
                     </Pill>
                  </span>
               </TooltipTrigger>
               <TooltipContent className="font-mono">
                  {provenance.environment}/{provenance.package}/
                  {provenance.model}
               </TooltipContent>
            </Tooltip>
            {query.view && (
               <>
                  <span className="text-xs text-muted-foreground">+</span>
                  <Pill tone="view" icon={Layers}>
                     <span className="font-medium">{query.view}</span>
                  </Pill>
               </>
            )}
         </Row>
         {query.clauses.map((clause, i) => (
            <Row
               key={`${clause.kind}-${i}`}
               label={clauseMeta[clause.kind].label}
            >
               {clause.fields.map((field, j) => (
                  <FieldPill key={j} kind={clause.kind} field={field} />
               ))}
            </Row>
         ))}
      </div>
   );
}
