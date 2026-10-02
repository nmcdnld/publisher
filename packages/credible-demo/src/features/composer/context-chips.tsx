// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { FileText, X } from "lucide-react";
import { EntityIcon } from "@/components/entity-icon";
import { formatTokens } from "@/data/models";
import type { AttachmentMeta, EntityRef } from "@/data/types";
import { cn } from "@/lib/utils";

export interface Attachment {
   id: string;
   file: File;
   meta: AttachmentMeta;
   /** An object URL, for images. */
   preview?: string;
}

export function formatBytes(n: number): string {
   if (n < 1024) return `${n} B`;
   if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
   return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const chip =
   "group/chip inline-flex h-7 max-w-56 items-center gap-1.5 rounded-md border bg-background pr-1 text-xs";

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
   return (
      <button
         type="button"
         onClick={onClick}
         aria-label={label}
         className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
         <X className="size-3" />
      </button>
   );
}

/** What the message will carry besides its text: files, then @ references. */
export function ContextChips({
   attachments,
   references,
   onRemoveAttachment,
   onRemoveReference,
   className,
}: {
   attachments: Attachment[];
   references: EntityRef[];
   onRemoveAttachment: (id: string) => void;
   onRemoveReference: (ref: EntityRef) => void;
   className?: string;
}) {
   if (attachments.length === 0 && references.length === 0) return null;
   return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
         {attachments.map((a) => (
            <span
               key={a.id}
               className={cn(chip, a.preview ? "pl-0.5" : "pl-2")}
               title={`${a.meta.name} · ${formatBytes(a.meta.size)} · ~${formatTokens(a.meta.tokens)} tokens`}
            >
               {a.preview ? (
                  <img
                     src={a.preview}
                     alt=""
                     className="size-6 shrink-0 rounded object-cover"
                  />
               ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
               )}
               <span className="truncate">{a.meta.name}</span>
               <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatBytes(a.meta.size)}
               </span>
               <Remove
                  label={`Remove ${a.meta.name}`}
                  onClick={() => onRemoveAttachment(a.id)}
               />
            </span>
         ))}
         {references.map((r) => (
            <span
               key={r.id}
               className={cn(chip, "pl-2")}
               title={`${r.detail ?? r.label} · ~${formatTokens(r.tokens)} tokens`}
            >
               <EntityIcon
                  kind={r.kind}
                  className="size-3.5 shrink-0 text-primary"
               />
               <span className="truncate">{r.label}</span>
               <Remove
                  label={`Remove ${r.label}`}
                  onClick={() => onRemoveReference(r)}
               />
            </span>
         ))}
      </div>
   );
}
