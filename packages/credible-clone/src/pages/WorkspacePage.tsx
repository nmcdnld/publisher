// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   BookOpen,
   LayoutDashboard,
   MessagesSquare,
   User,
   type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useChats } from "../chats";
import { Composer } from "../components/Composer";
import { PackageRow } from "../components/PackageRow";
import { PageHeader } from "../components/PageHeader";
import { packages, timeAgo, workspace, type Scope } from "../fixtures";
import { reportRoute, useReports, type Report } from "../publisher/reports";

const PREVIEW_COUNT = 3;

export function WorkspacePage() {
   const navigate = useNavigate();
   const { chats, send } = useChats();
   const [scope, setScope] = useState<Scope>({});
   const reports = useReports();
   const recentChats = [...chats].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
   );

   return (
      <div className="ui-zoom flex h-full flex-col">
         <PageHeader title={workspace.name} />
         <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[540px] px-4 pt-14 pb-10">
               <h1 className="text-[22px] font-medium tracking-tight">
                  {workspace.name}
               </h1>
               <p className="mt-2 text-[11px] text-muted">
                  {workspace.description}
               </p>
               <div className="mt-3 flex items-center gap-2 text-[12px]">
                  <span className="flex size-5 items-center justify-center rounded border border-line">
                     <User className="size-3 text-muted" />
                  </span>
                  {workspace.visibility}
               </div>

               <Section
                  title="Conversations"
                  subtitle="Chats in your personal workspace."
               >
                  <ExpandableList
                     items={recentChats}
                     render={(c) => (
                        <Row
                           key={c.id}
                           to={`/chats/${c.id}`}
                           icon={MessagesSquare}
                           color="bg-convo"
                           title={c.title}
                           meta={timeAgo(c.updatedAt)}
                        />
                     )}
                  />
               </Section>

               <Section
                  title="Reports"
                  subtitle="Dashboards and notebooks in this workspace."
               >
                  {reports.isPending ? (
                     <p className="text-[10px] text-muted">Loading…</p>
                  ) : reports.isError ? (
                     <p className="text-[10px] text-muted">
                        Couldn't reach Publisher: {reports.error.message}
                     </p>
                  ) : (
                     <ExpandableList
                        items={reports.data}
                        render={(r) => (
                           <Row
                              key={reportRoute(r)}
                              to={reportRoute(r)}
                              {...reportStyle(r)}
                              title={r.title}
                              meta={r.served.package}
                           />
                        )}
                     />
                  )}
               </Section>

               <Section
                  title="Packages"
                  subtitle="Every package you have access to."
               >
                  {packages.map((p) => (
                     <PackageRow key={p.id} pkg={p} />
                  ))}
               </Section>
            </div>
         </div>

         <div className="flex justify-center px-4 pb-1">
            <Composer
               modelPicker
               className="max-w-[400px]"
               scope={scope}
               onScopeChange={setScope}
               onSubmit={(q) => navigate(`/chats/${send(null, q, scope)}`)}
            />
         </div>
      </div>
   );
}

function reportStyle(r: Report): { icon: LucideIcon; color: string } {
   return r.kind === "dashboard"
      ? { icon: LayoutDashboard, color: "bg-dashboard" }
      : { icon: BookOpen, color: "bg-notebook" };
}

function Section({
   title,
   subtitle,
   children,
}: {
   title: string;
   subtitle: string;
   children: ReactNode;
}) {
   return (
      <section className="mt-8">
         <h2 className="text-[13px] font-medium">{title}</h2>
         <p className="mt-0.5 mb-3 text-[10px] text-muted">{subtitle}</p>
         <div className="space-y-1">{children}</div>
      </section>
   );
}

function ExpandableList<T>({
   items,
   render,
}: {
   items: T[];
   render: (item: T) => ReactNode;
}) {
   const [expanded, setExpanded] = useState(false);
   const hidden = items.length - PREVIEW_COUNT;
   const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);

   return (
      <>
         {visible.map(render)}
         {hidden > 0 && (
            <div className="flex justify-center pt-2">
               <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="rounded-md bg-hover px-2.5 py-1 text-[10px] text-muted hover:text-ink"
               >
                  {expanded ? "Show less" : `Show ${hidden} more`}
               </button>
            </div>
         )}
      </>
   );
}

function Row({
   to,
   icon,
   color,
   title,
   meta,
}: {
   to: string;
   icon: LucideIcon;
   color: string;
   title: string;
   meta: string;
}) {
   return (
      <Link
         to={to}
         className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-hover"
      >
         <IconTile icon={icon} color={color} />
         <span className="flex-1 truncate text-[12px]">{title}</span>
         <span className="text-[9px] text-muted">{meta}</span>
      </Link>
   );
}

function IconTile({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
   return (
      <span
         className={`flex size-[22px] shrink-0 items-center justify-center rounded ${color}`}
      >
         <Icon className="size-3 text-white" strokeWidth={1.75} />
      </span>
   );
}
