// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from "react";
import { SaveButton } from "@/components/save-menu";
import { useAnalyses, useKeepResponse, useViewer } from "@/data/hooks";
import { responseAnalysis } from "@/data/responses";
import { analysisPromotable } from "@/data/sync";
import type { Thread, ThreadMessage } from "@/data/types";

/**
 * Save for one chat answer. The answer becomes an insight the first time it
 * is saved, to the viewer's Library or as a data app in its package, and
 * every later save is of that same insight.
 */
export function ResponseSave({
   thread,
   message,
}: {
   thread: Thread;
   message: ThreadMessage;
}) {
   const viewerId = useViewer().data?.person.id ?? "ai";
   const saved = useAnalyses().byId.get(message.analysisId ?? "");
   const keep = useKeepResponse();
   const draft = useMemo(
      () =>
         responseAnalysis(thread, message, {
            id: "",
            authorId: viewerId,
            createdAt: message.createdAt,
            topics: [],
         }),
      [thread, message, viewerId],
   );
   const analysis = saved ?? draft;
   if (!analysis) return null;
   return (
      <SaveButton
         promotable={analysisPromotable(analysis)}
         keep={
            saved ? undefined : () => keep.mutateAsync([thread.id, message.id])
         }
      />
   );
}
