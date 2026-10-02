// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowDown,
   ArrowUp,
   CalendarDays,
   ChevronRight,
   ChevronsUpDown,
   Copy,
   Download,
   Sigma,
   Type,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Evidence } from "@/data/types";
import { formatValue } from "@/lib/format";
import { isTimeField } from "@/lib/malloy-query";
import { cn } from "@/lib/utils";

interface Column {
   key: string;
   label: string;
   kind: "dimension" | "measure";
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

function toDelimited(columns: Column[], rows: Evidence["rows"], sep: string) {
   const cell = (v: string | number | undefined) => {
      const s = v === undefined ? "" : String(v);
      return /[",\n\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
   };
   return [
      columns.map((c) => cell(c.key)).join(sep),
      ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(sep)),
   ].join("\n");
}

/** A query's rows as a spreadsheet: typed headers, sortable columns, in-cell bars, and totals. */
export function ResultsGrid({
   evidence,
   filename,
   open = true,
   onOpenChange,
   className,
}: {
   evidence: Evidence;
   /** Used for the CSV download, without an extension. */
   filename: string;
   /** Whether the rows show; with onOpenChange, the header toggles them. */
   open?: boolean;
   onOpenChange?: (open: boolean) => void;
   className?: string;
}) {
   const [sort, setSort] = useState<Sort>(null);
   const columns: Column[] = [
      {
         key: evidence.xKey,
         label: evidence.xKey.replace(/_/g, " "),
         kind: "dimension",
      },
      ...evidence.series.map((s) => ({
         key: s.key,
         label: s.label,
         kind: "measure" as const,
      })),
   ];
   const measures = columns.filter((c) => c.kind === "measure");

   const rows = useMemo(() => {
      if (!sort) return evidence.rows;
      const dir = sort.dir === "asc" ? 1 : -1;
      return [...evidence.rows].sort((a, b) => {
         const x = a[sort.key];
         const y = b[sort.key];
         return (
            (typeof x === "number" && typeof y === "number"
               ? x - y
               : String(x).localeCompare(String(y))) * dir
         );
      });
   }, [evidence.rows, sort]);

   const peak = Object.fromEntries(
      measures.map((m) => [
         m.key,
         Math.max(...evidence.rows.map((r) => Math.abs(Number(r[m.key]) || 0))),
      ]),
   );
   const summable = evidence.format !== "percent";
   const total = (key: string) =>
      evidence.rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);

   const cycleSort = (key: string) =>
      setSort((s) =>
         s?.key !== key
            ? { key, dir: "desc" }
            : s.dir === "desc"
              ? { key, dir: "asc" }
              : null,
      );

