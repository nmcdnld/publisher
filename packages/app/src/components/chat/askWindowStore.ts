// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useSyncExternalStore } from "react";
import type { ChatScope } from "./chatHistory";

/** The page the Ask window reads, set by whichever page opened or last updated it. */
export interface AskContext {
   scope: ChatScope;
   /** The page rendered as markdown, sent with every question. */
   page?: string;
   subject: string;
   suggestions: string[];
}

interface AskWindowState {
   open: boolean;
   /** The thread shown; a fresh id until its first message saves it. */
   threadId: string;
   context?: AskContext;
}

const listeners = new Set<() => void>();
let state: AskWindowState = { open: false, threadId: newThreadId() };

function set(next: Partial<AskWindowState>) {
   state = { ...state, ...next };
   listeners.forEach((l) => l());
}

export function newThreadId(): string {
   return crypto.randomUUID();
}

export function useAskWindow(): AskWindowState {
   return useSyncExternalStore(
      (listener) => {
         listeners.add(listener);
         return () => listeners.delete(listener);
      },
      () => state,
   );
}

/** Opening a closed window starts a new chat; an open one keeps its thread. */
export function openAskWindow(context: AskContext) {
   set({
      open: true,
      context,
      threadId: state.open ? state.threadId : newThreadId(),
   });
}

/** Follow the reader to another page while the window is open. */
export function updateAskContext(context: AskContext) {
   if (!state.open) return;
   if (JSON.stringify(context) === JSON.stringify(state.context)) return;
   set({ context });
}

export function closeAskWindow() {
   set({ open: false });
}

export function showThread(threadId: string = newThreadId()) {
   set({ threadId });
}
