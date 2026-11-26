import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures";

// Embed and full-screen viewer keeper flows (AGENTS.md product areas): each
// embed opens full screen, zooms, fits, and closes with Escape.

const VIEWERS: Array<{ embed: string; open: string; dialog: string; zoom: (dialog: Locator) => Locator; fit: string }> = [
  {
    embed: "sequence",
    open: "Open Login flow in full-screen viewer",
    dialog: "Login flow sequence viewer",
    zoom: (dialog) => dialog.getByRole("status", { name: "Zoom level" }),
    fit: "Fit",
  },
  {
    embed: "canvas",
    // The hover toolbar covers the preview's center; its button opens the viewer.
    open: "Open canvas viewer",
    dialog: "One state, two readers canvas viewer",
    zoom: (dialog) => dialog.getByRole("button", { name: /^Zoom level/ }),
    fit: "Fit canvas",
  },
  {
    embed: "image",
    open: "Open One doc.json, two renders. in full-screen viewer",
    dialog: "One doc.json, two renders. image viewer",
    zoom: (dialog) => dialog.getByRole("status", { name: "Zoom level" }),
    fit: "Fit",
  },
];

for (const viewer of VIEWERS) {
  test(`opens the ${viewer.embed} embed full screen, zooms, fits, and closes with Escape`, async ({ page }) => {
    await page.goto("/#/40-embeds");
    await page.getByRole("main").getByRole("button", { name: viewer.open }).first().click();

    const dialog = page.getByRole("dialog", { name: viewer.dialog });
    await expect(dialog).toBeVisible();
    // It opens fitted to the viewport; the fitted zoom depends on the window size.
    const zoom = viewer.zoom(dialog);
    await expect(zoom).toHaveText(/^\d+%$/);
    const fitted = (await zoom.textContent())!;

    await dialog.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoom).not.toHaveText(fitted);
    await dialog.getByRole("button", { name: viewer.fit, exact: true }).click();
    await expect(zoom).toHaveText(fitted);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