   const download = () => {
      const blob = new Blob([toDelimited(columns, rows, ",")], {
         type: "text/csv",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
   };
   const copy = () =>
      navigator.clipboard.writeText(toDelimited(columns, rows, "\t")).then(
         () => toast.success("Rows copied; paste them into a spreadsheet"),
         () => toast.error("Couldn't copy the rows"),
      );

   return (
      <div className={cn("flex flex-col", className)}>
         <div className="flex items-center gap-2 px-4 py-2">
            {onOpenChange ? (
               <button
                  onClick={() => onOpenChange(!open)}
                  aria-expanded={open}
                  className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
               >
                  <ChevronRight
                     className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        open && "rotate-90",
                     )}
                  />
                  Results
               </button>
            ) : (
               <span className="text-sm font-medium">Results</span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
               {rows.length} rows × {columns.length} columns
            </span>
            {open && sort && (
               <button
                  onClick={() => setSort(null)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
               >
                  Clear sort
               </button>
            )}
            <div className="ml-auto flex items-center gap-0.5">
               <Button size="xs" variant="ghost" onClick={copy}>
                  <Copy />
                  Copy
               </Button>
               <Button size="xs" variant="ghost" onClick={download}>
                  <Download />
                  CSV
               </Button>
            </div>
         </div>

         <div className={cn("overflow-x-auto border-t", !open && "hidden")}>
            <table className="w-full border-collapse text-[13px]">
               <thead>
                  <tr className="bg-muted/40">
                     <th className="w-10 border-r border-b" />
                     {columns.map((c) => {
                        const Icon =
                           c.kind === "measure"
                              ? Sigma
                              : isTimeField(c.key)
                                ? CalendarDays
                                : Type;
                        const SortIcon =
                           sort?.key !== c.key
                              ? ChevronsUpDown
                              : sort.dir === "desc"
                                ? ArrowDown
                                : ArrowUp;
                        return (
                           <th
                              key={c.key}
                              aria-sort={
                                 sort?.key === c.key
                                    ? sort.dir === "asc"
                                       ? "ascending"
                                       : "descending"
                                    : undefined
                              }
                              className={cn(
                                 "border-r border-b border-t-2 p-0 font-normal last:border-r-0",
                                 c.kind === "measure"
                                    ? "border-t-chart-3/70"
                                    : "border-t-chart-1/70",
                              )}
                           >
                              <button
                                 onClick={() => cycleSort(c.key)}
                                 className={cn(
                                    "group/h flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-muted/60",
                                    c.kind === "measure" &&
                                       "flex-row-reverse justify-start text-right",
                                 )}
                              >
                                 <Icon
                                    className={cn(
                                       "size-3.5 shrink-0",
                                       c.kind === "measure"
                                          ? "text-chart-3"
                                          : "text-chart-1",
                                    )}
                                 />
                                 <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold capitalize">
                                       {c.label}
                                    </span>
                                    <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                                       {c.key}
                                    </span>
                                 </span>
                                 <SortIcon
                                    className={cn(
                                       "size-3 shrink-0 text-muted-foreground",
                                       sort?.key === c.key
                                          ? "text-foreground"
                                          : "opacity-0 group-hover/h:opacity-100",
                                    )}
                                 />
                              </button>
                           </th>
                        );
                     })}
                  </tr>
               </thead>
               <tbody>
                  {rows.map((r, i) => {
                     const on = r[evidence.xKey] === evidence.highlight;
                     return (
                        <tr
                           key={String(r[evidence.xKey])}
                           className={cn(
                              "group/row hover:bg-muted/40",
                              on && "bg-primary/[0.04]",
                           )}
                        >
                           <td
                              className={cn(
                                 "relative border-r border-b bg-muted/25 px-2 text-right font-mono text-[11px] text-muted-foreground tabular-nums",
                                 on && "text-primary",
                              )}
                           >
                              {on && (
                                 <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
                              )}
                              {i + 1}
                           </td>
                           {columns.map((c) => {
                              const v = r[c.key];
                              if (c.kind === "dimension") {
                                 return (
                                    <td
                                       key={c.key}
                                       className={cn(
                                          "border-r border-b px-3 py-1.5 whitespace-nowrap",
                                          on && "font-medium",
                                       )}
                                    >
                                       {v}
                                    </td>
                                 );
                              }
                              const n = Number(v);
                              const width = peak[c.key]
                                 ? (Math.abs(n) / peak[c.key]) * 100
                                 : 0;
                              return (
                                 <td
                                    key={c.key}
                                    className="relative border-r border-b px-3 py-1.5 text-right whitespace-nowrap tabular-nums last:border-r-0"
                                 >
                                    <span
                                       className={cn(
                                          "absolute inset-y-1.5 right-1.5 rounded-[2px]",
                                          n < 0
                                             ? "bg-negative/10"
                                             : "bg-chart-3/10",
                                       )}
                                       style={{
                                          width: `calc(${width}% - 0.75rem)`,
                                       }}
                                    />
                                    <Tooltip>
                                       <TooltipTrigger asChild>
                                          <span
                                             className={cn(
                                                "relative",
                                                n < 0 && "text-negative",
                                             )}
                                          >
                                             {formatValue(n, evidence.format)}
                                          </span>
                                       </TooltipTrigger>
                                       <TooltipContent className="font-mono">
                                          {String(v)}
                                       </TooltipContent>
                                    </Tooltip>
                                 </td>
                              );
                           })}
                        </tr>
                     );
                  })}
               </tbody>
               {summable && (
                  <tfoot>
                     <tr className="bg-muted/40 font-semibold">
                        <td className="border-r px-2 text-right font-mono text-[11px] font-normal text-muted-foreground">
                           Σ
                        </td>
                        {columns.map((c) => (
                           <td
                              key={c.key}
                              className={cn(
                                 "border-r px-3 py-1.5 whitespace-nowrap last:border-r-0",
                                 c.kind === "measure" &&
                                    "text-right tabular-nums",
                              )}
                           >
                              {c.kind === "measure"
                                 ? formatValue(total(c.key), evidence.format)
                                 : "Total"}
                           </td>
                        ))}
                     </tr>
                  </tfoot>
               )}
            </table>
         </div>
      </div>
   );
}
