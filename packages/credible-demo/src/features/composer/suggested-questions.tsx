// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, WandSparkles } from "lucide-react";
import { useClient, useSuggestedQuestions } from "@/data/hooks";
import { startSuggestions, useDemoRefresh } from "@/lib/demo-refresh";
import { cn } from "@/lib/utils";

const chip =
   "rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground";

/**
 * The templates under a composer. A workspace with none yet gets one chip
 * that has Opus 5.5 write them from its insights, packages and scenario.
 */
export function SuggestedQuestions({
   onPick,
   limit,
   className,
}: {
   onPick: (question: string) => void;
   limit?: number;
   className?: string;
}) {
   const client = useClient();
   const qc = useQueryClient();
   const { data } = useSuggestedQuestions();
   const task = useDemoRefresh();
   if (!data) return null;
   const running = task.status === "running";
   const writing = running && task.task === "questions";

   return (
      <div className={cn("flex flex-wrap gap-2", className)}>
         {data.length > 0 ? (
            data.slice(0, limit).map((q) => (
               <button key={q} onClick={() => onPick(q)} className={chip}>
                  {q}
               </button>
            ))
         ) : (
            <button
               disabled={running}
               onClick={() => void startSuggestions(client, qc)}
               className={cn(
                  chip,
                  "inline-flex items-center gap-1.5 border-dashed disabled:opacity-70",
               )}
            >
               {writing ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
               ) : (
                  <WandSparkles className="size-3.5" />
               )}
               {writing
                  ? "Writing questions with Claude Opus 5.5…"
                  : running
                    ? "Questions will follow the demo content"
                    : "Suggest questions for this workspace"}
            </button>
         )}
      </div>
   );
}
