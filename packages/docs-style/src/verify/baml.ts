/**
 * The meaning Verifier on BAML (baml_src/verify.baml): GPT-6.1 Sol at reasoning "medium" decides
 * whether AFTER says exactly what BEFORE says, in both directions. The reply follows a strict JSON
 * schema, and only a finished reply counts. Runs through codex-lb, or OpenRouter when codex-lb does
 * not answer and a key exists.
 */
import type { ClientRegistry } from "@boundaryml/baml";
import { chooseEndpoint, FINISHED_ONLY, loadBaml, OPENROUTER_HEADERS, RETRY_POLICY, type Endpoint, type RouteOptions } from "../rewrite/runtime";
import type { MeaningDifference, MeaningVerdict, Verifier } from "../types";

export interface BamlVerifierOptions extends RouteOptions {
  /**
   * Independent model answers per comparison, run at once. The verdict is "same" only when every
   * answer finds no difference. Default 1.
   */
  samples?: number;
  /** Reasoning effort. Default "medium". */
  effort?: "low" | "medium" | "high";
}

/** A verdict plus the tokens it cost, summed over every sample. */
export type MeasuredVerdict = MeaningVerdict & { inputTokens?: number; outputTokens?: number };

export interface BamlVerifier extends Verifier {
  compare(input: Parameters<Verifier["compare"]>[0]): Promise<MeasuredVerdict>;
}

const MODEL = "gpt-6.1-sol";
const KINDS = ["fact", "number", "name", "condition", "limit", "modality", "scope", "relation", "reference", "hierarchy", "emphasis", "added", "other"];

/** The reply shape, enforced by the API, so a reply can never be prose or a partial object. */
const MEANING_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "meaning_check",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["differences", "same"],
      properties: {
        differences: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "before", "after", "why"],
            properties: {
              kind: { type: "string", enum: KINDS },
              before: { type: "string" },
              after: { type: "string" },
              why: { type: "string" },
            },
          },
        },
        same: { type: "boolean" },
      },
    },
  },
};

export function createBamlVerifier(options: BamlVerifierOptions = {}): BamlVerifier {
  const samples = Math.max(1, Math.floor(options.samples ?? 1));
  const effort = options.effort ?? "medium";
  let route: Promise<{ endpoint: Endpoint; registry: ClientRegistry }> | undefined;

  const ask = async (input: Parameters<Verifier["compare"]>[0]): Promise<MeasuredVerdict> => {
    route ??= Promise.all([chooseEndpoint(options, "verifier"), loadBaml()]).then(([endpoint, { ClientRegistry: Registry }]) => {
      const registry = new Registry();
      registry.addLlmClient("VerifyRuntime", "openai-generic", clientOptions(endpoint, effort), RETRY_POLICY);
      registry.setPrimary("VerifyRuntime");
      return { endpoint, registry };
    });
    const { endpoint, registry } = await route;
    const { b, Collector } = await loadBaml();
    const collector = new Collector("docs-style-verify");
    const started = performance.now();
    try {
      const check = await b.CompareMeaning(input.before, input.after, input.blockType, input.heading ?? null, { clientRegistry: registry, collector });
      const differences = check.differences.map(difference);
      return {
        // A model that says "same" while it lists a difference, or "different" with none listed, is not sure: treat it as different.
        same: check.same === true && differences.length === 0,
        differences,
        model: MODEL,
        ms: Math.round(performance.now() - started),
        inputTokens: collector.usage.inputTokens ?? undefined,
        outputTokens: collector.usage.outputTokens ?? undefined,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Meaning check on ${MODEL} through ${endpoint.name} failed: ${reason}`, { cause: error });
    }
  };

  return {
    async compare(input) {
      const verdicts = await Promise.all(Array.from({ length: samples }, () => ask(input)));
      return merge(verdicts);
    },
  };
}

function clientOptions(endpoint: Endpoint, effort: string): Record<string, unknown> {
  const lb = endpoint.name === "codex-lb";
  return {
    base_url: endpoint.baseUrl,
    api_key: endpoint.apiKey,
    model: lb ? MODEL : `openai/${MODEL}`,
    ...(lb ? { reasoning_effort: effort } : { reasoning: { effort }, headers: OPENROUTER_HEADERS }),
    response_format: MEANING_SCHEMA,
    http: { connect_timeout_ms: 3000, request_timeout_ms: 180_000 },
    ...FINISHED_ONLY,
  };
}

function difference(raw: { kind: string; before: string; after: string; why: string }): MeaningDifference {
  const kind = raw.kind.trim().toLowerCase();
  return { kind: KINDS.includes(kind) ? kind : "other", before: raw.before, after: raw.after, why: raw.why };
}

/** Any sample that finds a difference makes the verdict "different". Differences merge without repeats. */
function merge(verdicts: MeasuredVerdict[]): MeasuredVerdict {
  if (verdicts.length === 1) return verdicts[0]!;
  const seen = new Set<string>();
  const differences = verdicts
    .flatMap((verdict) => verdict.differences)
    .filter((diff) => {
      const key = `${diff.kind}\u0000${diff.before}\u0000${diff.after}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const sum = (field: "inputTokens" | "outputTokens") =>
    verdicts.some((verdict) => verdict[field] !== undefined) ? verdicts.reduce((total, verdict) => total + (verdict[field] ?? 0), 0) : undefined;
  return {
    same: verdicts.every((verdict) => verdict.same),
    differences,
    model: MODEL,
    ms: Math.max(...verdicts.map((verdict) => verdict.ms)),
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
  };
}
