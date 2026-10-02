// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { cn } from "@/lib/utils";

const TOKEN = new RegExp(
   [
      String.raw`(?<comment>//.*|--.*)`,
      String.raw`(?<string>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`,
      String.raw`(?<date>@[\w\-:.]+)`,
      String.raw`(?<keyword>\b(?:run|source|query|extend|view|dimension|measure|join_one|join_many|join_cross|import|where|having|group_by|aggregate|calculate|select|nest|order_by|limit|top|is|asc|desc|for|to|and|or|not|on|with)\b)`,
      String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
      String.raw`(?<operator>->|[+?{}])`,
   ].join("|"),
   "g",
);

const tokenClass: Record<string, string> = {
   comment: "text-muted-foreground italic",
   string: "text-chart-5",
   date: "text-chart-5",
   keyword: "text-primary font-medium",
   number: "text-chart-2",
   operator: "text-muted-foreground",
};

function highlight(source: string): React.ReactNode[] {
   const out: React.ReactNode[] = [];
   let last = 0;
   for (const m of source.matchAll(TOKEN)) {
      const kind = Object.entries(m.groups ?? {}).find(([, v]) => v)?.[0];
      if (m.index > last) out.push(source.slice(last, m.index));
      out.push(
         <span key={m.index} className={kind && tokenClass[kind]}>
            {m[0]}
         </span>,
      );
      last = m.index + m[0].length;
   }
   out.push(source.slice(last));
   return out;
}

/** Malloy source, read-only or as an editor when onChange is given. */
export function MalloyBlock({
   value,
   onChange,
   className,
}: {
   value: string;
   onChange?: (value: string) => void;
   className?: string;
}) {
   const shared =
      "w-full rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed";
   if (onChange) {
      return (
         <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            rows={Math.max(4, value.split("\n").length + 1)}
            className={cn(
               shared,
               "resize-y bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
               className,
            )}
         />
      );
   }
   return (
      <pre className={cn(shared, "overflow-x-auto whitespace-pre", className)}>
         {highlight(value)}
      </pre>
   );
}
