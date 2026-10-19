import {
   chat,
   maxIterations,
   toServerSentEventsResponse,
   type ModelMessage,
   type StreamChunk,
   type UIMessage,
} from "@tanstack/ai";
import { z } from "zod";
import type { Env, PackageScope } from "./env";
import { loadHarness, skillsPrompt } from "./harness";
import { maxTokens, textModel } from "./models";

export interface AskRequest {
   scope: PackageScope;
   /** OpenRouter slug; the Worker's default when absent. */
   model?: string;
   /** The dictionary page the question was asked from, rendered as markdown. */
   page?: string;
   /** Set when the chat re-checks one Question Coverage question. */
   coverage?: CoverageCheck;
}

export interface CoverageCheck {
   question: string;
   persona?: string;
   category?: string;
   concepts: Array<{ type: string; text: string }>;
}

const ALWAYS_LOADED = ["malloy-analysis"];

export async function streamAsk(
   env: Env,
   messages: Array<UIMessage | ModelMessage>,
   request: AskRequest,
   abortController: AbortController,
): Promise<Response> {
   const { stream } = await runAsk(env, messages, request, abortController);
   return toServerSentEventsResponse(stream, { abortController });
}

/**
 * The `/ask` agent run, shared by the chat and by Question Coverage's
 * re-score so both judge a question the same way. The stream closes the MCP
 * session when it ends; `grounded` is false when Publisher was unreachable.
 */
