// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Audience } from "@/analyst/events";
import { PersonAvatar } from "@/components/people";
import { SurfaceSwatch, ThemePickerPanel } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
   Popover,
   PopoverContent,
   PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
   Tooltip,
   TooltipContent,
   TooltipTrigger,
} from "@/components/ui/tooltip";
import {
   DemoContentPanel,
   WorkspaceListPanel,
   WorkspaceMark,
   WorkspaceSettingsPanel,
} from "@/components/workspace-panels";
import { useDemoRefresh } from "@/lib/demo-refresh";
import { resetFixtures } from "@/data/fixture-client";
import { useThreads, useViewer } from "@/data/hooks";
import type { Viewer } from "@/data/types";
import { useThreadUi } from "@/features/threads/thread-context";
import { ThreadRail } from "@/features/threads/thread-rail";
import { setModePref, useAppearance, type ModePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useWorkspaces, workspaceLabel } from "@/lib/workspaces";
import {
   ArrowLeft,
   ArrowLeftRight,
   ChevronRight,
   Compass,
   Library,
   LoaderCircle,
   Monitor,
   Moon,
   RotateCcw,
   Settings,
   ShieldCheck,
   SquarePen,
   Sun,
   UserRound,
   WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";

const nav = [
   { to: "/", label: "For You", icon: Compass, end: true },
   { to: "/library", label: "Library", icon: Library },
];

const modes: { pref: ModePref; label: string; icon: typeof Sun }[] = [
   { pref: "system", label: "System", icon: Monitor },
   { pref: "light", label: "Light", icon: Sun },
   { pref: "dark", label: "Dark", icon: Moon },
];

const menuRow =
   "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

const subviews = {
   theme: { title: "Workspace theme", Panel: ThemePickerPanel },
   workspaces: { title: "Switch workspace", Panel: WorkspaceListPanel },
   settings: { title: "Workspace settings", Panel: WorkspaceSettingsPanel },
   demo: { title: "Demo content", Panel: DemoContentPanel },
};

/** Who the analyst treats you as. Admins get "Show work". */
function AnalystAudience() {
   const { audience, setAudience, adminToken, setAdminToken } = useThreadUi();
   const [needsToken, setNeedsToken] = useState(false);
   useEffect(() => {
      fetch("/api/analyst/config")
         .then((r) => (r.ok ? r.json() : null))
         .then((c: { adminToken?: boolean } | null) =>
            setNeedsToken(!!c?.adminToken),
         )
         .catch(() => {});
   }, []);
   return (
      <>
         <div className="px-2 pt-1.5 pb-1 text-xs tracking-wider text-muted-foreground uppercase">
            Analyst view
         </div>
         <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={audience}
            onValueChange={(v) => v && setAudience(v as Audience)}
            className="mx-1 mb-1 grid w-auto grid-cols-2"
         >
            <ToggleGroupItem value="admin" className="gap-1.5 text-xs">
               <ShieldCheck className="size-3.5" />
               Admin
            </ToggleGroupItem>
            <ToggleGroupItem value="member" className="gap-1.5 text-xs">
               <UserRound className="size-3.5" />
               End user
            </ToggleGroupItem>
         </ToggleGroup>
         {audience === "admin" && needsToken && (
            <Input
               type="password"
               value={adminToken}
               onChange={(e) => setAdminToken(e.target.value)}
               placeholder="Admin token"
               aria-label="Analyst admin token"
               className="mx-1 mb-1 h-7 w-[calc(100%-0.5rem)] text-xs"
            />
         )}
      </>
   );
}

function UserMenu({ viewer }: { viewer: Viewer }) {
   const [open, setOpen] = useState(false);
   const [view, setView] = useState<"main" | keyof typeof subviews>("main");
   const { modePref, theme } = useAppearance();
   const { active, workspaces } = useWorkspaces();
   const refreshing = useDemoRefresh().status === "running";
   const sub = view === "main" ? undefined : subviews[view];

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (!next) setView("main");
         }}
      >
         <PopoverTrigger asChild>
            <button className="m-2 flex items-center gap-2 rounded-md p-2 text-left hover:bg-sidebar-accent">
               <PersonAvatar person={viewer.person} />
               <span className="hidden min-w-0 md:block">
                  <span className="block truncate text-sm font-medium">
                     {viewer.person.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                     {viewer.person.title}
                  </span>
               </span>
            </button>
         </PopoverTrigger>
         <PopoverContent side="top" align="start" className="w-72 p-0">
            {sub ? (
               <>
                  <div className="flex items-center gap-2 border-b px-2 py-1.5">
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => setView("main")}
                        aria-label="Back"
                     >
                        <ArrowLeft className="size-3.5" />
                     </Button>
                     <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                        {sub.title}
                     </span>
                  </div>
                  <sub.Panel />
               </>
            ) : (
               <div className="p-1">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                     <WorkspaceMark workspace={active} />
                     <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                           {workspaceLabel(active)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                           Signed in as {viewer.person.name}
                        </span>
                     </span>
                  </div>
                  <Separator className="my-1" />
                  <button
                     className={menuRow}
                     onClick={() => setView("workspaces")}
                  >
                     <ArrowLeftRight />
                     <span className="flex-1 truncate">
                        Switch workspace
                        <span className="text-muted-foreground">
                           {" "}
                           · {workspaces.length}
                        </span>
                     </span>
                     <ChevronRight />
                  </button>
                  <button
                     className={menuRow}
                     onClick={() => setView("settings")}
                  >
                     <Settings />
                     <span className="flex-1 truncate">
                        Name, logo, and packages
                     </span>
                     <ChevronRight />
                  </button>
                  <Separator className="my-1" />
                  <div className="px-2 pt-1.5 pb-1 text-xs tracking-wider text-muted-foreground uppercase">
                     Appearance
                  </div>
                  <ToggleGroup
                     type="single"
                     variant="outline"
                     size="sm"
                     value={modePref}
                     onValueChange={(v) => v && setModePref(v as ModePref)}
                     className="mx-1 mb-1 grid w-auto grid-cols-3"
                  >
                     {modes.map(({ pref, label, icon: Icon }) => (
                        <ToggleGroupItem
                           key={pref}
                           value={pref}
                           aria-label={label}
                           className="gap-1.5 text-xs"
                        >
                           <Icon className="size-3.5" />
                           {label}
                        </ToggleGroupItem>
                     ))}
                  </ToggleGroup>
                  <button className={menuRow} onClick={() => setView("theme")}>
                     <SurfaceSwatch
                        grayScale={theme.grayScale}
                        accent={theme.accent}
                     />
                     <span className="flex-1 truncate">
                        Workspace theme
                        <span className="text-muted-foreground">
                           {" "}
                           · {theme.name}
                        </span>
                     </span>
                     <ChevronRight />
                  </button>
                  <Separator className="my-1" />
                  <AnalystAudience />
                  <Separator className="my-1" />
                  <button className={menuRow} onClick={() => setView("demo")}>
                     {refreshing ? (
                        <LoaderCircle className="animate-spin" />
                     ) : (
                        <WandSparkles />
                     )}
                     <span className="flex-1 truncate">
                        {refreshing
                           ? "Refreshing demo content…"
                           : "Refresh demo content"}
                     </span>
                     <ChevronRight />
                  </button>
                  <button
                     className={menuRow}
                     onClick={() => {
                        setOpen(false);
                        resetFixtures();
                     }}
                  >
                     <RotateCcw />
                     Reset demo data
                  </button>
               </div>
            )}
         </PopoverContent>
      </Popover>
   );
}

