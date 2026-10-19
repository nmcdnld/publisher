// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type { Entity, Ontology } from "../../../ontology/types";
import { displayName, KIND_META } from "./shared";

/** A dictionary page as markdown, for "Ask about this". */
export function pageMarkdown(
   ontology: Ontology,
   entity: Entity | undefined,
   draftDoc?: string,
): string {
   if (!entity) {
      return [
         `# Package ${ontology.packageName}`,
         ontology.description ?? "",
         "## Sources",
         ...ontology.sources.map(
            (s) =>
               `- \`${s.name}\` (${s.modelPath})${s.doc ? `: ${s.doc}` : ""}`,
         ),
      ].join("\n");
   }
   const name = (id: string) => {
      const e = ontology.entities.get(id);
      return e ? `\`${displayName(e)}\` (${e.kind})` : id;
   };
   const lines = [
      `# ${KIND_META[entity.kind].label} \`${displayName(entity)}\``,
      `Defined in \`${entity.modelPath}\`.`,
      entity.doc
         ? `Description: ${entity.doc}`
         : draftDoc
           ? `Draft description (unreviewed): ${draftDoc}`
           : "No description.",
      entity.dataType ? `Type: ${entity.dataType}` : "",
      entity.excerpt
         ? `Definition:\n\`\`\`malloy\n${entity.excerpt.text}\n\`\`\``
         : "",
      entity.relationship
         ? `Join: ${entity.relationship} to ${name(entity.joinTargetId ?? "")}`
         : "",
      entity.uses.length ? `Uses: ${entity.uses.map(name).join(", ")}` : "",
      entity.usedBy.length
         ? `Used by: ${entity.usedBy.map(name).join(", ")}`
         : "",
      entity.mentions.length
         ? `Mentioned in: ${entity.mentions.map((m) => m.title ?? m.file).join(", ")}`
         : "",
   ];
   if (entity.kind === "source") {
      const fields = (entity.fieldIds ?? [])
         .map((id) => ontology.entities.get(id))
         .filter(Boolean) as Entity[];
      lines.push(
         "Fields:",
         ...fields.map(
            (f) => `- ${f.kind} \`${f.name}\`${f.doc ? `: ${f.doc}` : ""}`,
         ),
      );
   }
   return lines.filter(Boolean).join("\n");
}
