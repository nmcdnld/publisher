import {
   boolean,
   chat,
   choice,
   decide,
   streamToText,
   toServerSentEventsResponse,
   type UIMessage,
   type ModelMessage,
} from "@tanstack/ai";
import { z } from "zod";
import { runAsk } from "./dictionary";
import type { Env, PackageScope } from "./env";
import { defaultModel, HttpError, jev, maxTokens, textModel } from "./models";
import {
   getContext,
   publisherReachable,
   type RetrievedSource,
   type SearchTarget,
} from "./publisher";

const CONCEPT_TYPES = [
   "source",
   "measure",
   "dimension",
   "view",
   "dimensional_value",
] as const;

export const QuestionSetSchema = z.object({
   domain: z.string().meta({
      description:
         "The business domain in one to three words, such as 'ecommerce' or 'fantasy football'",
   }),
   questions: z.array(
      z.object({
         text: z.string().meta({
            description: "The question, worded the way a stakeholder asks it",
         }),
         persona: z.string().meta({
            description: "Who asks it, such as 'CFO' or 'merchandiser'",
         }),
         category: z.string().meta({
            description:
               "A short theme shared by several questions, such as 'Revenue' or 'Retention'",
         }),
         concepts: z
            .array(
               z.object({
                  type: z.enum(CONCEPT_TYPES),
                  text: z.string().meta({
                     description:
                        "The business concept in plain words, not a field name",
                  }),
               }),
            )
            .meta({
               description:
                  "The two to five concepts a data model needs to answer the question",
            }),
      }),
   ),
});

export interface QuestionsRequest {
   scope: PackageScope;
   description?: string;
   sources: Array<{ name: string; doc?: string }>;
   count: number;
   focus?: string;
   /** Questions already in the set, which the new ones add to. */
   existing?: Array<{ text: string; category: string }>;
}

const EXISTING_LIMIT = 300;

/** Streams a question set; the client reads it with useChat({ outputSchema }). */
export function streamQuestions(
   env: Env,
   messages: Array<UIMessage | ModelMessage>,
   request: QuestionsRequest,
   abortController: AbortController,
): Response {
   const count = Math.min(Math.max(request.count || 60, 10), 300);
   const existing = request.existing ?? [];
   const sourceList = request.sources
      .map((s) => `- ${s.name}${s.doc ? `: ${s.doc}` : ""}`)
      .join("\n");
   const stream = chat({
      adapter: textModel(env),
      messages,
      systemPrompts: [
         [
            "You write realistic business questions that people in an organization would ask an analytics assistant.",
            `The package is "${request.scope.package}". ${request.description ?? ""}`,
            `Its top-level tables, to tell you the domain (not to limit you):\n${sourceList}`,
            `Write exactly ${count} distinct questions across 6 to 10 categories and several personas.`,
            "Ask what a real stakeholder in this domain would want to know, whether or not the tables above could answer it: include questions a model of this kind usually covers, questions at its edges, and questions that need data it plausibly lacks (costs, targets, marketing, inventory, sentiment, forecasts and so on, as fits the domain).",
            "Mix simple lookups, breakdowns, trends over time, comparisons, rankings, ratios and cohort-style questions.",
            "For each question list the concepts it needs, typed as a measure (something you aggregate), a dimension (something you group or filter by), a source (an entity or table), a view (a standard report) or a dimensional_value (a specific value such as a region name).",
            request.focus ? `Focus: ${request.focus}` : "",
            existing.length
               ? [
                    `These ${count} questions add to a set that already has the ${existing.length} below. Do not repeat or rephrase any of them. Reuse their categories, spelled exactly, wherever a new question fits one; start a new category only for a theme none of them covers.`,
                    `Existing categories: ${[...new Set(existing.map((q) => q.category))].join(", ")}`,
                    existing
                       .slice(-EXISTING_LIMIT)
                       .map((q) => `- [${q.category}] ${q.text}`)
                       .join("\n"),
                 ].join("\n\n")
               : "",
         ]
            .filter(Boolean)
            .join("\n\n"),
      ],
      outputSchema: QuestionSetSchema,
      stream: true,
      abortController,
      modelOptions: maxTokens(Math.min(1500 + count * 110, 32000)),
   });
   return toServerSentEventsResponse(stream, { abortController });
}

