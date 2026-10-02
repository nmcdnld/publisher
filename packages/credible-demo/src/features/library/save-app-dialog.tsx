// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   appPaths,
   isSlug,
   slugOf,
   slugOfAppPath,
} from "@malloy-publisher/app-manifest";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MalloyBlock } from "@/components/malloy-block";
import { Button } from "@/components/ui/button";
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
   keys,
   useClient,
   useLibrary,
   useViewer,
   useWorkspacePackages,
} from "@/data/hooks";
import { pageKey, PublisherError, workspaceRoute } from "@/data/publisher";
import { findingHref, findingOf, type Promotable } from "@/data/sync";
import type { LibraryItem } from "@/data/types";
import { PromoteWizard } from "@/features/library/promote-wizard";
import { parseRun } from "@/lib/promote";
import { dataAppRef, findingHome, findingManifest } from "@/lib/save-app";
import { CompileStatus, Field, Notice } from "./form-parts";

/**
 * Save to the workspace: the whole finding, as a data app in the package its
 * data came from. Publisher compiles it there first; when the package can't
 * take it, the finding can still be kept in the workspace Library only.
 */
export function SaveAppDialog({
   promotable,
   item,
   open,
   onOpenChange,
}: {
   promotable: Promotable;
   /** The Library item it was opened from, whose title and last save it starts from. */
   item?: LibraryItem;
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const [followOn, setFollowOn] = useState<LibraryItem | null>(null);
   return (
      <>
         <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
               {open && (
                  <SaveForm
                     promotable={promotable}
                     item={item}
                     onDone={(next) => {
                        onOpenChange(false);
                        if (next) setFollowOn(next);
                     }}
                  />
               )}
            </DialogContent>
         </Dialog>
         {followOn && (
            <PromoteWizard
               item={followOn}
               promotable={promotable}
               open
               onOpenChange={(o) => !o && setFollowOn(null)}
            />
         )}
      </>
   );
}

function SaveForm({
   promotable,
   item,
   onDone,
}: {
   promotable: Promotable;
   item?: LibraryItem;
   /** Called with the kept item when its query should also go into the model. */
   onDone: (addQuery?: LibraryItem) => void;
}) {
   const client = useClient();
   const qc = useQueryClient();
   const navigate = useNavigate();
   const viewer = useViewer().data?.person;
   const packages = useWorkspacePackages();
   const library = useLibrary().data ?? [];
   const finding = findingOf(promotable);
   const home = useMemo(() => findingHome(promotable), [promotable]);
   const pkg = home.ok
      ? packages.data?.find((p) => p.name === home.package)
      : undefined;

   // The workspace's item for this finding is the one a save updates.
   const kept =
      library.find(
         (i) => i.scope === "workspace" && i.href === findingHref(finding),
      ) ?? item;
   const savedRef = [kept?.packageRef, item?.packageRef].find(
      (r) => r?.kind === "data_app" && home.ok && r.package === home.package,
   );
   const savedSlug = savedRef && slugOfAppPath(savedRef.id);

   const base = useMemo(
      () =>
         viewer &&
         findingManifest(promotable, { title: "", description: "" }, viewer),
      [promotable, viewer],
   );
   const [title, setTitle] = useState(kept?.title ?? base?.title ?? "");
   const [description, setDescription] = useState(
      kept?.description ?? base?.description ?? "",
   );
   const [slug, setSlug] = useState(savedSlug ?? slugOf(title));
   const canAddQuery = Boolean(parseRun(promotable.malloy));
   const [addQuery, setAddQuery] = useState(false);

   // Read once, when the dialog opens: a replace must be of the app as it was then.
   const previous = useQuery({
      queryKey: ["data-app", home.ok && home.package, savedSlug],
      queryFn: () => client.getDataAppManifest(pkg!.name, savedSlug!),
      enabled: Boolean(pkg && savedSlug),
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
   });
   const replacing = slug === savedSlug && Boolean(previous.data);
   const taken = (s: string) =>
      pkg?.items.some(
         (i) => i.kind === "data_app" && i.id === appPaths(s).index,
      );
   const slugProblem = !isSlug(slug)
      ? "Use lowercase letters, digits and dashes, starting with a letter or digit."
      : !replacing && taken(slug)
        ? `${pkg?.name} already has an app at apps/${slug}/.`
        : undefined;

   const manifest = useMemo(
      () =>
         viewer && findingManifest(promotable, { title, description }, viewer),
      [promotable, title, description, viewer],
   );
   const queries = Object.entries(manifest?.queries ?? {});
   const compile = useQuery({
      queryKey: [
         "save-app-compile",
         pkg?.name,
         queries.map(([, q]) => [q.model, q.malloy]),
      ],
      queryFn: () =>
         Promise.all(
            queries.map(async ([id, q]) => ({
               id,
               title: q.title ?? id,
               problems: (
                  await client.compileModel(
                     pkg!.name,
                     q.model,
                     q.malloy,
                     "append",
                  )
               ).filter((p) => p.severity === "error"),
            })),
         ),
      enabled: Boolean(pkg && manifest),
      retry: false,
      staleTime: Infinity,
   });
   const compileErrors = (compile.data ?? []).filter((q) => q.problems.length);
   const compiles =
      compile.isSuccess && compileErrors.length === 0 && !compile.isFetching;

   const refresh = () =>
      Promise.all(
         [keys.library, keys.workspace, ["comments"]].map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
         ),
      );
   const entry = {
      title: title.trim() || (base?.title ?? ""),
      description: description.trim() || (base?.description ?? ""),
   };

   const save = useMutation({
      mutationFn: async () => {
         await client.writeDataApp(
            pkg!.name,
            slug,
            manifest!,
            replacing ? previous.data?.contentHash : undefined,
         );
         const ref = dataAppRef(pkg!.name, slug);
         const saved = await client.keepInWorkspace(finding, ref, entry);
         if (finding.kind === "analysis") {
            await client.moveComments(
               finding.id,
               pageKey(pkg!.name, "data_app", ref.id),
            );
         }
         return saved;
      },
      onSuccess: async (saved) => {
         await refresh();
         const route = workspaceRoute(
            pkg!.name,
            "data_app",
            appPaths(slug).index,
         );
         toast.success(`Saved to ${pkg!.name}`, {
            description: `${entry.title} is at apps/${slug}/, for everyone in the workspace and the Publisher Console.`,
            action: { label: "Open", onClick: () => navigate(route) },
         });
         onDone(addQuery ? saved : undefined);
      },
   });

   const keepOnly = useMutation({
      mutationFn: () => client.keepInWorkspace(finding, null, entry),
      onSuccess: async (kept) => {
         await refresh();
         toast.success("Kept in the workspace Library", {
            description: "It isn't in a package, so only this app shows it.",
            action: {
               label: "View",
               onClick: () =>
                  navigate(`/library?scope=workspace&item=${kept.id}`),
            },
         });
         onDone();
      },
   });

   const refusal =
      save.error instanceof PublisherError ? save.error : undefined;
   const conflict = refusal?.status === 409;
   // Where the package can't take it at all, the Library still can.
   const cannotWrite =
      !home.ok ||
      (packages.isSuccess && !pkg) ||
      packages.isError ||
      refusal?.status === 403 ||
      (save.error !== null && !refusal);

   if (!home.ok) {
      return (
         <>
            <DialogHeader>
               <DialogTitle>Save to the workspace</DialogTitle>
               <DialogDescription>
                  A saved finding lives in the package its data came from, and
                  this one has none it can go to.
               </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
               <Notice tone="error">{home.problem}</Notice>
               <p className="text-sm text-muted-foreground">
                  You can still keep it in the workspace Library. Everyone here
                  sees it; the Publisher Console and agents don't.
               </p>
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => onDone()}>
                  Cancel
               </Button>
               <Button
                  disabled={keepOnly.isPending}
                  onClick={() => keepOnly.mutate()}
               >
                  Keep in the Library only
               </Button>
            </DialogFooter>
         </>
      );
   }

   return (
      <>
         <DialogHeader>
            <DialogTitle>
               Save to <span className="font-mono">{home.package}</span>
            </DialogTitle>
            <DialogDescription>
               Saves all of it, the text, the chart and the rows it was written
               against, into {home.package} as a data app. Everyone in the
               workspace sees it, so does the Publisher Console, and its charts
               rerun live.
            </DialogDescription>
         </DialogHeader>

         <div className="-mx-6 min-h-0 space-y-4 overflow-y-auto px-6">
            <Field
               label="Address"
               hint={`${home.package}/public/apps/${slug}/`}
               error={slugProblem}
            >
               <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="font-mono"
                  aria-invalid={Boolean(slugProblem)}
               />
            </Field>
            <Field label="Title">
               <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
               />
            </Field>
            <Field
               label="Description"
               hint="The line under the title, and what the Library card shows"
            >
               <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
               />
            </Field>
            {replacing && (
               <Notice>
                  This replaces what you saved at apps/{slug}/. Pick another
                  address to keep both.
               </Notice>
            )}

            <div className="space-y-2 rounded-lg border p-3">
               <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                     {queries.length} quer{queries.length === 1 ? "y" : "ies"},
                     checked against {home.package}
                  </span>
                  {pkg && (
                     <CompileStatus
                        pending={compile.isFetching}
                        error={compile.error}
                        errors={compileErrors.reduce(
                           (n, q) => n + q.problems.length,
                           0,
                        )}
                        warnings={0}
                     />
                  )}
               </div>
               {compileErrors.length > 0 && (
                  <>
                     <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                        {compileErrors.flatMap((q) =>
                           q.problems.map((p, i) => (
                              <li key={`${q.id}-${i}`} className="font-mono">
                                 <span className="text-muted-foreground">
                                    {q.title}:{" "}
                                 </span>
                                 {p.message}
                              </li>
                           )),
                        )}
                     </ul>
                     <Notice tone="error">
                        {home.package} no longer runs this finding as it was
                        written, so it can't be saved there. Remix it against
                        the model as it is now.
                     </Notice>
                  </>
               )}
               {compile.error && (
                  <Notice tone="error">{compile.error.message}</Notice>
               )}
               <details className="group text-sm">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                     <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                     Show the Malloy
                  </summary>
                  <div className="mt-2 space-y-3">
                     {queries.map(([id, q]) => (
                        <Field key={id} label={q.title ?? id} hint={q.model}>
                           <MalloyBlock value={q.malloy} className="max-h-40" />
                        </Field>
                     ))}
                  </div>
               </details>
            </div>

            {canAddQuery && (
               <div className="flex items-start justify-between gap-3">
                  <div>
                     <Label htmlFor="save-add-query">
                        Also add its query to the model
                     </Label>
                     <p className="mt-0.5 text-xs text-muted-foreground">
                        Next, as a view or a named query, so others can reuse it
                        by name and agents find it.
                     </p>
                  </div>
                  <Switch
                     id="save-add-query"
                     checked={addQuery}
                     onCheckedChange={setAddQuery}
                  />
               </div>
            )}

            {packages.isSuccess && !pkg && (
               <Notice tone="error">
                  Publisher isn't serving {home.package} right now, so there's
                  nowhere to save it.
               </Notice>
            )}
            {packages.isError && (
               <Notice tone="error">
                  Publisher didn't answer, so nothing can be saved into a
                  package.
               </Notice>
            )}
            {save.error && (
               <Notice tone="error">
                  {conflict
                     ? `apps/${slug}/ changed in ${home.package} since you opened this, so nothing was written. Close and save again to start from what's there now.`
                     : save.error.message}
               </Notice>
            )}
            {keepOnly.error && (
               <Notice tone="error">{keepOnly.error.message}</Notice>
            )}
         </div>

         <DialogFooter>
            {cannotWrite && (
               <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  disabled={keepOnly.isPending}
                  onClick={() => keepOnly.mutate()}
               >
                  Keep in the Library only
               </Button>
            )}
            <Button variant="outline" onClick={() => onDone()}>
               Cancel
            </Button>
            <Button
               disabled={
                  !pkg ||
                  !manifest ||
                  !compiles ||
                  Boolean(slugProblem) ||
                  save.isPending ||
                  conflict ||
                  (Boolean(savedSlug) && previous.isPending)
               }
               onClick={() => save.mutate()}
            >
               {save.isPending && <Loader2 className="animate-spin" />}
               {replacing ? "Replace in" : "Save to"} {home.package}
            </Button>
         </DialogFooter>
      </>
   );
}
