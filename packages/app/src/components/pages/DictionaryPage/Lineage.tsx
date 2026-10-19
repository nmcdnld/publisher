// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { InfoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../../lib/utils";
import type { Entity, Ontology } from "../../../ontology/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { ConnectionGroups } from "./ConnectionsCard";
import { dictionaryHref } from "./shared";

/** `from` depends on `to`: it joins it, or is built on it. */
interface LineageEdge {
   from: string;
   to: string;
   kind: "extends" | "join";
   /** `many` when any of the joins behind this edge is a join_many. */
   relationship?: string;
   /** The join fields behind this edge; two joins to one source are one edge. */
   joins: string[];
}

interface LineageNode {
   source: Entity;
   row: number;
   lane: number;
   /** Depends on no other source: it reads a table (or SQL) directly. */
   terminal: boolean;
}

export interface LineageGraph {
   nodes: LineageNode[];
   byId: Map<string, LineageNode>;
   edges: LineageEdge[];
   lanes: number;
   /** What the center is built from, transitively. */
   upstream: Set<string>;
   /** What is built from the center, transitively. */
   downstream: Set<string>;
}

function dependencies(ontology: Ontology, source: Entity): LineageEdge[] {
   const isSource = (id?: string): id is string =>
      !!id && id !== source.id && ontology.entities.get(id)?.kind === "source";
   const byTarget = new Map<string, LineageEdge>();
   if (isSource(source.extendsId)) {
      byTarget.set(source.extendsId, {
         from: source.id,
         to: source.extendsId,
         kind: "extends",
         joins: [],
      });
   }
   for (const fid of source.fieldIds ?? []) {
      const join = ontology.entities.get(fid);
      if (join?.kind !== "join" || !isSource(join.joinTargetId)) continue;
      const existing = byTarget.get(join.joinTargetId);
      if (existing?.kind === "extends") continue;
      if (existing) {
         existing.joins.push(join.name);
         if (join.relationship === "many") existing.relationship = "many";
      } else {
         byTarget.set(join.joinTargetId, {
            from: source.id,
            to: join.joinTargetId,
            kind: "join",
            relationship: join.relationship,
            joins: [join.name],
         });
      }
   }
   return [...byTarget.values()];
}

/**
 * Every source that reaches `centerId` through joins and `extend`, and every
 * source it reaches, back to the ones that read a table. One row per source in
 * topological order, data flowing down: tables at the top, consumers below
 * what they consume. Each source owns a lane from its own row down to its last
 * consumer's, so every edge is a straight drop in the provider's lane and a
 * horizontal step into the consumer's row.
 */
