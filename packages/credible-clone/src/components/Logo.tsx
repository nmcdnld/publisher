// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import wordmark from "../logo.svg?raw";

const BRAND_DOT = "var(--mui-palette-brand-dot, #0084FF)";

// The compact mark reuses the wordmark's "c", bar thickness, and brand dot.
// Both share the wordmark's 583-unit height and left edge, so rendering them
// at the same height keeps the bracket and "c" in place when the rail expands.
const C_PATH =
   "M263.137 453.942C178.539 453.942 126.271 399.521 126.271 313.31C126.271 228.177 181.233 171.602 264.753 171.602C335.88 171.602 380.064 210.935 391.381 273.438H330.491C322.948 241.109 299.778 221.172 263.675 221.172C216.796 221.172 186.083 258.89 186.083 313.31C186.083 367.192 216.256 404.371 263.675 404.371C299.778 404.371 322.948 383.895 330.491 351.567H391.381C380.604 414.608 333.725 453.942 263.137 453.942Z";

export function Logo({
   compact,
   className,
}: {
   compact?: boolean;
   className?: string;
}) {
   if (compact) {
      return (
         <svg
            viewBox="0 0 518 583"
            aria-hidden="true"
            focusable="false"
            className={clsx("h-6 w-auto", className)}
         >
            <g fill="currentColor">
               <path d={C_PATH} />
               <rect x="0" y="8.33" width="58.73" height="574.67" />
               <rect x="459.27" y="8.33" width="58.73" height="574.67" />
               <rect x="0" y="524.27" width="518" height="58.73" />
               <rect x="0" y="8.33" width="200" height="58.73" />
               <rect x="318" y="8.33" width="200" height="58.73" />
            </g>
            <circle cx="259" cy="42" r="42" style={{ fill: BRAND_DOT }} />
         </svg>
      );
   }
   return (
      <span
         aria-hidden="true"
         className={clsx("block h-6 [&>svg]:h-full [&>svg]:w-auto", className)}
         dangerouslySetInnerHTML={{ __html: wordmark }}
      />
   );
}
