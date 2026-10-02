// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Delta } from "@/data/types";
import { deltaTone, formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DeltaBadge({
   delta,
   className,
}: {
   delta: Delta;
   className?: string;
}) {
   const tone = deltaTone(delta);
   const Icon =
      tone === "flat"
         ? ArrowRight
         : delta.value > 0
           ? ArrowUpRight
           : ArrowDownRight;
   return (
      <span
         className={cn(
            "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
            tone === "good" && "bg-positive/12 text-positive",
            tone === "bad" && "bg-negative/12 text-negative",
            tone === "flat" && "bg-muted text-muted-foreground",
            className,
         )}
      >
         <Icon className="size-3.5" />
         {formatDelta(delta)}
      </span>
   );
}
