import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `docs-cli audit` loads text-measure's exact HarfBuzz backend before it
 * lints, reports layout findings as warnings, and names the backend it
 * measured with. It runs in a fresh process, without the test preload.
 */
test("docs-cli audit measures layout with HarfBuzz and reports layout findings as warnings", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-cli-text-measure-"));
  try {
    const sentence = "Short text column under forty characters";
    const doc = {
      schemaVersion: 1, id: "wide", title: "Wide Table", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["intro", "table"] },
        intro: { id: "intro", type: "paragraph", props: {}, children: [], text: [{ insert: "This page holds a table that is too wide for its lane." }] },
        table: {
          id: "table", type: "structured-table", children: [],
          props: { columns: ["One", "Two", "Three", "Four", "Five", "Six"], rows: [[sentence, sentence, sentence, sentence, sentence, sentence]] },
        },
      },
    };
    await mkdir(join(root, "docs", "10-wide"), { recursive: true });
    await writeFile(join(root, "docs", "10-wide", "doc.json"), `${JSON.stringify(doc, null, 2)}\n`);
    const cli = join(import.meta.dir, "..", "index.ts");
    const run = Bun.spawn([process.execPath, cli, "audit", join(root, "docs")], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = [await new Response(run.stdout).text(), await new Response(run.stderr).text()];
    expect(await run.exited, stderr).toBe(0);
    expect(stdout).toMatch(/^WARN layout\.table-fit 10-wide — The table needs at least [\d,]+px but has 1,100px at stock theme settings, so it scrolls sideways on screen\./m);
    expect(stdout).not.toContain("approximate");
    expect(stdout).toContain("text measure: harfbuzz (exact)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("when HarfBuzz does not load, docs-cli audit still runs on the table backend and says so", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-cli-text-measure-fallback-"));
  try {
    const doc = {
      schemaVersion: 1, id: "code", title: "Code", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["intro", "code"] },
        intro: { id: "intro", type: "paragraph", props: {}, children: [], text: [{ insert: "This page holds one long line of code." }] },
        code: { id: "code", type: "code", props: { language: "text" }, children: [], text: [{ insert: "x".repeat(250) }] },
      },
    };
    await mkdir(join(root, "docs", "10-code"), { recursive: true });
    await writeFile(join(root, "docs", "10-code", "doc.json"), `${JSON.stringify(doc, null, 2)}\n`);
    const cli = join(import.meta.dir, "..", "index.ts");
    const headless = Bun.resolveSync("@codecaine-ai/text-measure/headless", join(import.meta.dir, ".."));
    const script = join(root, "audit.ts");
    await writeFile(script, `
      import { mock } from "bun:test";
      const real = await import(${JSON.stringify(headless)});
      mock.module(${JSON.stringify(headless)}, () => ({ ...real, useHarfBuzz: async () => { throw new Error("fixture: WASM load failed"); } }));
      process.argv = [process.execPath, ${JSON.stringify(cli)}, "audit", ${JSON.stringify(join(root, "docs"))}];
      await import(${JSON.stringify(cli)});
    `);
    const run = Bun.spawn([process.execPath, script], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = [await new Response(run.stdout).text(), await new Response(run.stderr).text()];
    expect(await run.exited, stderr).toBe(0);
    expect(stderr).toContain("text-measure: HarfBuzz did not load, so layout lints stay approximate: fixture: WASM load failed");
    expect(stdout).toMatch(/^WARN layout\.code-line-width 10-code — Line 1 is 250 columns wide.* These widths are approximate: text-measure is on its table backend\./m);
    expect(stdout).toContain("text measure: table (approximate: layout widths are estimates)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
