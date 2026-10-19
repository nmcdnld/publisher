// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import {
   chat,
   chatParamsFromRequestBody,
   maxIterations,
   toolDefinition,
   toServerSentEventsResponse,
   type AnyServerTool,
   type AnyTextAdapter,
   type StreamChunk,
} from "@tanstack/ai";
import { createMCPClient, type MCPClient } from "@tanstack/ai-mcp";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod";
import { DEFAULT_MODEL, MODELS } from "../src/models";

export interface AgentEnv {
   OPENROUTER_API_KEY?: string;
   /** OpenRouter slug; Opus 5.5 when unset. */
   CHAT_MODEL?: string;
   PUBLISHER_MCP_URL: string;
}

/** What the clone sends as `forwardedProps`; mirrored in `src/chats.tsx`. */
export interface ChatRequest {
   /** The package the chat is scoped to, by the names Publisher serves it under. */
   scope?: { environment: string; package: string };
   /** A dashboard or notebook in that package the chat is about. */
   report?: { kind: "dashboard" | "notebook"; title: string };
   /** An OpenRouter slug from `chatModels`; anything else falls back to the default. */
   model?: string;
}

/** What `GET /ai/status` answers; mirrored in `src/agent.tsx`. */
export interface AgentStatus {
   defaultModel: string;
   models: string[];
   openRouter: { configured: boolean };
   mcpServers: Array<{
      id: string;
      name: string;
      url: string;
      connected: boolean;
      tools: string[];
      skills: number;
      error?: string;
   }>;
}

function defaultModel(env: AgentEnv): string {
   return env.CHAT_MODEL || DEFAULT_MODEL;
}

function chatModels(env: AgentEnv): string[] {
   const ids = MODELS.map((m) => m.id);
   return ids.includes(defaultModel(env)) ? ids : [defaultModel(env), ...ids];
}

type OpenRouterSlug = Parameters<typeof createOpenRouterText>[0];

const ALWAYS_LOADED = ["malloy-analysis"];
const RESULT_LIMIT = 16_000;

/** `POST /ai/chat`: one agent turn, streamed back as server-sent events. */
export async function handleChat(
   request: Request,
   env: AgentEnv,
): Promise<Response> {
   if (!env.OPENROUTER_API_KEY) {
      return new Response(null, {
         status: 503,
         statusText:
            "No OPENROUTER_API_KEY: set it in packages/credible-clone/.env.local",
      });
   }
   let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>;
   try {
      params = await chatParamsFromRequestBody(await request.json());
   } catch (error) {
      return new Response(null, { status: 400, statusText: message(error) });
   }
   const { scope, report, model } = params.forwardedProps as ChatRequest;

   const abortController = new AbortController();
   request.signal.addEventListener("abort", () => abortController.abort());

   const harness = await loadHarness(env.PUBLISHER_MCP_URL);
   const stream = chat({
      // The adapter's @tanstack/ai is a separately installed copy of the same
      // version; TypeScript keeps the two apart only because their peers differ.
      adapter: createOpenRouterText(
         (model && chatModels(env).includes(model)
            ? model
            : defaultModel(env)) as OpenRouterSlug,
         env.OPENROUTER_API_KEY,
      ) as unknown as AnyTextAdapter,
      messages: params.messages,
      tools: harness?.tools ?? [],
      agentLoopStrategy: maxIterations(16),
      systemPrompts: [systemPrompt(scope, report, harness)],
      abortController,
      modelOptions: { maxCompletionTokens: 6000 } as never,
   });
   return toServerSentEventsResponse(
      harness ? closeAfter(stream, harness.close) : stream,
      { abortController },
   );
}

/** `GET /ai/status`: whether a chat turn could run right now, and with what. */
export async function handleStatus(env: AgentEnv): Promise<Response> {
   const status: AgentStatus = {
      defaultModel: defaultModel(env),
      models: chatModels(env),
      openRouter: { configured: Boolean(env.OPENROUTER_API_KEY) },
      mcpServers: [await probePublisher(env.PUBLISHER_MCP_URL)],
   };
   return Response.json(status, { headers: { "cache-control": "no-store" } });
}