/** Chat history, most recent first, with a quiet way to start another. */
function SidebarThreads() {
   const threads = useThreads().data ?? [];
   const { startNew } = useThreadUi();
   return (
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
         <div className="flex items-center justify-center pb-1 md:justify-between md:pr-1 md:pl-3">
            <span className="hidden text-xs font-medium text-sidebar-foreground/50 md:inline">
               Chats
            </span>
            <Tooltip>
               <TooltipTrigger asChild>
                  <Button
                     variant="ghost"
                     size="icon-xs"
                     className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                     onClick={() => startNew()}
                     aria-label="New chat"
                  >
                     <SquarePen className="size-3.5" />
                  </Button>
               </TooltipTrigger>
               <TooltipContent side="right">New chat</TooltipContent>
            </Tooltip>
         </div>
         <div className="hidden min-h-0 flex-1 flex-col gap-px overflow-y-auto md:flex">
            {threads.map((t) => (
               <NavLink
                  key={t.id}
                  to={`/chat/${t.id}`}
                  title={t.title}
                  className={({ isActive }) =>
                     cn(
                        "block shrink-0 truncate rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        isActive &&
                           "bg-sidebar-accent text-sidebar-accent-foreground",
                     )
                  }
               >
                  {t.title}
               </NavLink>
            ))}
         </div>
      </div>
   );
}

export function AppShell() {
   const { docked } = useThreadUi();
   const viewer = useViewer().data;
   const { active } = useWorkspaces();
   const onChatPage = !!useMatch("/chat/*");
   const onStudioPage = !!useMatch("/studio/*");

   return (
      <div className="flex h-dvh overflow-hidden">
         <nav className="flex w-16 shrink-0 flex-col border-r bg-sidebar md:w-56">
            <div className="flex h-14 items-center gap-2 px-4">
               <WorkspaceMark workspace={active} />
               <span className="hidden min-w-0 truncate text-[15px] font-semibold tracking-tight md:inline">
                  {workspaceLabel(active)}
               </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 p-2">
               {nav.map((item) => (
                  <NavLink
                     key={item.to}
                     to={item.to}
                     end={item.end}
                     className={({ isActive }) =>
                        cn(
                           "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                           (isActive || (item.to === "/" && onStudioPage)) &&
                              "bg-sidebar-accent text-sidebar-accent-foreground",
                        )
                     }
                  >
                     <item.icon className="size-4 shrink-0" />
                     <span className="hidden md:inline">{item.label}</span>
                  </NavLink>
               ))}
               <SidebarThreads />
            </div>
            {viewer && <UserMenu viewer={viewer} />}
         </nav>

         <main className="@container min-w-0 flex-1 overflow-y-auto">
            <Outlet />
         </main>

         {docked && !onChatPage && (
            <div className="fixed inset-0 z-40 lg:static lg:z-auto">
               <ThreadRail />
            </div>
         )}
      </div>
   );
}

export function PageContainer({
   children,
   className,
}: {
   children: React.ReactNode;
   className?: string;
}) {
   return (
      <div
         className={cn(
            "mx-auto w-full max-w-6xl px-6 py-8 lg:px-10",
            className,
         )}
      >
         {children}
      </div>
   );
}

export function PageHeader({
   title,
   description,
   actions,
}: {
   title: string;
   description?: string;
   actions?: React.ReactNode;
}) {
   return (
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
         <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
               <p className="mt-1 text-sm text-muted-foreground">
                  {description}
               </p>
            )}
         </div>
         {actions}
      </div>
   );
}
