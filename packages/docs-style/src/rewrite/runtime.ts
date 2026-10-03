/**
 * The BAML plumbing that the rewriter and the meaning verifier share: route choice (codex-lb
 * first, OpenRouter when codex-lb does not answer and a key exists), the lazy BAML runtime, and
 * the client options that every call needs.
 *
 * Clients are built at runtime with ClientRegistry, never as a static BAML fallback chain: BAML
 * resolves the env var of every client in a chain up front, so a missing OpenRouter key would
 * break calls that never needed it.
 */
import { codecaineEnv } from "./env";

export const CODEX_LB_URL = "http://127.0.0.1:2455/v1";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_HEADERS = { "HTTP-Referer": "https://github.com/codecaine-ai/docs-system", "X-Title": "codecaine-docs-style" };
/** codex-lb accepts this placeholder. The same default as the eval-suite judges. */
const CODEX_LB_PLACEHOLDER_KEY = "sk-clb-local";
const PROBE_TIMEOUT_MS = 1500;
/** Defined in baml_src/clients.baml: retries on network, HTTP, and timeout errors. */
export const RETRY_POLICY = "RewriteRetry";
/**
 * Only a reply the model finished counts. Without this, BAML's lenient parser hands back the
 * partial string of a reply cut off at "length". A rejected finish reason is never retried.
 */
export const FINISHED_ONLY = { finish_reason_allow_list: ["stop"] };

export interface RouteOptions {
  /** The codex-lb base URL. Default http://127.0.0.1:2455/v1. */
  codexLbUrl?: string;
  /** Default: OPENROUTER_API_KEY from the process env or ~/.config/codecaine/env. "" turns OpenRouter off. */
  openRouterKey?: string;
  /** Probe codex-lb once before the first call. Default true. false uses codex-lb without asking. */
  probe?: boolean;
}

export interface Endpoint {
  name: "codex-lb" | "OpenRouter";
  baseUrl: string;
  apiKey: string;
}

/** codex-lb when it answers (or when probe is false), else OpenRouter when a key exists. Throws otherwise. */
export async function chooseEndpoint(options: RouteOptions, purpose: string): Promise<Endpoint> {
  const codexLbUrl = (options.codexLbUrl ?? CODEX_LB_URL).replace(/\/+$/, "");
  if (options.probe === false || (await answers(codexLbUrl))) {
    return { name: "codex-lb", baseUrl: codexLbUrl, apiKey: codecaineEnv("CODEX_LB_API_KEY") ?? CODEX_LB_PLACEHOLDER_KEY };
  }
  const openRouterKey = options.openRouterKey ?? codecaineEnv("OPENROUTER_API_KEY");
  if (openRouterKey) return { name: "OpenRouter", baseUrl: OPENROUTER_URL, apiKey: openRouterKey };
  throw new Error(
    `No ${purpose} route: codex-lb does not answer at ${codexLbUrl}, and OPENROUTER_API_KEY is not set in the process env or ~/.config/codecaine/env.`,
  );
}

/** GET /models with a short timeout. Any answer other than 2xx counts as down. */
async function answers(codexLbUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${codexLbUrl}/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
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
