// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// The analyst's wire protocol: AG-UI `CUSTOM` events on one Server-Sent
// Events stream. End users receive run, status, dataset, metric, and report
// events; admins also receive findings and trace.

import type { ReportSpec } from "@malloy-publisher/app-manifest/analyst/blocks";
import type { GroundingIssue, GroundingResult } from "./grounding";
import type {
   Dataset,
   Findings,
   Metric,
} from "@malloy-publisher/app-manifest/analyst/schema";

export type Phase = "explore" | "present" | "ground" | "repair";
export type Audience = "admin" | "member";

/** How the run was produced: by a model, or by the keyless scripted planner. */
export type RunMode = "model" | "scripted";

export type TraceStep =
   | {
        kind: "iteration";
        id: string;
        phase: Phase;
        index: number;
        model: string;
        tools: string[];
        promptHash?: string;
        at: number;
     }
   | {
        kind: "text" | "reasoning";
        id: string;
        phase: Phase;
        text: string;
        at: number;
     }
   | {
        kind: "tool";
        id: string;
        toolName: string;
        args: unknown;
        ok: boolean;
        durationMs: number;
        resultPreview: string;
        datasetId?: string;
        metricId?: string;
        error?: string;
        at: number;
     }
   | {
        kind: "usage";
        id: string;
        phase: Phase;
        model: string;
        promptTokens: number;
        completionTokens: number;
        costUsd?: number;
        at: number;
     }
   | {
        kind: "grounding";
        id: string;
        ok: boolean;
        dropped: GroundingIssue[];
        at: number;
     }
   | {
        kind: "note";
        id: string;
        level: "info" | "warning" | "error";
        text: string;
        at: number;
     };

export interface RunSummary {
   status: "ok" | "partial" | "failed";
   durationMs: number;
   toolCalls: number;
   queries: number;
   iterations: number;
   costUsd: number;
   reason?: string;
}

export interface AnalystEvents {
   "analyst:run": {
      runId: string;
      mode: RunMode;
      audience: Audience;
      model: string;
   };
   "analyst:status": { phase: Phase; text: string };
   "analyst:dataset": Dataset;
   "analyst:metric": Metric;
   "analyst:findings": Findings;
   /** Raw JSON text of the report as the presenter streams it. */
   "analyst:report-delta": { delta: string };
   /** The grounded report; `partial` when the run stopped early. */
   "analyst:report": {
      report: ReportSpec;
      grounding: GroundingResult;
      partial: boolean;
   };
   "analyst:trace": TraceStep;
   "analyst:summary": RunSummary;
}

export type AnalystEventName = keyof AnalystEvents;

export const ANALYST_EVENTS = [
   "analyst:run",
   "analyst:status",
   "analyst:dataset",
   "analyst:metric",
   "analyst:findings",
   "analyst:report-delta",
   "analyst:report",
   "analyst:trace",
   "analyst:summary",
] as const satisfies readonly AnalystEventName[];

/** Everything else is dropped for an end user's stream. */
export const MEMBER_EVENTS: ReadonlySet<string> = new Set<AnalystEventName>([
   "analyst:run",
   "analyst:status",
   "analyst:dataset",
   "analyst:metric",
   "analyst:report-delta",
   "analyst:report",
   "analyst:summary",
]);

export interface AnalystRequest {
   question: string;
   /** Overrides the analyst's explorer model. */
   model?: string;
   /**
    * Earlier turns of this thread, for follow-ups, with numbers already
    * written out: a new run can't cite an old run's metric ids.
    */
   history?: { question: string; answer: string; notes?: string[] }[];
   /** The workspace's packages; absent when it shows every package. */
   packages?: string[];
}
