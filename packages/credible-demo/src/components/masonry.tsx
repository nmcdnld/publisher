// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   Children,
   useLayoutEffect,
   useRef,
   useState,
   type ReactElement,
   type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** The grid's row unit and the gap under each tile, in px. */
const ROW = 4;
const GAP = 16;

/**
 * Tiles of uneven height packed into columns, in order: each tile spans as
 * many thin rows as it is tall, so grid auto-placement drops the next tile
 * into whichever column frees up first. Columns come from `className`
 * (`grid-cols-*`), and every tile keeps one parent, so none remount.
 */
export function Masonry({
   className,
   children,
}: {
   className?: string;
   children: ReactNode;
}) {
   return (
      <div
         className={cn("grid items-start gap-x-4", className)}
         style={{ gridAutoRows: ROW }}
      >
         {Children.toArray(children).map((child) => (
            <Tile key={(child as ReactElement).key}>{child}</Tile>
         ))}
      </div>
   );
}

function Tile({ children }: { children: ReactNode }) {
   const ref = useRef<HTMLDivElement>(null);
   const [span, setSpan] = useState<number>();
   useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const measure = () =>
         setSpan(Math.ceil((el.getBoundingClientRect().height + GAP) / ROW));
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
   }, []);
   return (
      <div
         ref={ref}
         className="min-w-0"
         style={span ? { gridRowEnd: `span ${span}` } : undefined}
      >
         {children}
      </div>
   );
}
