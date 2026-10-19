// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Progress as ProgressPrimitive,
   Separator as SeparatorPrimitive,
} from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function Separator({
   className,
   orientation = "horizontal",
   decorative = true,
   ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
   return (
      <SeparatorPrimitive.Root
         data-slot="separator"
         decorative={decorative}
         orientation={orientation}
         className={cn(
            "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
            className,
         )}
         {...props}
      />
   );
}

function Progress({
   className,
   value,
   indicatorClassName,
   ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
   indicatorClassName?: string;
}) {
   return (
      <ProgressPrimitive.Root
         data-slot="progress"
         className={cn(
            "relative h-2 w-full overflow-hidden rounded-full bg-primary/15",
            className,
         )}
         {...props}
      >
         <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className={cn(
               "h-full w-full flex-1 bg-primary transition-all",
               indicatorClassName,
            )}
            style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
         />
      </ProgressPrimitive.Root>
   );
}

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
   return (
      <div
         data-slot="skeleton"
         className={cn("animate-pulse rounded-md bg-accent", className)}
         {...props}
      />
   );
}

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
   return (
      <kbd
         className={cn(
            "pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
            className,
         )}
         {...props}
      />
   );
}

export { Kbd, Progress, Separator, Skeleton };
