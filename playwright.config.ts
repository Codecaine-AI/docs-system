import { randomUUID } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

// One id per `playwright test` run. Workers inherit it from the runner's
// environment, so each worker's fixture root is keyed by run and worker
// (see e2e/fixtures.ts). The next run gets a new id and fresh copies.
process.env.DOCS_E2E_RUN_ID ??= randomUUID();

// No `webServer`: `docs serve` binds one `--root` per process and writes
// `.index/` into it, so every worker starts its own server on its own copy of
// the fixture corpus. globalSetup builds the shared SPA cache once first.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