export interface CatalogSource extends RetrievedSource {
   doc?: string;
}

export interface ClassifyRequest {
   scope: PackageScope;
   catalog: CatalogSource[];
   questions: Array<{
      id: string;
      text: string;
      concepts: Array<{ type: SearchTarget["target_type"]; text: string }>;
   }>;
}

export type CoverageStatus = "answerable" | "partial" | "missing";

export interface Classification {
   id: string;
   status: CoverageStatus;
   confidence: number;
   probabilities: Record<CoverageStatus, number>;
   concepts: Array<{ type: string; text: string; present: number }>;
   retrieval: "get_context" | "lexical";
   retrieved: Array<{ model: string; source: string; fields: string[] }>;
   judge: "jev" | "opus" | "agent" | "transcript";
   /** Why Jev did not judge this one, when it fell back to Opus. */
   judgeNote?: string;
   /** The agent's reply, for an `agent` verdict. */
   answer?: string;
   model?: string;
   ms: number;
   error?: string;
}

export interface CheckRequest {
   scope: PackageScope;
   model?: string;
   question: ClassifyRequest["questions"][number] & {
      persona?: string;
      category?: string;
   };
}

const VERDICT =
   /\*\*Verdict:?\*\*:?\s*\**\s*(answerable|partial(?:ly answerable)?|missing)/gi;
const ANSWER_LIMIT = 12_000;

/**
 * One question judged the way "Re-run as chat" judges it: the `/ask` agent
 * answers it with Publisher's tools and skills, then closes with a verdict.
 */
export async function checkQuestion(
   env: Env,
   request: CheckRequest,
): Promise<Classification> {
   const started = Date.now();
   const { question } = request;
   const concepts = question.concepts.slice(0, MAX_CONCEPTS);
   const { stream, grounded } = await runAsk(
      env,
      [{ role: "user", content: question.text }],
      {
         scope: request.scope,
         model: request.model,
         coverage: {
            question: question.text,
            persona: question.persona,
            category: question.category,
            concepts,
         },
      },
      new AbortController(),
   );
   if (!grounded) {
      throw new HttpError(503, "Publisher's MCP endpoint is unreachable");
   }
   const text = await streamToText(stream);
   const verdicts = [...text.matchAll(VERDICT)];
   const word = verdicts.at(-1)?.[1].toLowerCase();
   if (!word) {
      throw new HttpError(502, "The agent finished without a verdict");
   }
   const status: CoverageStatus = word.startsWith("partial")
      ? "partial"
      : (word as CoverageStatus);
   const verdictSection = text.slice(text.lastIndexOf("### Verdict"));
   return {
      id: question.id,
      status,
      confidence: 1,
      probabilities: {
         answerable: status === "answerable" ? 1 : 0,
         partial: status === "partial" ? 1 : 0,
         missing: status === "missing" ? 1 : 0,
      },
      concepts: conceptsFromVerdict(verdictSection, concepts),
      retrieval: "get_context",
      retrieved: [],
      judge: "agent",
      answer:
         text.length > ANSWER_LIMIT ? `…${text.slice(-ANSWER_LIMIT)}` : text,
      model: request.model ?? defaultModel(env),
      ms: Date.now() - started,
   };
}

/**
 * Read the verdict's ✅/❌ bullets back onto the needed concepts: by position
 * when there is one bullet per concept, else by name. `present` is -1 for a
 * concept the verdict did not mention.
 */
function conceptsFromVerdict(
   section: string,
   concepts: CheckRequest["question"]["concepts"],
): Classification["concepts"] {
   const bullets = section
      .split("\n")
      .filter((line) => /^\s*[-*]/.test(line) && /[✅❌]/u.test(line))
      .map((line) => ({
         present: line.includes("✅") ? 1 : 0,
         text: line.toLowerCase(),
      }));
   return concepts.map((c, i) => {
      const named = bullets.find((b) => b.text.includes(c.text.toLowerCase()));
      const bullet = bullets.length === concepts.length ? bullets[i] : named;
      return { ...c, present: bullet?.present ?? -1 };
   });
}

