// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQueryClient } from "@tanstack/react-query";
import {
   createContext,
   useCallback,
   useContext,
   useMemo,
   useRef,
   useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { offeredModels } from "@/analyst/config";
import type { AnalystRequest, Audience } from "@/analyst/events";
import {
   applyEvent,
   newRecord,
   storedRecord,
   type AnalystRecord,
} from "@/analyst/record";
import { streamRun } from "@/analyst/stream";
import { keys, useAppendExchange } from "@/data/hooks";
import { DEFAULT_MODEL, resolveModel } from "@/data/models";
import type { MessageContext, Thread } from "@/data/types";
import { answerFields, historyOf } from "@/features/analyst/answer";
import { activeWorkspace } from "@/lib/workspaces";

/** An analyst run still streaming, shown in the rail until it is saved. */
export interface LiveRun {
   threadId: string | null;
   question: string;
   context?: MessageContext;
   record: AnalystRecord;
}

/**
 * Where a conversation shows: the full-page `/chat` route, or the rail docked
 * beside whatever page you are on.
 */
export type ChatSurface = "page" | "rail";

interface SurfaceOpts {
   /** Defaults to the surface the caller is rendered in; see `ChatSurfaceProvider`. */
   surface?: ChatSurface;
}

interface ThreadUi {
   activeThreadId: string | null;
   /** True while the rail is open; it then follows you across pages. */
   docked: boolean;
   /** A model id from `chatModels`. */
   model: string;
   setModel: (id: string) => void;
   /** Who the analyst treats you as: admins see the trace and "Show work". */
   audience: Audience;
   setAudience: (a: Audience) => void;
   adminToken: string;
   setAdminToken: (t: string) => void;
   /** The question awaiting a reply, shown optimistically in the rail. */
   pending: string | null;
   live: LiveRun | null;
   /** Stops the running analyst; what it found so far is kept. */
   stop: () => void;
   ask: (
      text: string,
      opts?: SurfaceOpts & { fresh?: boolean; context?: MessageContext },
   ) => void;
   openThread: (id: string, opts?: SurfaceOpts) => void;
   startNew: (opts?: SurfaceOpts) => void;
   closeRail: () => void;
}

const ThreadUiContext = createContext<ThreadUi | null>(null);
const SurfaceContext = createContext<ChatSurface>("page");

/** The route a conversation lives at on the page surface. */
export const chatPath = (threadId: string | null) =>
   threadId ? `/chat/${threadId}` : "/chat";

/** Components inside keep their conversation on `surface` when they ask or open a thread. */
export function ChatSurfaceProvider({
   surface,
   children,
}: {
   surface: ChatSurface;
   children: React.ReactNode;
}) {
   return (
      <SurfaceContext.Provider value={surface}>
         {children}
      </SurfaceContext.Provider>
   );
}

const MODEL_KEY = "destination.model";
const AUDIENCE_KEY = "destination.analyst.audience";
const TOKEN_KEY = "destination.analyst.adminToken";

function useStored<T extends string>(key: string, initial: T) {
   const [value, setValue] = useState<T>(
      () => (localStorage.getItem(key) as T | null) ?? initial,
   );
   const set = useCallback(
      (v: T) => {
         setValue(v);
         localStorage.setItem(key, v);
      },
      [key],
   );
   return [value, set] as const;
}

export function ThreadUiProvider({ children }: { children: React.ReactNode }) {
   const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
   const [docked, setDocked] = useState(false);
   const [storedModel, setModel] = useStored<string>(MODEL_KEY, DEFAULT_MODEL);
   const model = resolveModel(storedModel).id;
   const [audience, setAudience] = useStored<Audience>(AUDIENCE_KEY, "admin");
   const [adminToken, setAdminToken] = useStored<string>(TOKEN_KEY, "");
   const [live, setLive] = useState<LiveRun | null>(null);
   const abortRef = useRef<AbortController | null>(null);
   const append = useAppendExchange();
   const qc = useQueryClient();
   const navigate = useNavigate();
   const pathname = useRef("");
   pathname.current = useLocation().pathname;

   /** Brings thread `id` (or a new one) up on `surface`. */
   const show = useCallback(
      (id: string | null, surface: ChatSurface) => {
         if (surface === "rail") {
            setDocked(true);
            return;
         }
         setDocked(false);
         if (pathname.current !== chatPath(id)) navigate(chatPath(id));
      },
      [navigate],
   );

   const runAnalyst = useCallback(
      async (
         text: string,
         threadId: string | null,
         context: MessageContext = {},
      ) => {
         const thread = threadId
            ? qc.getQueryData<Thread | null>(keys.thread(threadId))
            : null;
         const wanted = resolveModel(context.model ?? model).openRouterId;
         const request: AnalystRequest = {
            question: text,
            model:
               wanted &&
               (audience === "admin" || offeredModels.includes(wanted))
                  ? wanted
                  : undefined,
            history: historyOf(thread?.messages),
            packages: activeWorkspace().packages,
         };

         const abort = new AbortController();
         abortRef.current = abort;
         let record = newRecord(text);
         setLive({ threadId, question: text, context, record });
         let frame = 0;
         const flush = () => {
            frame = 0;
            setLive((l) => (l ? { ...l, record } : l));
         };
         try {
            await streamRun(
               request,
               {
                  audience,
                  adminToken: adminToken || undefined,
                  signal: abort.signal,
               },
               {
                  onEvent: (name, value) => {
                     record = applyEvent(record, name, value);
                     if (!frame) frame = requestAnimationFrame(flush);
                  },
                  onError: (message) => {
                     record = { ...record, status: "failed", error: message };
                  },
               },
            );
         } catch (e) {
            record = abort.signal.aborted
               ? {
                    ...record,
                    status: record.report ? "partial" : "failed",
                    partial: true,
                    error: "Stopped before it finished.",
                 }
               : { ...record, status: "failed", error: (e as Error).message };
         }
         cancelAnimationFrame(frame);
         abortRef.current = null;
         if (record.status === "running") {
            record = {
               ...record,
               status: record.report ? "ok" : "failed",
               error: record.report
                  ? undefined
                  : "The analyst stopped without a report.",
            };
         }
         setLive((l) => (l ? { ...l, record } : l));
         append.mutate(
            [
               threadId,
               { text, ...context },
               answerFields(storedRecord(record)),
            ],
            {
               onSuccess: (saved) => {
                  qc.setQueryData(keys.thread(saved.id), saved);
                  setActiveThreadId((id) => (id === threadId ? saved.id : id));
                  // A new thread gets its id only now; give its page a real URL.
                  if (threadId === null && pathname.current === chatPath(null))
                     navigate(chatPath(saved.id), { replace: true });
               },
               onError: (e) => toast.error(e.message),
               onSettled: () => setLive(null),
            },
         );
      },
      [model, audience, adminToken, append, qc, navigate],
   );

   const ask = useCallback<ThreadUi["ask"]>(
      (text, opts = {}) => {
         const trimmed = text.trim();
         if (!trimmed || live) return;
         const threadId = opts.fresh ? null : activeThreadId;
         if (opts.fresh) setActiveThreadId(null);
         show(threadId, opts.surface ?? "page");
         void runAnalyst(trimmed, threadId, opts.context);
      },
      [activeThreadId, live, runAnalyst, show],
   );

   const value = useMemo<ThreadUi>(
      () => ({
         activeThreadId,
         docked,
         model,
         setModel,
         audience,
         setAudience,
         adminToken,
         setAdminToken,
         pending: live?.question ?? null,
         live,
         stop: () => abortRef.current?.abort(),
         ask,
         openThread: (id, opts = {}) => {
            setActiveThreadId(id);
            show(id, opts.surface ?? "page");
         },
         startNew: (opts = {}) => {
            setActiveThreadId(null);
            show(null, opts.surface ?? "page");
         },
         closeRail: () => setDocked(false),
      }),
      [
         show,
         activeThreadId,
         docked,
         model,
         setModel,
         audience,
         setAudience,
         adminToken,
         setAdminToken,
         live,
         ask,
      ],
   );

   return (
      <ThreadUiContext.Provider value={value}>
         {children}
      </ThreadUiContext.Provider>
   );
}

/** The thread UI, or null outside a ThreadUiProvider, as on a standalone page. */
export function useOptionalThreadUi(): ThreadUi | null {
   const ctx = useContext(ThreadUiContext);
   const surface = useContext(SurfaceContext);
   return useMemo<ThreadUi | null>(
      () =>
         ctx && {
            ...ctx,
            ask: (text, opts) => ctx.ask(text, { surface, ...opts }),
            openThread: (id, opts) => ctx.openThread(id, { surface, ...opts }),
            startNew: (opts) => ctx.startNew({ surface, ...opts }),
         },
      [ctx, surface],
   );
}

export function useThreadUi(): ThreadUi {
   const ui = useOptionalThreadUi();
   if (!ui) throw new Error("useThreadUi must be used inside ThreadUiProvider");
   return ui;
}
