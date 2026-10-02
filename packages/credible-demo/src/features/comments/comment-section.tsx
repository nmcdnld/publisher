// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { PersonAvatar, useAuthorName } from "@/components/people";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAddComment, useComments, usePeople, useViewer } from "@/data/hooks";
import type { AnalysisComment } from "@/data/types";
import { relativeTime } from "@/lib/format";

/**
 * The discussion under an analysis or a Publisher page: what colleagues said
 * about it, oldest first. `subject` is an analysis id or a page's `pageKey`;
 * `formerly` names what it was filed under before, such as the analysis a
 * saved finding came from, so a comment left there is not lost.
 */
export function CommentSection({
   subject,
   formerly,
}: {
   subject: string;
   formerly?: string[];
}) {
   const { data: comments, isPending } = useComments(subject, formerly);
   const viewer = useViewer().data;
   const add = useAddComment(subject);
   const [draft, setDraft] = useState("");

   const post = () => {
      const text = draft.trim();
      if (!text || add.isPending) return;
      add.mutate(text, { onSuccess: () => setDraft("") });
   };

   return (
      <section className="space-y-4 border-t pt-6" aria-label="Comments">
         <h2 className="flex items-center gap-2 text-base font-semibold">
            Comments
            {comments && comments.length > 0 && (
               <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {comments.length}
               </span>
            )}
         </h2>

         {isPending ? (
            <div className="space-y-4">
               {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3">
                     <Skeleton className="size-7 rounded-full" />
                     <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3.5 w-3/4" />
                     </div>
                  </div>
               ))}
            </div>
         ) : comments && comments.length > 0 ? (
            <ul className="space-y-5">
               {comments.map((c) => (
                  <li key={c.id}>
                     <CommentRow comment={c} />
                  </li>
               ))}
            </ul>
         ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
               <MessageSquare className="size-4 shrink-0" />
               No comments yet. Ask a question or flag something for the author.
            </div>
         )}

         <div className="flex gap-3">
            {viewer && <PersonAvatar person={viewer.person} />}
            <div className="flex-1 space-y-2">
               <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                     if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        post();
                     }
                  }}
                  placeholder="Add a comment…"
                  aria-label="Add a comment"
                  className="min-h-20 resize-none bg-card"
               />
               <div className="flex items-center justify-end gap-3">
                  <span className="text-xs text-muted-foreground">
                     ⌘↵ to post
                  </span>
                  <Button
                     size="sm"
                     disabled={!draft.trim() || add.isPending}
                     onClick={post}
                  >
                     Comment
                  </Button>
               </div>
            </div>
         </div>
      </section>
   );
}

function CommentRow({ comment }: { comment: AnalysisComment }) {
   const { byId } = usePeople();
   const name = useAuthorName()(comment.authorId);
   const person = byId.get(comment.authorId);
   return (
      <div className="flex gap-3">
         {person ? (
            <PersonAvatar person={person} />
         ) : (
            <span className="size-7 shrink-0 rounded-full bg-muted" />
         )}
         <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-sm">
               <span className="font-medium">{name}</span>
               <time
                  dateTime={comment.createdAt}
                  className="text-xs text-muted-foreground"
               >
                  {relativeTime(comment.createdAt)}
               </time>
            </div>
            <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">
               {comment.text}
            </p>
         </div>
      </div>
   );
}
