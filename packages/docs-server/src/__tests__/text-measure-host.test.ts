import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Layout lints measure text with text-measure's exact HarfBuzz backend. The
 * routes load it themselves, so any host that embeds them lints exactly. A
 * fresh process (no test preload) shows it: the backend is the approximate
 * table before the routes exist and HarfBuzz once a save has linted.
 */
test("createDocsRoutes loads HarfBuzz, and a save-time lint waits for it", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-server-text-measure-"));
  try {
    const docsRoot = join(root, "docs");
    await mkdir(join(docsRoot, "page"), { recursive: true });
    const doc = {
      schemaVersion: 1, id: "page", title: "Page", root: "root",
      blocks: { root: { id: "root", type: "paragraph", props: {}, children: ["p"] }, p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: "Original." }] } },
    };
    await writeFile(join(docsRoot, "page", "doc.json"), `${JSON.stringify(doc, null, 2)}\n`);
    const src = join(import.meta.dir, "..");
    const script = join(root, "host.ts");
    await writeFile(script, `
      import { activeBackend } from ${JSON.stringify(Bun.resolveSync("@codecaine-ai/text-measure", src))};
      import { createDocsRoutes } from ${JSON.stringify(join(src, "routes.ts"))};
      import { createDocsStore } from ${JSON.stringify(join(src, "store.ts"))};
      const before = activeBackend().name;
      const app = createDocsRoutes(createDocsStore(${JSON.stringify(docsRoot)}));
      const bundle = await (await app.handle(new Request("http://localhost/api/bundle?path=page"))).json();
      const saved = await app.handle(new Request("http://localhost/api/ops", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "page", expected_hash: bundle.doc_hash, ops: [{ type: "updateBlock", blockId: "p", text: [{ insert: "Edited." }] }] }),
      }));
      console.log(JSON.stringify({ before, status: saved.status, after: activeBackend() }));
    `);
    const run = Bun.spawn([process.execPath, script], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = [await new Response(run.stdout).text(), await new Response(run.stderr).text()];
    expect(await run.exited, stderr).toBe(0);
    expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual({ before: "table", status: 200, after: { name: "harfbuzz", exact: true } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

/** Runs `body` in a fresh Bun process (no test preload) and returns its last stdout line as JSON. */
async function runScript(root: string, body: string): Promise<any> {
  const script = join(root, "script.ts");
  await writeFile(script, body);
  const run = Bun.spawn([process.execPath, script], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = [await new Response(run.stdout).text(), await new Response(run.stderr).text()];
  expect(await run.exited, stderr).toBe(0);
  return { output: JSON.parse(stdout.trim().split("\n").at(-1)!), stderr };
}

const src = join(import.meta.dir, "..");
const headless = Bun.resolveSync("@codecaine-ai/text-measure/headless", src);
const core = Bun.resolveSync("@codecaine-ai/text-measure", src);

test("a failed HarfBuzz load is retried by the next lint, at most three times in all", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-server-text-measure-retry-"));
  try {
    const { output, stderr } = await runScript(root, `
      import { mock } from "bun:test";
      const real = await import(${JSON.stringify(headless)});
      // mock.module patches the live module, so keep the real loader before mocking it.
      const load = real.useHarfBuzz;
      let attempts = 0;
      let failures = 1;
      mock.module(${JSON.stringify(headless)}, () => ({ ...real, useHarfBuzz: async () => {
        attempts += 1;
        if (failures-- > 0) throw new Error("fixture: transient font read failure");
        await load();
      } }));
      const { textMeasureReady, textMeasureBackend } = await import(${JSON.stringify(join(src, "text-measure.ts"))});
      await textMeasureReady();
      const first = textMeasureBackend().name;
      await textMeasureReady();
      const second = textMeasureBackend().name;
      await textMeasureReady();
      console.log(JSON.stringify({ attempts, first, second }));
    `);
    expect(output).toEqual({ attempts: 2, first: "table", second: "harfbuzz" });
    expect(stderr).toContain("attempt 1 of 3, the next lint retries");

    const persistent = await runScript(root, `
      import { mock } from "bun:test";
      const real = await import(${JSON.stringify(headless)});
      let attempts = 0;
      mock.module(${JSON.stringify(headless)}, () => ({ ...real, useHarfBuzz: async () => { attempts += 1; throw new Error("fixture: no fonts"); } }));
      const { textMeasureReady, textMeasureBackend } = await import(${JSON.stringify(join(src, "text-measure.ts"))});
      for (let call = 0; call < 6; call += 1) await textMeasureReady();
      console.log(JSON.stringify({ attempts, backend: textMeasureBackend().name }));
    `);
    expect(persistent.output).toEqual({ attempts: 3, backend: "table" });
    expect(persistent.stderr).toContain("attempt 3 of 3, no more retries");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("a lint rule that throws cannot block a save: it leaves one warning and the save goes through", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-server-throwing-rule-"));
  try {
    const docsRoot = join(root, "docs");
    await mkdir(join(docsRoot, "page"), { recursive: true });
    const doc = {
      schemaVersion: 1, id: "page", title: "Page", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["p", "s"] },
        p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: "Original." }] },
        s: { id: "s", type: "stack", props: { nodes: [{ name: "Leaf", detail: "A short detail" }], boundaries: [] }, children: [] },
      },
    };
    await writeFile(join(docsRoot, "page", "doc.json"), `${JSON.stringify(doc, null, 2)}\n`);
    // The stack rule measures with fitText: make it throw, as a broken measuring backend would.
    const { output } = await runScript(root, `
      import { mock } from "bun:test";
      const real = await import(${JSON.stringify(core)});
      mock.module(${JSON.stringify(core)}, () => ({ ...real, fitText: () => { throw new Error("fixture: fitText failed"); } }));
      const { applyDocOpsToBundle } = await import(${JSON.stringify(join(src, "doc-ops.ts"))});
      const saved = await applyDocOpsToBundle(${JSON.stringify(docsRoot)}, "page", [{ type: "updateBlock", blockId: "p", text: [{ insert: "Edited." }] }], undefined, undefined, { lintPhase: "complete" });
      console.log(JSON.stringify({ ok: saved.ok, blocking: saved.lint?.blocking, failures: saved.lint?.findings.filter((f) => f.evidence.startsWith("internal error")) }));
    `);
    expect(output.ok).toBe(true);
    expect(output.blocking).toEqual([]);
    expect(output.failures).toEqual([expect.objectContaining({
      ruleId: "layout.stack-detail-fit",
      severity: "warning",
      message: "The layout.stack-detail-fit check failed on this page and was skipped: fixture: fitText failed.",
    })]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
