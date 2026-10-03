import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JudgeUnavailable } from "../types";
import { createJevJudge } from "./jev";

// Every test runs against an empty env file and no key or model in the process, so the result
// never depends on the developer's ~/.config/codecaine/env. No test reaches the network.
const ENV_NAMES = ["CODECAINE_ENV_FILE", "TYPESAFE_API_KEY", "CODECAINE_DOCS_JUDGMENT_MODEL"] as const;
let saved: Record<string, string | undefined>;
let dir: string;
let envFile: string;
beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  dir = mkdtempSync(join(tmpdir(), "jev-judge-"));
  envFile = join(dir, "env");
  writeFileSync(envFile, "");
  process.env.CODECAINE_ENV_FILE = envFile;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.CODECAINE_DOCS_JUDGMENT_MODEL;
});
afterEach(() => {
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  rmSync(dir, { recursive: true, force: true });
});

type Call = { url: string; headers: Headers; body: any };
/** A fetch that records each request and answers with `respond`. */
function fakeFetch(respond: (body: any, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url: String(url), headers: new Headers(init.headers), body });
    return respond(body, init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}
const noul = (p: number) => Response.json({ model: "jev-1.13.0", answers: { q: { type: "noul", noul: p } }, usage: { input_tokens: 40, output_tokens: 1 } });
const ask = (block: string, key = block) => ({ key, question: "Is `block` bad?", state: { block } });

test("asks each question in its own noul request and returns P(true) by key", async () => {
  const { fetch, calls } = fakeFetch((body) => noul(body.state.block === "a" ? 0.9 : 0.2));
  const answers = await createJevJudge({ apiKey: "key", fetch }).ask([ask("a", "one"), ask("b", "two")]);
  expect(answers).toEqual(new Map([["one", 0.9], ["two", 0.2]]));
  expect(calls.map((call) => call.url)).toEqual(["https://api.typesafe.ai/v1/systemone", "https://api.typesafe.ai/v1/systemone"]);
  expect(calls[0]!.headers.get("authorization")).toBe("Bearer key");
  expect(calls[0]!.body).toEqual({
    model: "jev-1.13.0",
    state: { block: "a" },
    questions: { q: { type: "noul", instructions: "Is `block` bad?" } },
  });
});

test("asks once for a repeated question and state, within a call and across calls", async () => {
  const { fetch, calls } = fakeFetch(() => noul(0.7));
  const judge = createJevJudge({ apiKey: "key", fetch });
  expect(await judge.ask([ask("a", "x"), ask("a", "y")])).toEqual(new Map([["x", 0.7], ["y", 0.7]]));
  expect(await judge.ask([ask("a", "z")])).toEqual(new Map([["z", 0.7]]));
  expect(calls).toHaveLength(1);
});

test("retries a timeout and a rate limit, then answers", async () => {
  const { fetch, calls } = fakeFetch((_body, init) => {
    if (calls.length === 1) return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
    if (calls.length === 2) return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
    return noul(0.6);
  });
  expect(await createJevJudge({ apiKey: "key", fetch, timeoutMs: 20 }).ask([ask("a")])).toEqual(new Map([["a", 0.6]]));
  expect(calls).toHaveLength(3);
});

test("a request that still fails after two retries drops only its own answer", async () => {
  const { fetch, calls } = fakeFetch((body) =>
    body.state.block === "broken" ? new Response("down", { status: 503, headers: { "retry-after": "0" } }) : noul(0.4),
  );
  const judge = createJevJudge({ apiKey: "key", fetch });
  expect(await judge.ask([ask("a"), ask("broken"), ask("b")])).toEqual(new Map([["a", 0.4], ["b", 0.4]]));
  expect(calls.filter((call) => call.body.state.block === "broken")).toHaveLength(3);
  // Only a call in which every request fails makes Jev unavailable.
  await expect(judge.ask([ask("broken")])).rejects.toBeInstanceOf(JudgeUnavailable);
});

test("reads the key from the shared env file, and without a key sends nothing", async () => {
  const { fetch, calls } = fakeFetch(() => noul(0.5));
  writeFileSync(envFile, "TYPESAFE_API_KEY=from-file\n");
  await createJevJudge({ fetch }).ask([ask("a")]);
  expect(calls[0]!.headers.get("authorization")).toBe("Bearer from-file");

  writeFileSync(envFile, "# no key here\n");
  await expect(createJevJudge({ fetch }).ask([ask("b")])).rejects.toBeInstanceOf(JudgeUnavailable);
  expect(calls).toHaveLength(1);
});
