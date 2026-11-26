import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

import { test as base } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const corpus = path.join(import.meta.dirname, "fixtures", "corpus");

export type DocsServer = {
  /** This worker's private copy of the fixture corpus. */
  docsRoot: string;
  url: string;
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not read a free port"));
      });
    });
  });
}

/** Resolves when `docs serve` logs its URL; rejects if it exits first. */
function serverListening(child: ChildProcess, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(url)) resolve();
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
      await mkdir(workerDir, { recursive: true });
      await cp(corpus, docsRoot, { recursive: true });

      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      const { DOCS_SHARED_API_URL, DOCS_SHARED_PROJECT_ID, DOCS_SHARED_API_TOKEN, ...env } = process.env;
      const child = spawn(
        "bun",
        ["packages/docs-cli/src/index.ts", "serve", "--standalone", "--root", docsRoot, "--port", String(port)],
        {
          cwd: repoRoot,
          // An empty state dir keeps the machine's global themes and docs service out of the run.
          env: { ...env, CODECAINE_DOCS_STATE_DIR: path.join(workerDir, "state") },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const exited = new Promise((resolve) => child.once("exit", resolve));
      try {
        await serverListening(child, url);
        await use({ docsRoot, url });
      } finally {
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
