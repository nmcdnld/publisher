import type { Env, PackageScope } from "./env";

/**
 * A minimal client for Publisher's MCP endpoint (stateless streamable HTTP),
 * so coverage and "Ask about this" see exactly what an agent's retrieval sees.
 */
export async function callPublisherTool(
   env: Env,
   name: string,
   args: Record<string, unknown>,
   signal?: AbortSignal,
): Promise<unknown> {
   if (!env.PUBLISHER_MCP_URL) {
      throw new Error("PUBLISHER_MCP_URL is not set");
   }
   const response = await fetch(env.PUBLISHER_MCP_URL, {
      method: "POST",
      headers: {
         "content-type": "application/json",
         accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
         jsonrpc: "2.0",
         id: crypto.randomUUID(),
         method: "tools/call",
         params: { name, arguments: args },
      }),
      signal,
   });
   const body = await response.text();
   const payload = parseRpcBody(body) as {
      error?: { message: string };
      result?: {
         isError?: boolean;
         content?: Array<{
            type: string;
            text?: string;
            resource?: { text?: string };
         }>;
      };
   };
   if (payload.error) throw new Error(payload.error.message);
   const first = payload.result?.content?.[0];
   const text = first?.resource?.text ?? first?.text ?? "";
   if (payload.result?.isError) throw new Error(text || `${name} failed`);
   try {
      return JSON.parse(text);
   } catch {
      return text;
   }
}

function parseRpcBody(body: string): unknown {
   const trimmed = body.trim();
   if (trimmed.startsWith("{")) return JSON.parse(trimmed);
   const data = trimmed
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
   return JSON.parse(data);
}

let mcpProbe: { at: number; ok: boolean } | undefined;

export async function publisherReachable(env: Env): Promise<boolean> {
   if (!env.PUBLISHER_MCP_URL) return false;
   if (mcpProbe && Date.now() - mcpProbe.at < 30_000) return mcpProbe.ok;
   let ok = false;
   try {
      const response = await fetch(env.PUBLISHER_MCP_URL, {
         method: "POST",
         headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
         },
         body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
         signal: AbortSignal.timeout(1500),
      });
      ok = response.ok;
   } catch {
      ok = false;
   }
   mcpProbe = { at: Date.now(), ok };
   return ok;
}

export type TargetType =
   | "source"
   | "dimension"
   | "measure"
   | "view"
   | "join"
   | "dimensional_value";

export interface SearchTarget {
   target_type: TargetType;
   search_text: string;
}

/** What retrieval handed back, trimmed to what a judge needs to read. */
export interface RetrievedSource {
   model: string;
   source: string;
   summary?: string;
   joins: string[];
   fields: Array<{
      name: string;
      kind: string;
      type?: string;
      doc?: string;
   }>;
}

interface GetContextResponse {
   sources?: Array<{
      source_info: {
         resource_id: { model_path: string; source: string };
         one_line_summary?: string;
         docs?: string;
         joins?: Array<{ name: string; relationship?: string }>;
      };
      entities?: Array<{
         name: string;
         entity_type: string;
         description?: string;
         data_type?: string;
      }>;
   }>;
}

export async function getContext(
   env: Env,
   scope: PackageScope,
   targets: SearchTarget[],
   userPrompt: string,
   signal?: AbortSignal,
): Promise<RetrievedSource[]> {
   const raw = (await callPublisherTool(
      env,
      "get_context",
      {
         scopes: [scope],
         search_targets: targets,
         user_prompt: userPrompt,
         limit: 30,
      },
      signal,
   )) as GetContextResponse;
   return (raw.sources ?? []).slice(0, 5).map((s) => ({
      model: s.source_info.resource_id.model_path,
      source: s.source_info.resource_id.source,
      summary: s.source_info.one_line_summary ?? s.source_info.docs,
      joins: (s.source_info.joins ?? []).map(
         (j) => `${j.name} (${j.relationship ?? "?"})`,
      ),
      fields: (s.entities ?? []).slice(0, 15).map((e) => ({
         name: e.name,
         kind: e.entity_type,
         type: e.data_type,
         doc: e.description,
      })),
   }));
}
