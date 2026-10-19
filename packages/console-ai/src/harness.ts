import { toolDefinition, type AnyServerTool } from "@tanstack/ai";
import { createMCPClient, type MCPClient } from "@tanstack/ai-mcp";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/client/validators/cf-worker";
import { z } from "zod";
import type { Env } from "./env";

/**
 * What Publisher hands any external MCP client, rebuilt for a chat() run:
 * every tool it registers, and its skills (served as MCP prompts) behind a
 * `load_skill` tool with an index in the system prompt.
 */
export interface Harness {
   tools: AnyServerTool[];
   toolNames: string[];
   skills: SkillInfo[];
   /** Skill bodies to put in the system prompt up front. */
   preloaded: Array<{ name: string; text: string }>;
   close: () => Promise<void>;
}

export interface SkillInfo {
   name: string;
   description: string;
}

const RESULT_LIMIT = 16_000;

let skillIndex: { at: number; skills: SkillInfo[] } | undefined;
const skillText = new Map<string, string>();

export async function loadHarness(
   env: Env,
   preload: string[] = [],
): Promise<Harness | undefined> {
   if (!env.PUBLISHER_MCP_URL) return undefined;
   let mcp: MCPClient;
   try {
      mcp = await createMCPClient({
         transport: { type: "http", url: env.PUBLISHER_MCP_URL },
         name: "malloy-console-ai",
         clientOptions: {
            jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
         },
      });
   } catch (error) {
      console.error(`Publisher MCP: ${String(error)}`);
      return undefined;
   }
   try {
      const [serverTools, skills] = await Promise.all([
         mcp.tools(),
         listSkills(mcp),
      ]);
      const preloaded = (
         await Promise.all(
            preload
               .filter((name) => skills.some((s) => s.name === name))
               .map(async (name) => ({
                  name,
                  text: await readSkill(mcp, name),
               })),
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
      console.error(`Publisher MCP discovery: ${String(error)}`);
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
            return {
               error: error instanceof Error ? error.message : String(error),
            };
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

/** The skill index as a system-prompt section. */
export function skillsPrompt(harness: Harness): string {
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
