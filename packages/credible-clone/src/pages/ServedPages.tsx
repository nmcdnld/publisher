// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { encodeResourceUri, Package } from "@malloy-publisher/sdk";
import clsx from "clsx";
import type { ReactNode } from "react";
import {
   useLocation,
   useNavigate,
   useParams,
   useSearchParams,
} from "react-router-dom";
import { useChats } from "../chats";
import { ChatPanel, OriginChats } from "../components/ChatPanel";
import { Composer } from "../components/Composer";
import { ContentActions } from "../components/ContentActions";
import { PageHeader } from "../components/PageHeader";
import { packages, type Scope, type Served } from "../fixtures";
import { REPORTS_ENVIRONMENT, useReports } from "../publisher/reports";
import {
   ServedDashboard,
   ServedNotebook,
   ServedPackageFile,
   Unavailable,
} from "../publisher/views";

const CONSOLE_URL = "http://localhost:4000";

export function ReportPage() {
   const { package: pkg, kind, "*": name } = useParams();
   const { data: reports } = useReports();
   if (!pkg || !name || (kind !== "dashboard" && kind !== "notebook")) {
      return <NotFound />;
   }
   const served = { environment: REPORTS_ENVIRONMENT, package: pkg, name };
   const title =
      reports?.find(
         (r) =>
            r.kind === kind &&
            r.served.package === pkg &&
            r.served.name === name,
      )?.title ?? name;
   const scope: Scope = {
      environment: served.environment,
      package: served.package,
      report: { kind, title },
   };
   return (
      <ServedLayout title={title} served={served} scope={scope}>
         {kind === "dashboard" ? (
            <ServedDashboard served={served} slug={name} />
         ) : (
            <ServedNotebook served={served} path={name} />
         )}
      </ServedLayout>
   );
}

export function PackagePage() {
   const { id, "*": path } = useParams();
   const navigate = useNavigate();
   const pkg = packages.find((p) => p.id === id);
   if (!pkg) return <NotFound />;
   const { served } = pkg;
   const reportKind = path?.startsWith("dashboards/")
      ? "dashboard"
      : path?.startsWith("notebooks/")
        ? "notebook"
        : undefined;
   const scope: Scope = {
      environment: pkg.environment,
      package: pkg.name,
      report:
         reportKind && path ? { kind: reportKind, title: path } : undefined,
   };

   // `Package` links its files Console-style, `/<env>/<package>/<path>`; those
   // open here, and anything outside the package opens in the Console.
   const openPackageFile = (to: string) => {
      if (!served) return;
      const prefix = `/${served.environment}/${served.package}`;
      if (to === prefix || to.startsWith(`${prefix}/`)) {
         navigate(`/packages/${pkg.id}${to.slice(prefix.length)}`);
      } else {
         window.open(`${CONSOLE_URL}${to}`, "_blank", "noopener");
      }
   };

   return (
      <ServedLayout
         title={path ? `${pkg.name} / ${path}` : pkg.name}
         served={served}
         scope={scope}
      >
         {!served ? (
            <Unavailable>
               This package is fixture data only; nothing on the local Publisher
               server backs it yet.
            </Unavailable>
         ) : path ? (
            <ServedPackageFile served={served} path={path} />
         ) : (
            <Package
               resourceUri={encodeResourceUri({
                  environmentName: served.environment,
                  packageName: served.package,
               })}
               onClickPackageFile={openPackageFile}
            />
         )}
      </ServedLayout>
   );
}

/**
 * A served page with a composer floating over its content. Asking a question
 * docks the chat in a column on the right, tracked in `?chat=` so the full chat
 * view can link back to it. `?chats` docks the list of chats started from this
 * page in the same column instead.
 */
function ServedLayout({
   title,
   served,
   scope,
   children,
}: {
   title: string;
   served?: Served;
   scope: Scope;
   children: ReactNode;
}) {
   const { chats, send } = useChats();
   const { pathname } = useLocation();
   const [params, setParams] = useSearchParams();
   const chatId = params.get("chat");
   const showList = !chatId && params.has("chats");
   const panelOpen = !!chatId || showList;
   const originChats = chats.filter((c) => c.origin?.path === pathname);

   const setPanel = (panel: { chat: string } | "list" | null) =>
      setParams((prev) => {
         const next = new URLSearchParams(prev);
         next.delete("chat");
         next.delete("chats");
         if (panel === "list") next.set("chats", "");
         else if (panel) next.set("chat", panel.chat);
         return next;
      });
   const setChat = (id: string | null) => setPanel(id ? { chat: id } : null);
   const startChat = (q: string) =>
      setChat(send(null, q, scope, { title, path: pathname }));

   return (
      <div className="flex h-full flex-col">
         <div className="ui-zoom">
            <PageHeader
               title={title}
               actions={
                  scope.report && (
                     <ContentActions
                        shortcut={{
                           path: pathname,
                           title: scope.report.title,
                           kind: scope.report.kind,
                        }}
                        chatCount={originChats.length}
                        onViewChats={() => setPanel("list")}
                     />
                  )
               }
            />
         </div>
         <div className="relative min-h-0 flex-1">
            {/* A size container, so the chat column can be exactly as tall as the
                visible area (100cqh) while it sticks beside the scrolling content. */}
            <div className="h-full overflow-y-auto [container-type:size]">
               <div
                  className={clsx(
                     "mx-auto flex w-full gap-8 px-8",
                     panelOpen ? "max-w-[1816px]" : "max-w-[1400px]",
                  )}
               >
                  <div
                     className={clsx(
                        "min-w-0 flex-1 pt-6",
                        panelOpen ? "pb-6" : "pb-48",
                     )}
                  >
                     {children}
                  </div>
                  {chatId && (
                     <ChatPanel
                        chatId={chatId}
                        onClose={() => setChat(null)}
                        onShowList={
                           originChats.length > 0
                              ? () => setPanel("list")
                              : undefined
                        }
                     />
                  )}
                  {showList && (
                     <OriginChats
                        chats={originChats}
                        scope={scope}
                        onSelect={setChat}
                        onSubmit={startChat}
                        onClose={() => setPanel(null)}
                     />
                  )}
               </div>
            </div>
            {!panelOpen && (
               // Above anything the page positions (MUI's app bar and drawers top out
               // at 1200), below the menus and popovers MUI portals to <body> (1300+),
               // so a dropdown opened near the bottom isn't hidden behind it.
               <div className="ui-zoom pointer-events-none absolute inset-x-0 bottom-0 z-[1250] flex justify-center px-4 pb-0.5">
                  <Composer
                     floating
                     modelPicker
                     className="pointer-events-auto max-w-[400px]"
                     scope={scope}
                     onSubmit={startChat}
                  />
               </div>
            )}
         </div>
      </div>
   );
}

function NotFound() {
   return (
      <>
         <div className="ui-zoom">
            <PageHeader title="Not found" />
         </div>
         <Unavailable>Nothing in this workspace has that address.</Unavailable>
      </>
   );
}
