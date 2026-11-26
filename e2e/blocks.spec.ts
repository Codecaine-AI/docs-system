import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Structured block keeper flows (AGENTS.md product areas). The read flows use
// 30-blocks; each edit flow has its own doc.

type Block = { props: Record<string, unknown> };
async function block(request: APIRequestContext, path: string, blockId: string): Promise<Block> {
  const response = await request.get(`/api/bundle?path=${path}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).doc.blocks[blockId];
}

const opsSaved = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/api/ops") && r.request().method() === "POST" && r.ok());

test("edits a structured table cell and adds a row", async ({ page, request }) => {
  await page.goto("/#/31-table-edit");
  const table = page.getByRole("table", { name: "Keepers" });
  await expect(table.getByRole("row", { name: "North Point Ada" })).toBeVisible();

  let saved = opsSaved(page);
  await table.getByRole("textbox", { name: "Row 1, column 2" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Cora");
  await saved;
  saved = opsSaved(page);
  await page.getByRole("button", { name: "Add row" }).click();
  await saved;

  await expect(table.getByRole("row")).toHaveCount(4);
  expect((await block(request, "31-table-edit", "b-table")).props.rows).toEqual([
    ["North Point", "Cora"],
    ["Gull Rock", "Ben"],
    ["", ""],
  ]);
  await page.reload();
  await expect(page.getByRole("table", { name: "Keepers" }).getByRole("row", { name: "North Point Cora" })).toBeVisible();
});

test("opens a state shape field's description", async ({ page }) => {
  await page.goto("/#/30-blocks");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "TideReading" })).toBeVisible();
  await expect(main.getByText("Station name.")).toBeHidden();

  await main.getByRole("button", { name: "station", exact: true }).click();

  await expect(main.getByText("Station name.")).toBeVisible();
  await expect(main.getByRole("button", { name: "heightMeters (optional)" })).toBeVisible();
});

test("opens an interaction surface operation to its parameters", async ({ page }) => {
  await page.goto("/#/30-blocks");
  const main = page.getByRole("main");
  const operation = main.getByRole("group").filter({ hasText: "log.record" });
  await expect(operation).toContainText("(…) → void");
  await expect(main.getByRole("region", { name: "log.record parameters" })).toHaveCount(0);

  await operation.getByText("log.record").first().click();

  const parameters = main.getByRole("region", { name: "log.record parameters" });
  await expect(parameters.getByRole("button", { name: "reading", exact: true })).toBeVisible();
  await expect(parameters.getByText("TideReading")).toBeVisible();
  await expect(main.getByRole("region", { name: "log.record returns" }).getByRole("heading")).toHaveText(/Returns\s*void/);
});

test("reads a file tree nested from its paths", async ({ page }) => {
  await page.goto("/#/30-blocks");
  const tree = page.getByRole("list", { name: "File tree" });

  await expect(tree.getByRole("listitem", { level: 1 })).toHaveText(/stations\/\s*One folder per station/);
  await expect(tree.getByRole("listitem", { level: 2 })).toHaveText(/north-point\.json\s*North Point readings/);
});

test("changes a code block's language", async ({ page, request }) => {
  await page.goto("/#/32-code-edit");
  const main = page.getByRole("main");
  await expect(main.getByRole("code")).toHaveText('const tide = readTide("Gull Rock");');

  const saved = opsSaved(page);
  await main.getByRole("combobox", { name: "Code block language" }).selectOption("python");
  await saved;

  expect((await block(request, "32-code-edit", "b-code")).props.language).toBe("python");
  await page.reload();
  await expect(page.getByRole("main").getByRole("combobox", { name: "Code block language" })).toHaveValue("python");
});
