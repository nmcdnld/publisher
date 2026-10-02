// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Button } from "@/components/ui/button";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThread } from "@/data/hooks";
import { AnalystMessage } from "@/features/analyst/analyst-message";
import { useEffect, useRef } from "react";
import { AssistantMessage, ThinkingMessage, UserMessage } from "./message";
import { ResponseSave } from "./response-save";
import { useThreadUi } from "./thread-context";

/** The open thread and whether a run for it is streaming, for any chat surface. */
export function useActiveConversation() {
   const { activeThreadId, pending, live } = useThreadUi();
   const query = useThread(activeThreadId);
   const thread = query.data ?? null;
   const showLive = !!live && live.threadId === activeThreadId;
   const loaded = activeThreadId === null || query.isFetched;
   return {
      thread,
      loaded,
      pending,
      showLive,
      title: thread?.title ?? pending ?? (loaded ? "New thread" : ""),
   };
}

export function IconAction({
   label,
   icon,
   onClick,
   disabled = false,
}: {
   label: string;
   icon: React.ReactNode;
   onClick: () => void;
   disabled?: boolean;
}) {
   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <Button
               size="icon"
               variant="ghost"
               className="size-8"
               onClick={onClick}
               disabled={disabled}
               aria-label={label}
            >
               {icon}
            </Button>
         </TooltipTrigger>
         <TooltipContent>{label}</TooltipContent>
      </Tooltip>
   );
}

/** The open thread's messages, plus the run in flight; keeps the newest in view. */
export function ThreadMessages({ empty }: { empty: React.ReactNode }) {
   const { live } = useThreadUi();
   const { thread, pending, showLive } = useActiveConversation();
   const bottom = useRef<HTMLDivElement>(null);
   const liveProgress = live
      ? `${live.record.datasets.length}:${live.record.metrics.length}:${live.record.reportText?.length ?? 0}`
      : "";

   useEffect(() => {
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
   }, [thread?.messages.length, pending, liveProgress]);

   return (
      <div className="space-y-5">
         {!thread && !pending && !showLive && empty}
         {thread?.messages.map((m) =>
            m.role === "user" ? (
               <UserMessage
                  key={m.id}
                  text={m.text}
                  references={m.references}
                  attachments={m.attachments}
                  model={m.model}
               />
            ) : m.analyst ? (
               <AnalystMessage
                  key={m.id}
                  record={m.analyst}
                  actions={<ResponseSave thread={thread} message={m} />}
               />
            ) : (
               <AssistantMessage
                  key={m.id}
                  threadId={thread.id}
                  message={m}
                  actions={<ResponseSave thread={thread} message={m} />}
               />
            ),
         )}
         {showLive && live ? (
            <>
               <UserMessage
                  text={live.question}
                  references={live.context?.references}
                  attachments={live.context?.attachments}
                  model={live.context?.model}
               />
               <AnalystMessage record={live.record} live />
            </>
         ) : (
            pending &&
            !live && (
               <>
                  <UserMessage text={pending} />
                  <ThinkingMessage />
               </>
            )
         )}
         <div ref={bottom} />
      </div>
   );
}
