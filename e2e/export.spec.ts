import { readFile } from "node:fs/promises";

import type { Page } from "@playwright/test";
import { unzipSync } from "fflate";

import { expect, test } from "./fixtures";

// Export keeper flows (AGENTS.md product areas). The workbench's export UI is
// the "Export pages" dialog, which downloads PDFs. The static-site export is
// CLI-only (`docs-cli export`) and docs-publish is a host library, so their
// owner tests are the docs-workbench and docs-publish Bun areas.

async function openExport(page: Page, path: string) {
  await page.goto(`/#/${path}`);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export pages" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("exports the open page as one combined PDF", async ({ page }) => {
  const dialog = await openExport(page, "20-reading");
  // The open page starts selected.
  await expect(dialog.getByRole("checkbox", { name: "20-reading" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "10-field-notes" })).not.toBeChecked();

  await dialog.getByRole("combobox", { name: "Download as" }).selectOption({ label: "One combined PDF" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("contentinfo").getByRole("button", { name: "Export" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(dialog.getByRole("status")).toHaveText("1 page exported.");
});

test("exports selected pages as a ZIP with one PDF per page", async ({ page }) => {
  const dialog = await openExport(page, "20-reading");
  await dialog.getByRole("checkbox", { name: "30-blocks" }).check();
  await dialog.getByRole("combobox", { name: "Download as" }).selectOption({ label: "ZIP of PDFs · preserve folders" });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("contentinfo").getByRole("button", { name: "Export" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const entries = unzipSync(new Uint8Array(await readFile(await download.path())));
  expect(Object.keys(entries).sort()).toEqual(["20-reading.pdf", "30-blocks.pdf"]);
  for (const pdf of Object.values(entries)) expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  await expect(dialog.getByRole("status")).toHaveText("2 pages exported.");
});
