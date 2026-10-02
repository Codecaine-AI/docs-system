import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { createDocsTools, type DocsTool } from "../tools";

const fixture: DocDocument = {
  schemaVersion: 1, id: "fixture", title: "Fixture", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["cs", "ct"] },
    cs: { id: "cs", type: "call-stack", props: { frames: [{ text: "main()" }] }, children: [] },
    ct: { id: "ct", type: "component-tree", props: { nodes: [{ text: "<App>" }] }, children: [] },
  },
};
let temp: string;
let tools: DocsTool[];
async function call(name: string, args: Record<string, unknown>) {
  const tool = tools.find((entry) => entry.name === name);
  expect(tool).toBeDefined();
  return (await tool!.execute({ project: "a", path: "page", ...args })).structuredContent as Record<string, any>;
}
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-outline-"));
  await mkdir(join(temp, "page"), { recursive: true });
  await writeFile(join(temp, "page/doc.json"), serializeDocDocument(fixture));
  tools = createDocsTools({ resolveProject: async (id) => ({ id, docsRoot: temp }) });
});
afterEach(async () => { await rm(temp, { recursive: true, force: true }); });

describe("outline row MCP tools", () => {
  test("exposes call-stack and component-tree row actions under snake-case names", () => {
    const names = new Set(tools.map((tool) => tool.name));
    for (const prefix of ["call_stack", "component_tree"]) {
      for (const verb of ["insert_row", "update_row", "remove_row", "move_row", "set_rows"]) {
        expect(names.has(`docs_${prefix}_${verb}`)).toBe(true);
      }
    }
  });

  test("inserts a nested frame and updates a node through the tools", async () => {
    let read = await call("docs_read", {});
    const inserted = await call("docs_call_stack_insert_row", { blockId: "cs", expected_hash: read.hash, params: { path: [0, 0], row: { text: "run()", kind: "branch" } } });
    expect(inserted.ok).toBe(true);
    read = await call("docs_read", {});
    expect(read.markdown ?? JSON.stringify(read)).toContain("run()");
    const updated = await call("docs_component_tree_update_row", { blockId: "ct", expected_hash: read.hash, params: { path: [0], patch: { kind: "component", comment: "root" } } });
    expect(updated.ok).toBe(true);
    const invalid = await call("docs_component_tree_update_row", { blockId: "ct", expected_hash: updated.hash, params: { path: [3], patch: { kind: null } } });
    expect(invalid.ok).toBe(false);
  });
});
