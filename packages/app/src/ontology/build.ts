// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import type {
   ContentItem,
   ContentKind,
   Entity,
   EntityKind,
   Excerpt,
   Mention,
   Ontology,
} from "./types";

/** One model as `GET …/models/{path}` returns it. */
export interface ModelInput {
   path: string;
   modelDef?: string;
   sourceText?: string;
   givens?: Array<{
      name: string;
      type?: string;
      label?: string;
      description?: string;
      control?: string;
      default?: string;
   }>;
   error?: string;
}

/** A dashboard, notebook or data app, with the text that says what it uses. */
export interface ContentInput {
   kind: ContentKind;
   file: string;
   title: string;
   description?: string;
   name?: string;
   href: string;
   /** Its source: the `.malloy` file, the notebook's cells, the app's HTML. */
   text?: string;
}

interface Location {
   url: string;
   range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
   };
}

interface FieldDef {
   name: string;
   as?: string;
   type: string;
   expressionType?: string;
   join?: string;
   code?: string;
   sourceID?: string;
   location?: Location;
   annotations?: {
      notes?: Array<{ text: string }>;
      blockNotes?: Array<{ text: string }>;
   };
   pipeline?: unknown[];
}

interface ContentDef {
   type: string;
   name: string;
   as?: string;
   fields?: FieldDef[];
   location?: Location;
   primaryKey?: string;
   tablePath?: string;
   connection?: string;
   filterList?: Array<{ code?: string }>;
   annotations?: FieldDef["annotations"];
}

interface ModelDef {
   contents: Record<string, ContentDef>;
   imports?: Array<{ location?: { url?: string } }>;
}

const MIN_MENTION_LENGTH = 3;

