import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { document, paragraph } from "../../packages/docs-model/src/lint/fixtures";
import { lintGuard } from "./gate";
import { lintPage } from "./render";
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
