// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { Navigate, Route, Routes } from "react-router-dom";
import { AgentProvider } from "./agent";
import { ChatsProvider } from "./chats";
import { Rail } from "./components/Rail";
import { workspace } from "./fixtures";
import { ChatsLayout } from "./pages/chats/ChatsLayout";
import { ChatThread } from "./pages/chats/ChatThread";
import { NewChat } from "./pages/chats/NewChat";
import { DetailPage } from "./pages/DetailPage";
import { PackagesPage } from "./pages/PackagesPage";
import { PackagePage, ReportPage } from "./pages/ServedPages";
import { WorkspacePage } from "./pages/WorkspacePage";
import { PublisherHost } from "./publisher/PublisherHost";

export default function App() {
   return (
      <PublisherHost>
         <AgentProvider>
            <ChatsProvider>
               <div className="flex h-full">
                  <Rail />
                  <main className="flex min-w-0 flex-1 flex-col">
                     <Routes>
                        <Route
                           path="/"
                           element={
                              <Navigate
                                 to={`/workspaces/${workspace.id}`}
                                 replace
                              />
                           }
                        />
                        <Route
                           path="/workspaces/:workspaceId"
                           element={<WorkspacePage />}
                        />
                        <Route path="/chats" element={<ChatsLayout />}>
                           <Route
                              index
                              element={<Navigate to="new" replace />}
                           />
                           <Route path="new" element={<NewChat />} />
                           <Route path=":chatId" element={<ChatThread />} />
                        </Route>
                        <Route
                           path="/reports/:package/:kind/*"
                           element={<ReportPage />}
                        />
                        <Route path="/packages" element={<PackagesPage />} />
                        <Route
                           path="/packages/:id/*"
                           element={<PackagePage />}
                        />
                        <Route path="/:section/:id?" element={<DetailPage />} />
                     </Routes>
                  </main>
               </div>
            </ChatsProvider>
         </AgentProvider>
      </PublisherHost>
   );
}
