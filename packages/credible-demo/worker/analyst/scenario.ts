// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

// POST /api/analyst/scenario answers one Scenario as JSON: the Discover
// briefing, suggested questions and topics for a workspace's packages, written
// by Opus 5.5 from findings an insight run already grounded.

import { chat, type ModelMessage } from "@tanstack/ai";
import {
   createOpenRouterText,
   type OpenRouterTextModelOptions,
} from "@tanstack/ai-openrouter";
import { analystConfig, scopedConfig } from "../../src/analyst/config";
import { INSIGHT_MODEL, topicId } from "../../src/analyst/insights";
import {
   ScenarioSpec,
   type Scenario,
   type ScenarioFinding,
   type ScenarioRequest,
} from "../../src/analyst/scenario";
import type { Topic } from "../../src/data/types";
import { drain, model } from "./agent";
import { parsePackages } from "./insight-route";
import { errorText, traceRecorder } from "./middleware";
import { sourceCatalog } from "./prompts";
import type { PublisherClient } from "./publisher";
import { RunState } from "./run";

const TIMEOUT_MS = 120_000;
const MAX_FINDINGS = 8;

const json = (status: number, body: unknown) =>
   new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
   });

const clip = (s: unknown, n: number) =>
   typeof s === "string" ? s.trim().slice(0, n) : "";

function parseFindings(raw: unknown): ScenarioFinding[] {
   if (!Array.isArray(raw)) return [];
   return raw.slice(0, MAX_FINDINGS).flatMap((x): ScenarioFinding[] => {
      const f = (x ?? {}) as Partial<ScenarioFinding>;
      const d = f.delta;
      if (!clip(f.headline, 1) || !d || typeof d.value !== "number") return [];
      return [
         {
            headline: clip(f.headline, 200),
            narrative: clip(f.narrative, 600),
            label: clip(f.label, 60),
            delta: {
               value: d.value,
               unit: d.unit === "pp" ? "pp" : "percent",
               period: d.period,
               polarity:
                  d.polarity === "down_is_good" ? "down_is_good" : "up_is_good",
            },
            topics: Array.isArray(f.topics)
               ? f.topics.map((t) => topicId(String(t))).filter(Boolean)
               : [],
         },
      ];
   });
}

