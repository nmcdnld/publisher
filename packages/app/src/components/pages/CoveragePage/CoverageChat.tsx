// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { CheckIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Ontology } from "../../../ontology/types";
import { ChatPanel } from "../../chat/ChatPanel";
import { type ConsoleChat, useConsoleChat } from "../../chat/useConsoleChat";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
   type ChatVerdict,
   type Classification,
   type CoverageStatus,
   type Investigation,
   type Question,
   STATUS_META,
} from "./model";
import { transcriptMarkdown } from "../../chat/transcript";

/**
 * One coverage question re-run as a grounded chat: the agent answers it with
 * Publisher's tools, then closes with a verdict the panel reads back.
 */
export function CoverageChat({
   ontology,
   question,
   result,
   onSave,
   onInvestigation,
}: {
   ontology: Ontology;
   question: Question;
   result?: Classification;
   onSave: (verdict: Omit<ChatVerdict, "batch">) => void;
   onInvestigation: (investigation: Investigation) => void;
}) {
   // The verdict this chat set out to check; saving one must not change it.
   const [started] = useState(result);
   const chat = useConsoleChat({
      scope: {
         environment: ontology.environmentName,
         package: ontology.packageName,
      },
      coverage: {
         question: question.text,
         persona: question.persona,
         category: question.category,
         concepts: question.concepts,
      },
   });

   const sent = useRef(false);
   const { sendMessage, unavailable, model } = chat;
   useEffect(() => {
      if (sent.current || unavailable || !model) return;
      // A send inside the first effect pass is aborted when StrictMode
      // detaches the chat client; wait until it is attached for good.
      const timer = setTimeout(() => {
         sent.current = true;
         void sendMessage(question.text);
      });
      return () => clearTimeout(timer);
   }, [sendMessage, unavailable, model, question.text]);

   // Keep the investigation with the run each time a reply finishes, so it
   // outlives the sheet whether or not the verdict is saved.
   const recorded = useRef("");
   const save = useRef(onInvestigation);
   save.current = onInvestigation;
   const { isLoading, messages } = chat;
   useEffect(() => {
      const last = messages.at(-1);
      if (isLoading || last?.role !== "assistant") return;
      const transcript = transcriptMarkdown(messages);
      if (!transcript || transcript === recorded.current) return;
      recorded.current = transcript;
      save.current({
         transcript,
         verdict: latestVerdict(messages),
         model,
         via: "chat",
         at: Date.now(),
      });
   }, [isLoading, messages, model]);

   return (
      <ChatPanel
         chat={chat}
         placeholder="Follow up, or ask it to try another interpretation…"
         before={
            <VerdictBanner
               chat={chat}
               previous={started?.chat ? started.chat.batch : started?.status}
               saved={result?.chat?.status}
               onSave={(status) =>
                  onSave({ status, model: chat.model, at: Date.now() })
               }
            />
         }
      />
   );
}

function VerdictBanner({
   chat,
   previous,
   saved,
   onSave,
}: {
   chat: ConsoleChat;
   previous?: CoverageStatus;
   saved?: CoverageStatus;
   onSave: (status: CoverageStatus) => void;
}) {
   const verdict = latestVerdict(chat.messages);
   if (!verdict) {
      return chat.isLoading ? (
         <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
            <Loader2Icon className="size-3.5 animate-spin" />
            Answering the question with the model&apos;s tools; a verdict
            follows.
         </div>
      ) : null;
   }
   const agrees = previous === verdict;
   return (
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs backdrop-blur">
         <span className="text-muted-foreground">Chat verdict</span>
         <Badge variant={verdict}>{STATUS_META[verdict].label}</Badge>
         {previous && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
               {agrees ? (
                  "agrees with the batch verdict"
               ) : (
                  <>
                     overturns the batch verdict,
                     <Badge variant={previous} className="opacity-70">
                        {STATUS_META[previous].label}
                     </Badge>
                  </>
               )}
            </span>
         )}
         <span className="ml-auto">
            {saved === verdict ? (
               <span className="flex items-center gap-1 text-muted-foreground">
                  <CheckIcon className="size-3.5" /> Saved to the heat map
               </span>
            ) : (
               <Button
                  size="xs"
                  disabled={chat.isLoading}
                  title="Replace this question's verdict in the run, and rescore it"
                  onClick={() => onSave(verdict)}
               >
                  <SaveIcon /> Save verdict
               </Button>
            )}
         </span>
      </div>
   );
}

const VERDICT =
   /\*\*Verdict:?\*\*:?\s*\**\s*(answerable|partial(?:ly answerable)?|missing)/i;

/** The verdict the latest finished assistant reply closed with. */
function latestVerdict(
   messages: ConsoleChat["messages"],
): CoverageStatus | undefined {
   for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const text = message.parts
         .map((p) => (p.type === "text" ? p.content : ""))
         .join("");
      const match = text.match(VERDICT);
      if (!match) continue;
      const word = match[1].toLowerCase();
      return word.startsWith("partial") ? "partial" : (word as CoverageStatus);
   }
   return undefined;
}
