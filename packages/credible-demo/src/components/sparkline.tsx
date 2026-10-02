// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useId } from "react";
import { cn } from "@/lib/utils";

const W = 100;
const H = 32;
const PAD = 3;

/** A trend with no axes, drawn in currentColor, ending on a dot at the latest value. */
export function Sparkline({
   values,
   className,
}: {
   values: number[];
   className?: string;
}) {
   const gradient = useId();
   if (values.length < 2) return null;
   const min = Math.min(...values);
   const max = Math.max(...values);
   const x = (i: number) => (i / (values.length - 1)) * W;
   const y = (v: number) =>
      H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
   const line = values
      .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
      .join(" ");
   const last = values[values.length - 1];

   return (
      <div className={cn("relative", className)} aria-hidden>
         <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="size-full overflow-visible"
         >
            <defs>
               <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                  <stop
                     offset="0%"
                     stopColor="currentColor"
                     stopOpacity={0.25}
                  />
                  <stop
                     offset="100%"
                     stopColor="currentColor"
                     stopOpacity={0}
                  />
               </linearGradient>
            </defs>
            <path
               d={`${line} L${W},${H} L0,${H} Z`}
               fill={`url(#${gradient})`}
            />
            <path
               d={line}
               fill="none"
               stroke="currentColor"
               strokeWidth={1.5}
               strokeLinejoin="round"
               strokeLinecap="round"
               vectorEffect="non-scaling-stroke"
            />
         </svg>
         <span
            className="absolute size-1.5 -translate-1/2 rounded-full bg-current ring-3 ring-current/20"
            style={{ left: "100%", top: `${(y(last) / H) * 100}%` }}
         />
      </div>
   );
}
