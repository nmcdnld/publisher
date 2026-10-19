// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   ArrowLeftIcon,
   ArrowUpRightIcon,
   ChevronRightIcon,
   FileCode2Icon,
   XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type { Entity, Ontology } from "../../../ontology/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
   connectionsOf,
   nodeLabel,
   type ConnectionGroup,
   type ConnectionNode,
   type Relation,
} from "./connections";
import { CONTENT_META } from "./content";
import { dictionaryHref, KIND_META, KindIcon } from "./shared";

/** How many neighbors a group shows before it folds the rest into "+N". */
const CARD_LIMIT = 6;
const GRAPH_LIMIT = 8;

/**
 * What this entity uses and what uses it, model references, the content that
 * shows it and the files that name it, as groups of chips.
 */
export function ConnectionGroups({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const connections = useMemo(
      () => connectionsOf(ontology, entity),
      [ontology, entity],
   );
   const [expanded, setExpanded] = useState<Set<string>>(new Set());
   useEffect(() => setExpanded(new Set()), [entity.id]);

   if (connections.total === 0) {
      return (
         <p className="text-xs text-muted-foreground">
            Nothing in the model, or in its dashboards, notebooks and apps,
            links to or from this.
         </p>
      );
   }
   return (
      <div className="space-y-3">
         {[...connections.uses, ...connections.usedBy].map((group) => {
            const shown = expanded.has(group.key)
               ? group.nodes
               : group.nodes.slice(0, CARD_LIMIT);
            return (
               <div key={group.key} className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">
                     {group.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                     {shown.map((node) => (
                        <NodeChip
                           key={node.key}
                           ontology={ontology}
                           node={node}
                        />
                     ))}
                     {shown.length < group.nodes.length && (
                        <button
                           type="button"
                           onClick={() =>
                              setExpanded((s) => new Set(s).add(group.key))
                           }
                           className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                           +{group.nodes.length - shown.length} more
                        </button>
                     )}
                  </div>
               </div>
            );
         })}
      </div>
   );
}

function nodeHref(ontology: Ontology, node: ConnectionNode): string {
   const base = `/${ontology.environmentName}/${ontology.packageName}`;
   if (node.type === "entity") return dictionaryHref(ontology, node.entity.id);
   if (node.type === "content") {
      return `${dictionaryHref(ontology)}?${new URLSearchParams({ content: node.item.id })}`;
   }
   return node.mention.href ? `${base}/${node.mention.href}` : base;
}

function NodeIcon({
   node,
   className,
}: {
   node: ConnectionNode;
   className?: string;
}) {
   if (node.type === "entity") {
      return <KindIcon kind={node.entity.kind} className={className} />;
   }
   if (node.type === "content") {
      const meta = CONTENT_META[node.item.kind];
      const Icon = meta.icon;
      return (
         <Icon
            className={cn("size-3.5", meta.tint, "bg-transparent", className)}
         />
      );
   }
   return (
      <FileCode2Icon
         className={cn("size-3.5 text-muted-foreground", className)}
      />
   );
}

function NodeChip({
   ontology,
   node,
}: {
   ontology: Ontology;
   node: ConnectionNode;
}) {
   return (
      <Link
         to={nodeHref(ontology, node)}
         title={
            node.note ? `${nodeLabel(node)} (${node.note})` : nodeLabel(node)
         }
         className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent",
            node.type === "entity" && "font-mono",
            node.type === "file" && "border-dashed",
         )}
      >
         <NodeIcon node={node} />
         <span className="truncate">{nodeLabel(node)}</span>
      </Link>
   );
}

// ── The graph ────────────────────────────────────────────────────────────

const WIDTH = 880;
const COL_W = 244;
const CENTER_W = 220;
const LEFT_X = 0;
const CENTER_X = (WIDTH - CENTER_W) / 2;
const RIGHT_X = WIDTH - COL_W;
const NODE_H = 26;
const NODE_GAP = 4;
const HEAD_H = 20;
const GROUP_GAP = 12;
const PAD = 12;
/** Room above the first group for the column's own label. */
const TOP = 36;
const CENTER_H = 120;

interface Placed {
   key: string;
   y: number;
   group: ConnectionGroup;
   node?: ConnectionNode;
   /** A "+N more" row that expands the group. */
   more?: number;
   head?: boolean;
}

