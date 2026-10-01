// Jev (TypeSafe System One) behind the JudgmentEngine seam. Every failure throws
// JudgmentUnavailable, and callers fail open: writes keep deterministic feedback and
// docs_check reports judgment as unavailable instead of blocking.
import type { DocDocument } from "@codecaine-ai/docs-model";
import { codecaineEnv } from "./codecaine-env";
import { blockMarkdown, nearestHeading } from "./doc-context";
import { ruleApplies, type JudgedFinding, type JudgmentEngine, type JudgmentRule } from "./lint-feedback";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-1.13.0";
export const JEV_TIMEOUT_MS = 4000;
/**
 * Questions per request. One question per request, each with its own state, scored best on real
 * pages: packing 50 questions into one request dropped flat-hierarchy hits from 8 to 3 of 12 bad
 * runs and nearly tripled packed-bullet false positives on good pages.
 */
export const JEV_BATCH_SIZE = 1;
/** Above this many requests, questions are batched so one judge call stays near one round trip per worker. */
export const JEV_MAX_REQUESTS = 24;
/** Requests in flight at once. TypeSafe rate limits start near 8 concurrent requests. */
export const JEV_CONCURRENCY = 6;
const CACHE_LIMIT = 5000;

export class JudgmentUnavailable extends Error {}

export interface JevRequestInfo { questions: number; status: number | "error"; ms: number; inputTokens?: number; outputTokens?: number }
export interface JevEngineOptions {
  fetch?: typeof fetch;
  /** Read at call time, so a key added to the shared env file works without a restart. */
  apiKey?: () => string | undefined;
  /** False disables judgment. Defaults to CODECAINE_DOCS_JUDGMENT, read at call time. */
  enabled?: () => boolean;
  model?: string;
  endpoint?: string;
  /** One deadline for the whole judge call, in milliseconds. */
  timeoutMs?: number;
  batchSize?: number;
  maxRequests?: number;
  concurrency?: number;
  onRequest?: (info: JevRequestInfo) => void;
}

/**
 * CODECAINE_DOCS_JUDGMENT=off (process env or the shared env file) turns judgment off. Under
 * `bun test` (NODE_ENV=test) it is off unless set to on, so test suites never reach the network.
 */
export function judgmentEnabled(): boolean {
  const value = codecaineEnv("CODECAINE_DOCS_JUDGMENT")?.trim().toLowerCase();
  if (value === undefined || value === "") return process.env.NODE_ENV !== "test";
  return !["off", "0", "false", "no"].includes(value);
}

/** The answer to one question, before the rule turns it into a finding. */
type Answer = { kind: "noul"; p: number } | { kind: "choice"; probabilities: Record<string, number> } | { kind: "score"; score: number; levels: number };

const DEFAULT_LEVELS = ["Fine as written", "Minor problem", "Clear problem"] as const;

/** Default state: the block and its nearest heading. */
const defaultState = (doc: DocDocument, id: string) => ({ heading: nearestHeading(doc, id) ?? "", block: blockMarkdown(doc.blocks[id]) });

/** The typed question body, with backticked state fields scoped under `prefix` when states are batched. */
function questionFor(rule: JudgmentRule, prefix?: string): Record<string, unknown> {
  const instructions = prefix ? rule.question.replace(/`([A-Za-z_][\w.]*)`/g, (_, field: string) => `\`${prefix}.${field}\``) : rule.question;
  if (rule.kind === "noul") return { type: "noul", instructions, ...(rule.criteria ? { criteria: rule.criteria } : {}) };
  if (rule.kind === "score") return { type: "score", instructions, criteria: [...(rule.levels ?? DEFAULT_LEVELS)] };
  return { type: "choice", instructions, criteria: Object.fromEntries(rule.options.map((o) => [o.label, o.description ?? null])) };
}

function parseAnswer(rule: JudgmentRule, raw: any): Answer | undefined {
  if (!raw || typeof raw !== "object" || raw.type !== rule.kind) return undefined;
  if (rule.kind === "noul") return typeof raw.noul === "number" ? { kind: "noul", p: raw.noul } : undefined;
  if (rule.kind === "score") return typeof raw.score === "number" ? { kind: "score", score: raw.score, levels: (rule.levels ?? DEFAULT_LEVELS).length } : undefined;
  return raw.probabilities && typeof raw.probabilities === "object" ? { kind: "choice", probabilities: raw.probabilities } : undefined;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** Turn an answer into a finding. A choice reports the summed probability of options that carry a fix. */
function findingFor(rule: JudgmentRule, blockId: string, evidence: string, answer: Answer): JudgedFinding | undefined {
  const base = { blockId, ruleId: rule.id, field: "text", evidence, message: rule.problem ?? `${rule.id} applies.` };
  if (rule.kind === "noul" && answer.kind === "noul") return { ...base, probability: clamp(rule.invert ? 1 - answer.p : answer.p), fix: rule.fix };
  if (rule.kind === "score" && answer.kind === "score") return { ...base, probability: clamp(answer.score / Math.max(1, answer.levels - 1)), fix: rule.fix };
  if (rule.kind === "choice" && answer.kind === "choice") {
    const flagged = rule.options.filter((o) => o.fix !== undefined).map((o) => ({ o, p: answer.probabilities[o.label] ?? 0 }));
    if (!flagged.length) return undefined;
    const worst = flagged.reduce((a, b) => (b.p > a.p ? b : a));
    return { ...base, message: worst.o.problem ?? base.message, probability: clamp(flagged.reduce((sum, f) => sum + f.p, 0)), fix: worst.o.fix! };
  }
  return undefined;
}

/** Run tasks with at most `limit` in flight. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = { status: "fulfilled", value: await tasks[i]!() }; } catch (reason) { results[i] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export interface JevEngine extends JudgmentEngine {
  readonly model: string;
  /** Cached answers. Exposed for tests and the sample script. */
  readonly cacheSize: () => number;
}

