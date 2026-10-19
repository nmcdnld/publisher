// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Markdown as TanstackMarkdown } from "@tanstack/markdown/react";
import { memo, type ComponentProps } from "react";
import { cn } from "../../lib/utils";

function Link(props: ComponentProps<"a">) {
   return <a {...props} target="_blank" rel="noreferrer" />;
}

const COMPONENTS = { a: Link };

/** GitHub-flavored Markdown as a model writes it; raw HTML stays escaped. */
export const Markdown = memo(function Markdown({
   text,
   className,
}: {
   text: string;
   className?: string;
}) {
   return (
      <div className={cn("chat-md", className)}>
         <TanstackMarkdown components={COMPONENTS}>{text}</TanstackMarkdown>
      </div>
   );
});
