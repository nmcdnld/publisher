// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowUp,
   AtSign,
   Loader2,
   Mic,
   Paperclip,
   Plus,
   Square,
} from "lucide-react";
import {
   useEffect,
   useImperativeHandle,
   useLayoutEffect,
   useMemo,
   useRef,
   useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuShortcut,
   DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import { threadTokens } from "@/data/entities";
import { useThread, useWorkspaceEntities } from "@/data/hooks";
import {
   contextUsage,
   estimateTokens,
   fileTokens,
   resolveModel,
} from "@/data/models";
import type { EntityRef } from "@/data/types";
import { useThreadUi } from "@/features/threads/thread-context";
import { cn } from "@/lib/utils";
import { caretOffset, escapeRegExp, mentionAt, mentionPattern } from "./caret";
import { ContextChips, type Attachment } from "./context-chips";
import { MentionMenu } from "./mention-menu";
import { ModelPicker } from "./model-picker";
import { useMentionMenu, type MentionState } from "./use-mention-menu";
import { useVoiceInput } from "./use-voice-input";

export interface ComposerHandle {
   /** Replace the draft, e.g. with a suggested question, and focus it. */
   setText: (text: string) => void;
   focus: () => void;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPT =
   ".csv,.tsv,.json,.jsonl,.ndjson,.txt,.md,.malloy,.malloynb,.sql,.xlsx,.parquet,.pdf,image/*";

let attachmentCounter = 0;

export function Composer({
   placeholder = "Ask a follow-up…",
   fresh = false,
   autoFocus = false,
   size = "sm",
   className,
   ref,
}: {
   placeholder?: string;
   /** Start a new thread rather than continuing the open one. */
   fresh?: boolean;
   autoFocus?: boolean;
   size?: "sm" | "lg";
   className?: string;
   ref?: React.Ref<ComposerHandle>;
}) {
   const { ask, pending, model, setModel, activeThreadId, live, stop } =
      useThreadUi();
   const thread = useThread(fresh ? null : activeThreadId).data;

   const [text, setText] = useState("");
   const [refs, setRefs] = useState<EntityRef[]>([]);
   const [attachments, setAttachments] = useState<Attachment[]>([]);
   const [mention, setMention] = useState<MentionState | null>(null);
   const [modelOpen, setModelOpen] = useState(false);
   const [dragging, setDragging] = useState(false);
   const [warm, setWarm] = useState(false);
   /** An `@` whose menu was dismissed with Escape stays closed until it changes. */
   const dismissed = useRef<number | null>(null);
   const input = useRef<HTMLTextAreaElement>(null);
   const overlay = useRef<HTMLDivElement>(null);
   const fileInput = useRef<HTMLInputElement>(null);

   const { entities, loading } = useWorkspaceEntities(warm);

   // A reference counts only while its `@handle` is still in the text.
   const pattern = useMemo(
      () => mentionPattern(refs.map((r) => r.handle)),
      [refs],
   );
   const activeRefs = useMemo(() => {
      if (!pattern) return [];
      const found = new Set(
         [...text.matchAll(pattern)].map((m) => m[2].slice(1)),
      );
      return refs.filter((r) => found.has(r.handle));
   }, [text, refs, pattern]);

   const usage = contextUsage({
      history: threadTokens(thread),
      references: activeRefs.reduce((n, r) => n + r.tokens, 0),
      attachments: attachments.reduce((n, a) => n + a.meta.tokens, 0),
      prompt: estimateTokens(text),
   });
   const resolved = resolveModel(model);
   const tooBig = usage.total > resolved.window;

   const focus = (caret?: number) =>
      requestAnimationFrame(() => {
         const el = input.current;
         if (!el) return;
         el.focus();
         const at = caret ?? el.value.length;
         el.setSelectionRange(at, at);
      });

   useImperativeHandle(ref, () => ({
      setText: (t) => {
         setText(t);
         setMention(null);
         focus(t.length);
      },
      focus: () => focus(),
   }));

   // Grow with the text, up to the max height the class sets.
   useLayoutEffect(() => {
      const el = input.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
      if (overlay.current) overlay.current.scrollTop = el.scrollTop;
   }, [text]);

   const latestAttachments = useRef(attachments);
   latestAttachments.current = attachments;
   useEffect(
      () => () =>
         latestAttachments.current.forEach(
            (a) => a.preview && URL.revokeObjectURL(a.preview),
         ),
      [],
   );

   // ── @ mentions ─────────────────────────────────────────────────────

   const syncMention = (value: string, caret: number) => {
      const found = mentionAt(value, caret);
      if (!found || found.start === dismissed.current) {
         if (!found) dismissed.current = null;
         setMention(null);
         return;
      }
      setWarm(true);
      const off = caretOffset(input.current!, found.start);
      setMention({ ...found, anchor: off });
   };

   const insertReference = (entity: EntityRef) => {
      if (!mention) return;
      const end = mention.start + 1 + mention.query.length;
      const before = text.slice(0, mention.start);
      const after = text.slice(end).replace(/^ /, "");
      const token = `@${entity.handle} `;
      setText(before + token + after);
      setRefs((r) => (r.some((x) => x.id === entity.id) ? r : [...r, entity]));
      setMention(null);
      focus(before.length + token.length);
   };

   const closeMention = () => {
      if (mention) dismissed.current = mention.start;
      setMention(null);
   };

   const menu = useMentionMenu({
      mention,
      entities: entities.filter((e) => !activeRefs.some((r) => r.id === e.id)),
      onSelect: insertReference,
      onClose: closeMention,
   });

   const removeReference = (r: EntityRef) => {
      const token = new RegExp(
         `(^|\\s)@${escapeRegExp(r.handle)}(?=$|[\\s.,;:!?)]) ?`,
         "g",
      );
      setText((t) => t.replace(token, "$1"));
      setRefs((all) => all.filter((x) => x.id !== r.id));
      focus();
   };

   const startReference = () => {
      const el = input.current;
      const caret = el?.selectionStart ?? text.length;
      const before = text.slice(0, caret);
      const lead = before && !/\s$/.test(before) ? " " : "";
      const next = `${before}${lead}@${text.slice(caret)}`;
      const at = caret + lead.length + 1;
      setText(next);
      dismissed.current = null;
      requestAnimationFrame(() => {
         focus(at);
         requestAnimationFrame(() => syncMention(next, at));
      });
   };

   // ── Attachments ────────────────────────────────────────────────────

   const addFiles = (files: Iterable<File>) => {
      const added: Attachment[] = [];
      for (const file of files) {
         if (file.size > MAX_FILE_BYTES) {
            toast.error(`${file.name} is over 20 MB`);
            continue;
         }
         added.push({
            id: `att-${attachmentCounter++}`,
            file,
            meta: {
               name: file.name,
               type: file.type,
               size: file.size,
               tokens: Math.round(fileTokens(file)),
            },
            preview: file.type.startsWith("image/")
               ? URL.createObjectURL(file)
               : undefined,
         });
      }
      if (added.length) setAttachments((a) => [...a, ...added]);
   };

   const removeAttachment = (id: string) =>
      setAttachments((all) => {
         const gone = all.find((a) => a.id === id);
         if (gone?.preview) URL.revokeObjectURL(gone.preview);
         return all.filter((a) => a.id !== id);
      });

   // ── Voice ──────────────────────────────────────────────────────────

   const dictation = useRef({ before: "", after: "" });
   const voice = useVoiceInput({
      onTranscript: (spoken) => {
         const { before, after } = dictation.current;
         setText(before + spoken.trimStart() + after);
      },
      onError: (message) => toast.error(message),
   });

   const toggleVoice = () => {
      if (!voice.listening) {
         const caret = input.current?.selectionStart ?? text.length;
         const before = text.slice(0, caret);
         const after = text.slice(caret);
         dictation.current = {
            before: before && !/\s$/.test(before) ? `${before} ` : before,
            after: after && !/^\s/.test(after) ? ` ${after}` : after,
         };
      }
      voice.toggle();
      focus();
   };

   // ── Submit ─────────────────────────────────────────────────────────

   const canSend = !!text.trim() && !pending && !tooBig;

   const submit = () => {
      if (!canSend) return;
      if (voice.listening) voice.stop();
      ask(text, {
         fresh,
         context: {
            model: resolved.id,
            references: activeRefs.length ? activeRefs : undefined,
            attachments: attachments.length
               ? attachments.map((a) => a.meta)
               : undefined,
         },
      });
      attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      setText("");
      setRefs([]);
      setAttachments([]);
      setMention(null);
   };

   const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (menu.onKeyDown(e)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
         e.preventDefault();
         setModelOpen(true);
         return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
         e.preventDefault();
         submit();
         return;
      }
      // Backspace right after a reference deletes the whole `@handle`.
      const el = e.currentTarget;
      if (
         e.key === "Backspace" &&
         el.selectionStart === el.selectionEnd &&
         el.selectionStart > 0
      ) {
         const caret = el.selectionStart;
         const before = text.slice(0, caret);
         const hit = activeRefs.find((r) =>
            new RegExp(`(^|\\s)@${escapeRegExp(r.handle)}$`).test(before),
         );
         if (hit) {
            e.preventDefault();
            const start = caret - hit.handle.length - 1;
            setText(text.slice(0, start) + text.slice(caret));
            focus(start);
         }
      }
   };

   // ── Render ─────────────────────────────────────────────────────────

   const textClass = cn(
      "col-start-1 row-start-1 block w-full resize-none px-4 pt-3.5 pb-1 whitespace-pre-wrap break-words [scrollbar-gutter:stable]",
      size === "lg"
         ? "min-h-[4.75rem] max-h-72 text-base leading-6"
         : "min-h-12 max-h-48 text-sm leading-5",
   );

   const highlighted = useMemo(() => {
      const parts: React.ReactNode[] = [];
      let last = 0;
      if (pattern && activeRefs.length) {
         for (const m of text.matchAll(pattern)) {
            const start = m.index + m[1].length;
            parts.push(text.slice(last, start));
            parts.push(
               <span
                  key={start}
                  className="rounded-[3px] bg-primary/10 text-primary ring-1 ring-primary/20"
               >
                  {m[2]}
               </span>,
            );
            last = start + m[2].length;
         }
      }
      parts.push(text.slice(last));
      // A trailing newline needs a character after it to take up a line.
      if (text.endsWith("\n")) parts.push("\u200b");
      return parts;
   }, [text, pattern, activeRefs.length]);

   return (
      <div
         className={cn(
            "relative rounded-2xl border bg-card shadow-xs transition-shadow focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/15",
            tooBig && "border-destructive/60",
            className,
         )}
         onDragEnter={(e) => {
            if (e.dataTransfer.types.includes("Files")) setDragging(true);
         }}
         onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
         }}
         onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
               setDragging(false);
         }}
         onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
            focus();
         }}
      >
         <ContextChips
            attachments={attachments}
            references={activeRefs}
            onRemoveAttachment={removeAttachment}
            onRemoveReference={removeReference}
            className="px-3 pt-3"
         />

         <div className="relative grid">
            <div
               ref={overlay}
               aria-hidden
               className={cn(
                  textClass,
                  "pointer-events-none overflow-hidden text-foreground",
               )}
            >
               {highlighted}
            </div>
            <textarea
               ref={input}
               value={text}
               autoFocus={autoFocus}
               rows={1}
               spellCheck
               onFocus={() => setWarm(true)}
               onChange={(e) => {
                  setText(e.target.value);
                  syncMention(e.target.value, e.target.selectionStart);
               }}
               onSelect={(e) =>
                  syncMention(
                     e.currentTarget.value,
                     e.currentTarget.selectionStart,
                  )
               }
               onScroll={(e) => {
                  if (overlay.current)
                     overlay.current.scrollTop = e.currentTarget.scrollTop;
               }}
               onKeyDown={onKeyDown}
               onPaste={(e) => {
                  if (e.clipboardData.files.length) {
                     e.preventDefault();
                     addFiles(e.clipboardData.files);
                  }
               }}
               placeholder={voice.listening ? "Listening…" : placeholder}
               aria-label="Message"
               aria-autocomplete="list"
               aria-expanded={menu.open}
               className={cn(
                  textClass,
                  "overflow-y-auto bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground selection:bg-primary/25",
               )}
            />
            <MentionMenu
               mention={mention}
               menu={menu}
               loading={loading}
               onSelect={insertReference}
               onClose={closeMention}
               ignoreOutside={input}
            />
         </div>

         <div className="flex items-center gap-1 px-2 pt-1 pb-2">
            <DropdownMenu>
               <Tooltip>
                  <TooltipTrigger asChild>
                     <DropdownMenuTrigger asChild>
                        <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           className="size-7 rounded-full text-muted-foreground"
                           aria-label="Add context"
                        >
                           <Plus />
                        </Button>
                     </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Add files or references</TooltipContent>
               </Tooltip>
               <DropdownMenuContent
                  align="start"
                  className="w-60"
                  onCloseAutoFocus={(e) => e.preventDefault()}
               >
                  <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                     <Paperclip />
                     Upload files
                     <DropdownMenuShortcut>
                        CSV, PDF, images
                     </DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={startReference}>
                     <AtSign />
                     Reference workspace
                     <DropdownMenuShortcut>@</DropdownMenuShortcut>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
            <input
               ref={fileInput}
               type="file"
               multiple
               accept={ACCEPT}
               className="hidden"
               onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                  focus();
               }}
            />

            <ModelPicker
               value={model}
               onChange={setModel}
               usage={usage}
               open={modelOpen}
               onOpenChange={setModelOpen}
               onDone={() => focus()}
            />

            <div className="ml-auto flex items-center gap-1">
               <Tooltip>
                  <TooltipTrigger asChild>
                     {/* A span, so the tooltip still explains a disabled button. */}
                     <span tabIndex={voice.supported ? -1 : 0}>
                        <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           onClick={toggleVoice}
                           disabled={!voice.supported}
                           aria-label={
                              voice.listening ? "Stop dictation" : "Dictate"
                           }
                           aria-pressed={voice.listening}
                           className={cn(
                              "size-8 rounded-full text-muted-foreground",
                              voice.listening &&
                                 "w-auto gap-1.5 bg-destructive/10 px-2.5 text-destructive hover:bg-destructive/15 hover:text-destructive",
                           )}
                        >
                           {voice.listening ? (
                              <>
                                 <LevelBars level={voice.level} />
                                 <Square className="size-3 fill-current" />
                              </>
                           ) : (
                              <Mic />
                           )}
                        </Button>
                     </span>
                  </TooltipTrigger>
                  <TooltipContent>
                     {!voice.supported
                        ? "Voice input isn't supported in this browser"
                        : voice.listening
                          ? "Stop dictation"
                          : "Dictate"}
                  </TooltipContent>
               </Tooltip>
               {live ? (
                  <Tooltip>
                     <TooltipTrigger asChild>
                        <Button
                           type="button"
                           size="icon"
                           variant="secondary"
                           className="size-8 rounded-full"
                           onClick={stop}
                           aria-label="Stop the analyst"
                        >
                           <Square className="size-3 fill-current" />
                        </Button>
                     </TooltipTrigger>
                     <TooltipContent>
                        Stop; keep what it found so far
                     </TooltipContent>
                  </Tooltip>
               ) : (
                  <Tooltip>
                     <TooltipTrigger asChild>
                        <span tabIndex={canSend ? -1 : 0}>
                           <Button
                              type="button"
                              size="icon"
                              className="size-8 rounded-full"
                              disabled={!canSend}
                              onClick={submit}
                              aria-label="Send"
                           >
                              {pending ? (
                                 <Loader2 className="animate-spin" />
                              ) : (
                                 <ArrowUp />
                              )}
                           </Button>
                        </span>
                     </TooltipTrigger>
                     <TooltipContent>
                        {tooBig
                           ? `Too much context for ${resolved.label}`
                           : pending
                             ? "Waiting for the answer…"
                             : "Send ↵"}
                     </TooltipContent>
                  </Tooltip>
               )}
            </div>
         </div>

         {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
               Drop files to attach
            </div>
         )}
      </div>
   );
}

/** Five bars that move with the microphone's level. */
function LevelBars({ level }: { level: number }) {
   return (
      <span className="flex h-3.5 items-center gap-[2px]" aria-hidden>
         {[0.55, 0.85, 1, 0.75, 0.5].map((w, i) => (
            <span
               key={i}
               className="w-[2px] rounded-full bg-current transition-[height] duration-75"
               style={{
                  height: `${Math.max(3, Math.min(14, 3 + level * 11 * w))}px`,
               }}
            />
         ))}
      </span>
   );
}
