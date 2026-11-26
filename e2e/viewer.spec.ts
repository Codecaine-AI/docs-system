import { expect, test } from "./fixtures";

// Viewer and navigation keeper flows (AGENTS.md product areas).

test("opens a doc from the tree", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  // The root route lands on the first doc in the tree.
  await expect(main.getByRole("heading", { name: "Field Notes", exact: true })).toBeVisible();
  await expect(main.getByText("Lighthouse keepers log the weather at dawn.")).toBeVisible();

  await page.getByRole("navigation", { name: "Docs tree" }).getByRole("link", { name: /reading/ }).click();

  await expect(main.getByRole("heading", { name: "Reading Room" })).toBeVisible();
  await expect(page).toHaveURL(/#\/20-reading$/);
});

test("follows a doc link through the side peek", async ({ page }) => {
  await page.goto("/#/20-reading");
  const main = page.getByRole("main");
  await main.getByText("Field Notes", { exact: true }).click();

  const peek = page.getByRole("complementary", { name: "Doc preview" });
  await expect(peek.getByRole("heading", { name: "Field Notes" })).toBeVisible();
  await expect(peek.getByText("Lighthouse keepers log the weather at dawn.")).toBeVisible();
  // The peek opens beside the page; the reader stays on the linking doc.
  await expect(main.getByRole("heading", { name: "Reading Room" })).toBeVisible();

  await peek.getByRole("button", { name: "Open in full" }).click();

  await expect(page).toHaveURL(/#\/10-field-notes$/);
  await expect(main.getByRole("heading", { name: "Field Notes", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Doc preview" })).toHaveCount(0);
});

test("routes by hash, and Back returns to the previous doc", async ({ page }) => {
  await page.goto("/#/30-blocks");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Block Gallery" })).toBeVisible();

  await page.getByRole("navigation", { name: "Docs tree" }).getByRole("link", { name: /reading/ }).click();
  await expect(main.getByRole("heading", { name: "Reading Room" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/30-blocks$/);
  await expect(main.getByRole("heading", { name: "Block Gallery" })).toBeVisible();
});
