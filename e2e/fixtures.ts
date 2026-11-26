import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

import { test as base } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const corpus = path.join(import.meta.dirname, "fixtures", "corpus");

export type DocsServer = {
  /** This worker's private copy of the fixture corpus. */
  docsRoot: string;
  url: string;
};

/**
 * Resolves with the URL `docs serve` logs once it is listening; rejects if it
 * exits first. With `--port 0` the server binds an OS-chosen port itself, so
 * no other process can take the port between choosing and binding it.
 */
function serverUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const ready = /\[docs-workbench\] (http:\/\/127\.0\.0\.1:\d+)\n/.exec(output);
      if (ready?.[1]) resolve(ready[1]);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => reject(new Error(`docs serve exited (${code}) before listening:\n${output}`)));
  });
}

export const test = base.extend<{}, { docsServer: DocsServer }>({
  docsServer: [
    async ({}, use, workerInfo) => {
      // A fresh copy per worker per run: the server writes `.index/` into its
      // root, so workers must never share a root or touch the checked-in corpus.
      const runId = process.env.DOCS_E2E_RUN_ID ?? "local";
      const workerDir = path.join(
        repoRoot,
        "test-results",
        "fixture-roots",
        runId,
        `worker-${workerInfo.workerIndex}`,
      );
      const docsRoot = path.join(workerDir, "docs");
      // The repo themes are copied too: a Style rail save writes the active
      // theme, and it must land in this worker's copy, never in themes/.
      const themesRoot = path.join(workerDir, "themes");
      await mkdir(workerDir, { recursive: true });
      await cp(corpus, docsRoot, { recursive: true });
      await cp(path.join(repoRoot, "themes"), themesRoot, { recursive: true });

      // Playwright sets FORCE_COLOR for workers. Without it removed, Bun wraps
      // the server's log lines in ANSI codes and the ready line never matches.
      const { DOCS_SHARED_API_URL, DOCS_SHARED_PROJECT_ID, DOCS_SHARED_API_TOKEN, FORCE_COLOR, ...env } =
        process.env;
      const child = spawn(
        "bun",
        [
          "packages/docs-cli/src/index.ts", "serve", "--standalone",
          "--root", docsRoot, "--themes-root", themesRoot, "--port", "0",
        ],
        {
          cwd: repoRoot,
          // An empty state dir keeps the machine's global themes and docs service out of the run.
          env: { ...env, NO_COLOR: "1", CODECAINE_DOCS_STATE_DIR: path.join(workerDir, "state") },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      // A worker torn down mid-setup skips the finally below; never leave the server behind.
      const killOnWorkerExit = () => child.kill();
      process.once("exit", killOnWorkerExit);
      const exited = new Promise((resolve) => child.once("exit", resolve));
      try {
        await use({ docsRoot, url: await serverUrl(child) });
      } finally {
        process.off("exit", killOnWorkerExit);
        child.kill();
        await exited;
      }
    },
    { scope: "worker" },
  ],
  baseURL: async ({ docsServer }, use) => {
    await use(docsServer.url);
  },
});

export { expect } from "@playwright/test";
