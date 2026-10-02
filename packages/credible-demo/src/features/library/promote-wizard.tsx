// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useMutation, useQuery } from "@tanstack/react-query";
import {
   Check,
   Copy,
   Download,
   LayoutDashboard,
   Loader2,
   RefreshCw,
   SquareFunction,
   TableProperties,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MalloyBlock } from "@/components/malloy-block";
import { Badge } from "@/components/ui/badge";
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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
   useClient,
   useLinkLibraryItem,
   useModelSource,
   useWorkspacePackages,
} from "@/data/hooks";
import { workspaceRoute } from "@/data/publisher";
import type { Promotable } from "@/data/sync";
import type { LibraryItem, PackageRef } from "@/data/types";
import {
   addQuery,
   addView,
   dashboardFile,
   declares,
   definedSources,
   extendableSources,
   IDENTIFIER,
   parseRun,
   toIdentifier,
} from "@/lib/promote";
import { cn } from "@/lib/utils";
import { CompileStatus, Field, Notice } from "./form-parts";

type Target = "view" | "query" | "dashboard";

const TARGETS: {
   value: Target;
   title: string;
   body: string;
   icon: typeof TableProperties;
   writer: string;
}[] = [
   {
      value: "view",
      title: "A view on its source",
      body: "Adds a view: to the source in its model file, so any query, dashboard, or notebook can reuse it by name.",
      icon: TableProperties,
      writer: "You save the edit",
   },
   {
      value: "query",
      title: "A named query",
      body: "Appends a query: to the model file. It runs by name, as it is, without being part of a source.",
      icon: SquareFunction,
      writer: "You save the edit",
   },
   {
      value: "dashboard",
      title: "A new dashboard",
      body: "Creates a one-tile dashboards/ file that imports the source. It can grow into a full dashboard in the builder.",
      icon: LayoutDashboard,
      writer: "Publisher saves it",
   },
];

const STEPS = ["Destination", "Name", "Review"] as const;

function useDebounced<T>(value: T, ms: number): T {
   const [settled, setSettled] = useState(value);
   useEffect(() => {
      const t = setTimeout(() => setSettled(value), ms);
      return () => clearTimeout(t);
   }, [value, ms]);
   return settled;
}

/**
 * Walks a Library item's Malloy into a package: where it goes, what it is
 * called, then the exact edit with Publisher's compile verdict on it. Once the
 * package serves it, the item is linked to it and shows as in sync.
 */
export function PromoteWizard({
   item,
   promotable,
   open,
   onOpenChange,
}: {
   item: LibraryItem;
   promotable: Promotable;
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
            {open && (
               <Wizard
                  item={item}
                  promotable={promotable}
                  onDone={() => onOpenChange(false)}
               />
            )}
         </DialogContent>
      </Dialog>
   );
}

