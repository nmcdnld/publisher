// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Composer } from "@/features/composer/composer";
import { MessageSquarePlus, PanelRightClose, Sparkles } from "lucide-react";
import {
   IconAction,
   ThreadMessages,
   useActiveConversation,
} from "./conversation";
import { ChatSurfaceProvider, useThreadUi } from "./thread-context";

/**
 * The docked conversation: stays open on the right while you browse. Open it
 * with `openThread(id, { surface: "rail" })`; asking from inside it stays here.
 */
export function ThreadRail() {
   return (
      <ChatSurfaceProvider surface="rail">
         <RailBody />
      </ChatSurfaceProvider>
   );
}

function RailBody() {
   const { closeRail, startNew } = useThreadUi();
   const { thread, title } = useActiveConversation();

   return (
      <aside className="flex h-full w-full flex-col border-l bg-sidebar lg:w-[420px]">
         <header className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
            <Sparkles className="size-4 text-primary" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
               {title}
            </h2>
            <IconAction
               label="New thread"
               icon={<MessageSquarePlus />}
               onClick={() => startNew()}
            />
            <IconAction
               label="Close"
               icon={<PanelRightClose />}
               onClick={closeRail}
            />
         </header>

         <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <ThreadMessages
               empty={
                  <p className="pt-10 text-center text-sm text-muted-foreground">
                     Ask a question to start a thread. It stays here while you
                     browse.
                  </p>
               }
            />
         </div>

         <div className="shrink-0 border-t p-3">
            <Composer
               autoFocus
               placeholder={
                  thread
                     ? "Ask a follow-up…"
                     : "What would you like to do next?"
               }
            />
         </div>
      </aside>
   );
}