export async function runAsk(
   env: Env,
   messages: Array<UIMessage | ModelMessage>,
   request: AskRequest,
   abortController: AbortController,
): Promise<{ stream: AsyncIterable<StreamChunk>; grounded: boolean }> {
   const adapter = textModel(env, request.model);
   const harness = await loadHarness(env, ALWAYS_LOADED);
   const { scope } = request;

   const stream = chat({
      adapter,
      messages,
      tools: harness?.tools ?? [],
      agentLoopStrategy: maxIterations(request.coverage ? 14 : 10),
      systemPrompts: [
         [
            `You are the analyst for a Malloy semantic model served by Malloy Publisher: package "${scope.package}" in environment "${scope.environment}". Pass exactly these names wherever a tool takes an environment, package or scope.`,
            request.coverage
               ? coveragePrompt(request.coverage)
               : request.page
                 ? `The user is reading this page of the model's Data Dictionary:\n\n${request.page}`
                 : "",
            harness
               ? `You have Publisher's own MCP tools (${harness.toolNames.map((n) => `\`${n}\``).join(", ")}). Ground every claim: use get_context to find names, execute_query to run Malloy, and use names exactly as returned. Say which query produced any number you quote.`
               : "Publisher's MCP endpoint is unreachable from this session, so you cannot query data. Answer from what you were given and say when a question needs a query to settle.",
            FORMAT_RULES,
            harness ? skillsPrompt(harness) : "",
         ]
            .filter(Boolean)
            .join("\n\n"),
      ],
      abortController,
      modelOptions: maxTokens(request.coverage ? 6000 : 4000),
   });
   return {
      stream: harness ? closeAfter(stream, harness.close) : stream,
      grounded: Boolean(harness),
   };
}

const FORMAT_RULES = [
   "## Answer format",
   "Write GitHub-flavored Markdown; the chat renders it.",
   "- Lead with the answer in a sentence, then the supporting detail.",
   "- Tabular results go in a Markdown table with a header row and a `|---|` separator line, one row per line. Right-align numbers (`|---:|`) and format them for reading (thousands separators, currency, percent).",
   "- Put Malloy in fenced code blocks tagged `malloy`, formatted over several lines, never as one long line.",
   "- Format source, field and view names as inline code. Never invent a name.",
   "- Be brief. No preamble about which tools you are about to call.",
].join("\n");

function coveragePrompt(check: CoverageCheck): string {
   return [
      "## Coverage check",
      "Question Coverage asked whether this model can answer the question below. Re-check it for real: answer the question with the tools, then judge coverage from what the tools actually returned, not from what a model like this usually has.",
      `Question: ${check.question}`,
      check.persona || check.category
         ? `Asked by: ${[check.persona, check.category].filter(Boolean).join(", ")}`
         : "",
      `Concepts it needs:\n${check.concepts.map((c) => `- ${c.text} (${c.type})`).join("\n")}`,
      [
         "Steps: (1) find the names with get_context; (2) if anything is ambiguous, state the interpretation you chose; (3) run the query with execute_query and show the result; (4) if a concept is absent, say which and what the closest available field is.",
         "The investigation is handed to a coding agent that edits the Malloy model, so before the verdict write these two sections:",
         "### Recommended changes",
         "Numbered, smallest first. For each: the source and model file it belongs in, then the dimension, measure, join or view to add, with a Malloy snippet when existing columns can compute it; or, when no column holds it, the data that has to be brought in and at what grain. Write `None` when the question is answerable as the model stands.",
         "### Exit criteria",
         "A `- [ ]` checklist a coding agent can verify on its own: the field names that must exist, the query (in a fenced `malloy` block) that must compile and return rows, any sanity check on the numbers, and that re-running this question returns answerable.",
         "End with exactly this section:",
         "### Verdict",
         "**Verdict:** answerable | partial | missing (pick one)",
         "- One bullet per needed concept: ✅ or ❌, the concept, and the field that covers it or `none`.",
         "Answerable means every measure, grouping and filter is present; partial means at least one is missing or only approximated; missing means the central measure or entity is absent.",
      ].join("\n"),
   ]
      .filter(Boolean)
      .join("\n\n");
}

async function* closeAfter(
   stream: AsyncIterable<StreamChunk>,
   close: () => Promise<void>,
): AsyncIterable<StreamChunk> {
   try {
      yield* stream;
   } finally {
      await close();
   }
}

export interface ChatTitleRequest {
   question: string;
   answer?: string;
   model?: string;
}

const TitleSchema = z.object({
   title: z.string().meta({
      description:
         "Two to six words naming what the conversation is about, in sentence case, with no quotes or trailing punctuation.",
   }),
});

export async function chatTitle(env: Env, request: ChatTitleRequest) {
   const result = await chat({
      adapter: textModel(env, request.model),
      messages: [
         {
            role: "user",
            content: [
               "Title this conversation by its subject: the metric, entity or question it is about. Never use generic words like Malloy, model, data or analysis.",
               `Question: ${request.question.slice(0, 2000)}`,
               request.answer ? `Answer: ${request.answer.slice(0, 2000)}` : "",
            ]
               .filter(Boolean)
               .join("\n\n"),
         },
      ],
      outputSchema: TitleSchema,
      modelOptions: maxTokens(60),
   });
   return { title: result.title.trim().replace(/^["']|["'.]$/g, "") };
}

export interface DraftDocsRequest {
   scope: PackageScope;
   domain?: string;
   entities: Array<{
      id: string;
      kind: string;
      name: string;
      source?: string;
      type?: string;
      formula?: string;
      neighbors?: string[];
   }>;
}

const DraftsSchema = z.object({
   drafts: z.array(
      z.object({
         id: z.string(),
         doc: z.string().meta({
            description:
               "One sentence, at most 20 words, saying what the entity means to a business reader. For a source, say what one row is.",
         }),
      }),
   ),
});

export async function draftDocs(env: Env, request: DraftDocsRequest) {
   const entities = request.entities.slice(0, 40);
   const result = await chat({
      adapter: textModel(env),
      messages: [
         {
            role: "user",
            content: [
               `Draft a #(doc) description for each of these undocumented entities in the Malloy package "${request.scope.package}"${request.domain ? ` (${request.domain})` : ""}.`,
               "Describe only what the name, type, formula and neighbours support; where meaning is uncertain, say what it appears to be rather than guessing a business rule.",
               JSON.stringify(entities),
            ].join("\n\n"),
         },
      ],
      outputSchema: DraftsSchema,
      modelOptions: maxTokens(400 + entities.length * 80),
   });
   return result;
}
