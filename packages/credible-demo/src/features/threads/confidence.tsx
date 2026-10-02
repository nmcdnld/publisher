// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Confidence } from "@/data/types";
import { cn } from "@/lib/utils";

const levels = {
   high: {
      icon: ShieldCheck,
      label: "High confidence",
      tone: "text-positive",
      bar: "bg-positive",
   },
   medium: {
      icon: ShieldQuestion,
      label: "Medium confidence",
      tone: "text-chart-3",
      bar: "bg-chart-3",
   },
   low: {
      icon: ShieldAlert,
      label: "Low confidence",
      tone: "text-negative",
      bar: "bg-negative",
   },
};

export function ConfidenceIndicator({
   confidence,
}: {
   confidence: Confidence;
}) {
   const l = levels[confidence.level];
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <span
               className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-medium",
                  l.tone,
               )}
            >
               <l.icon className="size-3.5" />
               {l.label}
               <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                  <span
                     className={cn("block h-full rounded-full", l.bar)}
                     style={{ width: `${Math.round(confidence.score * 100)}%` }}
                  />
               </span>
            </span>
         </TooltipTrigger>
         <TooltipContent className="max-w-64">
            {confidence.reason}
         </TooltipContent>
      </Tooltip>
   );
}