export interface EvaluateRequest {
   scope: PackageScope;
   model?: string;
   question: string;
   /** The user's earlier turns in the same chat, oldest first. */
   earlier?: string[];
   /** The reply to `question` as Markdown, with the tools it called. */
   answer: string;
   /** Themes the package's coverage already uses, to file the question under. */
   categories?: string[];
}

const EvaluationSchema = z.object({
   analytical: z.boolean().meta({
      description:
         "True when the message asks something about the business the data describes. False for greetings, thanks, instructions about formatting, and questions about this tool, the page, or the model's code rather than the business.",
   }),
   persona: z.string().meta({
      description: "Who plausibly asks it, such as 'CFO' or 'merchandiser'",
   }),
   category: z.string().meta({
      description:
         "A short theme, such as 'Revenue' or 'Retention'; one of the existing categories, spelled exactly, whenever it fits",
   }),
   status: z.enum(["answerable", "partial", "missing"]),
   confidence: z.number().meta({ description: "0 to 1" }),
   concepts: z
      .array(
         z.object({
            type: z.enum(CONCEPT_TYPES),
            text: z.string().meta({
               description:
                  "The business concept in plain words, not a field name",
            }),
            present: z.boolean().meta({
               description:
                  "Did the answer find a field that represents it, or compute it from one in a step?",
            }),
         }),
      )
      .meta({
         description:
            "The two to five concepts a data model needs to answer the question",
      }),
});

export type Evaluation =
   | { analytical: false }
   | {
        analytical: true;
        persona: string;
        category: string;
        concepts: Array<{ type: string; text: string }>;
        result: Classification;
     };

/**
 * A question asked in the Ask window, judged from the answer the chat already
 * gave: what the agent's tools found decides coverage, so nothing is re-run.
 */
export async function evaluateAsked(
   env: Env,
   request: EvaluateRequest,
): Promise<Evaluation> {
   const started = Date.now();
   const categories = request.categories ?? [];
   const result = await chat({
      adapter: textModel(env, request.model),
      messages: [
         {
            role: "user",
            content: [
               `Someone asked an analytics chat about the Malloy package "${request.scope.package}". The chat answered with Publisher's tools. Judge, from the answer and the tools it ran, whether the model could answer the question.`,
               `answerable: ${COVERAGE_OPTIONS.answerable}\npartial: ${COVERAGE_OPTIONS.partial}\nmissing: ${COVERAGE_OPTIONS.missing}`,
               "Judge only from what the answer shows the tools returned. An answer that ran a query and reported its result for what was asked is answerable; one that substituted a related measure, or approximated a filter, is partial; one that found no field for the central concept is missing.",
               request.earlier?.length
                  ? `Earlier questions in the same chat, for context:\n${request.earlier.map((q) => `- ${q.slice(0, 500)}`).join("\n")}`
                  : "",
               categories.length
                  ? `Existing categories: ${categories.join(", ")}`
                  : "",
               `Question: ${request.question.slice(0, 2000)}`,
               `Answer:\n${request.answer.slice(-ANSWER_LIMIT)}`,
            ]
               .filter(Boolean)
               .join("\n\n"),
         },
      ],
      outputSchema: EvaluationSchema,
      modelOptions: maxTokens(1200),
   });
   if (!result.analytical) return { analytical: false };
   const confidence = Math.min(Math.max(result.confidence, 0), 1);
   const concepts = result.concepts.slice(0, MAX_CONCEPTS);
   return {
      analytical: true,
      persona: result.persona,
      category: result.category,
      concepts: concepts.map(({ type, text }) => ({ type, text })),
      result: {
         id: "",
         status: result.status,
         confidence,
         probabilities: {
            answerable: result.status === "answerable" ? confidence : 0,
            partial: result.status === "partial" ? confidence : 0,
            missing: result.status === "missing" ? confidence : 0,
         },
         concepts: concepts.map(({ present, ...c }) => ({
            ...c,
            present: present ? 1 : 0,
         })),
         retrieval: "get_context",
         retrieved: [],
         judge: "transcript",
         model: request.model ?? defaultModel(env),
         ms: Date.now() - started,
      },
   };
}

const MAX_CONCEPTS = 6;
const COVERAGE_OPTIONS = {
   answerable:
      "Every measure, grouping and filter the question needs is present",
   partial:
      "Some needed concepts are present but at least one is missing or only approximated",
   missing: "The central measure or entity the question is about is absent",
} as const;
const COVERAGE_INSTRUCTIONS =
   "Using only `retrieved_context`, can a single analytical query answer `question` correctly?";

