// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Bookmark,
   BookmarkCheck,
   ChevronDown,
   Package,
   PackageCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
   useLibrary,
   useSaveAnalysis,
   useViewer,
   useWorkspacePackages,
} from "@/data/hooks";
import {
   analysisPromotable,
   findingHref,
   findingOf,
   type Promotable,
} from "@/data/sync";
import type { Analysis } from "@/data/types";
import { SaveAppDialog } from "@/features/library/save-app-dialog";
import { findingHome } from "@/lib/save-app";
import { cn } from "@/lib/utils";

export type FindingSave = ReturnType<typeof useFindingSave>;

/**
 * Where a finding is kept, and the two ways to keep it: for the viewer, in
 * their Library, or for everyone, as a data app in its package. `dialog` must
 * be rendered for the second to open.
 */
export function useFindingSave(
   promotable: Promotable | undefined,
   /**
    * Makes the analysis when `promotable` is only a draft of one, as a chat
    * answer is until it is first saved; either save calls it first.
    */
   keep?: () => Promise<Analysis>,
) {
   const navigate = useNavigate();
   const library = useLibrary().data ?? [];
   const packages = useWorkspacePackages().data;
   const viewerId = useViewer().data?.person.id;
   const saveAnalysis = useSaveAnalysis();
   const [open, setOpen] = useState(false);
   const [kept, setKept] = useState<Analysis>();
   const [keeping, setKeeping] = useState(false);

   const current = kept ? analysisPromotable(kept) : promotable;
   const drafted = Boolean(keep && !kept);
   const href = current && !drafted && findingHref(findingOf(current));
   const mine = library.find((i) => i.href === href && i.ownerId === viewerId);
   const workspace = library.find(
      (i) => i.href === href && i.scope === "workspace",
   );
   const ref =
      workspace?.packageRef?.kind === "data_app"
         ? workspace.packageRef
         : undefined;
   const gone =
      ref &&
      packages &&
      !packages
         .find((p) => p.name === ref.package)
         ?.items.some((i) => i.kind === "data_app" && i.id === ref.id);
   const home = current && findingHome(current);

   const ensure = async (): Promise<Analysis | undefined> => {
      if (kept || !keep) return kept ?? current?.finding.analysis;
      setKeeping(true);
      try {
         const made = await keep();
         setKept(made);
         return made;
      } catch (e) {
         toast.error(e instanceof Error ? e.message : String(e));
         return undefined;
      } finally {
         setKeeping(false);
      }
   };

   const saveForMe = async () => {
      const analysis = await ensure();
      if (!analysis) return;
      saveAnalysis.mutate([analysis.id], {
         onSuccess: (item) =>
            toast.success("Saved to your Library", {
               action: {
                  label: "View",
                  onClick: () => navigate(`/library?item=${item.id}`),
               },
            }),
         onError: (e) => toast.error(e.message),
      });
   };

   return {
      /** The viewer's own item for it, when they have one. */
      mine,
      /** The data app it was saved as, when it was. */
      ref,
      /** The package it was saved into, when it was. */
      savedIn: ref?.package,
      /** Saved once, but its package no longer serves it. */
      gone: Boolean(gone),
      toPackageLabel: ref
         ? gone
            ? `Save again to ${ref.package}…`
            : `Update in ${ref.package}…`
         : home?.ok
           ? `Save to ${home.package}…`
           : "Save to the workspace…",
      saveForMe,
      savingForMe: keeping || saveAnalysis.isPending,
      /** Whether it has anything a package could hold. */
      canSaveToPackage: Boolean(current),
      openSaveToPackage: () => {
         void ensure().then((analysis) => analysis && setOpen(true));
      },
      dialog: current && !drafted && (
         <SaveAppDialog
            promotable={current}
            item={workspace}
            open={open}
            onOpenChange={setOpen}
         />
      ),
   };
}

/** The two saves, as items in a menu that renders `save.dialog` beside it. */
export function SaveMenuItems({
   save,
   personal = true,
}: {
   save: FindingSave;
   /** Include "Save for me"; off where a button beside the menu does it. */
   personal?: boolean;
}) {
   return (
      <>
         {personal && (
            <DropdownMenuItem
               disabled={save.savingForMe || Boolean(save.mine)}
               onSelect={save.saveForMe}
            >
               {save.mine ? (
                  <BookmarkCheck className="text-primary" />
               ) : (
                  <Bookmark />
               )}
               {save.mine ? "Saved for you" : "Save for me"}
            </DropdownMenuItem>
         )}
         <DropdownMenuItem
            disabled={!save.canSaveToPackage || save.savingForMe}
            onSelect={save.openSaveToPackage}
         >
            {save.savedIn && !save.gone ? (
               <PackageCheck className="text-primary" />
            ) : (
               <Package />
            )}
            {save.canSaveToPackage
               ? save.toPackageLabel
               : "Save to a package (run a query first)"}
         </DropdownMenuItem>
      </>
   );
}

/**
 * Save, as a split button: the button keeps the finding in the viewer's
 * Library (or opens it there once it is), and the menu beside it saves it
 * for the whole workspace.
 */
export function SaveButton({
   promotable,
   keep,
   className,
}: {
   promotable: Promotable | undefined;
   /** Makes the analysis on first save, when `promotable` is a draft. */
   keep?: () => Promise<Analysis>;
   className?: string;
}) {
   const navigate = useNavigate();
   const save = useFindingSave(promotable, keep);
   const inPackage = save.savedIn && !save.gone;
   return (
      <>
         <div className={cn("inline-flex items-center", className)}>
            <Button
               variant="ghost"
               size="sm"
               className="rounded-r-none pr-2"
               disabled={!promotable || save.savingForMe}
               title={
                  save.mine ? "Open it in your Library" : "Save to your Library"
               }
               onClick={() =>
                  save.mine
                     ? navigate(`/library?item=${save.mine.id}`)
                     : void save.saveForMe()
               }
            >
               {save.mine ? (
                  <BookmarkCheck className="text-primary" />
               ) : (
                  <Bookmark />
               )}
               {save.mine ? "Saved" : "Save"}
            </Button>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button
                     variant="ghost"
                     size="sm"
                     className="gap-1 rounded-l-none px-1.5"
                     disabled={!promotable}
                     aria-label={
                        inPackage
                           ? `In ${save.savedIn}; more ways to save`
                           : "More ways to save"
                     }
                     title={inPackage ? `In ${save.savedIn}` : undefined}
                  >
                     {inPackage && <PackageCheck className="text-primary" />}
                     <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                     For everyone in the workspace
                  </DropdownMenuLabel>
                  <SaveMenuItems save={save} personal={false} />
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         {save.dialog}
      </>
   );
}
