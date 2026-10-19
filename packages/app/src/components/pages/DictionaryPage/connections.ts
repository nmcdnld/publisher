// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type {
   ContentItem,
   Entity,
   Mention,
   Ontology,
} from "../../../ontology/types";
import { relatedContent } from "./content";

/** How a neighbor is connected, which decides how its edge is drawn. */
export type Relation =
   | "extends"
   | "join"
   | "given"
   | "reference"
   | "indirect"
   | "content"
   | "mention";

export type ConnectionNode = { key: string; note?: string } & (
   | { type: "entity"; entity: Entity }
   | { type: "content"; item: ContentItem }
   | { type: "file"; mention: Mention }
);

export interface ConnectionGroup {
   key: string;
   label: string;
   relation: Relation;
   nodes: ConnectionNode[];
}

export interface Connections {
   uses: ConnectionGroup[];
   usedBy: ConnectionGroup[];
   total: number;
}

const KIND_ORDER: Record<Entity["kind"], number> = {
   source: 0,
   query: 1,
   view: 2,
   measure: 3,
   dimension: 4,
   join: 5,
   given: 6,
};

type Spec = readonly [key: string, label: string, relation: Relation];

const USES: Spec[] = [
   ["built-on", "Built on", "extends"],
   ["joins", "Joins", "join"],
   ["sources", "Sources", "reference"],
   ["queries", "Queries", "reference"],
   ["fields", "Fields and views", "reference"],
   ["givens", "Givens", "given"],
];

const USED_BY: Spec[] = [
   ["extended-by", "Extended by", "extends"],
   ["joined-by", "Joined by", "join"],
   ["sources", "Used by sources", "reference"],
   ["queries", "Used by queries", "reference"],
   ["fields", "Used by fields and views", "reference"],
   ["givens", "Used by givens", "given"],
   ["indirect", "Through its fields", "indirect"],
   ["content", "Dashboards, notebooks and apps", "content"],
   ["files", "Also named in", "mention"],
];

/**
 * Everything an entity is connected to, in both directions: what its
 * definition names, what names it, the content that shows it and the other
 * files that mention it, grouped by how they are connected.
 */
export function connectionsOf(ontology: Ontology, entity: Entity): Connections {
   const get = (id: string) => ontology.entities.get(id);
   const groups = (specs: Spec[]) =>
      new Map(
         specs.map(([key, label, relation]) => [
            key,
            { key, label, relation, nodes: [] } as ConnectionGroup,
         ]),
      );
   const add = (
      into: Map<string, ConnectionGroup>,
      key: string,
      e: Entity,
      note?: string,
   ) =>
      into.get(key)!.nodes.push({ type: "entity", key: e.id, entity: e, note });
   const joinNote = (join: Entity) =>
      join.relationship ? `join_${join.relationship}` : undefined;

   const joinsOf = (source: Entity) =>
      (source.fieldIds ?? [])
         .map(get)
         .filter((f): f is Entity => f?.kind === "join");
   const ownJoins =
      entity.kind === "source"
         ? joinsOf(entity)
         : entity.kind === "join"
           ? [entity]
           : [];

   const uses = groups(USES);
   for (const id of entity.uses) {
      const e = get(id);
      if (!e) continue;
      const join = ownJoins.find((j) => j.joinTargetId === id);
      if (id === entity.extendsId) add(uses, "built-on", e);
      else if (join) {
         add(
            uses,
            "joins",
            e,
            join.name === e.name || entity.kind === "join"
               ? joinNote(join)
               : `as ${join.name}`,
         );
      } else if (e.kind === "given") add(uses, "givens", e);
      else if (e.kind === "source") add(uses, "sources", e);
      else if (e.kind === "query") add(uses, "queries", e);
      else add(uses, "fields", e);
   }

   const usedBy = groups(USED_BY);
   const direct = new Set(entity.usedBy);
   for (const id of entity.usedBy) {
      const e = get(id);
      if (!e) continue;
      if (e.extendsId === entity.id) add(usedBy, "extended-by", e);
      else if (e.kind === "join" && e.joinTargetId === entity.id) {
         add(usedBy, "joined-by", e, joinNote(e));
      } else if (
         e.kind === "source" &&
         joinsOf(e).some((j) => j.joinTargetId === entity.id)
      ) {
         // The join itself is listed; the source that declares it says nothing more.
         if (!joinsOf(e).some((j) => direct.has(j.id))) {
            add(usedBy, "joined-by", e);
         }
      } else if (e.kind === "given") add(usedBy, "givens", e);
      else if (e.kind === "source") add(usedBy, "sources", e);
      else if (e.kind === "query") add(usedBy, "queries", e);
      else add(usedBy, "fields", e);
   }

   if (entity.kind === "source") {
      const via = new Map<string, string[]>();
      for (const fid of entity.fieldIds ?? []) {
         const field = get(fid);
         for (const uid of field?.usedBy ?? []) {
            const user = get(uid);
            if (!user || uid === entity.id || direct.has(uid)) continue;
            if (user.sourceId === entity.id) continue;
            via.set(uid, [...(via.get(uid) ?? []), field!.name]);
         }
      }
      for (const [uid, names] of via) {
         add(usedBy, "indirect", get(uid)!, `via ${names.join(", ")}`);
      }
   }

   for (const item of relatedContent(ontology, entity)) {
      usedBy.get("content")!.nodes.push({
         type: "content",
         key: item.id,
         item,
      });
   }
   for (const mention of entity.mentions) {
      if (mention.contentId) continue;
      usedBy.get("files")!.nodes.push({
         type: "file",
         key: `file:${mention.file}`,
         mention,
         note: `${mention.lines.length}×`,
      });
   }

   const finish = (m: Map<string, ConnectionGroup>) =>
      [...m.values()]
         .filter((g) => g.nodes.length)
         .map((g) => ({ ...g, nodes: g.nodes.sort(byKindThenName) }));
   const result = { uses: finish(uses), usedBy: finish(usedBy) };
   const count = (gs: ConnectionGroup[]) =>
      gs.reduce((n, g) => n + g.nodes.length, 0);
   return { ...result, total: count(result.uses) + count(result.usedBy) };
}

function byKindThenName(a: ConnectionNode, b: ConnectionNode): number {
   if (a.type === "entity" && b.type === "entity") {
      return (
         KIND_ORDER[a.entity.kind] - KIND_ORDER[b.entity.kind] ||
         a.entity.id.localeCompare(b.entity.id)
      );
   }
   return nodeLabel(a).localeCompare(nodeLabel(b));
}

export function nodeLabel(node: ConnectionNode): string {
   if (node.type === "content") return node.item.title;
   if (node.type === "file") return node.mention.title ?? node.mention.file;
   const e = node.entity;
   if (e.kind === "given") return `$${e.name}`;
   return e.sourceName && e.kind !== "source"
      ? `${e.sourceName}.${e.name}`
      : e.name;
}
