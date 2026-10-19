// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";

export function PageHeader({
   title,
   muted,
   actions,
}: {
   title: string;
   muted?: boolean;
   actions?: ReactNode;
}) {
   useEffect(() => {
      document.title = `${title} · Credible`;
   }, [title]);

   return (
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-5">
         <h1
            className={clsx(
               "flex-1 truncate text-[12px]",
               muted ? "text-muted" : "text-ink",
            )}
         >
            {title}
         </h1>
         {actions}
      </header>
   );
}
