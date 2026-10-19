// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { useRef, useState } from "react";
import { cn } from "../../../lib/utils";
import type { Ontology } from "../../../ontology/types";
import { DraftsPanel, PromotePanel } from "./DraftsPanel";
import { useDictionaryPanel } from "./panel";

const MIN_WIDTH = 360;
/** Room the page beside the panel keeps, at the least. */
const MIN_PAGE = 320;

const DEFAULT_WIDTH = { drafts: "clamp(26rem, 40%, 44rem)" };

/**
 * The dictionary's side panel: part of the page, beside it rather than over it, so
 * the page stays readable and usable while the panel is open. Drag its edge to
 * resize; double-click the edge to go back to the default width.
 */
export function DictionaryPanel({ ontology }: { ontology: Ontology }) {
   const { panel, close } = useDictionaryPanel();
   const kind = "drafts";
   const [widths, setWidths] =
      useState<Record<string, number | undefined>>(readWidths);
   const ref = useRef<HTMLElement>(null);
   if (!panel) return null;

   let body;
   if (panel.type === "drafts") {
      body = (
         <DraftsPanel ontology={ontology} focus={panel.focus} onClose={close} />
      );
   } else {
      body = <PromotePanel ontology={ontology} onClose={close} />;
   }

   const setWidth = (width: number | undefined, persist: boolean) => {
      const next = { ...widths, [kind]: width };
      setWidths(next);
      if (persist) {
         try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
         } catch {
            // The width just won't be remembered.
         }
      }
   };

   return (
      <aside
         ref={ref}
         aria-label="Side panel"
         style={{ width: widths[kind] ?? DEFAULT_WIDTH[kind] }}
         className="sticky top-0 flex h-[calc(100dvh-56px)] shrink-0 flex-col self-start border-l bg-background"
      >
         <ResizeHandle
            onResize={(w, done) => {
               const container = ref.current?.parentElement?.clientWidth ?? w;
               setWidth(
                  Math.round(
                     Math.max(MIN_WIDTH, Math.min(w, container - MIN_PAGE)),
                  ),
                  done,
               );
            }}
            onReset={() => setWidth(undefined, true)}
            startWidth={() => ref.current?.getBoundingClientRect().width ?? 0}
         />
         {body}
      </aside>
   );
}

const STORAGE_KEY = "dictionary-panel-widths";

function readWidths(): Record<string, number | undefined> {
   try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
   } catch {
      return {};
   }
}

function ResizeHandle({
   onResize,
   onReset,
   startWidth,
}: {
   onResize: (width: number, done: boolean) => void;
   onReset: () => void;
   startWidth: () => number;
}) {
   const [dragging, setDragging] = useState(false);
   const start = useRef({ x: 0, width: 0 });
   return (
      <div
         role="separator"
         aria-orientation="vertical"
         aria-label="Resize panel"
         title="Drag to resize · double-click to reset"
         onDoubleClick={onReset}
         onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { x: e.clientX, width: startWidth() };
            setDragging(true);
         }}
         onPointerMove={(e) => {
            if (!dragging) return;
            onResize(
               start.current.width + (start.current.x - e.clientX),
               false,
            );
         }}
         onPointerUp={(e) => {
            if (!dragging) return;
            setDragging(false);
            onResize(start.current.width + (start.current.x - e.clientX), true);
         }}
         className={cn(
            "absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize transition-colors hover:bg-primary/20",
            dragging && "bg-primary/30",
         )}
      />
   );
}
