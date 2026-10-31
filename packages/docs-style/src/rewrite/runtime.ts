/**
 * The BAML plumbing that the rewriter and the meaning verifier share: route choice (the Token
 * Burner gateway first, OpenRouter when the gateway does not answer and a key exists), the lazy
 * BAML runtime, and the client options that every call needs.
 *
 * Clients are built at runtime with ClientRegistry, never as a static BAML fallback chain: BAML
 * resolves the env var of every client in a chain up front, so a missing OpenRouter key would
 * break calls that never needed it.
 */
import { codecaineEnv, tokenGatewayKey, tokenGatewayUrl } from "./env";

export { TOKEN_GATEWAY_DEFAULT_URL } from "./env";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_HEADERS = { "HTTP-Referer": "https://github.com/codecaine-ai/docs-system", "X-Title": "codecaine-docs-style" };
const PROBE_TIMEOUT_MS = 1500;
/** Defined in baml_src/clients.baml: retries on network, HTTP, and timeout errors. */
export const RETRY_POLICY = "RewriteRetry";
/**
 * Only a reply the model finished counts. Without this, BAML's lenient parser hands back the
 * partial string of a reply cut off at "length". A rejected finish reason is never retried.
 */
export const FINISHED_ONLY = { finish_reason_allow_list: ["stop"] };

export interface RouteOptions {
  /** The gateway's /v1 base. Default TOKEN_GATEWAY_BASE_URL, else http://100.104.171.122:8793/v1. */
  gatewayUrl?: string;
  /**
   * The gateway key. Default TOKEN_GATEWAY_API_KEY from the process env or ~/.config/codecaine/env,
   * else ~/.config/token-gateway/mini-macbook-key, else ~/.config/token-gateway/mini-key. "" turns the gateway off.
   */
  gatewayKey?: string;
  /** Default: OPENROUTER_API_KEY from the process env or ~/.config/codecaine/env. "" turns OpenRouter off. */
  openRouterKey?: string;
  /** Probe the gateway once before the first call. Default true. false uses the gateway without asking. */
  probe?: boolean;
}

export interface Endpoint {
  name: "token-gateway" | "OpenRouter";
  baseUrl: string;
  apiKey: string;
}

/** The gateway when it answers (or when probe is false), else OpenRouter when a key exists. Throws otherwise. */
export async function chooseEndpoint(options: RouteOptions, purpose: string): Promise<Endpoint> {
  const gatewayUrl = (options.gatewayUrl ?? tokenGatewayUrl()).replace(/\/+$/, "");
  const gatewayKey = options.gatewayKey ?? tokenGatewayKey();
  if (gatewayKey && (options.probe === false || (await answers(gatewayUrl, gatewayKey)))) {
    return { name: "token-gateway", baseUrl: gatewayUrl, apiKey: gatewayKey };
  }
  const openRouterKey = options.openRouterKey ?? codecaineEnv("OPENROUTER_API_KEY");
  if (openRouterKey) return { name: "OpenRouter", baseUrl: OPENROUTER_URL, apiKey: openRouterKey };
  const gateway = gatewayKey
    ? `Token Gateway does not answer at ${gatewayUrl}`
    : "no Token Gateway key is set (TOKEN_GATEWAY_API_KEY, or ~/.config/token-gateway/mini-macbook-key or mini-key)";
  throw new Error(`No ${purpose} route: ${gateway}, and OPENROUTER_API_KEY is not set in the process env or ~/.config/codecaine/env.`);
}

/** GET /models with the key and a short timeout. Any answer other than 2xx counts as down. */
async function answers(gatewayUrl: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${gatewayUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

export type Baml = {
  b: (typeof import("../../baml_client"))["b"];
  ClientRegistry: typeof import("@boundaryml/baml").ClientRegistry;
  Collector: typeof import("@boundaryml/baml").Collector;
};
let baml: Promise<Baml> | undefined;

/**
 * Loaded on the first call, so importing this package never starts the native BAML runtime.
 * BAML logs every prompt and reply at its default level, which floods a sweep, so the level
 * drops to warn unless BAML_LOG asks for more.
 */
export function loadBaml(): Promise<Baml> {
  baml ??= Promise.all([import("../../baml_client"), import("@boundaryml/baml")]).then(([client, runtime]) => {
    if (!process.env.BAML_LOG) runtime.setLogLevel("warn");
    return { b: client.b, ClientRegistry: runtime.ClientRegistry, Collector: runtime.Collector };
  });
  return baml;
}
