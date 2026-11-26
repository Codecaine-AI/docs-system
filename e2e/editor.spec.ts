import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Editing and autosave keeper flows (AGENTS.md product areas). Each case
// edits its own fixture doc, so cases sharing a worker never touch one doc.

type Bundle = { doc_hash: string; doc: { title: string; blocks: Record<string, { text?: { insert: string }[] }> } };

async function bundle(request: APIRequestContext, path: string): Promise<Bundle> {
  const response = await request.get(`/api/bundle?path=${path}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

function blockText(doc: Bundle, blockId = "b-1"): string {
  return (doc.doc.blocks[blockId]?.text ?? []).map((span) => span.insert).join("");
}

/** Another writer (a second tab or an agent) replaces the doc's paragraph. */
async function writeAs(request: APIRequestContext, path: string, text: string, sessionId: string) {
  const { doc_hash } = await bundle(request, path);
  return request.post("/api/ops", {
    data: { path, expected_hash: doc_hash, session_id: sessionId, ops: [{ type: "updateBlock", blockId: "b-1", text: [{ insert: text }] }] },
  });
}

/** Puts the caret at the end of the doc's text and types. */
async function typeAtEnd(page: Page, paragraph: string, text: string) {
  await page.getByRole("main").getByText(paragraph).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text);
}

const opsSaved = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/api/ops") && r.request().method() === "POST" && r.ok());

test("edits text in place and autosaves it", async ({ page, request }) => {
  await page.goto("/#/50-autosave");
  await expect(page.getByRole("main").getByText("The lamp burns until dawn.")).toBeVisible();

  const saved = opsSaved(page);
  await typeAtEnd(page, "The lamp burns until dawn.", " Then it rests.");
  await saved;

  await expect(page.getByRole("banner").getByText("Saved", { exact: true })).toBeVisible();
  expect(blockText(await bundle(request, "50-autosave"))).toBe("The lamp burns until dawn. Then it rests.");
  await page.reload();
  await expect(page.getByRole("main").getByText("The lamp burns until dawn. Then it rests.")).toBeVisible();
});

test("undoes the last save", async ({ page, request }) => {
  await page.goto("/#/55-undo");
  await expect(page.getByRole("main").getByText("Keep this line as it is.")).toBeVisible();
  await typeAtEnd(page, "Keep this line as it is.", " Oops.");
  const undo = page.getByRole("button", { name: "Undo last save" });
  await expect(undo).toBeVisible();
  expect(blockText(await bundle(request, "55-undo"))).toBe("Keep this line as it is. Oops.");

  const undone = page.waitForResponse((r) => r.url().endsWith("/api/undo") && r.ok());
  await undo.click();
  await undone;

  await expect(page.getByRole("main").getByText("Keep this line as it is.", { exact: true })).toBeVisible();
  expect(blockText(await bundle(request, "55-undo"))).toBe("Keep this line as it is.");
});

test("renames the page from its title", async ({ page, request }) => {
  await page.goto("/#/51-title");
  const title = page.getByRole("main").getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Untitled Draft");

  const renamed = page.waitForResponse((r) => r.url().endsWith("/api/title") && r.ok());
  await title.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Harbor Log");
  await page.keyboard.press("Enter");
  await renamed;

  expect((await bundle(request, "51-title")).doc.title).toBe("Harbor Log");
  await page.reload();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Harbor Log");
});

test("keeps the draft when the doc changed elsewhere, reloads on request, and saves the draft only when asked", async ({ page, request }) => {
  // The page misses the other writer's change: its live event stream is down.
  await page.route("**/api/events*", (route) => route.abort());
  await page.goto("/#/52-stale");
  await expect(page.getByRole("main").getByText("Both keepers write here.")).toBeVisible();
  expect((await writeAs(request, "52-stale", "The other keeper got here first.", "other-keeper")).ok()).toBe(true);

  await typeAtEnd(page, "Both keepers write here.", " Mine too.");

  const main = page.getByRole("main");
  await expect(main.getByText("Doc changed elsewhere — reload to continue. Your edits are kept.")).toBeVisible();
  await expect(main.getByText("Both keepers write here. Mine too.")).toBeVisible();
  expect(blockText(await bundle(request, "52-stale"))).toBe("The other keeper got here first.");

  // A reload that fails keeps the page and the draft, and the banner can try again.
  await page.route("**/api/bundle*", (route) => route.abort(), { times: 1 });
  await main.getByRole("button", { name: "Reload doc" }).click();
  await expect(main.getByText("Both keepers write here. Mine too.")).toBeVisible();
  await expect(main.getByRole("button", { name: "Reload doc" })).toBeVisible();

  await main.getByRole("button", { name: "Reload doc" }).click();
  await expect(main.getByText("The other keeper got here first.")).toBeVisible();
  // The draft waits beside the fresh page and is never saved on its own.
  await expect(main.getByText(/Your draft is kept and not saved/)).toBeVisible();
  expect(blockText(await bundle(request, "52-stale"))).toBe("The other keeper got here first.");

  const saved = opsSaved(page);
  await main.getByRole("button", { name: "Use my draft" }).click();
  await saved;
  expect(blockText(await bundle(request, "52-stale"))).toBe("Both keepers write here. Mine too.");
});

test("pauses saving while another session holds the draft lock", async ({ page, request }) => {
  const lock = await request.post("/api/draft-lock/acquire", { data: { path: "54-locked", sessionId: "other-keeper", kind: "doc" } });
  expect(lock.ok()).toBe(true);
  await page.goto("/#/54-locked");
  await expect(page.getByRole("main").getByText("Only one keeper at a time.")).toBeVisible();

  await typeAtEnd(page, "Only one keeper at a time.", " Me too?");

  await expect(page.getByRole("main").getByText(/Another session is editing this document/)).toBeVisible();
  await expect(page.getByRole("banner").getByText("Not saved")).toBeVisible();
  expect(blockText(await bundle(request, "54-locked"))).toBe("Only one keeper at a time.");
});

test("shows another writer's change live", async ({ page, request }) => {
  await page.goto("/#/53-live");
  await expect(page.getByRole("main").getByText("Watch this line change.")).toBeVisible();

  expect((await writeAs(request, "53-live", "Another keeper changed it.", "other-keeper")).ok()).toBe(true);

  await expect(page.getByRole("main").getByText("Another keeper changed it.")).toBeVisible();
  await expect(page.getByRole("main").getByText("Watch this line change.")).toHaveCount(0);
});
