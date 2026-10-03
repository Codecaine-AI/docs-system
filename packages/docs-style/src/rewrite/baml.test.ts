import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RewriteRequest } from "../types";
import { messageText, startFakeModelServer, type FakeModelServer, type ModelReply } from "./fake-model-server";
import { createBamlRewriter, protectSpans, RewriteAnswerError } from "./index";

/** What the stand-in model answers unless a test changes it. A test that changes it puts it back. */
const GOOD_REPLY: ModelReply = { content: JSON.stringify({ markdown: "Run ⟦0⟧ first. Then publish the page." }) };
let server: FakeModelServer;
beforeAll(async () => {
  server = await startFakeModelServer(() => GOOD_REPLY);
});
afterAll(() => server.close());

const { markdown, tokens } = protectSpans([
  { insert: "Run " },
  { insert: "docs check", attributes: { code: true } },
  { insert: " first, and the page is then published by you." },
]);
const flagged = "Run \u0000 first, and the page is then published by you.";
const request: RewriteRequest = {
  blockType: "paragraph",
  markdown,
  tokens,
  findings: [{ ruleId: "ste.passive-voice", message: "Passive voice.", hint: "Use the active voice.", evidence: flagged, sentence: flagged }],
  flaggedSentences: [flagged],
  context: { heading: "Publish a Page" },
  allowList: false,
};

test("rewrites through codex-lb with Luna for fast and Sol for strong, probing once", async () => {
  const rewriter = createBamlRewriter({ codexLbUrl: `${server.baseUrl}/v1`, openRouterKey: "" });

  const fast = await rewriter.rewrite(request, "fast");
  const strong = await rewriter.rewrite(request, "strong");

  expect(fast).toMatchObject({ markdown: "Run ⟦0⟧ first. Then publish the page.", model: "gpt-6-luna", inputTokens: 812, outputTokens: 37 });
  expect(strong.model).toBe("gpt-6.1-sol");
  expect(server.probes).toEqual(["/v1/models"]);
  expect(server.requests.map(({ model, reasoning_effort, response_format }) => [model, reasoning_effort, response_format])).toEqual([
    ["gpt-6-luna", "low", { type: "json_object" }],
    ["gpt-6.1-sol", "low", { type: "json_object" }],
  ]);
  // The model sees the flagged sentence as masked text it can find in the block, plus the legend.
  const user = messageText(server.requests[0]!.messages.find((message) => message.role === "user")!.content);
  expect(user).toContain("1. Run ⟦0⟧ first, and the page is then published by you.");
  expect(user).toContain("where: flagged sentence 1");
  expect(user).toContain("⟦0⟧ = code: docs check");
  // codex-lb rejects json_object mode unless a user message says "json".
  expect(user.trimEnd().endsWith("Reply with the JSON object only.")).toBe(true);
});

test("rejects a reply the model did not finish, or one shaped like an array, without retrying", async () => {
  const rewriter = createBamlRewriter({ codexLbUrl: `${server.baseUrl}/v1`, openRouterKey: "" });
  const sent = server.requests.length;
  try {
    // A reply cut off at "length" parses leniently into partial text unless the client refuses it.
    server.answer = () => ({ content: JSON.stringify({ markdown: "Run ⟦0⟧ first. Then publish the" }), finishReason: "length" });
    await expect(rewriter.rewrite(request, "fast")).rejects.toThrow(/Rewrite on gpt-6-luna through codex-lb failed/);
    expect(server.requests.length).toBe(sent + 1);

    server.answer = () => ({ content: JSON.stringify({ markdown: ["Run ⟦0⟧ first.", "Then publish the page."] }) });
    await expect(rewriter.rewrite(request, "fast")).rejects.toBeInstanceOf(RewriteAnswerError);
  } finally {
    server.answer = () => GOOD_REPLY;
  }
});

test("fails with the reason when codex-lb is down and no OpenRouter key exists", async () => {
  const rewriter = createBamlRewriter({ codexLbUrl: `${server.baseUrl}/down/v1`, openRouterKey: "" });

  await expect(rewriter.rewrite(request, "fast")).rejects.toThrow(/No rewrite route: codex-lb does not answer/);
  // The probe reached the server and read its 503, so the route failed for the right reason.
  expect(server.probes).toContain("/down/v1/models");
});
