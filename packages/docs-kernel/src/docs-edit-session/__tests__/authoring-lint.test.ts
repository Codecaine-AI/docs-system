import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDocsEditSessionService } from "../service";
import { writeBundle } from "../test-fixtures";
import { createDocsEditToolset } from "../tools";

test("actual edit tool returns actionable lint text and structured findings while allowing drafts", async () => {
  const docsRoot = await mkdtemp(join(tmpdir(), "edit-lint-"));
  try {
    await writeBundle(docsRoot);
    const service = createDocsEditSessionService({ docsRoot });
    const created = await service.createSession({ path: "guide", spawn: false });
    if (!created.ok) throw new Error("Session creation failed");
    const session = service.getSession(created.state.sessionId)!;
    const result = await createDocsEditToolset(session).call("write_text", { requestAlias: "R1", blockId: "p1", markdown: "Save—read.", summary: "Edit" });
    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("writing.no-em-dash");
    expect(result.details).toMatchObject({ lint: { phase: "draft", blocking: [] } });
    expect(session.proposals()[0].lint?.findings.some(f => f.ruleId === "writing.no-em-dash")).toBe(true);
    expect(service.getState(created.state.sessionId)?.proposals[0].lint?.findings.length).toBeGreaterThan(0);
    const accepted = await service.acceptAll(created.state.sessionId);
    expect(accepted?.ok).toBe(false);
    expect(accepted?.results.some(r => r.lint?.blocking.some(f => f.ruleId === "writing.no-em-dash"))).toBe(true);
  } finally { await rm(docsRoot, { recursive: true, force: true }); }
});
