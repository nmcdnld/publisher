// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The Publisher REST calls the analyst's tools make. Everything is read-only:
// discovery reads model metadata, and a query is Malloy against a declared
// source, which has no statement that writes.

import type { ColumnUnit, Row, SourceRef } from "@malloy-publisher/app-manifest/analyst/schema";

export interface FieldInfo {
   name: string;
   kind: "dimension" | "measure" | "view";
   type?: string;
   unit?: ColumnUnit;
   label?: string;
   doc?: string;
}

export interface SourceInfo extends SourceRef {
   /** `package/model#source`, the id the tools cite. */
   id: string;
   doc?: string;
   fields: FieldInfo[];
   joins: { name: string; doc?: string; fields: FieldInfo[] }[];
}

interface ApiField {
   kind: string;
   name: string;
   type?: { kind?: string };
   annotations?: { value: string }[];
   schema?: { fields?: ApiField[] };
}
interface ApiSource {
   name: string;
   annotations?: { value: string }[];
   schema?: { fields?: ApiField[] };
}

const tagValue = (annotations: { value: string }[] | undefined, re: RegExp) =>
   annotations?.map((a) => a.value.match(re)?.[1]?.trim()).find(Boolean);

const docOf = (a?: { value: string }[]) =>
   tagValue(a, /^#\(doc\)\s*([\s\S]*)$/);

function unitOf(a?: { value: string }[]): ColumnUnit | undefined {
   const tags = a?.map((x) => x.value) ?? [];
   if (tags.some((t) => /^#\s*currency\b/.test(t))) return "currency";
   if (tags.some((t) => /^#\s*percent\b/.test(t))) return "percent";
   return undefined;
}

function fieldInfo(f: ApiField): FieldInfo | undefined {
   if (f.kind !== "dimension" && f.kind !== "measure" && f.kind !== "view")
      return undefined;
   return {
      name: f.name,
      kind: f.kind,
      type: f.type?.kind?.replace(/_type$/, ""),
      unit: unitOf(f.annotations),
      label: tagValue(f.annotations, /^#\s*label="([^"]+)"/),
      doc: docOf(f.annotations),
   };
}

export const sourceId = (s: SourceRef) => `${s.package}/${s.model}#${s.source}`;

export function parseSourceId(id: string): Omit<SourceRef, "environment"> {
   const m = id.match(/^([^/]+)\/(.+)#(\w+)$/);
   if (!m) throw new Error(`"${id}" is not a source id from list_sources`);
   return { package: m[1], model: m[2], source: m[3] };
}

export class PublisherClient {
   private cache = new Map<string, { at: number; value: Promise<unknown> }>();

   constructor(
      readonly base: string,
      private readonly ttlMs = 60_000,
   ) {}

   private async request<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(`${this.base}/api/v0${path}`, init);
      if (!response.ok) {
         const body = await response.text().catch(() => "");
         let message = body;
         try {
            message =
               (JSON.parse(body) as { message?: string }).message ?? body;
         } catch {
            // Not JSON; the text is the message.
         }
         throw new Error(
            `Publisher answered ${response.status}: ${message.slice(0, 400)}`,
         );
      }
      return (await response.json()) as T;
   }

   private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < this.ttlMs)
         return hit.value as Promise<T>;
      const value = load();
      this.cache.set(key, { at: Date.now(), value });
      value.catch(() => this.cache.delete(key));
      return value;
   }

   private modelPath(env: string, pkg: string, model: string) {
      return `/environments/${encodeURIComponent(env)}/packages/${encodeURIComponent(pkg)}/models/${model
         .split("/")
         .map(encodeURIComponent)
         .join("/")}`;
   }

   /** Every source a model file defines, with field docs, units, and labels. */
   modelSources(
      env: string,
      pkg: string,
      model: string,
   ): Promise<SourceInfo[]> {
      return this.cached(`model:${env}/${pkg}/${model}`, async () => {
         const detail = await this.request<{ sourceInfos?: string[] }>(
            this.modelPath(env, pkg, model),
         );
         return (detail.sourceInfos ?? []).flatMap((raw): SourceInfo[] => {
            let s: ApiSource;
            try {
               s = JSON.parse(raw) as ApiSource;
            } catch {
               return [];
            }
            const fields = s.schema?.fields ?? [];
            const ref = {
               environment: env,
               package: pkg,
               model,
               source: s.name,
            };
            return [
               {
                  ...ref,
                  id: sourceId(ref),
                  doc: docOf(s.annotations),
                  fields: fields.map(fieldInfo).filter((f) => !!f),
                  joins: fields
                     .filter((f) => f.kind === "join")
                     .map((j) => ({
                        name: j.name,
                        doc: docOf(j.annotations),
                        fields: (j.schema?.fields ?? [])
                           .map(fieldInfo)
                           .filter(
                              (f) => !!f && f.kind !== "view",
                           ) as FieldInfo[],
                     })),
               },
            ];
         });
      });
   }

   /** Every model file in every package of an environment. */
   async environmentModels(env: string) {
      const at = `/environments/${encodeURIComponent(env)}/packages`;
      const packages = await this.cached(`packages:${env}`, () =>
         this.request<{ name: string }[]>(at),
      );
      const models = await Promise.all(
         packages.map((p) =>
            this.cached(`models:${env}/${p.name}`, () =>
               this.request<{ path: string; error?: string }[]>(
                  `${at}/${encodeURIComponent(p.name)}/models`,
               ),
            )
               .then((ms) =>
                  ms
                     .filter((m) => !m.error)
                     .map((m) => ({ package: p.name, model: m.path })),
               )
               .catch(() => []),
         ),
      );
      return models.flat();
   }

   async query(
      ref: SourceRef,
      malloy: string,
      {
         givens,
         signal,
      }: { givens?: Record<string, unknown>; signal?: AbortSignal },
   ): Promise<Row[]> {
      const body = await this.request<{ result: string }>(
         `${this.modelPath(ref.environment, ref.package, ref.model)}/query`,
         {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
               query: malloy,
               compactJson: true,
               ...(givens && Object.keys(givens).length ? { givens } : {}),
            }),
            signal,
         },
      );
      const rows = JSON.parse(body.result) as unknown;
      if (!Array.isArray(rows)) throw new Error("Publisher returned no rows");
      return rows.map(flattenRow);
   }
}

/** A nested cell becomes JSON text; the analyst reads flat rows. */
function flattenRow(r: Record<string, unknown>): Row {
   const out: Row = {};
   for (const [k, v] of Object.entries(r)) {
      out[k] =
         v === null ||
         typeof v === "string" ||
         typeof v === "number" ||
         typeof v === "boolean"
            ? v
            : JSON.stringify(v);
   }
   return out;
}
