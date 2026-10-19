// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   fetchServerSentEvents,
   type UIMessage,
   useChat,
} from "@tanstack/ai-react";
import { useMemo } from "react";
import { aiUrl, useAiHealth, useChatModel } from "../../ai/consoleAi";

/**
 * A chat with the console-ai Worker's `/ai/ask` agent, which runs Publisher's
 * MCP tools and skills. `props` travel as `forwardedProps` (see `AskRequest`
 * in `packages/console-ai/src/dictionary.ts`), with the picked model added.
 * `thread` resumes a saved conversation; both fields are read on mount only.
 */
export function useConsoleChat(
   props: Record<string, unknown>,
   thread?: { id: string; messages?: UIMessage[] },
) {
   const health = useAiHealth();
   const [picked, setModel] = useChatModel();
   const model = picked ?? health.data?.defaultModel;
   const key = JSON.stringify(props);
   const forwardedProps = useMemo(
      () => ({ ...(JSON.parse(key) as Record<string, unknown>), model }),
      [key, model],
   );
   const connection = useMemo(() => fetchServerSentEvents(aiUrl("/ask")), []);
   const chat = useChat({
      connection,
      forwardedProps,
      threadId: thread?.id,
      initialMessages: thread?.messages,
   });
   const unavailable = health.data === null || health.data?.chat === false;
   return { ...chat, model, setModel, health, unavailable };
}

export type ConsoleChat = ReturnType<typeof useConsoleChat>;
