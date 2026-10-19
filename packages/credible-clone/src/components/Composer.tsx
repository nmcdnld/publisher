// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import { ArrowUp, FileText, Folder, LayoutGrid, Plus, X } from "lucide-react";
import { useState } from "react";
import { packages, type Scope } from "../fixtures";
import { ModelPicker } from "./ModelPicker";

const chip =
   "flex min-w-0 items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono whitespace-nowrap text-ink";

export function Composer({
   scope,
   onScopeChange,
   onSubmit,
   hero,
   floating,
   modelPicker,
   autoFocus,
   className,
}: {
   scope: Scope;
   onScopeChange?: (scope: Scope) => void;
   onSubmit: (text: string) => void;
   hero?: boolean;
   /** Drawn over page content, so it needs a heavier shadow. */
   floating?: boolean;
   /** Starts a chat, so its model is still open to choose. */
   modelPicker?: boolean;
   autoFocus?: boolean;
   className?: string;
}) {
   const [value, setValue] = useState("");
   const [menuOpen, setMenuOpen] = useState(false);
   const canSend = value.trim().length > 0;

   const submit = () => {
      if (!canSend) return;
      onSubmit(value.trim());
      setValue("");
   };

   return (
      <div className={clsx("w-full", className)}>
         <form
            className={clsx(
               "@container w-full rounded-xl border border-line bg-panel px-2.5 pt-2.5 pb-2",
               hero
                  ? "ring-4 ring-hover"
                  : floating
                    ? "shadow-lg"
                    : "shadow-sm",
            )}
            onSubmit={(e) => {
               e.preventDefault();
               submit();
            }}
         >
            <textarea
               rows={1}
               autoFocus={autoFocus}
               value={value}
               onChange={(e) => setValue(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                     e.preventDefault();
                     submit();
                  }
               }}
               placeholder={
                  scope.report
                     ? "What would you like to do next?"
                     : scope.package
                       ? `Ask about ${scope.package}`
                       : "What would you like to do next?"
               }
               className="max-h-40 w-full resize-none bg-transparent text-[12px] outline-none [field-sizing:content] placeholder:text-muted"
            />
            <div className="relative mt-3 flex items-center gap-1.5 text-[9px]">
               <span className="mr-0.5 hidden shrink-0 text-muted @min-[20rem]:inline">
                  Scope
               </span>
               {scope.report ? (
                  <span className={chip} title={scope.report.title}>
                     <FileText className="size-2.5 shrink-0 text-muted" />
                     <span className="truncate">{scope.report.title}</span>
                     {onScopeChange && (
                        <button
                           type="button"
                           aria-label={`Remove ${scope.report.title}`}
                           onClick={() => onScopeChange({})}
                           className="ml-1 flex size-3 shrink-0 items-center justify-center rounded-full bg-ink text-surface"
                        >
                           <X className="size-2" strokeWidth={3} />
                        </button>
                     )}
                  </span>
               ) : scope.package ? (
                  <>
                     {scope.environment && (
                        <span
                           className={clsx(chip, "shrink-[2]")}
                           title={scope.environment}
                        >
                           <LayoutGrid className="size-2.5 shrink-0 text-muted" />
                           <span className="truncate">{scope.environment}</span>
                        </span>
                     )}
                     <span className={chip} title={scope.package}>
                        <Folder className="size-2.5 shrink-0 text-muted" />
                        <span className="truncate">{scope.package}</span>
                        {onScopeChange && (
                           <button
                              type="button"
                              aria-label={`Remove ${scope.package}`}
                              onClick={() => onScopeChange({})}
                              className="ml-1 flex size-3 shrink-0 items-center justify-center rounded-full bg-ink text-surface"
                           >
                              <X className="size-2" strokeWidth={3} />
                           </button>
                        )}
                     </span>
                  </>
               ) : (
                  <span className={chip}>All packages</span>
               )}

               {onScopeChange && (
                  <button
                     type="button"
                     aria-label="Add scope"
                     title="Add scope"
                     onClick={() => setMenuOpen((o) => !o)}
                     className="flex shrink-0 items-center gap-0.5 rounded bg-hover px-1.5 py-0.5 whitespace-nowrap text-muted hover:text-ink"
                  >
                     <Plus className="size-2.5" />
                     <span className="hidden @min-[20rem]:inline">Add</span>
                  </button>
               )}
               {menuOpen && (
                  <div className="absolute bottom-6 left-8 z-10 min-w-40 rounded-md border border-line bg-surface p-1 text-[11px] shadow-md">
                     {packages.map((p) => (
                        <button
                           key={p.id}
                           type="button"
                           onClick={() => {
                              onScopeChange?.({
                                 environment: p.environment,
                                 package: p.name,
                              });
                              setMenuOpen(false);
                           }}
                           className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-hover"
                        >
                           <Folder className="size-3 text-muted" />
                           {p.name}
                           <span className="ml-auto text-[9px] text-muted">
                              {p.environment}
                           </span>
                        </button>
                     ))}
                  </div>
               )}

               <button
                  type="submit"
                  aria-label="Send"
                  disabled={!canSend}
                  className={clsx(
                     "ml-auto shrink-0 rounded-full p-1",
                     canSend ? "bg-ink text-surface" : "text-faint",
                  )}
               >
                  <ArrowUp className="size-3" />
               </button>
            </div>
         </form>
         {modelPicker && (
            <div className="mt-0.5 flex justify-end">
               <ModelPicker />
            </div>
         )}
      </div>
   );
}
