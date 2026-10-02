// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ExternalLink, Link2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The "⋯" menu on anything that came from Publisher. Content shows here in
 * place; this is the way out to the Publisher Console for what only it does,
 * like editing the model or the dashboard's layout.
 */
export function PublisherMenu({
   publisherUrl,
   children,
   label = "More actions",
}: {
   publisherUrl?: string;
   /** Items shown above the links. */
   children?: React.ReactNode;
   label?: string;
}) {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={label}>
               <MoreHorizontal />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="min-w-48">
            {children}
            {children && <DropdownMenuSeparator />}
            <DropdownMenuItem
               onSelect={() => {
                  void navigator.clipboard
                     .writeText(window.location.href)
                     .then(() => toast.success("Link copied"));
               }}
            >
               <Link2 />
               Copy link
            </DropdownMenuItem>
            {publisherUrl && (
               <DropdownMenuItem asChild>
                  <a href={publisherUrl} target="_blank" rel="noreferrer">
                     <ExternalLink />
                     Open in Publisher
                  </a>
               </DropdownMenuItem>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