/**
 * A Jev failure that will repeat for every question (no binding, no credits)
 * parks Jev for a while, so a batch costs one failed call rather than one per
 * question.
 */
let jevParked: { until: number; reason: string } | undefined;

export function jevUnavailableReason(): string | undefined {
   return jevParked && jevParked.until > Date.now()
      ? jevParked.reason
      : undefined;
}

interface Retrieved {
   question: ClassifyRequest["questions"][number];
   concepts: ClassifyRequest["questions"][number]["concepts"];
   retrieval: Classification["retrieval"];
   sources: RetrievedSource[];
   started: number;
}

export async function classifyQuestions(
   env: Env,
   request: ClassifyRequest,
): Promise<Classification[]> {
   const useMcp = await publisherReachable(env);
   const retrieved = await Promise.all(
      request.questions.map((question) =>
         retrieve(env, request, question, useMcp),
      ),
   );

   const byJev = await Promise.all(retrieved.map((r) => judgeWithJev(env, r)));
   const leftover = retrieved.filter((_, i) => !byJev[i]);
   const byOpus = leftover.length
      ? await judgeWithOpus(env, leftover, jevParked?.reason)
      : [];
   const fallback = new Map(byOpus.map((c) => [c.id, c]));
   return retrieved.map((r, i) => byJev[i] ?? fallback.get(r.question.id)!);
}

async function retrieve(
   env: Env,
   request: ClassifyRequest,
   question: ClassifyRequest["questions"][number],
   useMcp: boolean,
): Promise<Retrieved> {
   const started = Date.now();
   const concepts = question.concepts.slice(0, MAX_CONCEPTS);
   if (useMcp) {
      try {
         const sources = await getContext(
            env,
            request.scope,
            concepts.map((c) => ({ target_type: c.type, search_text: c.text })),
            question.text,
         );
         return {
            question,
            concepts,
            retrieval: "get_context",
            sources,
            started,
         };
      } catch {
         // Fall through to the catalog the browser sent.
      }
   }
   return {
      question,
      concepts,
      retrieval: "lexical",
      sources: lexicalRetrieve(request.catalog, question.text, concepts),
      started,
   };
}

async function judgeWithJev(
   env: Env,
   r: Retrieved,
): Promise<Classification | undefined> {
   if (!env.OPENROUTER_API_KEY) {
      jevParked = { until: Infinity, reason: "No OPENROUTER_API_KEY" };
   }
   if (jevParked && jevParked.until > Date.now()) return undefined;
   try {
      const conceptQuestions = Object.fromEntries(
         r.concepts.map((concept, i) => [
            `concept_${i}`,
            boolean({
               instructions: `Does \`retrieved_context\` contain a ${concept.type} that represents "${concept.text}", either directly or as a field a query could compute it from in one step?`,
            }),
         ]),
      );
      const result = await decide({
         adapter: jev(env),
         state: {
            question: r.question.text,
            needed_concepts: r.concepts.map((c) => `${c.text} (${c.type})`),
            retrieved_context: r.sources,
         },
         questions: {
            coverage: choice({
               instructions: COVERAGE_INSTRUCTIONS,
               options: COVERAGE_OPTIONS,
            }),
            ...conceptQuestions,
         },
      });
      const answers = result as unknown as Record<
         string,
         { probability: number }
      >;
      return {
         id: r.question.id,
         status: result.coverage.value,
         confidence: result.coverage.confidence,
         probabilities: result.coverage.probabilities,
         concepts: r.concepts.map((c, i) => ({
            ...c,
            present: answers[`concept_${i}`]?.probability ?? 0,
         })),
         retrieval: r.retrieval,
         retrieved: summarizeRetrieved(r.sources),
         judge: "jev",
         ms: Date.now() - r.started,
      };
   } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (/credit|quota|unauthori|not entitled|binding/i.test(reason)) {
         jevParked = { until: Date.now() + 5 * 60_000, reason };
      }
      return undefined;
   }
}

