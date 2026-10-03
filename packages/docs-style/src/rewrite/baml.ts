/**
 * The Tier 3 Rewriter on BAML (baml_src/rewrite.baml). Fast is GPT-6 Luna and strong is
 * GPT-6.1 Sol. Both run through codex-lb when it answers, else through OpenRouter when an
 * OpenRouter key exists (see runtime.ts).
 */
import type { ClientRegistry } from "@boundaryml/baml";
import type { RewriteRequest, RewriteResponse, RewriteStrength, Rewriter } from "../types";
import { checkAnswer } from "./answer";
import { promptArgs } from "./prompt-args";
import { chooseEndpoint, FINISHED_ONLY, loadBaml, OPENROUTER_HEADERS, RETRY_POLICY, type Endpoint, type RouteOptions } from "./runtime";

interface Client {
  model: string;
  options: Record<string, unknown>;
}

interface Route {
  name: Endpoint["name"];
  clients: Record<RewriteStrength, Client>;
}

export function createBamlRewriter(options: RouteOptions = {}): Rewriter {
  let route: Promise<Route> | undefined;
  const registries = new Map<RewriteStrength, ClientRegistry>();

  return {
    async rewrite(request: RewriteRequest, strength: RewriteStrength): Promise<RewriteResponse> {
      // One probe per rewriter. A failed route stays failed, so every call fails fast with one reason.
      route ??= chooseEndpoint(options, "rewrite").then(rewriteRoute);
      const { name, clients } = await route;
      const client = clients[strength];
      const { b, ClientRegistry: Registry, Collector } = await loadBaml();
      let registry = registries.get(strength);
      if (!registry) {
        registry = new Registry();
        registry.addLlmClient("RewriteRuntime", "openai-generic", client.options, RETRY_POLICY);
        registry.setPrimary("RewriteRuntime");
        registries.set(strength, registry);
      }

      const args = promptArgs(request);
      const collector = new Collector("docs-style-rewrite");
      const started = performance.now();
      let markdown: string;
      try {
        const result = await b.RewriteBlock(
          args.blockType,
          args.markdown,
          args.findings,
          args.flaggedSentences,
          args.nearby,
          args.tokens,
          args.allowList,
          { clientRegistry: registry, collector },
        );
        markdown = result.markdown;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Rewrite on ${client.model} through ${name} failed: ${reason}`, { cause: error });
      }
      checkAnswer(request, markdown, client.model);
      return {
        markdown,
        model: client.model,
        ms: Math.round(performance.now() - started),
        inputTokens: collector.usage.inputTokens ?? undefined,
        outputTokens: collector.usage.outputTokens ?? undefined,
      };
    },
  };
}

/**
 * Luna for fast and Sol for strong. codex-lb strips temperature, so only the reasoning effort is
 * set there. OpenAI honours temperature only with effort "none" (the OpenRouter route is
 * unverified: no key existed on the build machine).
 */
function rewriteRoute(endpoint: Endpoint): Route {
  const lb = endpoint.name === "codex-lb";
  const client = (model: string, effort: string, requestTimeoutMs: number): Client => ({
    model: lb ? model : `openai/${model}`,
    options: {
      base_url: endpoint.baseUrl,
      api_key: endpoint.apiKey,
      model: lb ? model : `openai/${model}`,
      ...(lb ? { reasoning_effort: effort } : { reasoning: { effort }, headers: OPENROUTER_HEADERS }),
      ...(!lb && effort === "none" ? { temperature: 0.2 } : {}),
      response_format: { type: "json_object" },
      http: { connect_timeout_ms: 3000, request_timeout_ms: requestTimeoutMs },
      ...FINISHED_ONLY,
    },
  });
  return {
    name: endpoint.name,
    clients: { fast: client("gpt-6-luna", lb ? "low" : "none", 30_000), strong: client("gpt-6.1-sol", "low", 60_000) },
  };
}