export function buildOntology(input: {
   environmentName: string;
   packageName: string;
   description?: string;
   models: ModelInput[];
   content: ContentInput[];
}): Ontology {
   const entities = new Map<string, Entity>();
   const parsed = input.models.map((m) => ({
      ...m,
      def: safeParse<ModelDef>(m.modelDef),
   }));
   const root = packageRoot(parsed);
   const relPath = (url?: string) =>
      url && root && url.startsWith(root) ? url.slice(root.length) : undefined;
   const linesByPath = new Map(
      parsed
         .filter((m) => m.sourceText !== undefined)
         .map((m) => [m.path, m.sourceText!.split("\n")]),
   );

   /** Source ids by the source's name, for resolving `x is y extend`. */
   const sourceIdsByName = new Map<string, string[]>();
   const queryIdsByName = new Map<string, string[]>();
   /** A source's own text outside its fields' definitions: `where:`, `primary_key:`, the header. */
   const sourceBodies = new Map<string, string>();
   /** What the compiled model says a field references, which holds even where its file's text is not served. */
   const compiledRefs = new Map<string, string>();
   const pendingExtends: Array<{ entity: Entity; baseName: string }> = [];

   for (const model of parsed) {
      if (!model.def) continue;
      for (const [key, content] of Object.entries(model.def.contents)) {
         const defPath = relPath(content.location?.url) ?? model.path;
         const lines = linesByPath.get(defPath);
         if (content.fields && content.location) {
            const id = `${defPath}:${key}`;
            if (entities.has(id)) continue;
            const source = buildSource(id, key, defPath, content, lines);
            entities.set(id, source.entity);
            sourceBodies.set(id, source.body);
            sourceIdsByName.set(key, [...(sourceIdsByName.get(key) ?? []), id]);
            if (source.baseName) {
               pendingExtends.push({
                  entity: source.entity,
                  baseName: source.baseName,
               });
            }
            for (const field of source.fields) {
               field.joinTargetId = field.joinTargetId
                  ? toEntityId(field.joinTargetId, relPath)
                  : undefined;
               entities.set(field.id, field);
            }
            for (const [fieldId, refs] of source.refs) {
               compiledRefs.set(fieldId, refs);
            }
         } else if (content.type === "query" && content.location) {
            const id = `${defPath}:${key}`;
            if (entities.has(id)) continue;
            const excerpt = lines
               ? excerptOf(defPath, lines, content.location)
               : undefined;
            const notes = annotationsFor(lines, content.location, excerpt);
            queryIdsByName.set(key, [...(queryIdsByName.get(key) ?? []), id]);
            entities.set(id, {
               id,
               kind: "query",
               name: key,
               modelPath: defPath,
               excerpt,
               ...notes,
               uses: [],
               usedBy: [],
               mentions: [],
            });
         }
      }
      for (const given of model.givens ?? []) {
         const id = `given:${given.name}`;
         if (entities.has(id)) continue;
         entities.set(id, {
            id,
            kind: "given",
            name: given.name,
            modelPath: model.path,
            dataType: given.type,
            doc: given.description,
            label: given.label,
            tags: [],
            given: {
               type: given.type,
               control: given.control,
               default: given.default,
               label: given.label,
            },
            uses: [],
            usedBy: [],
            mentions: [],
         });
      }
   }

   for (const { entity, baseName } of pendingExtends) {
      const candidates = (sourceIdsByName.get(baseName) ?? []).filter(
         (id) => id !== entity.id,
      );
      entity.extendsId = candidates[0];
   }

   linkUses(entities, {
      sourceIdsByName,
      queryIdsByName,
      sourceBodies,
      compiledRefs,
      givenTags: givenDeclarationTags(linesByPath),
   });
   const content = linkMentions(entities, parsed, input.content);

   const all = [...entities.values()];
   const sources = all
      .filter((e) => e.kind === "source")
      .sort((a, b) => a.name.localeCompare(b.name));
   const documentable = all.filter((e) => e.kind !== "given");
   return {
      environmentName: input.environmentName,
      packageName: input.packageName,
      description: input.description,
      entities,
      sources,
      givens: all.filter((e) => e.kind === "given"),
      queries: all.filter((e) => e.kind === "query"),
      content,
      models: input.models.map((m) => ({ path: m.path, error: m.error })),
      files: new Map(
         input.models
            .filter((m) => m.sourceText !== undefined)
            .map((m) => [m.path, m.sourceText!] as const),
      ),
      stats: {
         sources: sources.length,
         dimensions: all.filter((e) => e.kind === "dimension").length,
         measures: all.filter((e) => e.kind === "measure").length,
         joins: all.filter((e) => e.kind === "join").length,
         views: all.filter((e) => e.kind === "view").length,
         documented: documentable.filter((e) => e.doc).length,
         documentable: documentable.length,
      },
   };
}

