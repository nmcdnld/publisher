// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
   return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
   props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) {
   return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetContent({
   className,
   children,
   side = "right",
   ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
   side?: "right" | "left";
}) {
   return (
      <SheetPrimitive.Portal>
         <SheetPrimitive.Overlay className="tw-portal fixed inset-0 z-[1300] bg-black/30" />
         <SheetPrimitive.Content
            data-slot="sheet-content"
            className={cn(
               "tw-portal fixed inset-y-0 z-[1300] flex h-full w-full flex-col gap-4 bg-background shadow-lg sm:max-w-lg",
               side === "right" ? "right-0 border-l" : "left-0 border-r",
               className,
            )}
            {...props}
         >
            {children}
            <SheetPrimitive.Close className="absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100">
               <XIcon className="size-4" />
               <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
         </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
   );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
   return (
      <div
         data-slot="sheet-header"
         className={cn("flex flex-col gap-1 p-4 pr-10", className)}
         {...props}
      />
   );
}

function SheetTitle({
   className,
   ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
   return (
      <SheetPrimitive.Title
         data-slot="sheet-title"
         className={cn("font-semibold text-foreground", className)}
         {...props}
      />
   );
}

function SheetDescription({
   className,
   ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
   return (
      <SheetPrimitive.Description
         data-slot="sheet-description"
         className={cn("text-sm text-muted-foreground", className)}
         {...props}
      />
   );
}

export {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
   SheetTrigger,
};
