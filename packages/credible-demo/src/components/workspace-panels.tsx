// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQueryClient } from "@tanstack/react-query";
import {
   Check,
   ImageUp,
   LoaderCircle,
   Plus,
   Sparkles,
   Trash2,
   TriangleAlert,
   WandSparkles,
   X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FIXTURES_STORAGE_KEY } from "@/data/fixture-client";
import {
   useAllWorkspacePackages,
   useClient,
   useDemoScenario,
   useWorkspacePackages,
} from "@/data/hooks";
import { startDemoRefresh, useDemoRefresh } from "@/lib/demo-refresh";
import { relativeTime } from "@/lib/format";
import { STORAGE_THEME_ID } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
   DEFAULT_WORKSPACE_ID,
   createWorkspace,
   deleteWorkspace,
   readLogoFile,
   showsPackage,
   switchWorkspace,
   updateWorkspace,
   useWorkspaces,
   workspaceLabel,
   type Workspace,
} from "@/lib/workspaces";

/** The workspace's logo, a monogram of its name, or the Credible mark. */
export function WorkspaceMark({
   workspace,
   className,
}: {
   workspace: Workspace;
   className?: string;
}) {
   const name = workspace.name?.trim();
   if (workspace.logo) {
      return (
         <img
            src={workspace.logo}
            alt=""
            className={cn(
               "size-7 shrink-0 rounded-lg object-contain",
               className,
            )}
         />
      );
   }
   return (
      <div
         className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground [&_svg]:size-4",
            className,
         )}
      >
         {name ? name[0].toUpperCase() : <Sparkles />}
      </div>
   );
}

/** Lists the workspaces to switch between, with a field to start a new one. */
export function WorkspaceListPanel() {
   const { workspaces, active } = useWorkspaces();
   const [name, setName] = useState("");
   const create = () => name.trim() && createWorkspace(name);

   return (
      <>
         <div className="max-h-72 overflow-y-auto p-1">
            {workspaces.map((w) => (
               <button
                  key={w.id}
                  type="button"
                  onClick={() => w.id !== active.id && switchWorkspace(w.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
               >
                  <WorkspaceMark
                     workspace={w}
                     className="size-5 rounded-md text-[11px] [&_svg]:size-3"
                  />
                  <span className="flex-1 truncate">{workspaceLabel(w)}</span>
                  {w.id === active.id && (
                     <Check className="size-3.5 shrink-0 text-primary" />
                  )}
               </button>
            ))}
         </div>
         <div className="flex gap-2 border-t p-2">
            <Input
               placeholder="New workspace name…"
               value={name}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && create()}
               className="h-8 text-sm md:text-sm"
            />
            <Button
               size="sm"
               className="h-8"
               disabled={!name.trim()}
               onClick={create}
            >
               <Plus />
               Create
            </Button>
         </div>
         <p className="px-3 pb-2 text-xs text-muted-foreground">
            Each workspace keeps its own demo data, theme, name, and logo.
         </p>
      </>
   );
}

/** Edits the active workspace's name, logo, and packages, and deletes it. */
export function WorkspaceSettingsPanel() {
   const { active } = useWorkspaces();
   const fileRef = useRef<HTMLInputElement>(null);
   const [confirmDelete, setConfirmDelete] = useState(false);

   const upload = async (file: File | undefined) => {
      if (!file) return;
      try {
         updateWorkspace(active.id, { logo: await readLogoFile(file) });
      } catch {
         toast.error("Couldn't read that image.");
      }
   };

   return (
      <div className="flex flex-col gap-4 p-3">
         <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name" className="text-xs">
               Name
            </Label>
            <Input
               id="workspace-name"
               placeholder="Credible"
               value={active.name ?? ""}
               onChange={(e) =>
                  updateWorkspace(active.id, {
                     name: e.target.value || undefined,
                  })
               }
               className="h-8 text-sm md:text-sm"
            />
         </div>

         <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Logo</span>
            <div className="flex items-center gap-2">
               <WorkspaceMark workspace={active} className="size-10" />
               <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                     void upload(e.target.files?.[0]);
                     e.target.value = "";
                  }}
               />
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
               >
                  <ImageUp />
                  {active.logo ? "Replace" : "Upload"}
               </Button>
               {active.logo && (
                  <Button
                     variant="ghost"
                     size="sm"
                     onClick={() =>
                        updateWorkspace(active.id, { logo: undefined })
                     }
                  >
                     <X />
                     Remove
                  </Button>
               )}
            </div>
         </div>

         <WorkspacePackagesField />

         {active.id !== DEFAULT_WORKSPACE_ID && (
            <Button
               variant="ghost"
               size="sm"
               className="justify-start text-destructive hover:text-destructive"
               onClick={() =>
                  confirmDelete
                     ? deleteWorkspace(active.id, [
                          FIXTURES_STORAGE_KEY,
                          STORAGE_THEME_ID,
                       ])
                     : setConfirmDelete(true)
               }
            >
               <Trash2 />
               {confirmDelete
                  ? "Click again to delete it and its data"
                  : "Delete workspace"}
            </Button>
         )}
      </div>
   );
}

