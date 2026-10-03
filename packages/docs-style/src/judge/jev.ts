/**
 * The Jev judge: TypeSafe System One (model jev-1.13.0) answers each yes/no question with
 * P(true), one question per request.
 *
 * This client mirrors packages/docs-mcp/src/jev-engine.ts: the same request format, bearer key,
 * model override, and in-memory cache. It differs in three ways, because a sweep asks thousands
 * of questions and one lost answer must not end Tier 2: there is no cap on requests per call, a
 * transient failure is retried twice instead of once, and a request that still fails drops only
 * its own answer. Consolidate the two clients when the STE rules join docs_check.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { JudgeUnavailable, type Judge, type JudgeQuestion } from "../types";

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.13.0";
/** TypeSafe rate limits start near 8 concurrent requests. */
const JEV_CONCURRENCY = 6;
const JEV_TIMEOUT_MS = 15_000;
/** Retries after a transient failure: a 429, a 5xx, a timeout, or a network error. */
const RETRIES = 2;
/** The first backoff. Each retry doubles it, with jitter, unless the response names a retry-after. */
const BACKOFF_MS = 500;
const RETRY_PAUSE_MAX_MS = 10_000;
/** About the questions of two full corpus sweeps. Past this, the oldest answers go first. */
const CACHE_LIMIT = 20_000;

export interface JevJudgeOptions {
  /** Defaults to TYPESAFE_API_KEY, read at ask time from the process, else ~/.config/codecaine/env. */
  apiKey?: string;
  /** Defaults to CODECAINE_DOCS_JUDGMENT_MODEL, else jev-1.13.0. */
  model?: string;
  endpoint?: string;
  /** Requests in flight at once. Default 6. */
  concurrency?: number;
  /** Deadline for each request attempt, in milliseconds. Default 15 s. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * Parse the shared Codecaine env file: KEY=value lines, with an optional `export` and optional
 * quotes. Same rules as docs-mcp/src/codecaine-env.ts.
 */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    if (value) out[match[1]!] = value;
  }
  return out;
}

/**
 * One variable from the process environment, else from the shared env file. Background services
 * do not inherit the user's shell, so keys live in that file. CODECAINE_ENV_FILE moves it.
 */
function codecaineEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const path = process.env.CODECAINE_ENV_FILE || join(homedir(), ".config", "codecaine", "env");
  try {
    return parseEnvFile(readFileSync(path, "utf8"))[name];
  } catch {
    return undefined;
  }
}

/** Run tasks with at most `limit` in flight. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]!() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** A failure worth another try. `pauseMs` is the server's retry-after, when it sent one. */
class TransientFailure extends Error {
  constructor(message: string, readonly pauseMs?: number) {
    super(message);
  }
}

/** The retry-after header in milliseconds, capped. Undefined when absent or not a number of seconds. */
function retryAfter(response: Response): number | undefined {
  const seconds = Number(response.headers.get("retry-after") ?? NaN);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, RETRY_PAUSE_MAX_MS) : undefined;
}

/** Exponential backoff with jitter, so the requests of one failed burst do not retry in step. */
const backoff = (attempt: number) => BACKOFF_MS * 2 ** attempt * (0.5 + Math.random() / 2);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/**
 * A Judge over the TypeSafe System One HTTP API. Each question goes in its own request with its
 * own state: one question per request scored best on real pages (see jev-engine.ts). Answers are
 * cached in memory by (model, question, state), so a second sweep does not ask again.
 *
 * A request that fails with a 429, a 5xx, a timeout, or a network error is retried twice. A
 * request that still fails, or fails with another status, leaves only its own keys out of the
 * result, and callers treat a missing answer as "not judged". ask() throws JudgeUnavailable only
 * when no key is set or when every request of the call fails. Under `bun test` the live endpoint
 * is off unless a fetch is injected, so a test suite never reaches the network by accident.
 */
export function createJevJudge(options: JevJudgeOptions = {}): Judge {
  const doFetch = options.fetch ?? fetch;
  const model = options.model ?? codecaineEnv("CODECAINE_DOCS_JUDGMENT_MODEL") ?? JEV_MODEL;
  const endpoint = options.endpoint ?? JEV_ENDPOINT;
  const concurrency = Math.max(1, options.concurrency ?? JEV_CONCURRENCY);
  const timeoutMs = options.timeoutMs ?? JEV_TIMEOUT_MS;
  const cache = new Map<string, number>();
  const remember = (key: string, p: number) => {
    cache.set(key, p);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  };

  /** One POST. Resolves to P(true). Throws TransientFailure when another try could succeed. */
  async function post(key: string, question: JudgeQuestion): Promise<number> {
    const signal = AbortSignal.timeout(timeoutMs);
    const timedOut = () => new TransientFailure(`Jev did not answer within ${timeoutMs} ms.`);
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          state: question.state,
          questions: { q: { type: "noul", instructions: question.question } },
        }),
      });
    } catch (error) {
      if (signal.aborted) throw timedOut();
      throw new TransientFailure(`Jev request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Read the body even on an error status, so the connection is released.
    const payload: any = await response.json().catch(() => undefined);
    if (signal.aborted) throw timedOut();
    if (response.status === 429 || response.status >= 500) throw new TransientFailure(`Jev returned HTTP ${response.status}.`, retryAfter(response));
    if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}.`);
    const answer = payload?.answers?.q;
    if (answer?.type !== "noul" || typeof answer.noul !== "number") throw new Error("Jev returned no noul answer.");
    return clamp(answer.noul);
  }

  /** post(), retried twice on a transient failure, after the server's retry-after or a backoff. */
  async function askOne(key: string, question: JudgeQuestion): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await post(key, question);
      } catch (error) {
        if (!(error instanceof TransientFailure) || attempt >= RETRIES) throw error;
        await sleep(error.pauseMs ?? backoff(attempt));
      }
    }
  }

  return {
    async ask(questions) {
      const answers = new Map<string, number>();
      // Identical (question, state) pairs share one request.
      const pending = new Map<string, JudgeQuestion[]>();
      for (const question of questions) {
        const cacheKey = `${model}\u0000${question.question}\u0000${JSON.stringify(question.state)}`;
        const hit = cache.get(cacheKey);
        const group = pending.get(cacheKey);
        if (hit !== undefined) answers.set(question.key, hit);
        else if (group) group.push(question);
        else pending.set(cacheKey, [question]);
      }
      if (!pending.size) return answers;
      if (process.env.NODE_ENV === "test" && !options.fetch) throw new JudgeUnavailable("Jev is off under bun test. Inject a fetch.");
      const key = options.apiKey ?? codecaineEnv("TYPESAFE_API_KEY");
      if (!key) throw new JudgeUnavailable("TYPESAFE_API_KEY is not set.");

      const groups = [...pending];
      const settled = await pool(
        groups.map(([cacheKey, group]) => async () => {
          const p = await askOne(key, group[0]!);
          remember(cacheKey, p);
          for (const question of group) answers.set(question.key, p);
        }),
        concurrency,
      );
      const failed = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed.length === groups.length) {
        const reason = failed[0]!.reason instanceof Error ? failed[0]!.reason.message : String(failed[0]!.reason);
        throw new JudgeUnavailable(`Jev answered none of ${groups.length} questions. ${reason}`);
      }
      return answers;
    },
  };
}
