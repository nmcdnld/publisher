// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
   "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3",
   {
      variants: {
         variant: {
            default: "border-transparent bg-primary text-primary-foreground",
            secondary:
               "border-transparent bg-secondary text-secondary-foreground",
            destructive: "border-transparent bg-destructive text-white",
            outline: "text-foreground",
            answerable: "border-transparent bg-answerable/15 text-answerable",
            partial: "border-transparent bg-partial/20 text-partial",
            missing: "border-transparent bg-missing/15 text-missing",
            draft: "border-draft/40 border-dashed bg-draft/10 text-draft",
         },
      },
      defaultVariants: {
         variant: "default",
      },
   },
);

function Badge({
   className,
   variant,
   asChild = false,
   ...props
}: React.ComponentProps<"span"> &
   VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
   const Comp = asChild ? Slot.Root : "span";
   return (
      <Comp
         data-slot="badge"
         className={cn(badgeVariants({ variant }), className)}
         {...props}
      />
   );
}

export { Badge, badgeVariants };