function buildSource(
   id: string,
   name: string,
   defPath: string,
   content: ContentDef,
   lines: string[] | undefined,
): {
   entity: Entity;
   fields: Entity[];
   baseName?: string;
   body: string;
   refs: Map<string, string>;
} {
   const location = content.location!;
   const { start, end } = location.range;
   const owned = (content.fields ?? []).filter(
      (f) =>
         f.location?.url === location.url &&
         f.location.range.start.line >= start.line &&
         f.location.range.start.line <= end.line,
   );
   const header = lines?.[start.line] ?? "";
   const baseMatch = header.match(
      new RegExp(`\\b${name}\\s+is\\s+([A-Za-z_]\\w*)\\s*(?:extend\\b|->|$)`),
   );
   const baseName =
      baseMatch && !/\.(table|sql)\s*\(/.test(header)
         ? baseMatch[1]
         : undefined;

   // A file whose text is not served still has its annotations compiled in.
   const sourceNotes = lines
      ? annotationsFor(lines, location, undefined)
      : columnNotes(content);
   const fields: Entity[] = [];
   const refs = new Map<string, string>();
   const views = new Set(
      (content.fields ?? [])
         .filter((f) => f.type === "turtle")
         .map((f) => f.as ?? f.name),
   );
   for (const field of owned) {
      const fieldName = field.as ?? field.name;
      const kind = fieldKind(field);
      // A table column's location is the `table()` call, not a definition.
      const isColumn = kind === "dimension" && !field.expressionType;
      const excerpt =
         lines && !isColumn
            ? excerptOf(defPath, lines, field.location!)
            : undefined;
      const notes =
         isColumn || !lines
            ? columnNotes(field)
            : annotationsFor(lines, field.location!, excerpt);
      if (field.pipeline) {
         refs.set(
            `${id}.${fieldName}`,
            pipelineRefs(field.pipeline, views).join("\n"),
         );
      }
      fields.push({
         id: `${id}.${fieldName}`,
         kind,
         name: fieldName,
         modelPath: defPath,
         sourceId: id,
         sourceName: name,
         dataType: kind === "join" || kind === "view" ? undefined : field.type,
         formula: field.code,
         excerpt,
         relationship: field.join,
         joinTargetId: field.sourceID,
         ...notes,
         uses: [],
         usedBy: [],
         mentions: [],
      });
   }

   const entity: Entity = {
      id,
      kind: "source",
      name,
      modelPath: defPath,
      table: content.tablePath,
      connection: content.connection,
      primaryKey: content.primaryKey,
      excerpt: lines ? sourceHeader(defPath, lines, location) : undefined,
      fieldIds: fields.map((f) => f.id),
      inheritedFieldCount: (content.fields ?? []).length - owned.length,
      ...sourceNotes,
      uses: [],
      usedBy: [],
      mentions: [],
   };
   const fieldLines = new Set<number>();
   for (const f of fields) {
      if (!f.excerpt) continue;
      for (let i = f.excerpt.startLine; i <= f.excerpt.endLine; i++) {
         fieldLines.add(i);
      }
   }
   const body = [
      ...(lines ?? [])
         .slice(start.line, end.line + 1)
         .filter((_, i) => !fieldLines.has(start.line + i)),
      ...(content.filterList ?? []).map((f) => f.code ?? ""),
   ].join("\n");
   return { entity, fields, baseName, body, refs };
}

/**
 * Every field path and expression in a compiled view's pipeline. A nested view
 * is inlined there, so a named one counts as its name: what it reads is its
 * own use. An inline `nest: x is { … }` is part of this view, so it is read through.
 */
function pipelineRefs(pipeline: unknown[], views: Set<string>): string[] {
   const out: string[] = [];
   const visit = (node: unknown) => {
      if (Array.isArray(node)) {
         node.forEach(visit);
         return;
      }
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "fieldref" && Array.isArray(n.path)) {
         out.push(n.path.join("."));
      }
      if (
         n.type === "turtle" &&
         typeof n.name === "string" &&
         views.has(n.name)
      ) {
         out.push(n.name);
         return;
      }
      if (typeof n.code === "string") out.push(n.code);
      for (const [key, value] of Object.entries(n)) {
         if (key !== "annotations" && key !== "at" && key !== "location") {
            visit(value);
         }
      }
   };
   visit(pipeline);
   return out;
}

function fieldKind(field: FieldDef): EntityKind {
   if (field.type === "turtle") return "view";
   if (field.join) return "join";
   if (field.expressionType === "aggregate") return "measure";
   return "dimension";
}

/** `name@file:///…/pkg/model.malloy` to `model.malloy:name`. */
function toEntityId(
   sourceID: string,
   relPath: (url?: string) => string | undefined,
): string | undefined {
   const at = sourceID.indexOf("@");
   if (at < 0) return undefined;
   const path = relPath(sourceID.slice(at + 1));
   return path ? `${path}:${sourceID.slice(0, at)}` : undefined;
}

function excerptOf(
   modelPath: string,
   lines: string[],
   location: Location,
): Excerpt {
   const { start, end } = location.range;
   let first = start.line;
   while (first > 0 && isAnnotation(lines[first - 1])) first--;
   const definitionLine = firstNonAnnotation(lines, start.line, end.line);
   return {
      modelPath,
      startLine: first,
      endLine: end.line,
      text: dedent(lines.slice(first, end.line + 1)).join("\n"),
      indent: (lines[definitionLine] ?? "").match(/^\s*/)?.[0] ?? "",
      definitionLine,
   };
}

