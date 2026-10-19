// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { usePublisherTheme } from "@malloy-publisher/sdk";
import type { UIMessage } from "@tanstack/ai-react";
import {
   ChevronDownIcon,
   MessageSquarePlusIcon,
   SparklesIcon,
   Trash2Icon,
   XIcon,
} from "lucide-react";
import {
   type PointerEvent,
   useEffect,
   useLayoutEffect,
   useRef,
   useState,
} from "react";
import { createPortal } from "react-dom";
import { postAi } from "../../ai/consoleAi";
import { cn } from "../../lib/utils";
import "../../styles/tailwind.css";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
   type AskContext,
   closeAskWindow,
   showThread,
   useAskWindow,
} from "./askWindowStore";
import { ChatPanel } from "./ChatPanel";
import {
   type ChatThread,
   deleteThread,
   firstQuestion,
   getThread,
   saveThread,
   threadTitle,
   useChatThreads,
} from "./chatHistory";
import { recordAsked } from "../pages/CoveragePage/asked";
import { isPrototypeFeatureEnabled } from "../../prototypeFeatures";
import { messageText, transcriptMarkdown } from "./transcript";
import { useConsoleChat } from "./useConsoleChat";

/**
 * The Ask chat as a floating, non-modal window: the page underneath stays
 * usable, and the window stays open across navigation until it is closed.
 */
export default function AskWindow() {
   const { open, threadId, context } = useAskWindow();
   const { mode } = usePublisherTheme();
   useEffect(() => {
      if (open)
         document.documentElement.classList.toggle("dark", mode === "dark");
   }, [open, mode]);
   if (!open || !context) return null;
   return createPortal(
      <FloatingWindow threadId={threadId} context={context} />,
      document.body,
   );
}

interface Rect {
   x: number;
   y: number;
   w: number;
   h: number;
}

const RECT_KEY = "console-ai:ask-window";
const MIN_W = 340;
const MIN_H = 360;

function defaultRect(): Rect {
   const w = Math.min(460, window.innerWidth - 32);
   const h = Math.min(660, window.innerHeight - 96);
   return {
      w,
      h,
      x: window.innerWidth - w - 24,
      y: window.innerHeight - h - 24,
   };
}

function clamp(r: Rect): Rect {
   const w = Math.max(MIN_W, Math.min(r.w, window.innerWidth - 16));
   const h = Math.max(MIN_H, Math.min(r.h, window.innerHeight - 16));
   return {
      w,
      h,
      x: Math.max(0, Math.min(r.x, window.innerWidth - w)),
      y: Math.max(0, Math.min(r.y, window.innerHeight - h)),
   };
}

function loadRect(): Rect {
   try {
      const saved = JSON.parse(localStorage.getItem(RECT_KEY) ?? "null");
      if (saved && typeof saved.x === "number") return clamp(saved as Rect);
   } catch {
      // Fall back to the corner.
   }
   return clamp(defaultRect());
}

function FloatingWindow({
   threadId,
   context,
}: {
   threadId: string;
   context: AskContext;
}) {
   const [rect, setRect] = useState(loadRect);
   const ref = useRef<HTMLDivElement>(null);
   const drag = useRef<{ dx: number; dy: number }>(undefined);
   const threads = useChatThreads();
   const thread = threads.find((t) => t.id === threadId);

   useEffect(() => {
      try {
         localStorage.setItem(RECT_KEY, JSON.stringify(rect));
      } catch {
         // The window still opens where it was this session.
      }
   }, [rect]);

   useEffect(() => {
      const onResize = () => setRect((r) => clamp(r));
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
   }, []);

   // `resize: both` sizes the element directly; read it back into the rect.
   useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const observer = new ResizeObserver(() => {
         const w = el.offsetWidth;
         const h = el.offsetHeight;
         setRect((r) => (r.w === w && r.h === h ? r : { ...r, w, h }));
      });
      observer.observe(el);
      return () => observer.disconnect();
   }, []);

   const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y };
   };
   const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      setRect((r) => clamp({ ...r, x: e.clientX - d.dx, y: e.clientY - d.dy }));
   };
   const endDrag = () => {
      drag.current = undefined;
   };

   const scopeMatches =
      !thread ||
      (thread.scope.environment === context.scope.environment &&
         thread.scope.package === context.scope.package);

   return (
      <div
         ref={ref}
         role="dialog"
         aria-label="Ask"
         className="tw-portal fixed z-[1290] flex resize flex-col overflow-hidden rounded-xl border bg-background text-foreground shadow-2xl"
         style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            minWidth: MIN_W,
            minHeight: MIN_H,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 16px)",
         }}
      >
         <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="flex cursor-grab touch-none select-none items-center gap-1 border-b bg-muted/40 py-1.5 pl-3 pr-1.5 active:cursor-grabbing"
         >
            <SparklesIcon className="size-4 shrink-0 text-draft" />
            <HistoryMenu current={thread} threadId={threadId} />
            <div className="ml-auto flex shrink-0 items-center">
               <Button
                  variant="ghost"
                  size="icon-sm"
                  title="New chat"
                  onClick={() => showThread()}
               >
                  <MessageSquarePlusIcon />
               </Button>
               <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Close"
                  onClick={closeAskWindow}
               >
                  <XIcon />
               </Button>
            </div>
         </div>
         <div className="truncate border-b px-3 py-1 text-[11px] text-muted-foreground">
            {scopeMatches ? (
               <>
                  Reading <code className="font-mono">{context.subject}</code>
               </>
            ) : (
               <>
                  From{" "}
                  <code className="font-mono">{thread?.scope.package}</code>;
                  not reading this page
               </>
            )}
         </div>
         <div className="flex min-h-0 flex-1 flex-col pt-3">
            <ThreadPanel key={threadId} threadId={threadId} context={context} />
         </div>
      </div>
   );
}