function Wizard({
   item,
   promotable,
   onDone,
}: {
   item: LibraryItem;
   promotable: Promotable;
   onDone: () => void;
}) {
   const client = useClient();
   const navigate = useNavigate();
   const link = useLinkLibraryItem();
   const packages = useWorkspacePackages().data ?? [];
   const run = useMemo(() => parseRun(promotable.malloy), [promotable.malloy]);

   const [step, setStep] = useState(0);
   const [target, setTarget] = useState<Target>("view");
   const [pkgName, setPkgName] = useState(
      item.packageRef?.package ?? promotable.provenance.package,
   );
   const pkg = packages.find((p) => p.name === pkgName) ?? packages[0];
   const models = (pkg?.items ?? []).filter((i) => i.kind === "query");
   const [modelChoice, setModelChoice] = useState(promotable.provenance.model);
   const modelPath = models.some((m) => m.path === modelChoice)
      ? modelChoice
      : (models[0]?.path ?? "");
   const [sourceChoice, setSourceChoice] = useState(
      run?.source ?? promotable.provenance.source,
   );
   const [name, setName] = useState(toIdentifier(item.title));
   const [title, setTitle] = useState(item.title);
   const [doc, setDoc] = useState(item.description);
   const [pipeline, setPipeline] = useState(run?.pipeline ?? "");

   const model = useModelSource(pkg?.name ?? "", modelPath);
   const text = model.data?.text ?? "";
   const sources = useMemo(
      () =>
         target === "view" ? extendableSources(text) : definedSources(text),
      [text, target],
   );
   const source = sources.includes(sourceChoice)
      ? sourceChoice
      : (sources[0] ?? "");

   const nameProblem = !IDENTIFIER.test(name)
      ? "Use letters, digits and underscores, starting with a letter."
      : target === "view" && model.data?.views[source]?.includes(name)
        ? `${source} already has a view named ${name}.`
        : target === "query" &&
            (model.data?.queries.includes(name) || declares(text, name))
          ? `${modelPath} already declares ${name}.`
          : target === "dashboard" &&
              pkg?.items.some((i) => i.kind === "dashboard" && i.id === name)
            ? `${pkg.name} already has a dashboard named ${name}.`
            : undefined;

   const proposal = useMemo(() => {
      if (!model.data || !source || !pipeline.trim()) return undefined;
      const def = { name, doc, pipeline: pipeline.trim() };
      if (target === "dashboard") {
         const file = dashboardFile({ ...def, title, modelPath, source });
         return { path: file.path, text: file.text, added: file.text, line: 1 };
      }
      const edit =
         target === "view"
            ? addView(text, source, def)
            : addQuery(text, { ...def, source });
      return edit && { path: modelPath, ...edit };
   }, [
      model.data,
      text,
      source,
      pipeline,
      name,
      doc,
      title,
      target,
      modelPath,
   ]);

   const checking = useDebounced(step === 2 ? proposal : undefined, 400);
   const compile = useQuery({
      queryKey: ["promote-compile", pkg?.name, checking?.path, checking?.text],
      queryFn: () =>
         client.compileModel(pkg!.name, checking!.path, checking!.text, "file"),
      enabled: Boolean(pkg && checking),
      retry: false,
      staleTime: Infinity,
   });
   const stale = checking !== proposal;
   const errors = (compile.data ?? []).filter((p) => p.severity === "error");
   const compiles =
      !stale && compile.isSuccess && errors.length === 0 && !compile.isFetching;

   const finish = (ref: PackageRef, route: string) =>
      link.mutate([item.id, ref], {
         onSuccess: () => {
            toast.success(`${item.title} is now in ${ref.package}`, {
               action: { label: "Open", onClick: () => navigate(route) },
            });
            onDone();
         },
      });

   const save = useMutation({
      mutationFn: () =>
         client.writeDashboardFile(pkg!.name, proposal!.path, proposal!.text),
      onSuccess: (written) =>
         finish(
            {
               package: pkg!.name,
               kind: "dashboard",
               id: name,
               path: written.path,
               member: `${name}_tiles.${name}`,
            },
            workspaceRoute(pkg!.name, "dashboard", name),
         ),
   });

   const verify = useMutation({
      mutationFn: async () => {
         await client.reloadPackage(pkg!.name);
         const fresh = await client.getModelSource(pkg!.name, modelPath);
         const served =
            target === "view"
               ? fresh.views[source]?.includes(name)
               : fresh.queries.includes(name);
         if (!served) {
            throw new Error(
               `${pkg!.name} reloaded, but ${modelPath} doesn't declare ${name} yet. Save the edit into the package's ${modelPath}, then verify again.`,
            );
         }
      },
      onSuccess: () =>
         finish(
            {
               package: pkg!.name,
               kind: "query",
               id: modelPath,
               path: modelPath,
               member: target === "view" ? `${source}.${name}` : name,
            },
            workspaceRoute(pkg!.name, "query", modelPath),
         ),
   });

   const canNext =
      step === 0
         ? Boolean(run && pkg && modelPath && source && model.data)
         : step === 1
           ? !nameProblem && Boolean(proposal)
           : false;

   if (!run) {
      return (
         <>
            <DialogHeader>
               <DialogTitle>Add its query to the model</DialogTitle>
               <DialogDescription>
                  Only a single <code>run:</code> against a source can be added
                  automatically, and this item's Malloy is something else. Paste
                  it into a model by hand.
               </DialogDescription>
            </DialogHeader>
            <MalloyBlock value={promotable.malloy} />
            <DialogFooter>
               <Button variant="outline" onClick={onDone}>
                  Close
               </Button>
            </DialogFooter>
         </>
      );
   }

   return (
      <>
         <DialogHeader>
            <DialogTitle>
               Add the query behind “{item.title}” to the model
            </DialogTitle>
            <DialogDescription>
               Write its Malloy into the model so Publisher serves it by name,
               it goes through review with the rest of the model, and agents can
               find it. Saving the finding itself is Save.
            </DialogDescription>
            <ol className="flex items-center gap-2 pt-2 text-xs">
               {STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2">
                     {i > 0 && <span className="h-px w-6 bg-border" />}
                     <span
                        className={cn(
                           "flex items-center gap-1.5",
                           i === step
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                        )}
                     >
                        <span
                           className={cn(
                              "flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums",
                              i < step &&
                                 "border-primary bg-primary text-primary-foreground",
                              i === step && "border-primary text-primary",
                           )}
                        >
                           {i < step ? <Check className="size-3" /> : i + 1}
                        </span>
                        {label}
                     </span>
                  </li>
               ))}
            </ol>
         </DialogHeader>

         <div className="-mx-6 min-h-0 overflow-y-auto px-6">
            {step === 0 && (
               <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                     {TARGETS.map((t) => (
                        <button
                           key={t.value}
                           onClick={() => setTarget(t.value)}
                           className={cn(
                              "flex flex-col gap-1.5 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/60",
                              target === t.value &&
                                 "border-primary bg-primary/5 ring-1 ring-primary",
                           )}
                        >
                           <span className="flex items-center gap-2 font-medium">
                              <t.icon className="size-4 text-muted-foreground" />
                              {t.title}
                           </span>
                           <span className="text-xs text-muted-foreground">
                              {t.body}
                           </span>
                           <Badge variant="outline" className="mt-auto">
                              {t.writer}
                           </Badge>
                        </button>
                     ))}
                  </div>
                  <>
                     <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Package">
                           <Select
                              value={pkg?.name ?? ""}
                              onValueChange={setPkgName}
                           >
                              <SelectTrigger className="w-full font-mono text-xs">
                                 <SelectValue placeholder="No packages" />
                              </SelectTrigger>
                              <SelectContent>
                                 {packages.map((p) => (
                                    <SelectItem
                                       key={p.name}
                                       value={p.name}
                                       className="font-mono text-xs"
                                    >
                                       {p.name}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </Field>
                        <Field
                           label={
                              target === "dashboard"
                                 ? "Import from"
                                 : "Model file"
                           }
                        >
                           <Select
                              value={modelPath}
                              onValueChange={setModelChoice}
                           >
                              <SelectTrigger className="w-full font-mono text-xs">
                                 <SelectValue placeholder="No model files" />
                              </SelectTrigger>
                              <SelectContent>
                                 {models.map((m) => (
                                    <SelectItem
                                       key={m.path}
                                       value={m.path}
                                       className="font-mono text-xs"
                                    >
                                       {m.path}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </Field>
                        <Field label="Source">
                           <Select
                              value={source}
                              onValueChange={setSourceChoice}
                              disabled={sources.length === 0}
                           >
                              <SelectTrigger className="w-full font-mono text-xs">
                                 <SelectValue
                                    placeholder={
                                       model.isPending
                                          ? "Reading…"
                                          : "None defined"
                                    }
                                 />
                              </SelectTrigger>
                              <SelectContent>
                                 {sources.map((s) => (
                                    <SelectItem
                                       key={s}
                                       value={s}
                                       className="font-mono text-xs"
                                    >
                                       {s}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        </Field>
                     </div>
                     {model.error && (
                        <Notice tone="error">
                           Couldn't read {modelPath}: {model.error.message}
                        </Notice>
                     )}
                     {model.data && sources.length === 0 && (
                        <Notice tone="error">
                           {modelPath} defines no source
                           {target === "view"
                              ? " with an extend { } block"
                              : ""}
                           . Pick another model file
                           {target === "view" ? " or target" : ""}.
                        </Notice>
                     )}
                     {model.data && source && run.source !== source && (
                        <Notice>
                           The saved query runs against {run.source}. Its fields
                           must exist on {source} too, which the review step
                           checks.
                        </Notice>
                     )}
                  </>
               </div>
            )}

            {step === 1 && (
               <div className="space-y-4">
                  <Field
                     label="Name"
                     hint={
                        target === "view"
                           ? `view: on ${source}`
                           : target === "query"
                             ? `query: in ${modelPath}`
                             : `dashboards/${name}.malloy`
                     }
                     error={name ? nameProblem : undefined}
                  >
                     <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="font-mono"
                        aria-invalid={Boolean(nameProblem)}
                     />
                  </Field>
                  {target === "dashboard" && (
                     <Field label="Dashboard title">
                        <Input
                           value={title}
                           onChange={(e) => setTitle(e.target.value)}
                        />
                     </Field>
                  )}
                  <Field
                     label="Description"
                     hint={
                        target === "dashboard"
                           ? "The dashboard's header text"
                           : "Becomes its #(doc), which search and agents read"
                     }
                  >
                     <Textarea
                        value={doc}
                        onChange={(e) => setDoc(e.target.value)}
                        rows={2}
                     />
                  </Field>
                  {!proposal && model.data && (
                     <Notice tone="error">
                        Couldn't find where {source}'s block closes in{" "}
                        {modelPath}.
                     </Notice>
                  )}
               </div>
            )}

            {step === 2 && (
               <div className="space-y-4">
                  <Field
                     label="Definition"
                     hint={
                        target === "query"
                           ? `query: ${name} is ${source} ->`
                           : `view: ${name} is`
                     }
                  >
                     <MalloyBlock value={pipeline} onChange={setPipeline} />
                  </Field>
                  {!stale && compile.error && (
                     <Notice tone="error">{compile.error.message}</Notice>
                  )}
                  {!stale && errors.length > 0 && proposal && (
                     <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                        {errors.map((p, i) => (
                           <li key={i} className="font-mono">
                              {p.line !== undefined && (
                                 <span className="text-muted-foreground">
                                    {proposal.path}:{p.line}:{p.column}{" "}
                                 </span>
                              )}
                              {p.message}
                           </li>
                        ))}
                     </ul>
                  )}
                  {proposal && (
                     <>
                        <div className="flex items-center justify-between gap-3 text-sm">
                           <span className="text-muted-foreground">
                              {target === "dashboard" ? (
                                 <>
                                    Creates{" "}
                                    <code className="text-foreground">
                                       {pkg?.name}/{proposal.path}
                                    </code>
                                 </>
                              ) : (
                                 <>
                                    Adds to{" "}
                                    <code className="text-foreground">
                                       {pkg?.name}/{proposal.path}
                                    </code>{" "}
                                    at line {proposal.line}
                                 </>
                              )}
                           </span>
                           <CompileStatus
                              pending={stale || compile.isFetching}
                              error={compile.error}
                              errors={errors.length}
                              warnings={
                                 (compile.data ?? []).filter(
                                    (p) => p.severity === "warning",
                                 ).length
                              }
                           />
                        </div>
                        <MalloyBlock
                           value={proposal.added}
                           className="max-h-72"
                        />
                        {target !== "dashboard" && compiles && (
                           <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
                              <p>
                                 Publisher only writes dashboard files, so this
                                 edit is yours to save. Put it in the package's{" "}
                                 <code>{proposal.path}</code>, where it goes
                                 through the same review as the rest of the
                                 model, then verify. A server in watch mode
                                 recompiles on save.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                 <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                       void navigator.clipboard
                                          .writeText(proposal.added)
                                          .then(() =>
                                             toast.success(
                                                "Copied the addition",
                                             ),
                                          )
                                    }
                                 >
                                    <Copy />
                                    Copy the addition
                                 </Button>
                                 <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                       download(proposal.path, proposal.text)
                                    }
                                 >
                                    <Download />
                                    Download {proposal.path.split("/").pop()}
                                 </Button>
                              </div>
                              {verify.error && (
                                 <Notice tone="error">
                                    {verify.error.message}
                                 </Notice>
                              )}
                           </div>
                        )}
                     </>
                  )}
                  {save.error && (
                     <Notice tone="error">{save.error.message}</Notice>
                  )}
               </div>
            )}
         </div>

         <DialogFooter>
            {step > 0 && (
               <Button
                  variant="ghost"
                  className="sm:mr-auto"
                  onClick={() => setStep(step - 1)}
               >
                  Back
               </Button>
            )}
            <Button variant="outline" onClick={onDone}>
               Cancel
            </Button>
            {step < 2 ? (
               <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                  Next
               </Button>
            ) : target === "dashboard" ? (
               <Button
                  disabled={!compiles || save.isPending || link.isPending}
                  onClick={() => save.mutate()}
               >
                  {save.isPending && <Loader2 className="animate-spin" />}
                  Save to {pkg?.name}
               </Button>
            ) : (
               <Button
                  disabled={!compiles || verify.isPending || link.isPending}
                  onClick={() => verify.mutate()}
               >
                  {verify.isPending ? (
                     <Loader2 className="animate-spin" />
                  ) : (
                     <RefreshCw />
                  )}
                  I've saved it: reload and verify
               </Button>
            )}
         </DialogFooter>
      </>
   );
}

function download(path: string, text: string) {
   const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
   const a = document.createElement("a");
   a.href = url;
   a.download = path.split("/").pop() ?? "model.malloy";
   a.click();
   URL.revokeObjectURL(url);
}
