// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Database } from "lucide-react";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Provenance as ProvenanceType } from "@/data/types";
import { cn } from "@/lib/utils";

/** Names the exact governed resource a number came from: package · source · view. */
export function Provenance({
   provenance,
   className,
}: {
   provenance: ProvenanceType;
   className?: string;
}) {
   const parts = [
      provenance.package,
      provenance.source,
      provenance.view,
   ].filter(Boolean);
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span
               className={cn(
                  "inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground",
                  className,
               )}
            >
               <Database className="size-3 shrink-0" />
               <span className="truncate">{parts.join(" · ")}</span>
            </span>
         </TooltipTrigger>
         <TooltipContent className="font-mono text-xs">
            {provenance.environment}/{provenance.package}/{provenance.model} ›{" "}
            {provenance.source}
            {provenance.view ? ` › ${provenance.view}` : ""}
         </TooltipContent>
      </Tooltip>
   );
}