function HistoryMenu({
   current,
   threadId,
}: {
   current?: ChatThread;
   threadId: string;
}) {
   const [open, setOpen] = useState(false);
   const threads = useChatThreads();
   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-accent"
               title="Chat history"
            >
               <span className="truncate">{threadTitle(current)}</span>
               <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-80 p-1">
            <button
               onClick={() => {
                  showThread();
                  setOpen(false);
               }}
               className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
               <MessageSquarePlusIcon className="size-4 text-muted-foreground" />
               New chat
            </button>
            {threads.length > 0 && (
               <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  History
               </div>
            )}
            <div className="max-h-80 overflow-y-auto">
               {threads.map((t) => (
                  <div
                     key={t.id}
                     className={cn(
                        "group flex items-center gap-1 rounded-md hover:bg-accent",
                        t.id === threadId && "bg-accent",
                     )}
                  >
                     <button
                        onClick={() => {
                           showThread(t.id);
                           setOpen(false);
                        }}
                        className="min-w-0 flex-1 px-2 py-1.5 text-left"
                     >
                        <div className="truncate text-sm">{threadTitle(t)}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                           {t.scope.package} · {t.subject} · {ago(t.updatedAt)}
                        </div>
                     </button>
                     <button
                        onClick={() => {
                           deleteThread(t.id);
                           if (t.id === threadId) showThread();
                        }}
                        title="Delete chat"
                        className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-destructive group-hover:opacity-100"
                     >
                        <Trash2Icon className="size-3.5" />
                     </button>
                  </div>
               ))}
            </div>
         </PopoverContent>
      </Popover>
   );
}

function ThreadPanel({
   threadId,
   context,
}: {
   threadId: string;
   context: AskContext;
}) {
   const [saved] = useState(() => getThread(threadId));
   // A new chat follows the reader until its first message pins where it began.
   const pinned = useRef(
      saved ? { scope: saved.scope, subject: saved.subject } : undefined,
   );
   const { scope, subject } = pinned.current ?? context;
   const samePackage =
      scope.environment === context.scope.environment &&
      scope.package === context.scope.package;
   const chat = useConsoleChat(
      { scope, page: samePackage ? context.page : undefined },
      { id: threadId, messages: saved?.messages },
   );
   const { messages, isLoading } = chat;

   const lastSaved = useRef<UIMessage[] | undefined>(saved?.messages);
   useEffect(() => {
      if (!messages.length || messages === lastSaved.current) return;
      // Mid-stream, save only new turns; the finished answer saves on settle.
      if (isLoading && messages.length === lastSaved.current?.length) return;
      lastSaved.current = messages;
      pinned.current ??= { scope, subject };
      saveThread(threadId, { scope, subject, messages });
   }, [messages, isLoading, threadId, scope, subject]);

   const titled = useRef(Boolean(saved?.title));
   useEffect(() => {
      if (titled.current || isLoading) return;
      const question = firstQuestion(messages);
      const answer = messages
         .find((m) => m.role === "assistant")
         ?.parts.map((p) => (p.type === "text" ? p.content : ""))
         .join("")
         .trim();
      if (!question || !answer) return;
      titled.current = true;
      postAi<{ title: string }>("/chat/title", {
         question,
         answer,
         model: chat.model,
      })
         .then(({ title }) => {
            if (title)
               saveThread(threadId, { scope, subject, title, touch: false });
         })
         .catch(() => {
            // The opening question stands in as the title.
         });
   }, [messages, isLoading, threadId, scope, subject, chat.model]);

   // File each question answered here in the package's Question Coverage.
   const judged = useRef(
      new Set(
         saved?.messages.filter((m) => m.role === "user").map((m) => m.id),
      ),
   );
   useEffect(() => {
      if (isLoading) return;
      messages.forEach((message, i) => {
         if (message.role !== "user" || judged.current.has(message.id)) return;
         const next = messages.findIndex((m, j) => j > i && m.role === "user");
         const reply = messages
            .slice(i + 1, next < 0 ? undefined : next)
            .filter((m) => m.role === "assistant");
         const question = messageText(message);
         const answer = transcriptMarkdown(reply);
         if (!question || !answer) return;
         judged.current.add(message.id);
         if (!isPrototypeFeatureEnabled("questionCoverage")) return;
         void recordAsked({
            scope,
            threadId,
            question,
            earlier: messages
               .slice(0, i)
               .filter((m) => m.role === "user")
               .map(messageText)
               .filter(Boolean),
            answer,
            model: chat.model,
         });
      });
   }, [messages, isLoading, threadId, scope, chat.model]);

   return (
      <ChatPanel
         chat={chat}
         suggestions={samePackage ? context.suggestions : []}
      />
   );
}

function ago(at: number): string {
   const minutes = Math.round((Date.now() - at) / 60_000);
   if (minutes < 1) return "just now";
   if (minutes < 60) return `${minutes}m ago`;
   const hours = Math.round(minutes / 60);
   if (hours < 24) return `${hours}h ago`;
   const days = Math.round(hours / 24);
   if (days < 30) return `${days}d ago`;
   return new Date(at).toLocaleDateString();
}