/** The steps of the demo task in flight or last run, as it narrated them. */
export function DemoSteps({ className }: { className?: string }) {
   const task = useDemoRefresh();
   const running = task.status === "running";
   if (!task.steps.length && !task.error) return null;
   return (
      <ol className={cn("flex flex-col gap-1.5", className)}>
         {task.steps.map((s, i) => {
            const pending = running && i === task.steps.length - 1;
            return (
               <li key={i} className="flex gap-2 text-xs">
                  {pending ? (
                     <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : s.tone === "warning" ? (
                     <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-negative" />
                  ) : (
                     <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  )}
                  <span className="min-w-0">
                     <span className="block">{s.label}</span>
                     {s.detail && (
                        <span className="block text-muted-foreground">
                           {s.detail}
                        </span>
                     )}
                  </span>
               </li>
            );
         })}
         {task.status === "failed" && task.error && (
            <li className="flex gap-2 text-xs text-negative">
               <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
               {task.error}
            </li>
         )}
      </ol>
   );
}

const SCENARIOS = [
   "An exec team skimming the week's numbers before Monday's review",
   "An analyst hunting for anomalies worth a deeper look",
   "A new hire learning what this data can answer",
];

/**
 * Rebuilds the active workspace's demo content for the packages it shows,
 * steered by a scenario: who the demo is for and what they care about.
 */
export function DemoContentPanel() {
   const client = useClient();
   const qc = useQueryClient();
   const { active } = useWorkspaces();
   const packages = useWorkspacePackages().data;
   const last = useDemoScenario().data;
   const refresh = useDemoRefresh();
   const [focus, setFocus] = useState(last?.focus ?? "");
   const [samples, setSamples] = useState(last?.samples ?? true);
   const [confirm, setConfirm] = useState(false);
   const running = refresh.status === "running";
   const storefront = showsPackage(active, "storefront");

   const start = () => {
      setConfirm(false);
      void startDemoRefresh(client, qc, { focus, samples });
   };

   return (
      <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto p-3">
         <p className="text-xs text-muted-foreground">
            Replaces this workspace's insights, feed, library, chats, and home
            page with content built for{" "}
            {packages ? (
               <span className="font-medium text-foreground">
                  {packages.map((p) => p.name).join(", ") || "no packages"}
               </span>
            ) : (
               "its packages"
            )}
            .
         </p>

         <div className="flex flex-col gap-1.5">
            <Label htmlFor="demo-focus" className="text-xs">
               Scenario{" "}
               <span className="font-normal text-muted-foreground">
                  (optional)
               </span>
            </Label>
            <Textarea
               id="demo-focus"
               rows={3}
               value={focus}
               disabled={running}
               onChange={(e) => setFocus(e.target.value)}
               placeholder="Who is this demo for, and what do they care about?"
               className="resize-none text-sm md:text-sm"
            />
            <div className="flex flex-wrap gap-1">
               {SCENARIOS.map((s) => (
                  <button
                     key={s}
                     type="button"
                     disabled={running}
                     onClick={() => setFocus(s)}
                     className="rounded-full border px-2 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                  >
                     {s}
                  </button>
               ))}
            </div>
         </div>

         {storefront && (
            <div className="flex items-center gap-2">
               <Label
                  htmlFor="demo-samples"
                  className="flex-1 flex-col items-start gap-0 text-xs font-normal"
               >
                  <span className="font-medium">Keep storefront samples</span>
                  <span className="text-muted-foreground">
                     The hand-written storefront story, plus the new insights
                  </span>
               </Label>
               <Switch
                  id="demo-samples"
                  size="sm"
                  checked={samples}
                  disabled={running}
                  onCheckedChange={setSamples}
               />
            </div>
         )}

         <Button
            size="sm"
            disabled={running || packages?.length === 0}
            variant={confirm ? "destructive" : "default"}
            onClick={() => (confirm ? start() : setConfirm(true))}
         >
            {running ? (
               <LoaderCircle className="animate-spin" />
            ) : (
               <WandSparkles />
            )}
            {running
               ? refresh.task === "briefing"
                  ? "Writing the briefing…"
                  : refresh.task === "questions"
                    ? "Writing questions…"
                    : "Refreshing…"
               : confirm
                 ? "Click again to replace it all"
                 : "Refresh demo content"}
         </Button>
         <p className="text-[11px] text-muted-foreground">
            Insights and the home page briefing are written by Claude Opus 5.5
            from live queries, and every number is checked. Takes a few minutes
            and a few dollars of OpenRouter credit.
         </p>

         <DemoSteps className="border-t pt-3" />
         {refresh.status === "idle" && last && (
            <p className="border-t pt-3 text-[11px] text-muted-foreground">
               Last built {relativeTime(last.refreshedAt)}
               {last.focus ? ` for “${last.focus}”` : ""}.
            </p>
         )}
      </div>
   );
}

/**
 * Picks which of the environment's packages the active workspace shows.
 * Turning every one back on clears the list, so later packages show too.
 */
function WorkspacePackagesField() {
   const { active } = useWorkspaces();
   const { data: packages, isPending, isError } = useAllWorkspacePackages();

   const toggle = (name: string, on: boolean) => {
      const all = (packages ?? []).map((p) => p.name);
      const shown = all.filter((n) =>
         n === name ? on : showsPackage(active, n),
      );
      updateWorkspace(active.id, {
         packages: shown.length === all.length ? undefined : shown,
      });
   };

   return (
      <div className="flex flex-col gap-1.5">
         <span className="text-xs font-medium">Packages</span>
         {isPending ? (
            <p className="text-xs text-muted-foreground">Loading packages…</p>
         ) : isError ? (
            <p className="text-xs text-muted-foreground">
               Couldn't reach Publisher to list packages.
            </p>
         ) : packages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
               Publisher serves no packages here.
            </p>
         ) : (
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
               {packages.map((p) => {
                  const id = `workspace-package-${p.name}`;
                  return (
                     <div
                        key={p.name}
                        className="flex items-center gap-2 rounded-sm px-1 py-1"
                     >
                        <Label
                           htmlFor={id}
                           className="min-w-0 flex-1 flex-col items-start gap-0 font-normal"
                        >
                           <span className="truncate text-sm">{p.name}</span>
                           {p.description && (
                              <span className="line-clamp-1 text-xs text-muted-foreground">
                                 {p.description}
                              </span>
                           )}
                        </Label>
                        <Switch
                           id={id}
                           size="sm"
                           checked={showsPackage(active, p.name)}
                           onCheckedChange={(on) => toggle(p.name, on)}
                        />
                     </div>
                  );
               })}
            </div>
         )}
         <p className="text-xs text-muted-foreground">
            Hidden packages stay in Publisher; this workspace just doesn't show
            them.
         </p>
      </div>
   );
}
