// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowUpRight,
   Boxes,
   Code2,
   EyeOff,
   FlaskConical,
   Link2,
   MessagesSquare,
   MoreHorizontal,
   PenLine,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SaveMenuItems, useFindingSave } from "@/components/save-menu";
import { modelQueryRoute } from "@/data/publisher";
import { analysisPromotable } from "@/data/sync";
import type { Analysis } from "@/data/types";
import { useThreadUi } from "@/features/threads/thread-context";
import { cn } from "@/lib/utils";

function copy(text: string, what: string) {
   navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error(`Couldn't copy the ${what.toLowerCase()}`),
   );
}

/** Open, Save, Remix and the rest of an analysis's verbs, in a ghost ⋯ menu. */
export function AnalysisMenu({
   analysis,
   onDismiss,
   inspectHref,
   className,
}: {
   analysis: Analysis;
   /** Offered as "Show fewer like this" when the surface can hide the card. */
   onDismiss?: () => void;
   /** Where the Studio shows how this insight was found, when it came from a run. */
   inspectHref?: string;
   className?: string;
}) {
   const navigate = useNavigate();
   const { ask } = useThreadUi();
   const save = useFindingSave(analysisPromotable(analysis));
   const href = `/analysis/${analysis.id}`;
   const { provenance } = analysis;

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="More actions"
                  className={cn(
                     "text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
                     className,
                  )}
               >
                  <MoreHorizontal className="size-4" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
               <DropdownMenuItem onSelect={() => navigate(href)}>
                  <ArrowUpRight />
                  Open analysis
               </DropdownMenuItem>
               <SaveMenuItems save={save} />
               <DropdownMenuItem onSelect={() => navigate(`${href}?remix=1`)}>
                  <PenLine />
                  Remix
               </DropdownMenuItem>
               <DropdownMenuItem
                  onSelect={() =>
                     ask(`Tell me more about: ${analysis.title}`, {
                        fresh: true,
                     })
                  }
               >
                  <MessagesSquare />
                  Ask a follow-up
               </DropdownMenuItem>
               {inspectHref && (
                  <DropdownMenuItem onSelect={() => navigate(inspectHref)}>
                     <FlaskConical />
                     Inspect in Studio
                  </DropdownMenuItem>
               )}
               <DropdownMenuSeparator />
               <DropdownMenuItem
                  onSelect={() =>
                     navigate(
                        modelQueryRoute(
                           provenance.package,
                           provenance.model,
                           analysis.malloy,
                        ),
                     )
                  }
               >
                  <Boxes />
                  Explore the model
               </DropdownMenuItem>
               <DropdownMenuItem
                  onSelect={() => copy(analysis.malloy, "Malloy")}
               >
                  <Code2 />
                  Copy Malloy
               </DropdownMenuItem>
               <DropdownMenuItem
                  onSelect={() =>
                     copy(`${window.location.origin}${href}`, "Link")
                  }
               >
                  <Link2 />
                  Copy link
               </DropdownMenuItem>
               {onDismiss && (
                  <>
                     <DropdownMenuSeparator />
                     <DropdownMenuItem onSelect={onDismiss}>
                        <EyeOff />
                        Show fewer like this
                     </DropdownMenuItem>
                  </>
               )}
            </DropdownMenuContent>
         </DropdownMenu>
         {save.dialog}
      </>
   );
}
