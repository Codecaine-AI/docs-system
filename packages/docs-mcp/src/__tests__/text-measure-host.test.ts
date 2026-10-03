import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_PATH, PACKAGE_ROOT } from "../lifecycle";

/**
 * Both processes that lint for the docs MCP load text-measure's exact
 * HarfBuzz backend at startup and report it on /health as `textMeasure`.
 * Each runs as a fresh process, without the test preload.
 */

async function until<T>(read: () => Promise<T | undefined>, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read().catch(() => undefined);
    if (value !== undefined) return value;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

test("the docs service daemon measures with HarfBuzz", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-mcp-text-measure-"));
  const state = join(root, "state");
  const daemon = Bun.spawn([process.execPath, CLI_PATH, "daemon"], {
    cwd: PACKAGE_ROOT, stdout: "ignore", stderr: "ignore", env: { ...process.env, CODECAINE_DOCS_STATE_DIR: state },
  });
  try {
    const { url, token } = await until(async () => JSON.parse(await readFile(join(state, "daemon.json"), "utf8")) as { url: string; token: string }, "daemon.json");
    const health = await (await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(health.textMeasure).toEqual({ name: "harfbuzz", exact: true });
    await fetch(`${url}/shutdown`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } finally {
    daemon.kill();
    await daemon.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("the managed runtime measures with HarfBuzz", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-mcp-text-measure-"));
  const registry = join(root, "registry.json");
  await writeFile(registry, JSON.stringify({ workspaces: [], projects: [] }));
  const runtime = Bun.spawn([process.execPath, join(PACKAGE_ROOT, "src/managed-runtime.ts")], {
    cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "ignore",
    env: { ...process.env, CODECAINE_DOCS_RUNTIME_TOKEN: "test-token", CODECAINE_DOCS_REGISTRY: registry, CODECAINE_DOCS_BUILD: "test" },
  });
  try {
    const reader = runtime.stdout.getReader();
    let output = "";
    const port = await until(async () => {
      const { value, done } = await reader.read();
      if (done) throw new Error("runtime exited");
      output += new TextDecoder().decode(value);
      const ready = /\{"ready":true,"port":(\d+)\}/.exec(output);
      return ready ? Number(ready[1]) : undefined;
    }, "the runtime's ready line");
    const health = await (await fetch(`http://127.0.0.1:${port}/health`, { headers: { Authorization: "Bearer test-token" } })).json();
    expect(health.textMeasure).toEqual({ name: "harfbuzz", exact: true });
  } finally {
    runtime.kill();
    await runtime.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
