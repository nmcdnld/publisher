// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import clsx from "clsx";
import {
   Check,
   ChevronDown,
   ChevronRight,
   Plug,
   Plus,
   RotateCw,
   Server,
} from "lucide-react";
import {
   useEffect,
   useLayoutEffect,
   useRef,
   useState,
   type ReactNode,
} from "react";
import { useAgent, type McpServerStatus, type Readiness } from "../agent";
import { modelInfo } from "../models";

/** Taller than the menu ever is, so it only opens down when that fits. */
const MENU_HEIGHT = 380;

const INTEGRATIONS = ["Slack", "Linear", "GitHub", "Google Drive"];

const bead: Record<Readiness, string> = {
   checking: "bg-faint animate-pulse",
   ready: "bg-emerald-500",
   degraded: "bg-amber-500",
   down: "bg-red-500",
};

const readinessText: Record<Readiness, string> = {
   checking: "Checking connections…",
   ready: "All systems connected",
   degraded: "Some tools are unreachable",
   down: "Chat is unavailable",
};

/** The chat model, with a bead for whether the agent and its tools are reachable. */
export function ModelPicker({ className }: { className?: string }) {
   const { status, error, readiness, checking, model, setModel, refresh } =
      useAgent();
   const [open, setOpen] = useState(false);
   const [up, setUp] = useState(true);
   const root = useRef<HTMLDivElement>(null);

   useLayoutEffect(() => {
      if (!open || !root.current) return;
      const rect = root.current.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      setUp(below < MENU_HEIGHT && rect.top > below);
   }, [open]);

   useEffect(() => {
      if (!open) return;
      const onPointer = (e: PointerEvent) => {
         if (!root.current?.contains(e.target as Node)) setOpen(false);
      };
      const onKey = (e: KeyboardEvent) => {
         if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointer);
      document.addEventListener("keydown", onKey);
      return () => {
         document.removeEventListener("pointerdown", onPointer);
         document.removeEventListener("keydown", onKey);
      };
   }, [open]);

   const current = modelInfo(model);

   return (
      <div ref={root} className={clsx("relative", className)}>
         <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            title={error ?? readinessText[readiness]}
            onClick={() => {
               if (!open) refresh();
               setOpen((o) => !o);
            }}
            className={clsx(
               "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] hover:bg-hover hover:text-ink",
               open ? "bg-hover text-ink" : "text-muted",
            )}
         >
            {/* <span
               className={clsx("size-1.5 rounded-full", bead[readiness])}
               aria-label={readinessText[readiness]}
            /> */}
            <span className={clsx(readiness === "checking" && "text-faint")}>
               {current.label}
            </span>
            <ChevronDown
               className={clsx(
                  "size-2.5 transition-transform",
                  open && up && "rotate-180",
               )}
            />
         </button>

         {open && (
            <div
               role="menu"
               className={clsx(
                  "absolute right-0 z-20 max-h-[380px] w-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 text-[11px] text-ink shadow-lg",
                  up ? "bottom-full mb-1" : "top-full mt-1",
               )}
            >
               <SectionLabel>Model</SectionLabel>
               {(status?.models ?? [model]).map((id) => {
                  const m = modelInfo(id);
                  return (
                     <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={id === model}
                        onClick={() => {
                           setModel(id);
                           setOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-hover"
                     >
                        <span className="truncate">{m.label}</span>
                        <span className="text-[9px] text-muted">
                           {m.vendor}
                        </span>
                        {id === model && (
                           <Check className="ml-auto size-3 shrink-0" />
                        )}
                     </button>
                  );
               })}

               <div className="my-1 border-t border-line" />

               <div className="flex items-center pr-1">
                  <SectionLabel>Connections</SectionLabel>
                  <button
                     type="button"
                     aria-label="Re-check connections"
                     title="Re-check connections"
                     onClick={refresh}
                     className="ml-auto rounded p-0.5 text-muted hover:bg-hover hover:text-ink"
                  >
                     <RotateCw
                        className={clsx("size-2.5", checking && "animate-spin")}
                     />
                  </button>
               </div>
               {error && <p className="px-2 pb-1 text-[9px] text-muted">
                  {`Agent unreachable: ${error}`}
               </p>}
               {status?.mcpServers.map((s) => (
                  <McpRow key={s.id} server={s} />
               ))}
               <AddMcpServer />
            </div>
         )}
      </div>
   );
}

function SectionLabel({ children }: { children: string }) {
   return (
      <div className="px-2 pt-1.5 pb-1 text-[9px] font-medium tracking-wide text-faint uppercase">
         {children}
      </div>
   );
}

function ConnectionRow({
   icon,
   name,
   ok,
   detail,
   onClick,
   expanded,
}: {
   icon: ReactNode;
   name: string;
   ok: boolean;
   detail: string;
   onClick?: () => void;
   expanded?: boolean;
}) {
   const Tag = onClick ? "button" : "div";
   return (
      <Tag
         type={onClick ? "button" : undefined}
         onClick={onClick}
         className={clsx(
            "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left",
            onClick && "hover:bg-hover",
         )}
      >
         {icon}
         <span className="min-w-0 flex-1">
            <span className="block truncate">{name}</span>
            <span className="block truncate text-[9px] text-muted">
               {detail}
            </span>
         </span>
         <span
            className={clsx(
               "size-1.5 shrink-0 rounded-full",
               ok ? "bg-emerald-500" : "bg-red-500",
            )}
         />
         {onClick && (
            <ChevronRight
               className={clsx(
                  "size-2.5 shrink-0 text-muted transition-transform",
                  expanded && "rotate-90",
               )}
            />
         )}
      </Tag>
   );
}

function McpRow({ server }: { server: McpServerStatus }) {
   const [expanded, setExpanded] = useState(true);
   return (
      <>
         <ConnectionRow
            icon={<Server className="size-3 text-muted" />}
            name={server.name}
            ok={server.connected}
            detail={
               server.connected
                  ? `${server.tools.length} tools · ${server.skills} skills`
                  : `Unreachable at ${server.url}`
            }
            onClick={() => setExpanded((e) => !e)}
            expanded={expanded}
         />
         {expanded && (
            <div className="flex flex-wrap gap-1 px-2 pt-0.5 pb-1.5 pl-6.5">
               {server.connected ? (
                  server.tools.map((t) => (
                     <span
                        key={t}
                        className="rounded border border-line bg-panel px-1 font-mono text-[9px] text-muted"
                     >
                        {t}
                     </span>
                  ))
               ) : (
                  <span className="text-[9px] break-all text-muted">
                     {server.error ?? "No response"}. Start Publisher, then
                     re-check.
                  </span>
               )}
            </div>
         )}
      </>
   );
}

/** Not wired up: the agent only talks to Publisher's MCP endpoint today. */
function AddMcpServer() {
   const [open, setOpen] = useState(false);
   const [custom, setCustom] = useState(false);

   return (
      <>
         <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-hover"
         >
            <Plus className="size-3 text-muted" />
            <span className="flex-1">Add MCP server</span>
            <ChevronRight
               className={clsx(
                  "size-2.5 shrink-0 text-muted transition-transform",
                  open && "rotate-90",
               )}
            />
         </button>
         {open && (
            <div className="mx-1 mb-1 rounded-md border border-line bg-panel/50 p-1">
               {INTEGRATIONS.map((name) => (
                  <div
                     key={name}
                     className="flex items-center gap-1.5 rounded px-1.5 py-1 text-muted"
                  >
                     <Plug className="size-3" />
                     <span>{name}</span>
                     <span className="ml-auto rounded bg-hover px-1 text-[9px]">
                        Coming soon
                     </span>
                  </div>
               ))}
               <div className="my-1 border-t border-line" />
               {custom ? (
                  <CustomServerForm onCancel={() => setCustom(false)} />
               ) : (
                  <button
                     type="button"
                     onClick={() => setCustom(true)}
                     className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-hover"
                  >
                     <Server className="size-3 text-muted" />
                     Custom server by URL…
                  </button>
               )}
            </div>
         )}
      </>
   );
}

function CustomServerForm({ onCancel }: { onCancel: () => void }) {
   const [name, setName] = useState("");
   const [url, setUrl] = useState("");
   const input =
      "w-full rounded border border-line bg-surface px-1.5 py-1 text-[10px] outline-none placeholder:text-faint focus:border-muted";
   return (
      <div className="space-y-1.5 p-1">
         <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className={input}
         />
         <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/mcp"
            className={clsx(input, "font-mono")}
         />
         <p className="text-[9px] text-muted">
            Custom servers aren't supported yet; the agent uses Publisher's
            tools only.
         </p>
         <div className="flex justify-end gap-1">
            <button
               type="button"
               onClick={onCancel}
               className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-hover hover:text-ink"
            >
               Cancel
            </button>
            <button
               type="button"
               disabled
               className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-surface opacity-40"
            >
               Connect
            </button>
         </div>
      </div>
   );
}
