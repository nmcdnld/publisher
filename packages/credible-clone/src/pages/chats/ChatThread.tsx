// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { AlertCircle, ArrowLeft, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { messageText, useChats } from "../../chats";
import {
   AssistantMessage,
   visiblyWorking,
} from "../../components/AssistantMessage";
import { ChatMenu } from "../../components/ChatMenu";
import { Composer } from "../../components/Composer";
import { PageHeader } from "../../components/PageHeader";
import type { Message } from "../../fixtures";

export function ChatThread() {
   const { chatId } = useParams();
   const { chats, messages, pending, errors, send, stop, setScope } =
      useChats();
   const chat = chats.find((c) => c.id === chatId);
   const thread = (chatId && messages[chatId]) || [];
   const isPending = chatId ? pending.has(chatId) : false;

   if (!chat) {
      return (
         <>
            <PageHeader title="Chat not found" muted />
            <p className="p-8 text-[12px] text-muted">
               This chat doesn't exist in the fixtures.
            </p>
         </>
      );
   }

   const ask = (text: string) => send(chat.id, text, chat.scope);

   return (
      <>
         <PageHeader
            title={chat.title}
            actions={
               <div className="flex items-center gap-1">
                  <button
                     type="button"
                     className="rounded-md border border-line px-2.5 py-1 text-[11px] hover:bg-hover"
                  >
                     Share
                  </button>
                  <ChatMenu
                     chat={chat}
                     placement="below"
                     className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
                  />
               </div>
            }
         />

         {chat.origin && (
            <Link
               to={`${chat.origin.path}?chat=${chat.id}`}
               className="flex shrink-0 items-center gap-1.5 border-b border-line bg-panel px-5 py-1.5 text-[10px] text-muted hover:text-ink"
            >
               <ArrowLeft className="size-3" />
               Started from
               <span className="truncate font-medium text-ink">
                  {chat.origin.title}
               </span>
            </Link>
         )}

         <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[480px] space-y-5 px-4 py-5">
               <ThreadMessages
                  thread={thread}
                  pending={isPending}
                  error={errors[chat.id]}
               />
            </div>
         </div>

         <div className="mx-auto w-full max-w-[480px] px-4 pb-4">
            {isPending ? (
               <button
                  type="button"
                  onClick={() => stop(chat.id)}
                  className="mx-auto flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[10px] hover:bg-hover"
               >
                  <Square className="size-2.5 fill-current" /> Stop
               </button>
            ) : (
               <Composer
                  scope={chat.scope}
                  onScopeChange={(scope) => setScope(chat.id, scope)}
                  onSubmit={ask}
               />
            )}
         </div>
      </>
   );
}

export function ThreadMessages({
   thread,
   pending,
   error,
}: {
   thread: Message[];
   pending: boolean;
   error?: string;
}) {
   const bottomRef = useRef<HTMLDivElement>(null);
   const last = thread.at(-1);

   useEffect(() => {
      bottomRef.current?.scrollIntoView({
         behavior: "smooth",
         block: "nearest",
      });
   }, [thread, pending]);

   return (
      <>
         {thread.map((m) => (
            <MessageView key={m.id} message={m} live={pending && m === last} />
         ))}
         <ReplyStatus thread={thread} pending={pending} error={error} />
         <div ref={bottomRef} />
      </>
   );
}

/** "Thinking…" until the reply shows progress of its own, then any error. */
export function ReplyStatus({
   thread,
   pending,
   error,
}: {
   thread: Message[];
   pending: boolean;
   error?: string;
}) {
   return (
      <>
         {pending && !visiblyWorking(thread.at(-1)) && (
            <p className="animate-pulse text-[10px] text-muted">Thinking…</p>
         )}
         {error && !pending && (
            <p className="flex items-start gap-1 text-[10px] text-red-700">
               <AlertCircle className="mt-px size-3 shrink-0" />
               {error}
            </p>
         )}
      </>
   );
}

export function MessageView({
   message,
   live,
}: {
   message: Message;
   live: boolean;
}) {
   if (message.role === "user") {
      return (
         <div className="flex justify-end">
            <p className="max-w-[80%] rounded-xl bg-hover px-2.5 py-1.5 text-[11px] whitespace-pre-wrap">
               {messageText(message)}
            </p>
         </div>
      );
   }
   if (message.role !== "assistant") return null;
   return <AssistantMessage message={message} live={live} />;
}

export function SuggestionRow({
   items,
   onPick,
}: {
   items: { label: string; onClick?: () => void }[] | string[];
   onPick?: (text: string) => void;
}) {
   return (
      <div className="flex flex-wrap gap-1.5">
         {items.map((item) => {
            const { label, onClick } =
               typeof item === "string"
                  ? { label: item, onClick: () => onPick?.(item) }
                  : item;
            return (
               <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="rounded-full border border-line px-2.5 py-1 text-[10px] hover:bg-hover"
               >
                  {label}
               </button>
            );
         })}
      </div>
   );
}
