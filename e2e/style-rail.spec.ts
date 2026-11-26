import { readFile } from "node:fs/promises";

import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Style rail and theme keeper flows (AGENTS.md product areas). A save writes
// this worker's copy of the repo themes, so a case that needs the stock size
// reads the current one first instead of assuming it.

const PARAGRAPH = "Lighthouse keepers log the weather at dawn.";

/** Opens Field Notes with the Style rail on its Typography section. */
async function openTypography(page: Page): Promise<{ rail: Locator; fontSize: Locator; paragraph: Locator }> {
  await page.goto("/#/10-field-notes");
  const paragraph = page.getByRole("main").getByText(PARAGRAPH);
  await expect(paragraph).toBeVisible();
  const rail = page.getByRole("complementary", { name: "Style" });
  if (!(await rail.isVisible())) await page.getByRole("banner").getByRole("button", { name: "Style" }).click();
  await rail.getByRole("button", { name: "Typography" }).click();
  return { rail, fontSize: rail.getByRole("slider", { name: /^Font size/ }), paragraph };
}

test("opens Style and moves a knob that restyles the page", async ({ page }) => {
  const { rail, fontSize, paragraph } = await openTypography(page);
  await rail.getByRole("button", { name: "Close Style" }).click();
  await expect(rail).toHaveCount(0);
  await page.getByRole("banner").getByRole("button", { name: "Style" }).click();
  await rail.getByRole("button", { name: "Typography" }).click();

  await fontSize.fill("22");

  await expect(paragraph).toHaveCSS("font-size", "22px");
  await expect(rail.getByRole("slider", { name: "Font size 22px" })).toBeVisible();
});

test("saves the style to the repo theme, so a new session starts with it", async ({ page, browser, docsServer }) => {
  const { rail, fontSize } = await openTypography(page);
  await fontSize.fill("26");
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/themes") && r.request().method() === "POST" && r.ok());
  await rail.getByRole("button", { name: "Save style to repo" }).click();
  await saved;

  // A fresh browser session has none of this page's local settings.
  const fresh = await browser.newContext({ baseURL: docsServer.url });
  const freshPage = await fresh.newPage();
  await freshPage.goto("/#/10-field-notes");
  await expect(freshPage.getByRole("main").getByText(PARAGRAPH)).toHaveCSS("font-size", "26px");
  await fresh.close();
});

test("exports a theme and imports it back after a reset", async ({ page }, testInfo) => {
  const { rail, fontSize, paragraph } = await openTypography(page);
  const stock = await fontSize.inputValue();
  await fontSize.fill("21");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    rail.getByRole("button", { name: "Export theme" }).click(),
  ]);
  const file = testInfo.outputPath("exported-theme.json");
  await download.saveAs(file);
  expect(JSON.parse(await readFile(file, "utf8")).settings.typography.fontSize).toBe(21);

  await rail.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(fontSize).toHaveValue(stock);
  await rail.getByLabel("Import theme").setInputFiles(file);

  await expect(fontSize).toHaveValue("21");
  await expect(paragraph).toHaveCSS("font-size", "21px");
});

test("resets the style to the theme defaults", async ({ page }) => {
  const { rail, fontSize, paragraph } = await openTypography(page);
  const stock = await fontSize.inputValue();
  const stockSize = await paragraph.evaluate((element) => getComputedStyle(element).fontSize);
  await fontSize.fill(stock === "14" ? "15" : "14");
  await expect(paragraph).not.toHaveCSS("font-size", stockSize);

  await rail.getByRole("button", { name: "Reset to defaults" }).click();

  await expect(fontSize).toHaveValue(stock);
  await expect(paragraph).toHaveCSS("font-size", stockSize);
});

test("switches the code theme", async ({ page, request }) => {
  await page.goto("/#/32-code-edit");
  const code = page.getByRole("main").getByRole("code");
  await expect(code).toHaveText('const tide = readTide("Gull Rock");');
  const keyword = code.getByText("const");
  const darkColor = await keyword.evaluate((element) => getComputedStyle(element).color);
  const rail = page.getByRole("complementary", { name: "Style" });
  if (!(await rail.isVisible())) await page.getByRole("banner").getByRole("button", { name: "Style" }).click();
  await rail.getByRole("button", { name: "Typography" }).click();

  const switched = page.waitForResponse((r) => r.url().endsWith("/api/code-themes/active") && r.request().method() === "PUT" && r.ok());
  await rail.getByRole("combobox", { name: "Code theme" }).selectOption({ label: "Light+ (built-in)" });
  await switched;

  await expect(keyword).not.toHaveCSS("color", darkColor);
  const active = await (await request.get("/api/code-themes/active")).json();
  await page.reload();
  await expect(page.getByRole("main").getByRole("code").getByText("const")).not.toHaveCSS("color", darkColor);
  expect(JSON.stringify(active)).toMatch(/light/i);
});
