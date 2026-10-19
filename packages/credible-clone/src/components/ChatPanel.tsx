// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import { ArrowRightToLine, Maximize2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { messageText, previewOf, useChats } from "../chats";
import { timeAgo, type Chat, type Message, type Scope } from "../fixtures";
import { MessageView, ReplyStatus } from "../pages/chats/ChatThread";
import { ChatMenu } from "./ChatMenu";
import { Composer } from "./Composer";

const iconButton =
   "flex size-5 items-center justify-center rounded text-faint hover:bg-hover hover:text-ink";

/**
 * A chat in a column beside the page it was started from, held in view while
 * the page scrolls. Each question sticks above its reply, with a stop button
 * while the reply is in progress; once it lands, a composer sits at the bottom
 * of the column under the scrolling thread. Its height comes from the scroll
 * container's `cqh`.
 */
export function ChatPanel({
   chatId,
   onClose,
   onShowList,
}: {
   chatId: string;
   onClose: () => void;
   /** Back to the chats started from this page. */
   onShowList?: () => void;
}) {
   const { chats, messages, pending, errors, send, stop, setScope } =
      useChats();
   const chat = chats.find((c) => c.id === chatId);
   const thread = messages[chatId] ?? [];
   const isPending = pending.has(chatId);
   const lastUser = thread.findLastIndex((m) => m.role === "user");
   const scrollRef = useRef<HTMLDivElement>(null);
   const lastTurnRef = useRef<HTMLElement>(null);
   const scrolledOnce = useRef(false);

   // A turn is a question and the replies that follow it.
   const turns: { start: number; messages: Message[] }[] = [];
   thread.forEach((m, i) => {
      if (m.role === "user" || turns.length === 0) {
         turns.push({ start: i, messages: [] });
      }
      turns.at(-1)!.messages.push(m);
   });

   // Bring the newest question to the top and leave it there, so its reply
   // streams in beneath from its first line rather than being followed to its
   // last. Scrolls the thread itself: scrollIntoView would also move the page
   // behind this sticky column.
   useEffect(() => {
      const el = scrollRef.current;
      const turn = lastTurnRef.current;
      if (!el || !turn) return;
      el.scrollTo({
         top: turn.offsetTop,
         behavior: scrolledOnce.current ? "smooth" : "instant",
      });
      scrolledOnce.current = true;
   }, [lastUser]);

   // Mark a question as stuck once its reply has scrolled up beneath it, so it
   // can show a shadow over the hidden text.
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const update = () => {
         const top = el.getBoundingClientRect().top;
         for (const card of el.querySelectorAll("[data-question]")) {
            card.toggleAttribute(
               "data-stuck",
               card.getBoundingClientRect().top - top < 1,
            );
         }
      };
      update();
      el.addEventListener("scroll", update, { passive: true });
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => {
         el.removeEventListener("scroll", update);
         observer.disconnect();
      };
   }, [thread]);

   return (
      <aside className="sticky top-0 h-[100cqh] w-96 shrink-0">
         {/* The gap clears the thread's -mx-3 overhang, so the toolbar sits just
             past the question cards' right edge. */}
         <div className="ui-zoom flex h-full gap-5 pt-4 pb-4">
            <div className="flex min-w-0 flex-1 flex-col">
               {/* Each turn is its own section, so its question sticks to the top
                only while its replies scroll beneath, and the next question pushes
                it out. The last turn is at least as tall as the thread, so its
                question can always be scrolled to the top. */}
               <div
                  ref={scrollRef}
                  className="relative -mx-3 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,black_calc(100%-12px),transparent)]"
               >
                  {!chat ? (
                     <p className="pt-3 text-[11px] text-muted">
                        This chat doesn't exist in the fixtures.
                     </p>
                  ) : (
                     turns.map((turn, t) => {
                        const isLast = t === turns.length - 1;
                        return (
                           <section
                              key={turn.messages[0].id}
                              ref={isLast ? lastTurnRef : undefined}
                              className={clsx(
                                 "flow-root pb-1",
                                 isLast && "min-h-full",
                              )}
                           >
                              {turn.messages.map((m, j) => {
                                 const i = turn.start + j;
                                 return m.role === "user" ? (
                                    <SentPrompt
                                       key={m.id}
                                       text={messageText(m)}
                                       onStop={
                                          isPending && i === lastUser
                                             ? () => stop(chat.id)
                                             : undefined
                                       }
                                    />
                                 ) : (
                                    <div key={m.id} className="pb-4">
                                       <MessageView
                                          message={m}
                                          live={
                                             isPending &&
                                             i === thread.length - 1
                                          }
                                       />
                                    </div>
                                 );
                              })}
                              {isLast && (
                                 <ReplyStatus
                                    thread={thread}
                                    pending={isPending}
                                    error={errors[chat.id]}
                                 />
                              )}
                           </section>
                        );
                     })
                  )}
               </div>

               {chat && !isPending && (
                  <Composer
                     autoFocus
                     className="mt-1 shrink-0"
                     scope={chat.scope}
                     onScopeChange={(scope) => setScope(chat.id, scope)}
                     onSubmit={(text) => send(chat.id, text, chat.scope)}
                  />
               )}
            </div>

            <div className="flex shrink-0 flex-col items-center gap-0.5 pt-3">
               <button
                  type="button"
                  title="Close chat"
                  aria-label="Close chat"
                  onClick={onClose}
                  className={iconButton}
               >
                  <ArrowRightToLine className="size-3.5" />
               </button>
               {/* {onShowList && (
                  <button
                     type="button"
                     title="Chats from here"
                     aria-label="Chats from here"
                     onClick={onShowList}
                     className={iconButton}
                  >
                     <List className="size-3.5" />
                  </button>
               )} */}
               {chat && (
                  <Link
                     to={`/chats/${chat.id}`}
                     title="Open in full chat"
                     aria-label="Open in full chat"
                     className={iconButton}
                  >
                     <Maximize2 className="size-3" />
                  </Link>
               )}
               {chat && (
                  <ChatMenu
                     chat={chat}
                     placement="left"
                     className={iconButton}
                  />
               )}
            </div>
         </div>
      </aside>
   );
}

