// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { usePublisherTheme } from "@malloy-publisher/sdk";
import { Settings } from "lucide-react";

/** The rail's settings button: toggles between light and dark mode. */
export function ThemeToggle() {
   const { mode, setMode } = usePublisherTheme();
   const next = mode === "dark" ? "light" : "dark";

   return (
      <button
         type="button"
         aria-label={`Switch to ${next} mode`}
         title={`Switch to ${next} mode`}
         onClick={() => setMode(next)}
         className="ml-auto rounded p-1 text-muted hover:bg-hover hover:text-ink"
      >
         <Settings className="size-3.5" />
      </button>
   );
}