/** A whole source is long; its page shows the annotations and first lines. */
function sourceHeader(
   modelPath: string,
   lines: string[],
   location: Location,
): Excerpt {
   const full = excerptOf(modelPath, lines, location);
   const endLine = Math.min(location.range.end.line, full.definitionLine + 2);
   return {
      ...full,
      endLine,
      text: dedent(lines.slice(full.startLine, endLine + 1)).join("\n"),
   };
}

function firstNonAnnotation(lines: string[], from: number, to: number) {
   for (let i = from; i <= to; i++) {
      if (!isAnnotation(lines[i])) return i;
   }
   return from;
}

function isAnnotation(line: string | undefined): boolean {
   const trimmed = line?.trim() ?? "";
   return trimmed.startsWith("#") && !trimmed.startsWith("##");
}

/**
 * A table column has no definition text, but one listed in an `include` block
 * carries that block's annotations in the compiled model.
 */
function columnNotes(
   field: Pick<FieldDef, "annotations">,
): Pick<Entity, "doc" | "tags"> {
   const notes = [
      ...(field.annotations?.notes ?? []),
      ...(field.annotations?.blockNotes ?? []),
   ].map((n) => n.text.trim());
   const docs: string[] = [];
   const tags: string[] = [];
   for (const note of notes) {
      const doc = note.match(/^#\(doc\)\s*(.*)$/s);
      if (doc) docs.push(doc[1].replace(/^"(.*)"$/s, "$1"));
      else tags.push(note);
   }
   return { doc: docs.length ? docs.join(" ") : undefined, tags };
}

function annotationsFor(
   lines: string[] | undefined,
   location: Location,
   excerpt: Excerpt | undefined,
): Pick<Entity, "doc" | "label" | "tags" | "persisted" | "authorized"> {
   if (!lines) return { tags: [] };
   const notes: string[] = [];
   const start = excerpt?.startLine ?? location.range.start.line;
   let above = start - 1;
   while (above >= 0 && isAnnotation(lines[above])) {
      notes.unshift(lines[above].trim());
      above--;
   }
   const definitionLine =
      excerpt?.definitionLine ??
      firstNonAnnotation(
         lines,
         location.range.start.line,
         location.range.end.line,
      );
   for (let i = start; i < definitionLine; i++) {
      if (isAnnotation(lines[i]) && !notes.includes(lines[i].trim())) {
         notes.push(lines[i].trim());
      }
   }
   const docs: string[] = [];
   let label: string | undefined;
   let authorized: string | undefined;
   let persisted = false;
   const tags: string[] = [];
   for (const note of notes) {
      const doc = note.match(/^#\(doc\)\s*(.*)$/);
      if (doc) {
         docs.push(doc[1].replace(/^"(.*)"$/, "$1"));
         continue;
      }
      const lbl = note.match(/^#\s*label\s*=\s*"([^"]*)"/);
      if (lbl) {
         label = lbl[1];
         continue;
      }
      if (note.startsWith("#(authorize)")) {
         authorized = note.slice("#(authorize)".length).trim() || "yes";
      }
      if (/^#@\s*persist\b/.test(note)) persisted = true;
      tags.push(note);
   }
   return {
      doc: docs.length ? docs.join(" ") : undefined,
      label,
      tags,
      persisted: persisted || undefined,
      authorized,
   };
}

function dedent(lines: string[]): string[] {
   const indents = lines
      .filter((l) => l.trim())
      .map((l) => l.match(/^\s*/)![0].length);
   const min = indents.length ? Math.min(...indents) : 0;
   return lines.map((l) => l.slice(min));
}

const IDENTIFIER = /\$?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g;

/** `source=`, `query=`, `dimension=`, `given=` and `to=` in a tag, e.g. a given's `suggest { … }` or a `# drill { … }`. */
const TAG_REF = /\b(source|query|dimension|given|to)\s*=\s*"?([A-Za-z_]\w*)"?/g;

interface LinkContext {
   sourceIdsByName: Map<string, string[]>;
   queryIdsByName: Map<string, string[]>;
   sourceBodies: Map<string, string>;
   compiledRefs: Map<string, string>;
   /** The annotation lines on every `given:` declaration, by given id. */
   givenTags: Map<string, string[]>;
}

/** Code with annotations, comments and string contents removed. */
function codeOf(text: string): string {
   return text
      .split("\n")
      .filter((l) => !isAnnotation(l) && !l.trim().startsWith("##"))
      .join("\n")
      .replace(/\/\/.*$/gm, "")
      .replace(/--.*$/gm, "")
      .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
}

/** The annotations above each `given: NAME` declaration, in any model file. */
function givenDeclarationTags(
   linesByPath: Map<string, string[]>,
): Map<string, string[]> {
   const tags = new Map<string, string[]>();
   for (const lines of linesByPath.values()) {
      lines.forEach((line, i) => {
         const name = line.match(/^\s*given:\s*([A-Za-z_]\w*)/)?.[1];
         if (!name) return;
         const id = `given:${name}`;
         const found = tags.get(id) ?? [];
         for (
            let above = i - 1;
            above >= 0 && isAnnotation(lines[above]);
            above--
         ) {
            const note = lines[above].trim();
            if (!found.includes(note)) found.push(note);
         }
         tags.set(id, found);
      });
   }
   return tags;
}

/**
 * Resolve the names each definition references to entity ids: fields and
 * views by name in their source's scope (following joins), other sources and
 * named queries by name, givens by `$NAME`, plus what the structure says
 * outright (a join's target, a source's base) and what its tags name.
 */
function linkUses(entities: Map<string, Entity>, ctx: LinkContext) {
   const fieldsOf = (
      sourceId: string | undefined,
      seen = new Set<string>(),
   ) => {
      const byName = new Map<string, Entity>();
      let current = sourceId ? entities.get(sourceId) : undefined;
      while (current && !seen.has(current.id)) {
         seen.add(current.id);
         for (const fid of current.fieldIds ?? []) {
            const f = entities.get(fid);
            if (f && !byName.has(f.name)) byName.set(f.name, f);
         }
         current = current.extendsId
            ? entities.get(current.extendsId)
            : undefined;
      }
      return byName;
   };

   const fieldCache = new Map<string, Map<string, Entity>>();
   const fieldsCached = (sourceId: string | undefined) => {
      if (!sourceId) return new Map<string, Entity>();
      if (!fieldCache.has(sourceId))
         fieldCache.set(sourceId, fieldsOf(sourceId));
      return fieldCache.get(sourceId)!;
   };

   /** Of several same-named definitions, the one in the referrer's own file. */
   const pick = (ids: string[] | undefined, near: Entity) => {
      const others = (ids ?? []).filter((id) => id !== near.id);
      return (
         others.find((id) => entities.get(id)?.modelPath === near.modelPath) ??
         others[0]
      );
   };
   const sourceNamed = (name: string, near: Entity) =>
      pick(ctx.sourceIdsByName.get(name), near);
   const queryNamed = (name: string, near: Entity) =>
      pick(ctx.queryIdsByName.get(name), near);

   /** `a.b.c` from a scope, following joins; every hop it passes is a use. */
   const walk = (
      scope: Map<string, Entity>,
      parts: string[],
      uses: Set<string>,
   ) => {
      for (const part of parts) {
         const field = scope.get(part);
         if (!field) return;
         uses.add(field.id);
         if (field.kind !== "join") return;
         scope = fieldsCached(field.joinTargetId);
      }
   };

   const merged = (sourceIds: Iterable<string>) => {
      const scope = new Map<string, Entity>();
      for (const id of sourceIds) {
         for (const [name, f] of fieldsCached(id)) {
            if (!scope.has(name)) scope.set(name, f);
         }
      }
      return scope;
   };

   const usesOf = new Map<string, Set<string>>();
   for (const entity of entities.values()) {
      const uses = new Set<string>();
      usesOf.set(entity.id, uses);
      const text =
         (entity.kind === "source"
            ? ctx.sourceBodies.get(entity.id)
            : (entity.excerpt?.text ??
              [entity.formula, ctx.compiledRefs.get(entity.id)]
                 .filter(Boolean)
                 .join("\n"))) ?? "";
      const tokens = [...codeOf(text).matchAll(IDENTIFIER)].map((m) => m[0]);
      // A query has no source of its own; its scope is every source it names.
      const local =
         entity.kind === "query"
            ? merged(
                 tokens.flatMap((t) => {
                    const id = sourceNamed(t.split(".")[0], entity);
                    return id ? [id] : [];
                 }),
              )
            : fieldsCached(
                 entity.kind === "source" ? entity.id : entity.sourceId,
              );

      for (const token of tokens) {
         if (token.startsWith("$")) {
            const given = entities.get(`given:${token.slice(1)}`);
            if (given) uses.add(given.id);
            continue;
         }
         const [head, ...rest] = token.split(".");
         if (local.has(head)) {
            walk(local, [head, ...rest], uses);
            continue;
         }
         const sourceId = sourceNamed(head, entity);
         if (sourceId) {
            uses.add(sourceId);
            walk(fieldsCached(sourceId), rest, uses);
            continue;
         }
         const queryId = queryNamed(head, entity);
         if (queryId) uses.add(queryId);
      }

      if (entity.kind === "join" && entity.joinTargetId) {
         uses.add(entity.joinTargetId);
      }
      if (entity.kind === "source") {
         if (entity.extendsId) uses.add(entity.extendsId);
         for (const fid of entity.fieldIds ?? []) {
            const target = entities.get(fid)?.joinTargetId;
            if (target) uses.add(target);
         }
         // Its own fields are what it declares, not what it uses.
         for (const id of [...uses]) {
            if (entities.get(id)?.sourceId === entity.id) uses.delete(id);
         }
      }
   }

   // Tags last: a `query=` tag reaches the fields of the sources that query uses.
   for (const entity of entities.values()) {
      const uses = usesOf.get(entity.id)!;
      const tags =
         entity.kind === "given"
            ? (ctx.givenTags.get(entity.id) ?? [])
            : entity.tags;
      const own = fieldsCached(
         entity.kind === "source" ? entity.id : entity.sourceId,
      );
      for (const tag of tags) {
         for (const m of tag.matchAll(/\$([A-Za-z_]\w*)/g)) {
            const given = entities.get(`given:${m[1]}`);
            if (given) uses.add(given.id);
         }
         if (tag.startsWith("#(authorize)")) {
            for (const m of codeOf(tag.slice(12)).matchAll(IDENTIFIER)) {
               if (!m[0].startsWith("$")) walk(own, m[0].split("."), uses);
            }
         }
         let scope = own;
         for (const [, key, name] of tag.matchAll(TAG_REF)) {
            if (key === "given") {
               const given = entities.get(`given:${name}`);
               if (given) uses.add(given.id);
            } else if (key === "source") {
               const id = sourceNamed(name, entity);
               if (id) {
                  uses.add(id);
                  scope = fieldsCached(id);
               }
            } else if (key === "query") {
               const id = queryNamed(name, entity);
               if (id) {
                  uses.add(id);
                  scope = merged(
                     [...(usesOf.get(id) ?? [])].filter(
                        (u) => entities.get(u)?.kind === "source",
                     ),
                  );
               }
            } else if (name !== "self") {
               walk(scope, [name], uses);
            }
         }
      }
      uses.delete(entity.id);
      if (entity.sourceId) uses.delete(entity.sourceId);
      entity.uses = [...uses];
   }
   for (const entity of entities.values()) {
      for (const id of entity.uses) entities.get(id)?.usedBy.push(entity.id);
   }
}

interface MentionFile {
   file: string;
   kind: Mention["kind"];
   title?: string;
   href?: string;
   text: string;
   content?: ContentItem;
}

/**
 * Who mentions what, by word: an entity's name appearing in a file. A field's
 * name only counts where its source is named too (the source itself, one built
 * on it, or a join to it), so a field called `region` does not appear in every
 * file that happens to say "region".
 */
function linkMentions(
   entities: Map<string, Entity>,
   models: Array<ModelInput>,
   contentInputs: ContentInput[],
): ContentItem[] {
   const content = contentInputs.map(
      (c): ContentItem => ({
         id: `${c.kind}:${c.file}`,
         kind: c.kind,
         file: c.file,
         title: c.title,
         description: c.description,
         name: c.name,
         href: c.href,
         entityIds: [],
         sourceIds: [],
      }),
   );
   const contentFiles = new Set(contentInputs.map((c) => c.file));
   const files: MentionFile[] = [
      ...contentInputs.flatMap((c, i): MentionFile[] =>
         c.text
            ? [
                 {
                    file: c.file,
                    kind: c.kind,
                    title: c.title,
                    href: c.href,
                    text: c.text,
                    content: content[i],
                 },
              ]
            : [],
      ),
      ...models
         .filter((m) => m.sourceText && !contentFiles.has(m.path))
         .map(
            (m): MentionFile => ({
               file: m.path,
               kind: "model",
               href: m.path,
               text: m.sourceText!,
            }),
         ),
   ];
   const names = sourceNames(entities);
   const indexes = files.map((file) => ({ file, words: wordIndex(file.text) }));
   for (const entity of entities.values()) {
      if (entity.name.length < MIN_MENTION_LENGTH) continue;
      const word = entity.kind === "given" ? `$${entity.name}` : entity.name;
      const anchors = entity.sourceId ? names.get(entity.sourceId) : undefined;
      for (const { file, words } of indexes) {
         if (file.file === entity.modelPath) continue;
         const lines = words.get(word);
         if (!lines?.length) continue;
         if (anchors && ![...anchors].some((name) => words.has(name))) {
            continue;
         }
         entity.mentions.push({
            file: file.file,
            kind: file.kind,
            title: file.title,
            lines,
            href: file.href,
            contentId: file.content?.id,
         });
         if (file.content) {
            file.content.entityIds.push(entity.id);
            const sourceId =
               entity.kind === "source" ? entity.id : entity.sourceId;
            if (sourceId && !file.content.sourceIds.includes(sourceId)) {
               file.content.sourceIds.push(sourceId);
            }
         }
      }
   }
   const order: Record<string, number> = { source: 0, view: 1, measure: 2 };
   for (const item of content) {
      item.entityIds.sort(
         (a, b) =>
            (order[entities.get(a)!.kind] ?? 3) -
            (order[entities.get(b)!.kind] ?? 3),
      );
   }
   return content;
}

/**
 * For each source, the names a file would use to reach its fields: its own,
 * every source built on it, and every join to it.
 */
function sourceNames(entities: Map<string, Entity>) {
   const names = new Map<string, Set<string>>();
   const add = (id: string, name: string) =>
      names.set(id, (names.get(id) ?? new Set()).add(name));
   for (const entity of entities.values()) {
      if (entity.kind === "source") {
         const seen = new Set<string>();
         for (
            let id: string | undefined = entity.id;
            id && !seen.has(id);
            id = entities.get(id)?.extendsId
         ) {
            seen.add(id);
            add(id, entity.name);
         }
      } else if (entity.kind === "join" && entity.joinTargetId) {
         add(entity.joinTargetId, entity.name);
      }
   }
   return names;
}

function wordIndex(text: string): Map<string, number[]> {
   const index = new Map<string, number[]>();
   text.split("\n").forEach((line, i) => {
      for (const match of line.matchAll(/\$?[A-Za-z_]\w*/g)) {
         const lines = index.get(match[0]) ?? [];
         if (lines[lines.length - 1] !== i) lines.push(i);
         index.set(match[0], lines);
      }
   });
   return index;
}

function packageRoot(models: Array<ModelInput & { def?: ModelDef }>) {
   for (const model of models) {
      // A model that only imports and exports defines nothing of its own;
      // its import statements still carry its URL.
      const urls = [
         ...Object.values(model.def?.contents ?? {}).map(
            (c) => c.location?.url,
         ),
         ...(model.def?.imports ?? []).map((i) => i.location?.url),
      ];
      for (const url of urls) {
         if (url?.endsWith(`/${model.path}`)) {
            return url.slice(0, url.length - model.path.length);
         }
      }
   }
   return undefined;
}

function safeParse<T>(json: string | undefined): T | undefined {
   if (!json) return undefined;
   try {
      return JSON.parse(json) as T;
   } catch {
      return undefined;
   }
}
