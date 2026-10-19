// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
   return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(
   props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
   return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
   className,
   align = "end",
   sideOffset = 6,
   ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
   return (
      <PopoverPrimitive.Portal>
         <PopoverPrimitive.Content
            data-slot="popover-content"
            align={align}
            sideOffset={sideOffset}
            collisionPadding={12}
            className={cn(
               "tw-portal z-[1500] rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none",
               className,
            )}
            {...props}
         />
      </PopoverPrimitive.Portal>
   );
}

export { Popover, PopoverContent, PopoverTrigger };
