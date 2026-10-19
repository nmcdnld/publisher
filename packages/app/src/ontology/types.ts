// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

export type EntityKind =
   | "source"
   | "dimension"
   | "measure"
   | "join"
   | "view"
   | "query"
   | "given";

/**
 * One page of the dictionary. Ids are `<modelPath>:<source>` for a source,
 * `<modelPath>:<source>.<field>` for anything declared in a source,
 * `<modelPath>:<query>` for a named query and `given:<NAME>` for a given.
 * `modelPath` is the file the thing is DEFINED in, so a source imported into
 * five models is still one page.
 */
export interface Entity {
   id: string;
   kind: EntityKind;
   name: string;
   modelPath: string;
   /** The source a field belongs to (its id), for every kind but source, query and given. */
   sourceId?: string;
   sourceName?: string;
   dataType?: string;
   doc?: string;
   label?: string;
   /** Annotation lines other than `#(doc)` and `# label`, e.g. `# currency`. */
   tags: string[];
   /** The expression, for a dimension or measure with one. */
   formula?: string;
   /** The definition as written, annotations included. */
   excerpt?: Excerpt;
   persisted?: boolean;
   authorized?: string;

   // Sources
   table?: string;
   connection?: string;
   primaryKey?: string;
   /** The source this one extends, by entity id, when it is defined as `x is y extend {...}`. */
   extendsId?: string;
   /** Fields declared here (ids), in declaration order. */
   fieldIds?: string[];
   /** Count of fields inherited from the base source or the table. */
   inheritedFieldCount?: number;

   // Joins
   relationship?: string;
   /** The joined source's entity id. */
   joinTargetId?: string;

   // Givens
   given?: {
      type?: string;
      control?: string;
      default?: string;
      label?: string;
   };

   /** Entities this one's definition references (ids). */
   uses: string[];
   /** Inverse of `uses`. */
   usedBy: string[];
   /** Textual mentions in other files: dashboards, notebooks, data apps, other models. */
   mentions: Mention[];
}

export interface Excerpt {
   modelPath: string;
   /** 0-based, inclusive. */
   startLine: number;
   endLine: number;
   text: string;
   /** Leading whitespace of the definition line, for writing a patch. */
   indent: string;
   /** 0-based line the definition itself (not its annotations) starts on. */
   definitionLine: number;
}

export interface Mention {
   file: string;
   kind: "dashboard" | "notebook" | "data app" | "model";
   title?: string;
   lines: number[];
   /** Where the Console opens it, relative to the package. */
   href?: string;
   /** The content item this file is, when it is a dashboard, notebook or data app. */
   contentId?: string;
}

export type ContentKind = "dashboard" | "notebook" | "data app";

/** Something a person opens: a dashboard, a notebook or a data app. */
export interface ContentItem {
   /** `<kind>:<file>`. */
   id: string;
   kind: ContentKind;
   /** Package-relative path of the file. */
   file: string;
   title: string;
   description?: string;
   /** The dashboard's name (its slug), for a dashboard. */
   name?: string;
   /** Where the Console opens it, relative to the package. */
   href: string;
   /** Entities it refers to, sources first. */
   entityIds: string[];
   /** The sources among those, and the sources their fields belong to. */
   sourceIds: string[];
}

export interface Ontology {
   environmentName: string;
   packageName: string;
   description?: string;
   entities: Map<string, Entity>;
   sources: Entity[];
   givens: Entity[];
   queries: Entity[];
   /** Dashboards, notebooks and data apps, in that order. */
   content: ContentItem[];
   models: Array<{ path: string; error?: string }>;
   /** Each model's text as served, by path. */
   files: Map<string, string>;
   stats: OntologyStats;
}

export interface OntologyStats {
   sources: number;
   dimensions: number;
   measures: number;
   joins: number;
   views: number;
   documented: number;
   documentable: number;
}
