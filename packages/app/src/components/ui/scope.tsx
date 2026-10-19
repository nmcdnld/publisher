// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { usePublisherTheme } from "@malloy-publisher/sdk";
import * as React from "react";
import { cn } from "../../lib/utils";
import "../../styles/tailwind.css";
import { TooltipProvider } from "./tooltip";

/**
 * The root of a page built with Tailwind and shadcn/ui inside the MUI
 * Console. Mirrors the Console's light/dark mode onto <html> so portalled
 * content (sheets, tooltips) follows it too.
 */
export function TailwindScope({
   className,
   children,
}: {
   className?: string;
   children: React.ReactNode;
}) {
   const { mode } = usePublisherTheme();
   React.useEffect(() => {
      document.documentElement.classList.toggle("dark", mode === "dark");
   }, [mode]);
   return (
      <TooltipProvider>
         <div className={cn("tw-scope", className)}>{children}</div>
      </TooltipProvider>
   );
}