/**
 * A JudgmentEngine over the TypeSafe System One HTTP API. Each (rule, block) question carries its
 * own state: the block's text and the context its rule needs. Up to batchSize questions share one
 * request under keys q0, q1, and so on. Answers are cached in memory by (model, rule id, state), so
 * a docs_check after a write does not re-judge unchanged blocks.
 */
export function createJevEngine(options: JevEngineOptions = {}): JevEngine {
  const doFetch = options.fetch ?? fetch;
  const apiKey = options.apiKey ?? (() => codecaineEnv("TYPESAFE_API_KEY"));
  const enabled = options.enabled ?? judgmentEnabled;
  const model = options.model ?? codecaineEnv("CODECAINE_DOCS_JUDGMENT_MODEL") ?? JEV_MODEL;
  const endpoint = options.endpoint ?? JEV_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
  const batchSize = Math.max(1, options.batchSize ?? JEV_BATCH_SIZE);
  const maxRequests = Math.max(1, options.maxRequests ?? JEV_MAX_REQUESTS);
  const concurrency = Math.max(1, options.concurrency ?? JEV_CONCURRENCY);
  const cache = new Map<string, Answer>();
  const remember = (key: string, answer: Answer) => {
    cache.set(key, answer);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  };

  /** One POST, retried once after a short pause on 429 or 529 while the deadline allows. */
  async function post(key: string, body: unknown, signal: AbortSignal, questions: number, retry = true): Promise<Record<string, unknown>> {
    const started = performance.now();
    let response: Response;
    try {
      response = await doFetch(endpoint, { method: "POST", signal, headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    } catch (error) {
      options.onRequest?.({ questions, status: "error", ms: performance.now() - started });
      throw new JudgmentUnavailable(signal.aborted ? `Jev did not answer within ${timeoutMs} ms.` : `Jev request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload: any = await response.json().catch(() => undefined);
    options.onRequest?.({ questions, status: response.status, ms: performance.now() - started, inputTokens: payload?.usage?.input_tokens, outputTokens: payload?.usage?.output_tokens });
    if ((response.status === 429 || response.status === 529) && retry && !signal.aborted) {
      await new Promise((done) => setTimeout(done, 250));
      return post(key, body, signal, questions, false);
    }
    if (!response.ok) throw new JudgmentUnavailable(`Jev returned HTTP ${response.status}.`);
    if (!payload?.answers || typeof payload.answers !== "object") throw new JudgmentUnavailable("Jev returned no answers.");
    return payload.answers;
  }

  return {
    model,
    cacheSize: () => cache.size,
    async judge({ doc, blockIds, rules }) {
      if (!enabled()) throw new JudgmentUnavailable("Judgment is off (CODECAINE_DOCS_JUDGMENT=off).");
      type Ask = { rule: JudgmentRule; blockId: string; state: Record<string, unknown>; cacheKey: string };
      const asks: Ask[] = [];
      for (const rule of rules) for (const blockId of blockIds) {
        if (!ruleApplies(rule, doc, blockId)) continue;
        const state = rule.state?.(doc, blockId) ?? defaultState(doc, blockId);
        asks.push({ rule, blockId, state, cacheKey: `${model}\u0000${rule.id}\u0000${JSON.stringify(state)}` });
      }
      const answers = new Map<Ask, Answer>();
      const pending = asks.filter((ask) => {
        const hit = cache.get(ask.cacheKey);
        if (hit) answers.set(ask, hit);
        return !hit;
      });
      if (pending.length) {
        const key = apiKey();
        if (!key) throw new JudgmentUnavailable("TYPESAFE_API_KEY is not set.");
        // Identical questions in one call share one ask.
        const unique = [...new Map(pending.map((ask) => [ask.cacheKey, ask])).values()];
        const batches: Ask[][] = [];
        const size = Math.max(batchSize, Math.ceil(unique.length / maxRequests));
        for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const settled = await pool(batches.map((batch) => async () => {
            const single = batch.length === 1;
            const state = single ? batch[0]!.state : Object.fromEntries(batch.map((ask, i) => [`q${i}`, ask.state]));
            const questions = Object.fromEntries(batch.map((ask, i) => [`q${i}`, questionFor(ask.rule, single ? undefined : `q${i}`)]));
            const raw = await post(key, { model, state, questions }, controller.signal, batch.length);
            batch.forEach((ask, i) => {
              const answer = parseAnswer(ask.rule, raw[`q${i}`]);
              if (answer) remember(ask.cacheKey, answer);
            });
          }), concurrency);
          const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
          if (failed) throw failed.reason instanceof JudgmentUnavailable ? failed.reason : new JudgmentUnavailable(String(failed.reason));
        } finally { clearTimeout(timer); }
        for (const ask of pending) {
          const answer = cache.get(ask.cacheKey);
          if (answer) answers.set(ask, answer);
        }
      }
      return asks.flatMap((ask) => {
        const answer = answers.get(ask);
        const finding = answer && findingFor(ask.rule, ask.blockId, blockMarkdown(doc.blocks[ask.blockId]), answer);
        return finding ? [finding] : [];
      });
    },
  };
}

/** The service default: Jev unless CODECAINE_DOCS_JUDGMENT=off, which the engine checks on every call. */
export const defaultJudgmentEngine = (): JevEngine => createJevEngine();
