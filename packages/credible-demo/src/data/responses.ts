// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Analysis, Thread, ThreadMessage } from "./types";

/**
 * A chat answer as an insight of its own: the answer as its narrative, its
 * lead chart and query as evidence, and the analyst's whole report when it
 * has one. Undefined for an answer with no query or chart to keep.
 */
export function responseAnalysis(
   thread: Thread,
   message: ThreadMessage,
   keep: Pick<Analysis, "id" | "authorId" | "createdAt" | "topics">,
): Analysis | undefined {
   if (
      message.role !== "assistant" ||
      !message.evidence ||
      !message.malloy ||
      !message.provenance
   ) {
      return undefined;
   }
   const at = thread.messages.findIndex((m) => m.id === message.id);
   const question = thread.messages
      .slice(0, at < 0 ? undefined : at)
      .reverse()
      .find((m) => m.role === "user")?.text;
   const report = message.analyst?.report ? message.analyst : undefined;
   return {
      ...keep,
      title: report?.report?.title || question || thread.title,
      narrative: message.text,
      details: [],
      evidence: message.evidence,
      malloy: message.malloy,
      provenance: message.provenance,
      ...(report ? { report } : {}),
   };
}
