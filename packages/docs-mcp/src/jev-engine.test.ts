import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DocBlock, DocDocument } from "@codecaine-ai/docs-model";
import { createJevEngine, judgmentEnabled, JudgmentUnavailable, type JevEngineOptions } from "./jev-engine";
import { judgedStyleGate, judgmentRules, ruleTargets, type JudgmentRule } from "./lint-feedback";

// Every call goes through a stub fetch. Nothing here reaches the network.
const savedEnv = { file: process.env.CODECAINE_ENV_FILE, judgment: process.env.CODECAINE_DOCS_JUDGMENT };
beforeEach(() => { process.env.CODECAINE_ENV_FILE = "/nonexistent/codecaine-env"; delete process.env.CODECAINE_DOCS_JUDGMENT; });
afterEach(() => {
  for (const [name, value] of [["CODECAINE_ENV_FILE", savedEnv.file], ["CODECAINE_DOCS_JUDGMENT", savedEnv.judgment]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

const block = (id: string, type: DocBlock["type"], text: string, children: string[] = [], props: Record<string, unknown> = {}): DocBlock =>
  ({ id, type, props, children, text: [{ insert: text }] });
const page = (items: string[], lead = "The kernel has three parts."): DocDocument => ({
  schemaVersion: 1, id: "p", title: "Kernel", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["h", "lead", ...items.map((_, i) => `i${i}`), "tail"] },
    h: block("h", "heading", "Parts", [], { level: 2 }),
    lead: block("lead", "paragraph", lead),
    ...Object.fromEntries(items.map((text, i) => [`i${i}`, block(`i${i}`, "list-item", text)])),
    tail: block("tail", "paragraph", "That is all."),
  },
});
const doc = page(["The loader reads the file.", "The router picks a node.", "The writer saves the trace."]);
const rule = (id: string) => judgmentRules.find((r) => r.id === id)!;

type Call = { url: string; headers: Record<string, string>; body: any };
/** A fetch stub that answers every question from `answer(question)`. */
function stub(answer: (question: any, key: string) => unknown, status = 200) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, headers: init.headers as Record<string, string>, body });
    const answers = Object.fromEntries(Object.entries(body.questions).map(([key, q]) => [key, answer(q, key)]));
    return new Response(JSON.stringify(status === 200 ? { model: body.model, answers, usage: { input_tokens: 100, output_tokens: 10 } } : { error: "boom" }), { status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}
const engineWith = (fetch: typeof globalThis.fetch, extra: JevEngineOptions = {}) =>
  createJevEngine({ fetch, apiKey: () => "test-key", enabled: () => true, ...extra });
const noul = (p: number) => ({ type: "noul", noul: p });

describe("request building", () => {
  test("one question per request carries the rule's state, the model, and the bearer key", async () => {
    const { calls, fetch } = stub(() => noul(0.1));
    await engineWith(fetch, { model: "jev-test" }).judge({ doc, blockIds: ["i0"], rules: [rule("judgment.flat-hierarchy")] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0]!.headers.authorization).toBe("Bearer test-key");
    expect(calls[0]!.body.model).toBe("jev-test");
    expect(calls[0]!.body.state).toEqual({ heading: "Parts", lead: "The kernel has three parts.", bullets: ["The loader reads the file.", "The router picks a node.", "The writer saves the trace."] });
    expect(calls[0]!.body.questions.q0.type).toBe("noul");
    expect(calls[0]!.body.questions.q0.instructions).toContain("`bullets`");
  });

  test("choice questions send option criteria, and batched questions scope state fields by key", async () => {
    const { calls, fetch } = stub(() => ({ type: "choice", choice: "one_point", probabilities: { one_point: 1 } }));
    await engineWith(fetch, { batchSize: 3 }).judge({ doc, blockIds: ["i0", "i1", "i2"], rules: [rule("judgment.packed-bullet")] });
    expect(calls).toHaveLength(1);
    const { state, questions } = calls[0]!.body;
    expect(Object.keys(state)).toEqual(["q0", "q1", "q2"]);
    expect(state.q1.bullet).toBe("The router picks a node.");
    expect(questions.q1.instructions).toContain("`q1.bullet`");
    expect(Object.keys(questions.q0.criteria)).toEqual(["one_point", "unrelated_points", "paragraph", "fragment"]);
  });

  test("more questions than maxRequests are batched to stay within the request cap", async () => {
    const { calls, fetch } = stub(() => ({ type: "choice", probabilities: { one_point: 1 } }));
    await engineWith(fetch, { maxRequests: 2 }).judge({ doc, blockIds: ["i0", "i1", "i2"], rules: [rule("judgment.packed-bullet")] });
    expect(calls.map((c) => Object.keys(c.body.questions).length)).toEqual([2, 1]);
  });
});

describe("response parsing", () => {
  test("noul, choice, and score answers become findings with probabilities and fixes", async () => {
    const score: JudgmentRule = { id: "t.score", kind: "score", question: "How unclear is `block`?", appliesTo: ["paragraph"], threshold: 0.5, gate: false, fix: "Say it plainly.", levels: ["Clear", "Vague", "Opaque"] };
    const { fetch } = stub((q) => q.type === "noul" ? noul(0.9)
      : q.type === "score" ? { type: "score", score: 1.5, legend: {}, probabilities: {}, confidence: 0.5 }
      : { type: "choice", choice: "paragraph", probabilities: { one_point: 0.2, unrelated_points: 0.1, paragraph: 0.6, fragment: 0.1 } });
    const found = await engineWith(fetch).judge({ doc, blockIds: ["i0", "lead"], rules: [rule("judgment.packed-bullet"), rule("judgment.flat-hierarchy"), rule("judgment.join-test"), score] });
    const by = (id: string, blockId: string) => found.find((f) => f.ruleId === id && f.blockId === blockId)!;
    // A choice reports the summed probability of options with a fix, and the likeliest option's fix.
    expect(by("judgment.packed-bullet", "i0").probability).toBeCloseTo(0.8);
    expect(by("judgment.packed-bullet", "i0").message).toBe("Bullet is a whole paragraph.");
    expect(by("judgment.packed-bullet", "i0").fix).toBe("Make the bullet a bold-label parent. Put each fact in its own one-sentence sub-bullet.");
    expect(by("judgment.flat-hierarchy", "i0").probability).toBe(0.9);
    expect(by("judgment.join-test", "lead").probability).toBe(0.9);
    expect(by("t.score", "lead").probability).toBeCloseTo(0.75);
    expect(by("judgment.packed-bullet", "i0").evidence).toBe("The loader reads the file.");
  });

  test("an inverted noul reports the probability of the negative answer", async () => {
    const good: JudgmentRule = { id: "t.inverted", kind: "noul", question: "Is `block` clear?", appliesTo: ["paragraph"], threshold: 0.5, gate: false, fix: "Clarify.", invert: true };
    const { fetch } = stub(() => noul(0.8));
    expect((await engineWith(fetch).judge({ doc, blockIds: ["tail"], rules: [good] }))[0]!.probability).toBeCloseTo(0.2);
  });

  test("a malformed answer drops that finding without failing the call", async () => {
    const { fetch } = stub(() => ({ type: "noul" }));
    expect(await engineWith(fetch).judge({ doc, blockIds: ["i0"], rules: [rule("judgment.flat-hierarchy")] })).toEqual([]);
  });
});

describe("fail open", () => {
  const ask = { doc, blockIds: ["i0"], rules: [rule("judgment.flat-hierarchy")] };
  test("a missing key throws JudgmentUnavailable before any request", async () => {
    const { calls, fetch } = stub(() => noul(0.9));
    const engine = createJevEngine({ fetch, apiKey: () => undefined, enabled: () => true });
    await expect(engine.judge(ask)).rejects.toThrow("TYPESAFE_API_KEY is not set.");
    expect(calls).toHaveLength(0);
  });

  test("a non-2xx response throws, and 429 is retried once", async () => {
    const failing = stub(() => noul(0.9), 500);
    await expect(engineWith(failing.fetch).judge(ask)).rejects.toBeInstanceOf(JudgmentUnavailable);
    expect(failing.calls).toHaveLength(1);
    const limited = stub(() => noul(0.9), 429);
    await expect(engineWith(limited.fetch).judge(ask)).rejects.toThrow("Jev returned HTTP 429.");
    expect(limited.calls).toHaveLength(2);
  });

  test("a request past the deadline is aborted and reported as a timeout", async () => {
    const hang = ((_: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(engineWith(hang, { timeoutMs: 20 }).judge(ask)).rejects.toThrow("Jev did not answer within 20 ms.");
  });

  test("docs_check's judged gate reports unavailable judgment instead of throwing", async () => {
    const { fetch } = stub(() => noul(0.9), 500);
    expect(await judgedStyleGate({ engine: engineWith(fetch), baseline: null, doc })).toEqual({ available: false, reason: "Jev returned HTTP 500." });
  });
});

describe("cache", () => {
  test("unchanged states are answered from memory, and a changed block is asked again", async () => {
    const { calls, fetch } = stub(() => noul(0.9));
    const engine = engineWith(fetch);
    const rules = [rule("judgment.flat-hierarchy")];
    const first = await engine.judge({ doc, blockIds: ["i0"], rules });
    expect(await engine.judge({ doc, blockIds: ["i0"], rules })).toEqual(first);
    expect(calls).toHaveLength(1);
    await engine.judge({ doc: page(["The loader reads the file twice.", "The router picks a node.", "The writer saves the trace."]), blockIds: ["i0"], rules });
    expect(calls).toHaveLength(2);
    // The model is part of the key.
    await engineWith(fetch, { model: "jev-other" }).judge({ doc, blockIds: ["i0"], rules });
    expect(calls).toHaveLength(3);
  });
});

describe("kill switch", () => {
  test("CODECAINE_DOCS_JUDGMENT=off disables the default engine without a request", async () => {
    process.env.CODECAINE_DOCS_JUDGMENT = "off";
    expect(judgmentEnabled()).toBe(false);
    const { calls, fetch } = stub(() => noul(0.9));
    const engine = createJevEngine({ fetch, apiKey: () => "test-key" });
    await expect(engine.judge({ doc, blockIds: ["i0"], rules: [rule("judgment.flat-hierarchy")] })).rejects.toThrow("Judgment is off (CODECAINE_DOCS_JUDGMENT=off).");
    expect(calls).toHaveLength(0);
    process.env.CODECAINE_DOCS_JUDGMENT = "on";
    expect(judgmentEnabled()).toBe(true);
  });

  test("the shared env file can switch judgment off", async () => {
    const file = `${process.env.TMPDIR ?? "/tmp"}/jev-env-${process.pid}`;
    await Bun.write(file, "CODECAINE_DOCS_JUDGMENT=off\n");
    process.env.CODECAINE_ENV_FILE = file;
    expect(judgmentEnabled()).toBe(false);
  });

  test("judgment stays off under bun test unless switched on", () => {
    expect(process.env.NODE_ENV).toBe("test");
    expect(judgmentEnabled()).toBe(false);
  });
});

describe("rule targets", () => {
  test("flat-hierarchy judges a run once, on its first item, and skips runs with sub-bullets or numbers", () => {
    const flat = rule("judgment.flat-hierarchy");
    expect(ruleTargets(flat, doc, ["i2", "i1", "lead"])).toEqual(["i0"]);
    const nested = structuredClone(doc);
    nested.blocks.i1!.children = ["sub"];
    nested.blocks.sub = block("sub", "list-item", "A detail.");
    expect(ruleTargets(flat, nested, ["i0"])).toEqual([]);
    const ordered = structuredClone(doc);
    for (const id of ["i0", "i1", "i2"]) ordered.blocks[id]!.props = { ordered: true };
    expect(ruleTargets(flat, ordered, ["i0"])).toEqual([]);
    expect(ruleTargets(flat, page(["One.", "Two."]), ["i0"])).toEqual([]);
  });

  test("join-test judges the paragraph before a list when the paragraph or any item changes", () => {
    const join = rule("judgment.join-test");
    expect(ruleTargets(join, doc, ["i2"])).toEqual(["lead"]);
    expect(ruleTargets(join, doc, ["tail"])).toEqual([]);
  });
});
