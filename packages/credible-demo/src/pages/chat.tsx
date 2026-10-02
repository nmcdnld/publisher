// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useThreads } from "@/data/hooks";
import { SuggestedQuestions } from "@/features/composer/suggested-questions";
import type { Thread } from "@/data/types";
import { Composer } from "@/features/composer/composer";
import {
   IconAction,
   ThreadMessages,
   useActiveConversation,
} from "@/features/threads/conversation";
import { useThreadUi } from "@/features/threads/thread-context";
import { relativeTime } from "@/lib/format";
import {
   BookmarkCheck,
   MessageSquarePlus,
   MessagesSquare,
   Sparkles,
} from "lucide-react";
import { useLayoutEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

/** `/chat` and `/chat/:threadId`: the conversation as the whole page. */
export function ChatPage() {
   const { threadId } = useParams();
   const { activeThreadId, pending, openThread, startNew } = useThreadUi();

   // Before paint, so a thread left open elsewhere never flashes here.
   useLayoutEffect(() => {
      if (threadId) openThread(threadId);
      else startNew();
      // Keyed on the URL alone: both are recreated every render.
   }, [threadId]);

   // A new thread has its id a moment before its URL does.
   const started = !!threadId || !!pending || !!activeThreadId;

   return <div className="h-full">{started ? <Conversation /> : <Hero />}</div>;
}

/** Old `/threads` links, including hrefs saved in stored library items. */
export function ThreadsRedirect() {
   const { threadId } = useParams();
   return <Navigate to={threadId ? `/chat/${threadId}` : "/chat"} replace />;
}

function Conversation() {
   const { startNew } = useThreadUi();
   const { thread, loaded, pending, showLive, title } = useActiveConversation();
   const missing = loaded && !thread && !pending && !showLive;

   return (
      <div className="flex h-full flex-col">
         <header className="flex h-14 shrink-0 items-center gap-1 border-b px-4 lg:px-6">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <h1 className="ml-1 min-w-0 flex-1 truncate text-sm font-semibold">
               {missing ? "Thread not found" : title}
            </h1>
            <IconAction
               label="New thread"
               icon={<MessageSquarePlus />}
               onClick={() => startNew()}
            />
         </header>

         <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-6 py-8">
               <ThreadMessages
                  empty={
                     missing && (
                        <div className="pt-16 text-center">
                           <p className="text-sm text-muted-foreground">
                              This thread doesn't exist, or it was removed.
                           </p>
                           <Button
                              variant="outline"
                              size="sm"
                              className="mt-4"
                              onClick={() => startNew()}
                           >
                              Start a new thread
                           </Button>
                        </div>
                     )
                  }
               />
            </div>
         </div>

         {!missing && (
            <div className="shrink-0 px-6 pb-6">
               <Composer
                  autoFocus
                  placeholder={thread ? "Ask a follow-up…" : "Ask anything…"}
                  className="mx-auto max-w-3xl shadow-md"
               />
            </div>
         )}
      </div>
   );
}

/** First arrival: a big, low-commitment input. Sending opens the thread here. */
function Hero() {
   const { ask } = useThreadUi();
   return (
      <div className="h-full overflow-y-auto">
         <div className="flex min-h-full flex-col">
            <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
               <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                     <Sparkles className="size-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">
                     What do you want to know?
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                     Threads remember the data you've looked at, so every
                     follow-up builds on the last.
                  </p>
               </div>
               <Composer
                  fresh
                  autoFocus
                  size="lg"
                  placeholder="What would you like to do next?"
                  className="shadow-md"
               />
               <SuggestedQuestions
                  limit={4}
                  onPick={(q) => ask(q, { fresh: true })}
                  className="mt-4 justify-center"
               />
            </div>
            <div className="mx-auto w-full max-w-2xl px-6 pb-10 md:hidden">
               <RecentThreads />
            </div>
         </div>
      </div>
   );
}

function RecentThreads() {
   const threads = useThreads().data ?? [];
   if (threads.length === 0) return null;
   return (
      <section className="space-y-2">
         <h2 className="text-sm font-medium text-muted-foreground">
            Recent threads
         </h2>
         <Card className="gap-0 divide-y p-0">
            {threads.map((t) => (
               <ThreadRow key={t.id} thread={t} />
            ))}
         </Card>
      </section>
   );
}

function ThreadRow({ thread }: { thread: Thread }) {
   const last = [...thread.messages]
      .reverse()
      .find((m) => m.role === "assistant");
   return (
      <Link
         to={`/chat/${thread.id}`}
         className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
         <MessagesSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
         <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
               <span className="truncate text-sm font-medium">
                  {thread.title}
               </span>
               {thread.messages.some((m) => m.analysisId) && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                     <BookmarkCheck className="size-3" />
                     Saved
                  </Badge>
               )}
            </span>
            {last && (
               <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {last.text}
               </span>
            )}
         </span>
         <span className="shrink-0 text-xs text-muted-foreground">
            {thread.messages.length} msgs · {relativeTime(thread.updatedAt)}
         </span>
      </Link>
   );
}