function layoutColumn(
   groups: ConnectionGroup[],
   expanded: Set<string>,
): { rows: Placed[]; height: number } {
   const rows: Placed[] = [];
   let y = TOP;
   for (const group of groups) {
      rows.push({ key: `head:${group.key}`, y, group, head: true });
      y += HEAD_H;
      const all = expanded.has(group.key);
      const shown = all ? group.nodes : group.nodes.slice(0, GRAPH_LIMIT);
      for (const node of shown) {
         rows.push({ key: `${group.key}:${node.key}`, y, group, node });
         y += NODE_H + NODE_GAP;
      }
      if (shown.length < group.nodes.length) {
         rows.push({
            key: `more:${group.key}`,
            y,
            group,
            more: group.nodes.length - shown.length,
         });
         y += NODE_H + NODE_GAP;
      }
      y += GROUP_GAP;
   }
   return { rows, height: y + PAD - GROUP_GAP };
}

const EDGE_STYLE: Record<Relation, { width: number; dash?: string }> = {
   extends: { width: 2.5 },
   join: { width: 1.5 },
   reference: { width: 1.25 },
   given: { width: 1.25, dash: "1 3" },
   indirect: { width: 1, dash: "4 3" },
   content: { width: 1.25, dash: "6 3" },
   mention: { width: 1, dash: "1 3" },
};

