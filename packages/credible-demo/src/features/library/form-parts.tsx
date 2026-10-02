// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
   label,
   hint,
   error,
   children,
}: {
   label: string;
   hint?: string;
   error?: string;
   children: React.ReactNode;
}) {
   return (
      <div className="space-y-1.5">
         <div className="flex items-baseline justify-between gap-2">
            <Label>{label}</Label>
            {hint && (
               <span className="truncate font-mono text-xs text-muted-foreground">
                  {hint}
               </span>
            )}
         </div>
         {children}
         {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
   );
}

export function Notice({
   tone = "info",
   children,
}: {
   tone?: "info" | "error";
   children: React.ReactNode;
}) {
   return (
      <p
         className={cn(
            "flex gap-2 rounded-md border p-3 text-xs",
            tone === "error"
               ? "border-destructive/30 bg-destructive/5 text-destructive"
               : "bg-muted/40 text-muted-foreground",
         )}
      >
         <CircleAlert className="mt-px size-3.5 shrink-0" />
         <span>{children}</span>
      </p>
   );
}

export function CompileStatus({
   pending,
   error,
   errors,
   warnings,
}: {
   pending: boolean;
   error: Error | null;
   errors: number;
   warnings: number;
}) {
   if (pending) {
      return (
         <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Compiling in Publisher…
         </span>
      );
   }
   if (error || errors > 0) {
      return (
         <Badge variant="destructive" className="shrink-0">
            {error
               ? "Publisher refused it"
               : `${errors} compile error${errors === 1 ? "" : "s"}`}
         </Badge>
      );
   }
   return (
      <Badge variant="secondary" className="shrink-0 gap-1">
         <Check className="size-3" />
         Compiles
         {warnings > 0
            ? ` with ${warnings} warning${warnings === 1 ? "" : "s"}`
            : ""}
      </Badge>
   );
}