async function probePublisher(
   url: string,
): Promise<AgentStatus["mcpServers"][number]> {
   const server = { id: "publisher", name: "Malloy Publisher", url };
   let mcp: MCPClient | undefined;
   try {
      mcp = await createMCPClient({
         transport: { type: "http", url },
         name: "credible-clone",
      });
      const [tools, skills] = await Promise.all([mcp.tools(), listSkills(mcp)]);
      return {
         ...server,
         connected: true,
         tools: [...tools.map((t) => t.name), "load_skill"],
         skills: skills.filter((s) => !s.name.includes("/")).length,
      };
   } catch (error) {
      return {
         ...server,
         connected: false,
         tools: [],
         skills: 0,
         error: message(error),
      };
   } finally {
      await mcp?.close().catch(() => undefined);
   }
}

function systemPrompt(
   scope: ChatRequest["scope"],
   report: ChatRequest["report"],
   harness: Harness | undefined,
): string {
   return [
      "You are Credible's data analyst. You answer questions about Malloy semantic models served by Malloy Publisher, by querying them.",
      scope
         ? `This chat is scoped to package "${scope.package}" in environment "${scope.environment}". Pass exactly these names wherever a tool takes an environment, package or scope.`
         : "This chat is not scoped to a package. Call `list_packages` to see what is served, pick the package the question is about, and say which one you used.",
      report
         ? `The user is looking at the ${report.kind} "${report.title}" in that package.`
         : "",
      harness
         ? `You have Publisher's own MCP tools (${harness.toolNames.map((n) => `\`${n}\``).join(", ")}). Ground every claim: use get_context to find names, execute_query to run Malloy, and use names exactly as returned. Say which query produced any number you quote.`
         : "Publisher's MCP endpoint is unreachable, so you cannot query data. Say so, answer from general knowledge only where that is safe, and tell the user to start Publisher.",
      FORMAT_RULES,
      harness ? skillsPrompt(harness) : "",
   ]
      .filter(Boolean)
      .join("\n\n");
}

const FORMAT_RULES = [
   "## Answer format",
   "Write GitHub-flavored Markdown; the chat renders it in a narrow column.",
   "- Lead with the answer in a sentence, then the supporting detail.",
   "- Tabular results go in a Markdown table with a header row and a `|---|` separator line, one row per line. Right-align numbers (`|---:|`) and format them for reading (thousands separators, currency, percent). Keep tables to a few columns.",
   "- Put Malloy in fenced code blocks tagged `malloy`, formatted over several lines.",
   "- Format source, field and view names as inline code. Never invent a name.",
   "- Be brief. No preamble about which tools you are about to call.",
].join("\n");

/**
 * What Publisher hands any external MCP client, rebuilt for a chat() run:
 * every tool it registers, and its skills (served as MCP prompts) behind a
 * `load_skill` tool with an index in the system prompt.
 */
interface Harness {
   tools: AnyServerTool[];
   toolNames: string[];
   skills: SkillInfo[];
   preloaded: Array<{ name: string; text: string }>;
   close: () => Promise<void>;
}

interface SkillInfo {
   name: string;
   description: string;
}

let skillIndex: { at: number; skills: SkillInfo[] } | undefined;
const skillText = new Map<string, string>();

async function loadHarness(url: string): Promise<Harness | undefined> {
   let mcp: MCPClient;
   try {
      mcp = await createMCPClient({
         transport: { type: "http", url },
         name: "credible-clone",
      });
   } catch (error) {
      console.error(`Publisher MCP at ${url}: ${message(error)}`);
      return undefined;
   }
   try {
      const [serverTools, skills] = await Promise.all([
         mcp.tools(),
         listSkills(mcp),
      ]);
      const preloaded = (
         await Promise.all(
            ALWAYS_LOADED.filter((name) =>
               skills.some((s) => s.name === name),
            ).map(async (name) => ({ name, text: await readSkill(mcp, name) })),
         )
      ).filter((s) => s.text);
      const tools = [
         ...serverTools.map((tool) => capped(tool as AnyServerTool)),
         loadSkillTool(mcp, skills),
      ];
      return {
         tools,
         toolNames: tools.map((t) => t.name),
         skills,
         preloaded,
         close: () => mcp.close().catch(() => undefined),
      };
   } catch (error) {
      await mcp.close().catch(() => undefined);
      console.error(`Publisher MCP discovery: ${message(error)}`);
      return undefined;
   }
}

async function listSkills(mcp: MCPClient): Promise<SkillInfo[]> {
   if (skillIndex && Date.now() - skillIndex.at < 5 * 60_000) {
      return skillIndex.skills;
   }
   const prompts = await mcp.prompts().catch(() => []);
   const skills = prompts.map((p) => ({
      name: p.name,
      description: p.description ?? "",
   }));
   skillIndex = { at: Date.now(), skills };
   return skills;
}

async function readSkill(mcp: MCPClient, name: string): Promise<string> {
   const cached = skillText.get(name);
   if (cached !== undefined) return cached;
   const result = await mcp.getPrompt(name);
   const text = result.messages
      .map((m) =>
         m.content.type === "text"
            ? m.content.text
            : m.content.type === "resource" && "text" in m.content.resource
              ? String(m.content.resource.text)
              : "",
      )
      .filter(Boolean)
      .join("\n\n");
   skillText.set(name, text);
   return text;
}

const loadSkillDef = toolDefinition({
   name: "load_skill",
   description:
      "Read one of Publisher's Malloy skills: the workflow guides listed in the system prompt. A skill may point to reference pages named `<skill>/<page>`; load those the same way.",
   inputSchema: z.object({
      name: z.string().meta({ description: "Skill name, e.g. malloy-queries" }),
   }),
});

function loadSkillTool(mcp: MCPClient, skills: SkillInfo[]): AnyServerTool {
   const names = new Set(skills.map((s) => s.name));
   return loadSkillDef.server(async ({ name }) => {
      if (!names.has(name)) {
         return {
            error: `No skill named "${name}".`,
            available: skills
               .filter((s) => !s.name.includes("/"))
               .map((s) => s.name),
         };
      }
      return await readSkill(mcp, name);
   }) as AnyServerTool;
}

/** Keeps an oversized result or a tool error from ending the agent loop. */
function capped(tool: AnyServerTool): AnyServerTool {
   const execute = tool.execute;
   if (!execute) return tool;
   return {
      ...tool,
      execute: async (args: unknown, context?: unknown) => {
         try {
            const result = unwrapResource(await execute(args, context));
            const text =
               typeof result === "string" ? result : JSON.stringify(result);
            return text.length > RESULT_LIMIT
               ? `${text.slice(0, RESULT_LIMIT)}… [truncated: aggregate in the query or add a limit]`
               : result;
         } catch (error) {
            return { error: message(error) };
         }
      },
   };
}

/**
 * Publisher answers with one embedded resource per call, which arrives as a
 * text part holding the resource as JSON; hand the model the resource's text.
 */
function unwrapResource(result: unknown): unknown {
   const parts = Array.isArray(result) ? result : [result];
   const texts = parts.map((part) => {
      const content =
         typeof part === "string"
            ? part
            : (part as { type?: string; content?: unknown })?.type === "text"
              ? (part as { content?: unknown }).content
              : undefined;
      if (typeof content !== "string") return undefined;
      try {
         const resource = JSON.parse(content) as {
            uri?: unknown;
            text?: unknown;
         };
         return typeof resource?.uri === "string" &&
            typeof resource.text === "string"
            ? resource.text
            : content;
      } catch {
         return content;
      }
   });
   return texts.every((t) => t !== undefined) ? texts.join("\n\n") : result;
}

function skillsPrompt(harness: Harness): string {
   const top = harness.skills.filter((s) => !s.name.includes("/"));
   return [
      "## Skills",
      "Publisher ships these skills. Call `load_skill` with a name before work a skill covers (writing a query, choosing a chart, reviewing a model), and follow it.",
      ...top.map((s) => `- \`${s.name}\`: ${firstSentence(s.description)}`),
      ...harness.preloaded.map(
         (s) => `\n## Skill \`${s.name}\` (already loaded)\n\n${s.text}`,
      ),
   ].join("\n");
}

function firstSentence(text: string): string {
   const match = text.match(/^(.{20,240}?[.!?])(\s|$)/);
   return match ? match[1] : text.slice(0, 240);
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

function message(error: unknown): string {
   return error instanceof Error ? error.message : String(error);
}