export function ConnectionGraph({
   ontology,
   startId,
   onClose,
}: {
   ontology: Ontology;
   startId: string;
   onClose: () => void;
}) {
   const [trail, setTrail] = useState([startId]);
   const centerId = trail[trail.length - 1];
   const center = ontology.entities.get(centerId);
   if (!center) return null;
   return (
      <div className="flex max-h-[min(44rem,80vh)] flex-col">
         <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs">
            <Button
               size="xs"
               variant="ghost"
               disabled={trail.length < 2}
               onClick={() => setTrail((t) => t.slice(0, -1))}
               aria-label="Back"
            >
               <ArrowLeftIcon />
            </Button>
            <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
               {trail.map((id, i) => {
                  const e = ontology.entities.get(id);
                  const last = i === trail.length - 1;
                  return (
                     <span
                        key={`${id}:${i}`}
                        className="flex min-w-0 items-center gap-0.5"
                     >
                        {i > 0 && (
                           <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        <button
                           type="button"
                           disabled={last}
                           onClick={() => setTrail((t) => t.slice(0, i + 1))}
                           className={cn(
                              "truncate rounded px-1 font-mono",
                              last
                                 ? "font-semibold text-foreground"
                                 : "text-muted-foreground hover:bg-accent hover:text-foreground",
                           )}
                        >
                           {e
                              ? nodeLabel({
                                   type: "entity",
                                   key: id,
                                   entity: e,
                                })
                              : id}
                        </button>
                     </span>
                  );
               })}
            </nav>
            <span className="hidden text-muted-foreground sm:inline">
               Click a node to re-center on it
            </span>
            <Button
               size="xs"
               variant="ghost"
               onClick={onClose}
               aria-label="Close"
            >
               <XIcon />
            </Button>
         </div>
         <GraphCanvas
            key={centerId}
            ontology={ontology}
            center={center}
            isPage={centerId === startId}
            onCenter={(id) => setTrail((t) => [...t, id])}
            onNavigate={onClose}
         />
         <GraphLegend />
      </div>
   );
}

function GraphCanvas({
   ontology,
   center,
   isPage,
   onCenter,
   onNavigate,
}: {
   ontology: Ontology;
   center: Entity;
   isPage: boolean;
   onCenter: (id: string) => void;
   onNavigate: () => void;
}) {
   const connections = useMemo(
      () => connectionsOf(ontology, center),
      [ontology, center],
   );
   const [expanded, setExpanded] = useState<Set<string>>(new Set());
   const [hovered, setHovered] = useState<string>();
   const expand = (key: string) => setExpanded((s) => new Set(s).add(key));

   const left = layoutColumn(connections.uses, expanded);
   const right = layoutColumn(connections.usedBy, expanded);
   const height = Math.max(left.height, right.height, TOP + CENTER_H + PAD);
   const cy = (TOP + height) / 2;
   const centerTop = cy - CENTER_H / 2;

   const edges = [
      ...left.rows
         .filter((r) => r.node)
         .map((r) => ({
            row: r,
            d: curve(LEFT_X + COL_W, r.y + NODE_H / 2, CENTER_X, cy),
         })),
      ...right.rows
         .filter((r) => r.node)
         .map((r) => ({
            row: r,
            d: curve(CENTER_X + CENTER_W, cy, RIGHT_X, r.y + NODE_H / 2),
         })),
   ];
   const lit = (key: string) => hovered === undefined || hovered === key;
   const meta = KIND_META[center.kind];

   return (
      <div className="min-h-0 flex-1 overflow-auto">
         <div className="relative mx-auto" style={{ width: WIDTH, height }}>
            <svg
               width={WIDTH}
               height={height}
               className="pointer-events-none absolute inset-0"
               aria-hidden
            >
               {edges
                  .sort(
                     (a, b) =>
                        Number(hovered === a.row.key) -
                        Number(hovered === b.row.key),
                  )
                  .map(({ row, d }) => {
                     const style = EDGE_STYLE[row.group.relation];
                     const many =
                        row.node?.type === "entity" &&
                        row.node.note === "join_many";
                     return (
                        <path
                           key={row.key}
                           d={d}
                           fill="none"
                           className={cn(
                              "transition-[stroke,opacity]",
                              hovered === row.key
                                 ? "stroke-primary"
                                 : "stroke-muted-foreground/35",
                              !lit(row.key) && "opacity-25",
                           )}
                           strokeWidth={style.width}
                           strokeDasharray={many ? "3 2" : style.dash}
                           strokeLinecap="round"
                        />
                     );
                  })}
            </svg>

            <ColumnLabel
               x={LEFT_X}
               text="Uses"
               count={countOf(connections.uses)}
            />
            <ColumnLabel
               x={RIGHT_X}
               text="Used by"
               count={countOf(connections.usedBy)}
            />
            {connections.uses.length === 0 && (
               <EmptyColumn x={LEFT_X} y={cy} text="Names nothing else" />
            )}
            {connections.usedBy.length === 0 && (
               <EmptyColumn x={RIGHT_X} y={cy} text="Nothing names this" />
            )}

            {[
               ...left.rows.map((r) => ({ r, x: LEFT_X })),
               ...right.rows.map((r) => ({ r, x: RIGHT_X })),
            ].map(({ r, x }) => {
               if (r.head) {
                  return (
                     <div
                        key={r.key}
                        className="absolute truncate px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                        style={{ left: x, top: r.y + 4, width: COL_W }}
                     >
                        {r.group.label} · {r.group.nodes.length}
                     </div>
                  );
               }
               if (r.more !== undefined) {
                  return (
                     <button
                        key={r.key}
                        type="button"
                        onClick={() => expand(r.group.key)}
                        className="absolute rounded-md border border-dashed px-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        style={{
                           left: x,
                           top: r.y,
                           width: COL_W,
                           height: NODE_H,
                        }}
                     >
                        +{r.more} more
                     </button>
                  );
               }
               return (
                  <GraphNode
                     key={r.key}
                     ontology={ontology}
                     node={r.node!}
                     x={x}
                     y={r.y}
                     dim={!lit(r.key)}
                     onHover={(on) => setHovered(on ? r.key : undefined)}
                     onCenter={onCenter}
                     onNavigate={onNavigate}
                  />
               );
            })}

            <div
               className="absolute flex flex-col gap-1.5 rounded-lg border-2 border-primary/50 bg-card p-3 shadow-sm"
               style={{
                  left: CENTER_X,
                  top: centerTop,
                  width: CENTER_W,
                  height: CENTER_H,
               }}
            >
               <div className="flex min-w-0 items-center gap-1.5">
                  <KindIcon kind={center.kind} className="size-4 shrink-0" />
                  <span className="min-w-0 truncate font-mono text-sm font-semibold">
                     {nodeLabel({
                        type: "entity",
                        key: center.id,
                        entity: center,
                     })}
                  </span>
               </div>
               <div className="flex items-center gap-1.5">
                  <Badge variant="secondary">{meta.label}</Badge>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                     {center.modelPath}
                  </span>
               </div>
               <p
                  className={cn(
                     "line-clamp-2 text-[11px] leading-snug",
                     !center.doc && "italic text-muted-foreground",
                  )}
               >
                  {center.doc ?? "No #(doc) description."}
               </p>
               {!isPage && (
                  <Link
                     to={dictionaryHref(ontology, center.id)}
                     onClick={onNavigate}
                     className="mt-auto inline-flex items-center gap-0.5 self-start text-[11px] text-primary hover:underline"
                  >
                     Open its page <ArrowUpRightIcon className="size-3" />
                  </Link>
               )}
            </div>
         </div>
      </div>
   );
}

