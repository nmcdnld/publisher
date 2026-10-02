// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   MEMBER_EVENTS,
   type AnalystEventName,
   type AnalystEvents,
   type Audience,
   type RunMode,
   type TraceStep,
} from "../../src/analyst/events";
import { analystConfig, type AnalystConfig } from "../../src/analyst/config";
import type {
   Dataset,
   Findings,
   Metric,
} from "@malloy-publisher/app-manifest/analyst/schema";
import type { PublisherClient, SourceInfo } from "./publisher";

export type Emit = <N extends AnalystEventName>(
   name: N,
   value: AnalystEvents[N],
) => void;

/** Whether an event may reach this audience. Enforced here, server-side. */
export const allowedFor = (audience: Audience, name: string) =>
   audience === "admin" || MEMBER_EVENTS.has(name);

let seq = 0;
const uid = (prefix: string) =>
   `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * One analyst run: the datasets and metrics its tools produced, its budget
 * counters, and the outbound event channel. Tools and middleware reach it
 * through the chat's runtime `context`, never through model-visible arguments.
 */
export class RunState {
   readonly id = uid("run");
   readonly started = Date.now();
   readonly datasets = new Map<string, Dataset>();
   readonly metrics = new Map<string, Metric>();
   /** Every tool's field hints, by source id, for units and labels. */
   readonly sourceCache = new Map<string, SourceInfo>();
   findings?: Findings;
   toolCalls = 0;
   queries = 0;
   iterations = 0;
   costUsd = 0;
   private nextDataset = 1;
   private nextMetric = 1;
   private nextStep = 1;

   constructor(
      readonly question: string,
      readonly publisher: PublisherClient,
      readonly audience: Audience,
      readonly mode: RunMode,
      private readonly sink: (name: string, value: unknown) => void,
      /** Row-level scopes from the session, forwarded as Publisher givens. */
      readonly givens: Record<string, unknown> = {},
      readonly config: AnalystConfig = analystConfig,
   ) {}

   /** Pushes an event straight to the stream, if this audience may see it. */
   emit: Emit = (name, value) => {
      if (allowedFor(this.audience, name)) this.sink(name, value);
   };

   trace(step: DistributiveOmit<TraceStep, "id" | "at"> & { id?: string }) {
      this.emit("analyst:trace", {
         ...step,
         id: step.id ?? this.stepId(),
         at: Date.now(),
      } as TraceStep);
   }

   stepId = () => `s${this.nextStep++}`;
   datasetId = () => `ds${this.nextDataset++}`;
   metricId = () => `m${this.nextMetric++}`;

   get elapsedMs() {
      return Date.now() - this.started;
   }

   /** The sources the analyst may use, read from Publisher. */
   async catalog(): Promise<SourceInfo[]> {
      const {
         environment: env,
         sources: allow,
         packages,
         sourceNames,
      } = this.config;
      // A package `sources` names is curated; with no scope, nothing else is read.
      const curated = (pkg: string) => allow.filter((a) => a.package === pkg);
      const inScope = (pkg: string) =>
         packages
            ? packages.includes(pkg)
            : !allow.length || !!curated(pkg).length;
      const models =
         allow.length && !packages
            ? [
                 ...new Map(
                    allow.map((s) => [`${s.package}/${s.model}`, s]),
                 ).values(),
              ]
            : (await this.publisher.environmentModels(env)).filter(
                 (m) =>
                    inScope(m.package) &&
                    (!curated(m.package).length ||
                       curated(m.package).some((a) => a.model === m.model)),
              );
      const all = (
         await Promise.all(
            models.map((m) =>
               this.publisher
                  .modelSources(env, m.package, m.model)
                  .catch(() => []),
            ),
         )
      ).flat();
      const allowed = all.filter((s) => {
         const c = curated(s.package);
         return (
            inScope(s.package) &&
            (!c.length ||
               c.some((a) => a.model === s.model && a.source === s.source)) &&
            (!sourceNames?.length || sourceNames.includes(s.source))
         );
      });
      for (const s of allowed) this.sourceCache.set(s.id, s);
      return allowed;
   }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
   ? Omit<T, K>
   : never;

export interface AnalystContext {
   run: RunState;
   user: { id: string; audience: Audience };
}
