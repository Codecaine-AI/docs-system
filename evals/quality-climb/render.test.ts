import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { document, paragraph } from "../../packages/docs-model/src/lint/fixtures";
import { lintGuard } from "./gate";
import { pngSize } from "./images";
import { lintPage, screenshot } from "./render";
import { REPO } from "./write";

describe("lintPage", () => {
  test("a semicolon in a paragraph blocks, as the writer's own docs_check with task_id blocks on it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "quality-climb-lint-"));
    try {
      const docJson = join(dir, "doc.json");
      await writeFile(docJson, JSON.stringify(document(paragraph("p", "The model parses the page; the server saves it."))));
      const lint = await lintPage(docJson, { root: REPO, label: "current" });
      expect(lint.styleGate).toBeGreaterThan(0);
      expect(lint.findings.map((f) => f.ruleId)).toContain("writing.semicolon");
      expect(lintGuard([{ set: "climb", briefId: 1, blocking: lint.blocking }], lint.rules).pass).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("screenshot", () => {
  // The test preload swaps in happy-dom's Response, which Bun.serve refuses, so this file serves with Bun's own.
  beforeAll(() => GlobalRegistrator.unregister());
  afterAll(() => GlobalRegistrator.register());
  test("with expand, a closed disclosure renders open, and its box and the PNG grow to hold the body", async () => {
    const site = await mkdtemp(join(tmpdir(), "quality-climb-expand-"));
    try {
      await writeFile(join(site, "index.html"), `<!doctype html><body style="margin:0"><div data-docs-scroller style="height:100vh;overflow:auto">
        <details data-block-id="op"><summary>op(id) → void</summary><div style="height:400px">Example call</div></details></div></body>`);
      const closed = await screenshot(site, "page", join(site, "closed.png"));
      const open = await screenshot(site, "page", join(site, "open.png"), true);
      expect(open.op!.height - closed.op!.height).toBeGreaterThanOrEqual(400);
      expect((await pngSize(join(site, "open.png"))).height).toBeGreaterThanOrEqual(open.op!.height);
    } finally {
      await rm(site, { recursive: true, force: true });
    }
  }, 60_000);
});