function GraphNode({
   ontology,
   node,
   x,
   y,
   dim,
   onHover,
   onCenter,
   onNavigate,
}: {
   ontology: Ontology;
   node: ConnectionNode;
   x: number;
   y: number;
   dim: boolean;
   onHover: (on: boolean) => void;
   onCenter: (id: string) => void;
   onNavigate: () => void;
}) {
   const label = nodeLabel(node);
   const className = cn(
      "group absolute flex items-center gap-1.5 rounded-md border bg-card px-2 text-left text-xs transition-[opacity,colors] hover:border-primary/50 hover:bg-accent",
      node.type === "entity" && "font-mono",
      node.type === "file" && "border-dashed",
      dim && "opacity-50",
   );
   const style = { left: x, top: y, width: COL_W, height: NODE_H };
   const body = (
      <>
         <NodeIcon node={node} className="shrink-0" />
         <span className="min-w-0 flex-1 truncate">{label}</span>
         {node.note && (
            <span className="max-w-[45%] shrink-0 truncate font-sans text-[10px] text-muted-foreground">
               {node.note}
            </span>
         )}
      </>
   );
   const hover = {
      onMouseEnter: () => onHover(true),
      onMouseLeave: () => onHover(false),
      onFocus: () => onHover(true),
      onBlur: () => onHover(false),
   };
   if (node.type !== "entity") {
      return (
         <Link
            to={nodeHref(ontology, node)}
            onClick={onNavigate}
            title={`Open ${label}`}
            className={className}
            style={style}
            {...hover}
         >
            {body}
            <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" />
         </Link>
      );
   }
   return (
      <div className={className} style={style} {...hover}>
         <button
            type="button"
            onClick={() => onCenter(node.entity.id)}
            title={`Re-center on ${label}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left"
         >
            {body}
         </button>
         <Link
            to={nodeHref(ontology, node)}
            onClick={onNavigate}
            title={`Open ${label}`}
            aria-label={`Open ${label}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus:opacity-100"
         >
            <ArrowUpRightIcon className="size-3" />
         </Link>
      </div>
   );
}

function ColumnLabel({
   x,
   text,
   count,
}: {
   x: number;
   text: string;
   count: number;
}) {
   return (
      <div
         className="absolute border-b px-1 pb-1 text-[11px] font-semibold"
         style={{ left: x, top: PAD, width: COL_W }}
      >
         {text}
         <span className="ml-1 font-normal text-muted-foreground">{count}</span>
      </div>
   );
}

function EmptyColumn({ x, y, text }: { x: number; y: number; text: string }) {
   return (
      <div
         className="absolute -translate-y-1/2 rounded-md border border-dashed px-2 py-1.5 text-center text-xs text-muted-foreground"
         style={{ left: x, top: y, width: COL_W }}
      >
         {text}
      </div>
   );
}

function GraphLegend() {
   const item = (label: string, relation: Relation, dash?: string) => {
      const style = EDGE_STYLE[relation];
      return (
         <span className="flex items-center gap-1.5">
            <svg width={18} height={6} aria-hidden>
               <line
                  x1={1}
                  y1={3}
                  x2={17}
                  y2={3}
                  className="stroke-muted-foreground"
                  strokeWidth={style.width}
                  strokeDasharray={dash ?? style.dash}
                  strokeLinecap="round"
               />
            </svg>
            {label}
         </span>
      );
   };
   return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-[10px] text-muted-foreground">
         {item("extends", "extends")}
         {item("join", "join")}
         {item("join_many", "join", "3 2")}
         {item("references", "reference")}
         {item("given", "given")}
         {item("through a field", "indirect")}
         {item("shown in", "content")}
         {item("named in", "mention")}
      </div>
   );
}

function countOf(groups: ConnectionGroup[]): number {
   return groups.reduce((n, g) => n + g.nodes.length, 0);
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
   const dx = (x2 - x1) / 2;
   return `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}
