import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// AI panel and annotation keeper flows (AGENTS.md product areas). Each case
// works on its own fixture doc.

async function bundle(request: APIRequestContext, path: string) {
  const response = await request.get(`/api/bundle?path=${path}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{ doc_hash: string; doc: { blocks: Record<string, { text?: { insert: string }[] }> } }>;
}

const paragraphText = async (request: APIRequestContext, path: string) =>
  ((await bundle(request, path)).doc.blocks["b-1"]?.text ?? []).map((span) => span.insert).join("");

/** Opens the doc with the AI panel showing (the Style rail closed, so the page keeps its width). */
async function openWithAiPanel(page: Page, path: string, paragraph: string) {
  await page.goto(`/#/${path}`);
  await expect(page.getByRole("main").getByText(paragraph)).toBeVisible();
  const closeStyle = page.getByRole("button", { name: "Close Style" });
  if (await closeStyle.isVisible()) await closeStyle.click();
  await page.getByRole("button", { name: "Show AI panel" }).click();
  const panel = page.getByRole("complementary", { name: "AI workspace" });
  await expect(panel).toBeVisible();
  return panel;
}

/** An agent stages a proposal that rewrites the doc's paragraph. */
async function stageProposal(request: APIRequestContext, path: string, summary: string, text: string) {
  const { doc_hash } = await bundle(request, path);
  const response = await request.post("/api/proposals", {
    data: { path, expected_hash: doc_hash, summary, ops: [{ type: "updateBlock", blockId: "b-1", text: [{ insert: text }] }] },
  });
  expect(response.status()).toBe(201);
}

test("shows the AI panel and queues a note on a block", async ({ page, request }) => {
  const panel = await openWithAiPanel(page, "60-annotate", "The fog horn sounds twice an hour.");
  await expect(panel.getByRole("button", { name: "Open (0)" })).toBeVisible();

  await page.getByRole("main").getByText("The fog horn sounds twice an hour.").click();
  await page.getByRole("textbox", { name: "What should change here?" }).fill("Say which horn.");
  await page.getByRole("button", { name: "Queue" }).click();

  await expect(panel.getByRole("button", { name: "Open (1)" })).toBeVisible();
  await expect(panel.getByText("Say which horn.")).toBeVisible();
  const annotations = await (await request.get("/api/annotations?path=60-annotate")).json();
  expect(annotations.annotations.annotations).toMatchObject([
    { body: "Say which horn.", intent: "agent-request", status: "open", target: { kind: "block", blockId: "b-1" } },
  ]);
});

test("accepts a staged proposal into the doc", async ({ page, request }) => {
  await openWithAiPanel(page, "61-proposal-accept", "Someone keeps the lamp.");
  await stageProposal(request, "61-proposal-accept", "Name the keeper", "Ada keeps the lamp.");

  const main = page.getByRole("main");
  await expect(main.getByText("Name the keeper")).toBeVisible();
  const accepted = page.waitForResponse((r) => /\/api\/proposals\/[^/]+\/accept$/.test(r.url()) && r.ok());
  await main.getByRole("button", { name: "Accept A1" }).click();
  await accepted;

  await expect(main.getByText("Ada keeps the lamp.")).toBeVisible();
  await expect(main.getByText("Someone keeps the lamp.")).toHaveCount(0);
  await expect(main.getByRole("button", { name: "Accept A1" })).toHaveCount(0);
  expect(await paragraphText(request, "61-proposal-accept")).toBe("Ada keeps the lamp.");
});

test("rejects a staged proposal and keeps the doc", async ({ page, request }) => {
  await openWithAiPanel(page, "62-proposal-reject", "The bell rings at noon.");
  await stageProposal(request, "62-proposal-reject", "Move the bell", "The bell rings at dusk.");

  const main = page.getByRole("main");
  await expect(main.getByText("Move the bell")).toBeVisible();
  // Reject offers feedback for the agent; a proposal with no request behind it is discarded.
  await main.getByRole("button", { name: "Reject A1" }).click();
  const rejected = page.waitForResponse((r) => /\/api\/proposals\/[^/]+\/reject$/.test(r.url()) && r.ok());
  await main.getByRole("button", { name: "Discard" }).click();
  await rejected;

  await expect(main.getByText("Move the bell")).toHaveCount(0);
  await expect(main.getByText("The bell rings at dusk.")).toHaveCount(0);
  await expect(main.getByText("The bell rings at noon.")).toBeVisible();
  expect(await paragraphText(request, "62-proposal-reject")).toBe("The bell rings at noon.");
});
