import { expect, test } from "./fixtures";

test("opens a doc from the worker's own fixture corpus", async ({ page }) => {
  await page.goto("/#/10-field-notes");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Field Notes" })).toBeVisible();
  await expect(main.getByText("Lighthouse keepers log the weather at dawn.")).toBeVisible();
});