export function lineageGraph(
   ontology: Ontology,
   centerId: string,
): LineageGraph {
   const deps = new Map<string, LineageEdge[]>();
   const consumers = new Map<string, LineageEdge[]>();
   for (const s of ontology.sources) deps.set(s.id, dependencies(ontology, s));
   for (const edges of deps.values()) {
      for (const e of edges) {
         consumers.set(e.to, [...(consumers.get(e.to) ?? []), e]);
      }
   }

   const reach = (
      start: string,
      next: (id: string) => string[],
   ): Set<string> => {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
         for (const id of next(stack.pop()!)) {
            if (id !== start && !seen.has(id)) {
               seen.add(id);
               stack.push(id);
            }
         }
      }
      return seen;
   };
   const down = reach(centerId, (id) => (deps.get(id) ?? []).map((e) => e.to));
   const up = reach(centerId, (id) =>
      (consumers.get(id) ?? []).map((e) => e.from),
   );
   const ids = new Set([centerId, ...up, ...down]);
   const name = (id: string) => ontology.entities.get(id)?.name ?? id;
   const byName = (a: string, b: string) => name(a).localeCompare(name(b));

   const candidate = [...ids].flatMap((id) =>
      (deps.get(id) ?? []).filter((e) => ids.has(e.to)),
   );
   const hasConsumer = new Set(candidate.map((e) => e.to));

   // Reverse postorder of a DFS puts every source above what it depends on;
   // the rows are mirrored at the end so data flows down instead. Children
   // and roots are visited in name order so the mirrored result reads
   // alphabetically; an edge back into the stack is a cycle and is dropped.
   const state = new Map<string, "open" | "done">();
   const order: string[] = [];
   const back = new Set<LineageEdge>();
   const visit = (id: string) => {
      state.set(id, "open");
      const out = candidate
         .filter((e) => e.from === id)
         .sort((a, b) => byName(a.to, b.to));
      for (const e of out) {
         const s = state.get(e.to);
         if (s === "open") back.add(e);
         else if (!s) visit(e.to);
      }
      state.set(id, "done");
      order.push(id);
   };
   const roots = [...ids].filter((id) => !hasConsumer.has(id)).sort(byName);
   for (const id of roots) if (!state.has(id)) visit(id);
   for (const id of [...ids].sort(byName)) {
      if (!state.has(id)) visit(id);
   }
   order.reverse();

   const edges = candidate.filter((e) => !back.has(e));
   const row = new Map(order.map((id, i) => [id, i]));
   const firstConsumer = new Map<string, number>();
   for (const e of edges) {
      const r = row.get(e.from)!;
      firstConsumer.set(e.to, Math.min(firstConsumer.get(e.to) ?? r, r));
   }

   // Interval colouring: a lane is free once its last occupant's row is at or
   // above where this source's span starts. The occupant ending exactly there
   // is the first consumer itself, so a single chain runs down one lane.
   const laneEnds: number[] = [];
   const lane = new Map<string, number>();
   const spans = order
      .map((id) => ({
         id,
         start: firstConsumer.get(id) ?? row.get(id)!,
         end: row.get(id)!,
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
   for (const span of spans) {
      let i = laneEnds.findIndex((end) => end <= span.start);
      if (i < 0) i = laneEnds.length;
      laneEnds[i] = span.end;
      lane.set(span.id, i);
   }

   const last = order.length - 1;
   const nodes = order
      .map(
         (id): LineageNode => ({
            source: ontology.entities.get(id)!,
            row: last - row.get(id)!,
            lane: lane.get(id)!,
            terminal: !(deps.get(id) ?? []).length,
         }),
      )
      .sort((a, b) => a.row - b.row);
   return {
      nodes,
      byId: new Map(nodes.map((n) => [n.source.id, n])),
      edges,
      lanes: Math.max(laneEnds.length, 1),
      upstream: down,
      downstream: up,
   };
}

/** What reaches `id` and what `id` reaches, over the drawn edges. */
function lineageOf(graph: LineageGraph, id: string) {
   const walk = (start: string, dir: "up" | "down") => {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
         const at = stack.pop()!;
         for (const e of graph.edges) {
            const [here, there] =
               dir === "down" ? [e.from, e.to] : [e.to, e.from];
            if (here === at && !seen.has(there)) {
               seen.add(there);
               stack.push(there);
            }
         }
      }
      return seen;
   };
   return { up: walk(id, "up"), down: walk(id, "down") };
}

function tableName(source: Entity): string | undefined {
   return source.table?.replace(/^(['"`])(.*)\1$/, "$2");
}

const ROW_H = 24;
const MAX_HEIGHT = 30 * 16;

/**
 * The source neighborhood as a DAG, with everything that links to or from the
 * entity (model references, content, mentions) as chip groups beneath it.
 */
export function ContentGraph({
   ontology,
   entity,
}: {
   ontology: Ontology;
   entity: Entity;
}) {
   const sourceId = entity.kind === "source" ? entity.id : entity.sourceId;
   const source = sourceId ? ontology.entities.get(sourceId) : undefined;
   const graph = useMemo(
      () => (source ? lineageGraph(ontology, source.id) : undefined),
      [ontology, source],
   );
   const dag = source && graph && graph.nodes.length >= 2 ? graph : undefined;
   return (
      <Card className="gap-3 py-4">
         <CardHeader className="px-4">
            <CardTitle className="flex items-center justify-between gap-2">
               <span className="flex items-center gap-1.5">
                  Content graph
                  {dag && source && (
                     <HowToRead
                        ontology={ontology}
                        graph={dag}
                        centerId={source.id}
                     />
                  )}
               </span>
               {dag && (
                  <span className="text-xs font-normal text-muted-foreground">
                     {dag.upstream.size} upstream · {dag.downstream.size}{" "}
                     downstream
                  </span>
               )}
            </CardTitle>
         </CardHeader>
         <CardContent className="space-y-3 px-4">
            {dag && source && (
               <>
                  <LineageView
                     ontology={ontology}
                     graph={dag}
                     centerId={source.id}
                  />
                  <Legend />
               </>
            )}
            <div className={cn(dag && "border-t pt-3")}>
               <ConnectionGroups ontology={ontology} entity={entity} />
            </div>
         </CardContent>
      </Card>
   );
}

function LineageView({
   ontology,
   graph,
   centerId,
}: {
   ontology: Ontology;
   graph: LineageGraph;
   centerId: string;
}) {
   const [hovered, setHovered] = useState<string>();
   const active = hovered && graph.byId.has(hovered) ? hovered : centerId;
   const lineage = useMemo(() => lineageOf(graph, active), [graph, active]);
   const scroller = useRef<HTMLDivElement>(null);

   const center = graph.byId.get(centerId)!;
   useEffect(() => {
      const el = scroller.current;
      if (el && el.scrollHeight > el.clientHeight) {
         el.scrollTop = center.row * ROW_H - el.clientHeight / 2 + ROW_H / 2;
      }
   }, [center.row]);

   const laneW = graph.lanes <= 8 ? 12 : Math.max(5, 96 / graph.lanes);
   const pad = 8;
   const gutter = pad * 2 + (graph.lanes - 1) * laneW;
   const height = graph.nodes.length * ROW_H;
   const x = (n: LineageNode) => pad + n.lane * laneW;
   const y = (n: LineageNode) => n.row * ROW_H + ROW_H / 2;

   const inLineage = (id: string) =>
      id === active || lineage.up.has(id) || lineage.down.has(id);
   const onPath = (e: LineageEdge) =>
      e.to === active ||
      lineage.up.has(e.to) ||
      e.from === active ||
      lineage.down.has(e.from);

   const path = (e: LineageEdge) => {
      const a = graph.byId.get(e.from)!;
      const b = graph.byId.get(e.to)!;
      const [xa, ya, xb, yb] = [x(a), y(a), x(b), y(b)];
      if (xa === xb) return `M${xb} ${yb}V${ya}`;
      const dir = Math.sign(xa - xb);
      const r = Math.min(6, Math.abs(xa - xb), ya - yb);
      return `M${xb} ${yb}V${ya - r}Q${xb} ${ya} ${xb + dir * r} ${ya}H${xa}`;
   };
   const edges = [...graph.edges].sort(
      (a, b) => Number(onPath(a)) - Number(onPath(b)),
   );

   const name = (id: string) => graph.byId.get(id)?.source.name ?? id;
   /** How a row relates to the active source, when it is one step away. */
   const relation = (id: string): string | undefined => {
      const dep = graph.edges.find((e) => e.from === active && e.to === id);
      if (dep?.kind === "extends") return "base";
      if (dep) {
         const renamed = dep.joins.filter((j) => j !== name(id));
         return renamed.length
            ? `as ${renamed.join(", ")}`
            : `join_${dep.relationship ?? "one"}`;
      }
      const user = graph.edges.find((e) => e.to === active && e.from === id);
      if (user) return user.kind === "extends" ? "extends it" : "joins it";
      return undefined;
   };

   return (
      <div
         ref={scroller}
         className="-mx-1 overflow-y-auto px-1"
         style={{ maxHeight: MAX_HEIGHT }}
         onMouseLeave={() => setHovered(undefined)}
      >
         <div className="relative" style={{ height }}>
            <svg
               width={gutter}
               height={height}
               className="pointer-events-none absolute top-0 left-0"
               aria-hidden
            >
               {edges.map((e) => {
                  const lit = onPath(e);
                  return (
                     <path
                        key={`${e.from}>${e.to}`}
                        d={path(e)}
                        fill="none"
                        className={lit ? "stroke-primary" : "stroke-border"}
                        strokeWidth={
                           e.kind === "extends" ? 2.5 : lit ? 1.75 : 1.25
                        }
                        strokeDasharray={
                           e.relationship === "many" ? "3 2" : undefined
                        }
                        strokeLinecap="round"
                     />
                  );
               })}
               {graph.nodes.map((n) => {
                  const id = n.source.id;
                  return (
                     <circle
                        key={id}
                        cx={x(n)}
                        cy={y(n)}
                        r={id === active ? 4.5 : 3}
                        className={cn(
                           id === active
                              ? "fill-primary"
                              : inLineage(id)
                                ? "fill-card stroke-primary"
                                : "fill-card stroke-muted-foreground/40",
                        )}
                        strokeWidth={1.5}
                     />
                  );
               })}
            </svg>
            {graph.nodes.map((n) => {
               const id = n.source.id;
               const tag = relation(id);
               const table = n.terminal ? tableName(n.source) : undefined;
               return (
                  <Link
                     key={id}
                     to={dictionaryHref(ontology, id)}
                     onMouseEnter={() => setHovered(id)}
                     onFocus={() => setHovered(id)}
                     title={
                        table
                           ? `${n.source.name} reads ${n.source.connection ? `${n.source.connection}: ` : ""}${table}`
                           : n.source.name
                     }
                     className={cn(
                        "absolute right-0 flex items-center gap-2 rounded-sm pr-1.5 font-mono text-xs transition-colors",
                        id === centerId && "bg-primary/10 font-semibold",
                        id === active && id !== centerId && "bg-accent",
                        inLineage(id)
                           ? "text-foreground"
                           : "text-muted-foreground/70",
                     )}
                     style={{
                        top: n.row * ROW_H,
                        height: ROW_H,
                        left: gutter - 2,
                        paddingLeft: 4,
                     }}
                  >
                     <span className="min-w-0 flex-1 truncate">
                        {n.source.name}
                     </span>
                     {tag ? (
                        <span className="max-w-[45%] shrink-0 truncate text-[10px] font-normal text-primary">
                           {tag}
                        </span>
                     ) : (
                        table && (
                           <span className="max-w-[45%] shrink-0 truncate text-[10px] font-normal text-muted-foreground/60">
                              {table}
                           </span>
                        )
                     )}
                  </Link>
               );
            })}
         </div>
      </div>
   );
}

/** "How to read this", told with edges and definitions from the graph on screen. */
function HowToRead({
   ontology,
   graph,
   centerId,
}: {
   ontology: Ontology;
   graph: LineageGraph;
   centerId: string;
}) {
   const entity = (id: string) => ontology.entities.get(id);
   const N = ({ id }: { id: string }) => (
      <code className="rounded bg-muted px-1 font-mono text-[11px] font-semibold">
         {entity(id)?.name ?? id}
      </code>
   );
   const C = <N id={centerId} />;
   const glyph = (e: LineageEdge): GlyphKind =>
      e.kind === "extends"
         ? "extends"
         : e.relationship === "many"
           ? "many"
           : "one";
   const describe = (e: LineageEdge) =>
      e.kind === "extends"
         ? "a thick line"
         : e.relationship === "many"
           ? "a dashed line"
           : "a thin solid line";
   /** The line in the model that draws this edge. */
   const snippet = (e: LineageEdge) => {
      if (e.kind === "extends") {
         return (
            definitionLine(entity(e.from)) ??
            `source: ${entity(e.from)?.name} is ${entity(e.to)?.name} extend {`
         );
      }
      const keyword = `join_${e.relationship ?? "one"}:`;
      const line =
         definitionLine(entity(`${e.from}.${e.joins[0]}`)) ?? `${e.joins[0]} …`;
      return line.startsWith("join_") ? line : `${keyword} ${line}`;
   };

   const consumer = graph.edges.find((e) => e.to === centerId);
   const dep =
      graph.edges.find((e) => e.from === centerId && e.kind === "join") ??
      graph.edges.find((e) => e.from === centerId);
   const many = graph.edges.find(
      (e) => e.relationship === "many" && e !== dep && e !== consumer,
   );
   const terminal =
      graph.nodes.find(
         (n) => n.terminal && n.source.table && graph.upstream.has(n.source.id),
      ) ?? graph.nodes.find((n) => n.terminal && n.source.table);

   const items: Array<{ text: ReactNode; code?: string }> = [];
   if (terminal) {
      items.push({
         text: (
            <>
               <Glyph kind="node" /> <N id={terminal.source.id} /> has no line
               coming into it from above: it reads a table, so it is where the
               data starts.
            </>
         ),
         code:
            definitionLine(terminal.source) ??
            `${terminal.source.connection ?? "duckdb"}.table('${tableName(terminal.source)}')`,
      });
   }
   if (dep) {
      items.push({
         text: (
            <>
               <Glyph kind={glyph(dep)} /> {C}{" "}
               {dep.kind === "extends" ? "is built on" : "joins"}{" "}
               <N id={dep.to} />, so <N id={dep.to} /> sits above it and{" "}
               {describe(dep)} runs down from it into the row for {C}:
            </>
         ),
         code: snippet(dep),
      });
   }
   if (consumer) {
      items.push({
         text: (
            <>
               <Glyph kind={glyph(consumer)} /> <N id={consumer.from} />{" "}
               {consumer.kind === "extends" ? "is built on" : "joins"} {C}, so
               it sits below, and {describe(consumer)} runs down from {C} into
               its row:
            </>
         ),
         code: snippet(consumer),
      });
   }
   if (many) {
      items.push({
         text: (
            <>
               <Glyph kind="many" /> Dashed means join_many: one{" "}
               <N id={many.from} /> row matches many <N id={many.to} /> rows, so
               total them with the measures defined on <N id={many.to} />, not a
               raw <code>sum()</code>:
            </>
         ),
         code: snippet(many),
      });
   }

   return (
      <Tooltip>
         <TooltipTrigger asChild>
            <button
               type="button"
               aria-label="How to read this diagram"
               className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
               <InfoIcon className="size-3.5" />
            </button>
         </TooltipTrigger>
         <TooltipContent
            side="left"
            align="start"
            sideOffset={12}
            className="w-[22rem] max-w-[calc(100vw-2rem)] space-y-3 border bg-popover p-3.5 leading-relaxed text-pretty text-popover-foreground shadow-lg"
         >
            <div className="space-y-1">
               <p className="text-[13px] font-semibold">
                  How to read this diagram
               </p>
               <p className="text-muted-foreground">
                  One row per source, with{" "}
                  <span className="rounded-sm bg-primary/10 px-1 font-mono font-semibold text-foreground">
                     {entity(centerId)?.name}
                  </span>{" "}
                  highlighted. Data flows down: the tables it is built from are
                  at the top, and what uses it is below.
               </p>
            </div>
            {items.map((item, i) => (
               <div key={i} className="space-y-1">
                  <p>{item.text}</p>
                  {item.code && (
                     <pre className="rounded-md border bg-muted/50 px-2 py-1.5 font-mono text-[10.5px] leading-snug break-all whitespace-pre-wrap">
                        {item.code}
                     </pre>
                  )}
               </div>
            ))}
            <p className="border-t pt-2 text-muted-foreground">
               Hover a row to trace its own lineage; click to open it.
            </p>
         </TooltipContent>
      </Tooltip>
   );
}

/** The first line of a definition, without its annotations. */
function definitionLine(entity: Entity | undefined): string | undefined {
   return entity?.excerpt?.text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
}

type GlyphKind = "one" | "many" | "extends" | "node";

/** A swatch of the diagram, drawn the way the diagram draws it. */
function Glyph({ kind }: { kind: GlyphKind }) {
   return (
      <svg
         width={18}
         height={10}
         aria-hidden
         className="inline-block align-[-1px]"
      >
         {kind === "node" ? (
            <circle
               cx={9}
               cy={5}
               r={3}
               className="fill-card stroke-primary"
               strokeWidth={1.5}
            />
         ) : (
            <path
               d="M3 1V4Q3 8 7 8H16"
               fill="none"
               className="stroke-primary"
               strokeWidth={kind === "extends" ? 2.5 : 1.5}
               strokeDasharray={kind === "many" ? "3 2" : undefined}
               strokeLinecap="round"
            />
         )}
      </svg>
   );
}

function Legend() {
   const item = (label: string, width: number, dash?: string) => (
      <span className="flex items-center gap-1.5">
         <svg width={16} height={6} aria-hidden>
            <line
               x1={1}
               y1={3}
               x2={15}
               y2={3}
               className="stroke-muted-foreground"
               strokeWidth={width}
               strokeDasharray={dash}
               strokeLinecap="round"
            />
         </svg>
         {label}
      </span>
   );
   return (
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
         {item("join_one", 1.25)}
         {item("join_many, fans out", 1.25, "3 2")}
         {item("extends", 2.5)}
      </div>
   );
}
