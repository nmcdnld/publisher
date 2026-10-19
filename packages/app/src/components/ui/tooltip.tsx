// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function TooltipProvider({
   delayDuration = 100,
   ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
   return (
      <TooltipPrimitive.Provider
         data-slot="tooltip-provider"
         delayDuration={delayDuration}
         {...props}
      />
   );
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
   return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(
   props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
   return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
   className,
   sideOffset = 4,
   children,
   ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
   return (
      <TooltipPrimitive.Portal>
         <TooltipPrimitive.Content
            data-slot="tooltip-content"
            sideOffset={sideOffset}
            className={cn(
               "tw-portal z-[1500] w-fit max-w-sm rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background",
               className,
            )}
            {...props}
         >
            {children}
         </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
   );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