/**
 * The chats started from a page, in the column a chat docks in, newest first.
 * Choosing one opens it in place; the composer underneath starts another from
 * the same page.
 */
export function OriginChats({
   chats,
   scope,
   onSelect,
   onSubmit,
   onClose,
}: {
   chats: Chat[];
   scope: Scope;
   onSelect: (chatId: string) => void;
   onSubmit: (text: string) => void;
   onClose: () => void;
}) {
   const { messages, pending } = useChats();
   const sorted = [...chats].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
   );

   return (
      <aside className="sticky top-0 h-[100cqh] w-96 shrink-0">
         <div className="ui-zoom flex h-full gap-5 pt-4 pb-4">
            <div className="flex min-w-0 flex-1 flex-col">
               <h2 className="px-2 pt-3 pb-2 text-[12px] font-medium">
                  Chats from here
                  <span className="ml-1.5 text-[10px] font-normal text-muted">
                     {chats.length}
                  </span>
               </h2>
               <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
                  {sorted.map((c) => (
                     <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelect(c.id)}
                        className="block w-full rounded-lg px-2 py-2 text-left hover:bg-hover"
                     >
                        <span className="flex items-baseline gap-2">
                           <span className="flex-1 truncate text-[11px] font-medium">
                              {c.title}
                           </span>
                           {pending.has(c.id) && (
                              <span className="size-1.5 shrink-0 animate-pulse self-center rounded-full bg-faint" />
                           )}
                           <span className="text-[9px] text-muted">
                              {timeAgo(c.updatedAt, true)}
                           </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted">
                           {previewOf(messages[c.id])}
                        </span>
                     </button>
                  ))}
                  {chats.length === 0 && (
                     <p className="px-2 py-4 text-center text-[11px] text-muted">
                        No chats have been started from this page yet.
                     </p>
                  )}
               </nav>
               <Composer
                  autoFocus
                  modelPicker
                  className="mt-1 shrink-0"
                  scope={scope}
                  onSubmit={onSubmit}
               />
            </div>

            <div className="flex shrink-0 flex-col items-center gap-0.5 pt-3">
               <button
                  type="button"
                  title="Close chats"
                  aria-label="Close chats"
                  onClick={onClose}
                  className={iconButton}
               >
                  <ArrowRightToLine className="size-3.5" />
               </button>
            </div>
         </div>
      </aside>
   );
}

/**
 * A sent question, stuck to the top of the thread while its reply scrolls under
 * it, with a shadow once there's text hidden beneath. It overhangs the reply by
 * its corner radius on each side, so nothing scrolling under it shows past the
 * rounded corners.
 */
function SentPrompt({ text, onStop }: { text: string; onStop?: () => void }) {
   return (
      <div
         data-question
         className="sticky top-0 z-10 -mx-3 my-3 rounded-xl bg-hover px-3 py-2 transition-shadow data-[stuck]:shadow-[0_6px_12px_-6px_rgb(0_0_0/0.18)]"
      >
         <p className="text-[12px] whitespace-pre-wrap [overflow-wrap:anywhere]">
            {text}
            {onStop && <span aria-hidden className="inline-block w-5" />}
         </p>
         {onStop && (
            <button
               type="button"
               aria-label="Stop"
               title="Stop"
               onClick={onStop}
               className="absolute right-2 bottom-1.5 flex rounded-full p-1 text-ink transition-colors hover:bg-line"
            >
               <span
                  aria-hidden
                  className="absolute inset-0 animate-spin rounded-full border-[1.5px] border-line border-t-ink [animation-duration:1.2s] motion-reduce:animate-none"
               />
               <X className="size-3" strokeWidth={2.25} />
            </button>
         )}
      </div>
   );
}
