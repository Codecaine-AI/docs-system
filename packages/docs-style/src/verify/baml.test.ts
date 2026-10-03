import { afterAll, beforeAll, expect, test } from "bun:test";
import { messageText, startFakeModelServer, type FakeModelServer } from "../rewrite/fake-model-server";
import { createBamlVerifier } from "./index";

/** The stand-in model's answers, as MeaningCheck objects, in the order requests arrive. */
const DROPPED_LINK = { kind: "Relation", before: "X — the promise", after: "X. The promise holds.", why: "The link between X and the promise is lost." };
let server: FakeModelServer;
let answers: unknown[] = [];
beforeAll(async () => {
  server = await startFakeModelServer(() => ({ content: JSON.stringify(answers.shift()) }));
});
afterAll(() => server.close());

const input = { before: "Every type answers both readers — the promise.", after: "Every type answers both readers. The promise holds.", blockType: "paragraph", heading: "Why" };
const verifier = () => createBamlVerifier({ codexLbUrl: `${server.baseUrl}/v1`, openRouterKey: "" });

test("asks Sol at medium effort for a strict meaning check, and reports each difference it finds", async () => {
  answers = [{ differences: [DROPPED_LINK], same: false }];
  const sent = server.requests.length;

  const verdict = await verifier().compare(input);

  expect(verdict).toMatchObject({ same: false, model: "gpt-6.1-sol", inputTokens: 812, outputTokens: 37 });
  expect(verdict.differences).toEqual([{ ...DROPPED_LINK, kind: "relation" }]);
  const body = server.requests[sent]!;
  expect([body.model, body.reasoning_effort, body.response_format?.type]).toEqual(["gpt-6.1-sol", "medium", "json_schema"]);
  expect(body.response_format?.json_schema).toMatchObject({ name: "meaning_check", strict: true, schema: { required: ["differences", "same"] } });
  const user = messageText(body.messages.find((message) => message.role === "user")!.content);
  for (const text of [input.before, input.after, "Section heading: Why"]) expect(user).toContain(text);
});

test.each([
  ["no difference and same", { differences: [], same: true }, true],
  ["a difference while it says same", { differences: [DROPPED_LINK], same: true }, false],
  ["different with no difference named", { differences: [], same: false }, false],
])("is same only when the model finds no difference and says so: %s", async (_, answer, same) => {
  answers = [answer];

  expect((await verifier().compare(input)).same).toBe(same);
});

test("with two samples, one answer that finds a difference makes the verdict different", async () => {
  answers = [{ differences: [], same: true }, { differences: [DROPPED_LINK], same: false }];
  const sent = server.requests.length;

  const verdict = await createBamlVerifier({ codexLbUrl: `${server.baseUrl}/v1`, openRouterKey: "", samples: 2 }).compare(input);

  expect(server.requests.length).toBe(sent + 2);
  expect(verdict).toMatchObject({ same: false, differences: [{ kind: "relation" }], inputTokens: 1624, outputTokens: 74 });
});

test("a reply the model did not finish is an error, never a verdict", async () => {
  server.answer = () => ({ content: '{"differences": [], "same": tr', finishReason: "length" });
  try {
    await expect(verifier().compare(input)).rejects.toThrow(/Meaning check on gpt-6.1-sol through codex-lb failed/);
  } finally {
    server.answer = () => ({ content: JSON.stringify(answers.shift()) });
  }
});
