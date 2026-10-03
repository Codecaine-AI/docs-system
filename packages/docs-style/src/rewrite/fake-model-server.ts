/**
 * Test support: a stand-in for codex-lb (an OpenAI-compatible chat endpoint) on a local port, so the
 * BAML adapters run end to end without the network.
 *
 * It is a node:http server that writes raw replies, because the repo's test preload swaps the
 * global Response for happy-dom's, which Bun.serve rejects. Under that preload the global fetch is
 * happy-dom's too, and it sends a CORS preflight first, so the server answers OPTIONS and allows
 * any origin. Under a path that starts with /down/, the model list answers 503.
 */
import { createServer, type ServerResponse } from "node:http";

export interface ChatRequestBody {
  model: string;
  reasoning_effort?: string;
  response_format?: { type: string; json_schema?: { name: string; strict: boolean; schema: { required: string[] } } };
  messages: { role: string; content: unknown }[];
}

/** What the stand-in model answers: the message content, and how the reply finished (default "stop"). */
export interface ModelReply {
  content: string;
  finishReason?: string;
}

export interface FakeModelServer {
  /** Such as http://127.0.0.1:50123. The chat API lives under /v1. */
  baseUrl: string;
  /** Paths of every model-list probe. */
  probes: string[];
  /** Every chat request body, in arrival order. */
  requests: ChatRequestBody[];
  /** The stand-in model. A test can replace it. */
  answer: (body: ChatRequestBody) => ModelReply;
  close(): void;
}

export const USAGE = { prompt_tokens: 812, completion_tokens: 37, total_tokens: 849 };

export async function startFakeModelServer(answer: FakeModelServer["answer"]): Promise<FakeModelServer> {
  const state: Omit<FakeModelServer, "baseUrl" | "close"> = { probes: [], requests: [], answer };
  const server = createServer(async (request, response) => {
    const path = request.url ?? "";
    if (request.method === "OPTIONS") return reply(response, 204);
    if (path.endsWith("/models")) {
      state.probes.push(path);
      return path.startsWith("/down/") ? reply(response, 503, { error: "down" }) : reply(response, 200, { object: "list", data: [] });
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw) as ChatRequestBody;
    state.requests.push(body);
    const { content, finishReason = "stop" } = state.answer(body);
    reply(response, 200, {
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
      usage: USAGE,
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return Object.assign(state, { baseUrl, close: () => server.close() });
}

/** The text of a chat message, whether its content is a string or a list of parts. */
export function messageText(content: unknown): string {
  return typeof content === "string" ? content : (content as { text: string }[]).map((part) => part.text).join("");
}

function reply(response: ServerResponse, status: number, value?: unknown): void {
  const body = value === undefined ? "" : JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "*",
  });
  response.end(body);
}
