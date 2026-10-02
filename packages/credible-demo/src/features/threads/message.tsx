// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Check, ChevronDown, Code2, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { EntityIcon } from "@/components/entity-icon";
import { EvidenceChart } from "@/components/evidence-chart";
import { MalloyBlock } from "@/components/malloy-block";
import { AiAvatar, PersonAvatar } from "@/components/people";
import { Provenance } from "@/components/provenance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSetMessageStatus, useViewer } from "@/data/hooks";
import { chatModels } from "@/data/models";
import type { MessageContext, ThreadMessage } from "@/data/types";
import { mentionPattern } from "@/features/composer/caret";
import { ConfidenceIndicator } from "./confidence";

export function UserMessage({
   text,
   references = [],
   attachments = [],
   model,
}: { text: string } & MessageContext) {
   const viewer = useViewer().data;
   const byHandle = new Map(references.map((r) => [r.handle, r]));
   const pattern = mentionPattern([...byHandle.keys()]);
   const parts: React.ReactNode[] = [];
   let last = 0;
   for (const m of pattern ? text.matchAll(pattern) : []) {
      const start = m.index + m[1].length;
      const ref = byHandle.get(m[2].slice(1))!;
      parts.push(text.slice(last, start));
      parts.push(
         <span
            key={start}
            title={ref.detail}
            className="inline-flex items-baseline gap-1 rounded bg-primary-foreground/15 px-1 font-medium"
         >
            <EntityIcon kind={ref.kind} className="size-3 self-center" />
            {ref.label}
         </span>,
      );
      last = start + m[2].length;
   }
   parts.push(text.slice(last));
   const modelLabel = chatModels.find((c) => c.id === model)?.label;

   return (
      <div className="flex justify-end gap-2">
         <div className="flex max-w-[85%] flex-col items-end gap-1">
            {attachments.length > 0 && (
               <div className="flex flex-wrap justify-end gap-1">
                  {attachments.map((a, i) => (
                     <span
                        key={i}
                        className="inline-flex max-w-48 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
                     >
                        <FileText className="size-3 shrink-0" />
                        <span className="truncate">{a.name}</span>
                     </span>
                  ))}
               </div>
            )}
            <div className="rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
               {parts}
            </div>
            {modelLabel && (
               <span className="text-[10px] text-muted-foreground">
                  {modelLabel}
               </span>
            )}
         </div>
         {viewer && <PersonAvatar person={viewer.person} className="size-6" />}
      </div>
   );
}

export function ThinkingMessage() {
   return (
      <div className="flex gap-2">
         <AiAvatar className="size-6" />
         <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Finding the right data…
         </div>
      </div>
   );
}

const statusLabel: Record<string, string> = {
   accepted: "Accepted",
   remixed: "Remixed by you",
   taken_over: "Yours now",
};

export function AssistantMessage({
   threadId,
   message,
   actions,
}: {
   threadId: string;
   message: ThreadMessage;
   /** Drawn in the action row, such as Save. */
   actions?: React.ReactNode;
}) {
   const setStatus = useSetMessageStatus();
   const [showQuery, setShowQuery] = useState(false);
   const settled = message.status && message.status !== "proposed";

   return (
      <div className="flex gap-2">
         <AiAvatar className="size-6" />
         <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
               {message.confidence && (
                  <ConfidenceIndicator confidence={message.confidence} />
               )}
               {settled && (
                  <Badge variant="secondary" className="gap-1">
                     <Check className="size-3" />
                     {statusLabel[message.status!]}
                  </Badge>
               )}
            </div>
            <p className="text-sm leading-relaxed">{message.text}</p>

            {message.evidence && (
               <div className="rounded-lg border bg-card p-2">
                  <EvidenceChart evidence={message.evidence} compact />
               </div>
            )}

            {message.malloy && showQuery && (
               <MalloyBlock value={message.malloy} />
            )}

            {message.provenance && (
               <Provenance provenance={message.provenance} />
            )}

            <div className="flex flex-wrap items-center gap-1">
               {!settled && (
                  <Button
                     size="sm"
                     variant="outline"
                     onClick={() =>
                        setStatus.mutate([threadId, message.id, "accepted"])
                     }
                  >
                     <Check />
                     Accept
                  </Button>
               )}
               {actions}
               {message.malloy && (
                  <Button
                     size="sm"
                     variant="ghost"
                     className="ml-auto text-muted-foreground"
                     onClick={() => setShowQuery((s) => !s)}
                  >
                     <Code2 />
                     Malloy
                     <ChevronDown className={showQuery ? "rotate-180" : ""} />
                  </Button>
               )}
            </div>
         </div>
      </div>
   );
}
