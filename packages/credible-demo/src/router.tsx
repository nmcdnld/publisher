// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/app-shell";
import { ThreadUiProvider } from "@/features/threads/thread-context";
import { AnalysisPage } from "@/pages/analysis";
import { ChatPage, ThreadsRedirect } from "@/pages/chat";
import { DiscoverPage } from "@/pages/discover";
import { FeedRedirect, LibraryPage, PackageRedirect } from "@/pages/library";
import { NotFoundPage } from "@/pages/not-found";
import { PublishPage } from "@/pages/publish";
import { StudioPage } from "@/pages/studio";

const embedded = (
   name:
      | "WorkspaceDashboardPage"
      | "WorkspaceDashboardEmbed"
      | "WorkspaceModelEmbed"
      | "WorkspaceModelPage"
      | "WorkspaceNotebookPage"
      | "WorkspaceDataAppPage",
) => {
   const Page = lazy(() =>
      import("@/pages/workspace-content").then((m) => ({ default: m[name] })),
   );
   return (
      <Suspense
         fallback={
            <PageContainer className="max-w-[1600px] space-y-4">
               <Skeleton className="h-8 w-72" />
               <Skeleton className="h-[480px] rounded-xl" />
            </PageContainer>
         }
      >
         <Page />
      </Suspense>
   );
};

export const router = createBrowserRouter([
   {
      path: "/embed/packages/:packageName/dashboards/:slug",
      element: embedded("WorkspaceDashboardEmbed"),
   },
   {
      path: "/embed/packages/:packageName/models/*",
      element: embedded("WorkspaceModelEmbed"),
   },
   {
      element: (
         <ThreadUiProvider>
            <AppShell />
         </ThreadUiProvider>
      ),
      children: [
         { path: "/", element: <DiscoverPage /> },
         { path: "/feed", element: <FeedRedirect /> },
         { path: "/library", element: <LibraryPage /> },
         {
            path: "/packages",
            element: <Navigate to="/library?scope=workspace" replace />,
         },
         { path: "/packages/:packageName", element: <PackageRedirect /> },
         {
            path: "/packages/:packageName/dashboards/:slug",
            element: embedded("WorkspaceDashboardPage"),
         },
         {
            path: "/packages/:packageName/models/*",
            element: embedded("WorkspaceModelPage"),
         },
         {
            path: "/packages/:packageName/notebooks/*",
            element: embedded("WorkspaceNotebookPage"),
         },
         {
            path: "/packages/:packageName/apps/*",
            element: embedded("WorkspaceDataAppPage"),
         },
         { path: "/publish", element: <PublishPage /> },
         { path: "/studio", element: <StudioPage /> },
         { path: "/chat", element: <ChatPage /> },
         { path: "/chat/:threadId", element: <ChatPage /> },
         { path: "/threads", element: <ThreadsRedirect /> },
         { path: "/threads/:threadId", element: <ThreadsRedirect /> },
         { path: "/analysis/:analysisId", element: <AnalysisPage /> },
         { path: "*", element: <NotFoundPage /> },
      ],
   },
]);
