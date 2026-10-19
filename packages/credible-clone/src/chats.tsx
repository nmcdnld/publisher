// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import {
   createContext,
   useCallback,
   useContext,
   useEffect,
   useMemo,
   useRef,
   useState,
   type ReactNode,
} from "react";
import { useAgent } from "./agent";
import { DEFAULT_MODEL } from "./models";
import {
   chats as initialChats,
   messages as initialMessages,
   packages,
   type Chat,
   type ChatOrigin,
   type Message,
   type Scope,
} from "./fixtures";

type ChatsContextValue = {
   chats: Chat[];
   messages: Record<string, Message[]>;
   pending: Set<string>;
   /** The last reply that failed, per chat. */
   errors: Record<string, string>;
   send: (
      chatId: string | null,
      text: string,
      scope: Scope,
      origin?: ChatOrigin,
   ) => string;
   /** Cancel the reply in progress, if any. */
   stop: (chatId: string) => void;
   setScope: (chatId: string, scope: Scope) => void;
};

/** Mirrors `ChatRequest` in `server/agent.ts`. */
type ChatRequest = {
   scope?: { environment: string; package: string };
   report?: Scope["report"];
   model?: string;
};

const ChatsContext = createContext<ChatsContextValue | null>(null);

/**
 * Every chat, each reply streamed from the agent at `/ai/chat` by a TanStack
 * AI `ChatClient`. One client per chat, held here rather than in a view, so a
 * reply keeps streaming as the chat moves between the side panel and the full
 * chat page.
 */
export function ChatsProvider({ children }: { children: ReactNode }) {
   const [chats, setChats] = useState(initialChats);
   const [messages, setMessages] = useState(initialMessages);
   const [pending, setPending] = useState<Set<string>>(new Set());
   const [errors, setErrors] = useState<Record<string, string>>({});
   const clients = useRef(new Map<string, ChatClient>());
   const latest = useRef(messages);
   latest.current = messages;
   const { model, status } = useAgent();
   const modelRef = useRef(model);
   modelRef.current = model;
   const chatsRef = useRef(chats);
   chatsRef.current = chats;
   const defaultModelRef = useRef(DEFAULT_MODEL);
   defaultModelRef.current = status?.defaultModel ?? DEFAULT_MODEL;

   useEffect(() => {
      const open = clients.current;
      return () => {
         open.forEach((client) => client.dispose());
         open.clear();
      };
   }, []);

   const clientFor = useCallback((chatId: string) => {
      let client = clients.current.get(chatId);
      if (client) return client;
      client = new ChatClient({
         connection: fetchServerSentEvents("/ai/chat"),
         threadId: chatId,
         initialMessages: latest.current[chatId],
         onMessagesChange: (thread) =>
            setMessages((prev) => ({ ...prev, [chatId]: thread })),
         onLoadingChange: (loading) =>
            setPending((prev) => {
               const next = new Set(prev);
               if (loading) next.add(chatId);
               else next.delete(chatId);
               return next;
            }),
         onErrorChange: (error) =>
            setErrors((prev) => {
               const { [chatId]: _, ...rest } = prev;
               return error ? { ...rest, [chatId]: error.message } : rest;
            }),
      });
      clients.current.set(chatId, client);
      return client;
   }, []);

   const send = useCallback(
      (
         chatId: string | null,
         text: string,
         scope: Scope,
         origin?: ChatOrigin,
      ) => {
         const id = chatId ?? crypto.randomUUID();
         const now = new Date().toISOString();
         const model = chatId
            ? (chatsRef.current.find((c) => c.id === chatId)?.model ??
              defaultModelRef.current)
            : modelRef.current;

         setChats((prev) =>
            chatId
               ? prev.map((c) => (c.id === id ? { ...c, updatedAt: now } : c))
               : [
                    {
                       id,
                       title: text.slice(0, 60),
                       updatedAt: now,
                       scope,
                       origin,
                       model,
                    },
                    ...prev,
                 ],
         );
         void clientFor(id).sendMessage(text, {
            ...chatRequest(scope),
            model,
         });
         return id;
      },
      [clientFor],
   );

   const stop = useCallback((chatId: string) => {
      clients.current.get(chatId)?.stop();
   }, []);

   const setScope = useCallback((chatId: string, scope: Scope) => {
      setChats((prev) =>
         prev.map((c) => (c.id === chatId ? { ...c, scope } : c)),
      );
   }, []);

   const value = useMemo(
      () => ({ chats, messages, pending, errors, send, stop, setScope }),
      [chats, messages, pending, errors, send, stop, setScope],
   );

   return (
      <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>
   );
}

/**
 * A fixture package is asked about under the names the local Publisher serves
 * it as; a report's package is already a served name.
 */
function chatRequest(scope: Scope): ChatRequest {
   if (!scope.environment || !scope.package) return {};
   const served = packages.find(
      (p) => p.environment === scope.environment && p.name === scope.package,
   )?.served;
   return {
      scope: served ?? {
         environment: scope.environment,
         package: scope.package,
      },
      report: scope.report,
   };
}

export function useChats() {
   const ctx = useContext(ChatsContext);
   if (!ctx) throw new Error("useChats must be used inside ChatsProvider");
   return ctx;
}

export function messageText(message: Message): string {
   return message.parts
      .map((p) => (p.type === "text" ? p.content : ""))
      .join("")
      .trim();
}

export function previewOf(thread: Message[] | undefined): string {
   const last = thread?.at(-1);
   if (!last) return "No messages yet";
   return messageText(last) || (last.role === "assistant" ? "Working…" : "");
}