const OpusVerdictsSchema = z.object({
   verdicts: z.array(
      z.object({
         id: z.string(),
         status: z.enum(["answerable", "partial", "missing"]),
         confidence: z.number().meta({ description: "0 to 1" }),
         concepts_present: z.array(z.boolean()).meta({
            description:
               "One entry per needed concept, in order: is it in the retrieved context?",
         }),
      }),
   ),
});

/** The same decision as Jev's, made by Opus in one batched call. */
async function judgeWithOpus(
   env: Env,
   items: Retrieved[],
   jevReason: string | undefined,
): Promise<Classification[]> {
   let verdicts: z.infer<typeof OpusVerdictsSchema>["verdicts"] = [];
   let error: string | undefined;
   try {
      const result = await chat({
         adapter: textModel(env),
         messages: [
            {
               role: "user",
               content: [
                  `For each item, answer: ${COVERAGE_INSTRUCTIONS}`,
                  `answerable: ${COVERAGE_OPTIONS.answerable}\npartial: ${COVERAGE_OPTIONS.partial}\nmissing: ${COVERAGE_OPTIONS.missing}`,
                  "Also say, for each needed concept in order, whether `retrieved_context` contains a field that represents it directly or that a query could compute it from in one step. Judge only from the retrieved context, never from what a model like this usually has.",
                  JSON.stringify(
                     items.map((r) => ({
                        id: r.question.id,
                        question: r.question.text,
                        needed_concepts: r.concepts.map(
                           (c) => `${c.text} (${c.type})`,
                        ),
                        retrieved_context: r.sources,
                     })),
                  ),
               ].join("\n\n"),
            },
         ],
         outputSchema: OpusVerdictsSchema,
         modelOptions: maxTokens(8000),
      });
      verdicts = result.verdicts;
   } catch (e) {
      error = e instanceof Error ? e.message : String(e);
   }
   const byId = new Map(verdicts.map((v) => [v.id, v]));
   return items.map((r) => {
      const verdict = byId.get(r.question.id);
      const status = verdict?.status ?? "missing";
      const confidence = Math.min(Math.max(verdict?.confidence ?? 0, 0), 1);
      return {
         id: r.question.id,
         status,
         confidence,
         probabilities: {
            answerable: status === "answerable" ? confidence : 0,
            partial: status === "partial" ? confidence : 0,
            missing: status === "missing" ? confidence : 0,
         },
         concepts: r.concepts.map((c, i) => ({
            ...c,
            present: verdict?.concepts_present[i] ? 1 : 0,
         })),
         retrieval: r.retrieval,
         retrieved: summarizeRetrieved(r.sources),
         judge: "opus",
         judgeNote: jevReason ? `Jev unavailable: ${jevReason}` : undefined,
         ms: Date.now() - r.started,
         error: verdict ? undefined : (error ?? "No verdict returned"),
      };
   });
}

function summarizeRetrieved(retrieved: RetrievedSource[]) {
   return retrieved.map((s) => ({
      model: s.model,
      source: s.source,
      fields: s.fields.map((f) => f.name),
   }));
}

/**
 * Stand-in for get_context when the Worker cannot reach Publisher's MCP port
 * (a deployed Worker, say): rank the catalog the browser sent by word overlap.
 */
function lexicalRetrieve(
   catalog: CatalogSource[],
   question: string,
   concepts: Array<{ text: string }>,
): RetrievedSource[] {
   const wanted = new Set(
      tokens([question, ...concepts.map((c) => c.text)].join(" ")),
   );
   const scored = catalog.map((source) => {
      const fields = source.fields
         .map((field) => ({
            field,
            score: overlap(wanted, `${field.name} ${field.doc ?? ""}`),
         }))
         .sort((a, b) => b.score - a.score);
      const score =
         overlap(wanted, `${source.source} ${source.doc ?? ""}`) * 2 +
         fields.slice(0, 5).reduce((sum, f) => sum + f.score, 0);
      return {
         score,
         source: {
            ...source,
            fields: fields.slice(0, 15).map((f) => f.field),
         },
      };
   });
   return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => s.source);
}

function tokens(text: string): string[] {
   return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
      .map((t) => t.replace(/(ies|es|s)$/, ""));
}

function overlap(wanted: Set<string>, text: string): number {
   return tokens(text).filter((t) => wanted.has(t)).length;
}
