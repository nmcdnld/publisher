import { chatParamsFromRequestBody } from "@tanstack/ai";
import {
   chatTitle,
   draftDocs,
   streamAsk,
   type AskRequest,
   type ChatTitleRequest,
} from "./dictionary";
import {
   checkQuestion,
   classifyQuestions,
   evaluateAsked,
   jevUnavailableReason,
   streamQuestions,
   type CheckRequest,
   type ClassifyRequest,
   type EvaluateRequest,
   type QuestionsRequest,
} from "./coverage";
import type { Env } from "./env";
import { defaultModel, HttpError, listModels } from "./models";
import { publisherReachable } from "./publisher";

const CORS = {
   "access-control-allow-origin": "*",
   "access-control-allow-methods": "GET, POST, OPTIONS",
   "access-control-allow-headers": "content-type",
};

export default {
   async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === "OPTIONS") {
         // The TanStack AI client adds its own headers (`X-Run-Id`), so allow
         // whatever the preflight asks for rather than a fixed list.
         const requested = request.headers.get(
            "access-control-request-headers",
         );
         return new Response(null, {
            headers: requested
               ? { ...CORS, "access-control-allow-headers": requested }
               : CORS,
         });
      }
      try {
         return withCors(await route(request, env));
      } catch (error) {
         const status = error instanceof HttpError ? error.status : 500;
         const message = error instanceof Error ? error.message : String(error);
         console.error(`${new URL(request.url).pathname}: ${message}`);
         return withCors(Response.json({ error: message }, { status }));
      }
   },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
   const { pathname } = new URL(request.url);

   if (request.method === "GET" && pathname === "/ai/health") {
      return Response.json({
         chat: Boolean(env.OPENROUTER_API_KEY),
         defaultModel: defaultModel(env),
         jev: Boolean(env.OPENROUTER_API_KEY),
         jevUnavailable: jevUnavailableReason(),
         publisherMcp: await publisherReachable(env),
      });
   }
   if (request.method === "GET" && pathname === "/ai/models") {
      return Response.json(await listModels(env));
   }
   if (request.method !== "POST") {
      throw new HttpError(404, `No route for ${request.method} ${pathname}`);
   }

   switch (pathname) {
      case "/ai/ask": {
         const params = await agentParams(request);
         return streamAsk(
            env,
            params.messages,
            params.forwardedProps as unknown as AskRequest,
            new AbortController(),
         );
      }
      case "/ai/coverage/questions": {
         const params = await agentParams(request);
         return streamQuestions(
            env,
            params.messages,
            params.forwardedProps as unknown as QuestionsRequest,
            new AbortController(),
         );
      }
      case "/ai/coverage/classify": {
         const body = (await request.json()) as ClassifyRequest;
         return Response.json({
            results: await classifyQuestions(env, body),
         });
      }
      case "/ai/coverage/check": {
         const body = (await request.json()) as CheckRequest;
         return Response.json(await checkQuestion(env, body));
      }
      case "/ai/coverage/evaluate": {
         const body = (await request.json()) as EvaluateRequest;
         return Response.json(await evaluateAsked(env, body));
      }
      case "/ai/chat/title": {
         const body = (await request.json()) as ChatTitleRequest;
         return Response.json(await chatTitle(env, body));
      }
      case "/ai/dictionary/draft-docs": {
         return Response.json(await draftDocs(env, await request.json()));
      }
      default:
         throw new HttpError(404, `No route for POST ${pathname}`);
   }
}

async function agentParams(request: Request) {
   try {
      return await chatParamsFromRequestBody(await request.json());
   } catch (error) {
      throw new HttpError(
         400,
         error instanceof Error ? error.message : "Bad request",
      );
   }
}

function withCors(response: Response): Response {
   const headers = new Headers(response.headers);
   for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
   return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
   });
}
