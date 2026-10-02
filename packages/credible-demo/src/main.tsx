// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createFixtureClient } from "@/data/fixture-client";
import { ClientContext } from "@/data/hooks";
import { initAppearance } from "@/lib/theme";
import { router } from "./router";
import "./index.css";

initAppearance();

const queryClient = new QueryClient({
   defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
   },
});

const client = createFixtureClient();

createRoot(document.getElementById("root")!).render(
   <StrictMode>
      <ClientContext.Provider value={client}>
         <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={300}>
               <RouterProvider router={router} />
               <Toaster position="bottom-left" />
            </TooltipProvider>
         </QueryClientProvider>
      </ClientContext.Provider>
   </StrictMode>,
);
