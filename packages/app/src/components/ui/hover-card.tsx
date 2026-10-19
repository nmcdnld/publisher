// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { HoverCard as HoverCardPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function HoverCard({
   openDelay = 250,
   closeDelay = 100,
   ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
   return (
      <HoverCardPrimitive.Root
         data-slot="hover-card"
         openDelay={openDelay}
         closeDelay={closeDelay}
         {...props}
      />
   );
}

function HoverCardTrigger(
   props: React.ComponentProps<typeof HoverCardPrimitive.Trigger>,
) {
   return (
      <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
   );
}

function HoverCardContent({
   className,
   align = "start",
   sideOffset = 6,
   ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
   return (
      <HoverCardPrimitive.Portal>
         <HoverCardPrimitive.Content
            data-slot="hover-card-content"
            align={align}
            sideOffset={sideOffset}
            className={cn(
               "tw-portal z-[1500] w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md outline-none",
               className,
            )}
            {...props}
         />
      </HoverCardPrimitive.Portal>
   );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