const numbersIn = (text: string) =>
   [...text.replace(/(\d),(\d)/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map(
      (m) => m[0],
   );

/** Numbers in the summary that no finding states. */
function unsupported(summary: string, findings: ScenarioFinding[]) {
   const known = new Set(
      findings.flatMap((f) => numbersIn(`${f.headline} ${f.narrative}`)),
   );
   return numbersIn(summary).filter((n) => !known.has(n));
}

/** What the Discover page shows when the model's summary can't be kept. */
const plainSummary = (findings: ScenarioFinding[]) =>
   findings
      .slice(0, 2)
      .map((f) => f.headline.replace(/\.?$/, "."))
      .join(" ");

const systemPrompt = (catalog: string, body: ScenarioRequest) =>
   `You set the scene for a demo of an analytics home page. The workspace${body.workspace ? `, "${body.workspace}",` : ""} reads only the Malloy sources below, and the people using it ${body.focus ? `are: ${body.focus}` : "are the team that owns this data"}.${body.topics?.length ? ` They already follow these topics; reuse them where they fit: ${body.topics.join(", ")}.` : ""}

Write for them, in their vocabulary, not the field names'. Never invent a number: the summary may only restate numbers that appear in the findings you are given, and when there are no findings the summary and highlights are empty. Questions must be answerable from these sources.

${catalog}`;

function finish(
   spec: ScenarioSpec,
   findings: ScenarioFinding[],
): Omit<Scenario, "model" | "costUsd"> {
   const used = new Set<number>();
   const highlights = spec.highlights
      .filter((h) => {
         const ok = findings[h.finding] && !used.has(h.finding);
         used.add(h.finding);
         return ok;
      })
      .slice(0, 3)
      .map((h) => ({
         label: clip(h.label, 40) || findings[h.finding].label,
         delta: findings[h.finding].delta,
      }));
   const summary =
      spec.summary.trim() &&
      spec.summary.length <= 360 &&
      !unsupported(spec.summary, findings).length
         ? spec.summary.trim()
         : plainSummary(findings);

   const topics = new Map<string, Topic>();
   for (const t of spec.topics) {
      const id = topicId(t.id);
      if (id && !topics.has(id))
         topics.set(id, {
            id,
            label: clip(t.label, 30) || id.replace(/-/g, " "),
            description: clip(t.description, 80),
         });
   }
   for (const id of findings.flatMap((f) => f.topics)) {
      if (!topics.has(id))
         topics.set(id, { id, label: id.replace(/-/g, " "), description: "" });
   }

   return {
      whatChanged: findings.length
         ? {
              summary,
              highlights: highlights.length
                 ? highlights
                 : findings
                      .slice(0, 3)
                      .map((f) => ({ label: f.label, delta: f.delta })),
              asOf: new Date().toISOString(),
           }
         : null,
      suggestedQuestions: spec.questions
         .map((q) => clip(q, 90))
         .filter(Boolean)
         .slice(0, 5),
      topics: [...topics.values()].slice(0, 8),
   };
}

export async function startScenario(
   request: Request,
   key: string | undefined,
   publisher: PublisherClient,
): Promise<Response> {
   let body: ScenarioRequest;
   try {
      const raw = (await request.json()) as Partial<ScenarioRequest>;
      body = {
         packages: parsePackages(raw.packages),
         workspace: clip(raw.workspace, 80) || undefined,
         focus: clip(raw.focus, 500),
         findings: parseFindings(raw.findings),
         topics: Array.isArray(raw.topics)
            ? raw.topics
                 .slice(0, 12)
                 .map((t) => clip(t, 40))
                 .filter(Boolean)
            : [],
      };
   } catch {
      return json(400, { error: "Body must be JSON" });
   }
   if (!key) {
      return json(503, {
         error: "Writing a scenario needs OPENROUTER_API_KEY on the Worker",
      });
   }

   const run = new RunState(
      body.focus || "Set the scene for this workspace",
      publisher,
      "member",
      "model",
      () => {},
      {},
      scopedConfig(analystConfig, body.packages),
   );
   const abort = new AbortController();
   request.signal.addEventListener("abort", () => abort.abort("cancelled"));
   const timer = setTimeout(() => abort.abort("time limit"), TIMEOUT_MS);
   try {
      const catalog = await run.catalog();
      if (!catalog.length) {
         return json(422, {
            error: "None of this workspace's packages has a source to read",
         });
      }
      const adapter = createOpenRouterText(model(INSIGHT_MODEL), key, {
         appTitle: "Credible demo scenarios",
      });
      const modelOptions: OpenRouterTextModelOptions = {
         reasoning: { effort: "medium" },
         sessionId: run.id,
      };
      const findings = body.findings
         .map(
            (f, i) =>
               `${i}. ${f.headline} (${f.label}; topics: ${f.topics.join(", ") || "none"})\n   ${f.narrative}`,
         )
         .join("\n");
      const once = async (messages: ModelMessage[]) => {
         let captured: unknown;
         const stream = chat({
            adapter,
            modelOptions,
            systemPrompts: [systemPrompt(sourceCatalog(catalog), body)],
            messages,
            outputSchema: ScenarioSpec,
            stream: true,
            middleware: [traceRecorder("present", (o) => (captured = o))],
            context: { run, user: { id: "local", audience: "member" } },
            abortController: abort,
         });
         await drain(run, stream);
         return ScenarioSpec.parse(captured);
      };
      const ask: ModelMessage = {
         role: "user",
         content: findings
            ? `Findings, already checked against the data:\n${findings}`
            : "There are no findings yet.",
      };
      let spec = await once([ask]);
      const bad = unsupported(spec.summary, body.findings);
      const problems = [
         bad.length &&
            `Your summary used ${bad.join(", ")}, which no finding states; use only the findings' numbers.`,
         spec.summary.length > 360 &&
            `Your summary is ${spec.summary.length} characters; keep it under 260.`,
      ].filter(Boolean);
      if (problems.length) {
         spec = await once([
            ask,
            {
               role: "user",
               content: `${problems.join(" ")} Return the whole scenario again.`,
            },
         ]).catch(() => spec);
      }
      const scenario: Scenario = {
         ...finish(spec, body.findings),
         model: INSIGHT_MODEL,
         costUsd: run.costUsd,
      };
      return json(200, scenario);
   } catch (e) {
      return json(502, {
         error: abort.signal.aborted
            ? `The scenario writer stopped: ${String(abort.signal.reason)}`
            : errorText(e),
      });
   } finally {
      clearTimeout(timer);
   }
}
