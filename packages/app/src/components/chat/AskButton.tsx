// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { SparklesIcon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../ui/button";
import {
   type AskContext,
   openAskWindow,
   updateAskContext,
} from "./askWindowStore";

/** Opens the floating Ask window on a page, and keeps it reading the page while open. */
export function AskButton({ context }: { context: AskContext }) {
   useEffect(() => updateAskContext(context), [context]);
   return (
      <Button
         variant="outline"
         size="sm"
         onClick={() => openAskWindow(context)}
      >
         <SparklesIcon />
         Ask about this
      </Button>
   );
}
