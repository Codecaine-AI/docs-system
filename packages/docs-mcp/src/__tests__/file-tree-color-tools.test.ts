import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DOCS_COLORS, serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model";
import { createDocsTools, type DocsTool } from "../tools";

const fixture: DocDocument = {
  schemaVersion: 1, id: "fixture", title: "Fixture", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["ft", "fe"] },
    ft: { id: "ft", type: "file-tree", props: { entries: [{ path: "src/" }] }, children: [] },
    fe: { id: "fe", type: "file-explorer", props: { entries: [{ path: "src/" }] }, children: [] },
  },
};
let temp: string;
let tools: DocsTool[];
function toolNamed(name: string): DocsTool {
  const tool = tools.find((entry) => entry.name === name);
  expect(tool).toBeDefined();
  return tool!;
}
async function call(name: string, args: Record<string, unknown>) {
  return (await toolNamed(name).execute({ project: "a", path: "page", ...args })).structuredContent as Record<string, any>;
}
async function entries(blockId: string): Promise<unknown> {
  const doc = JSON.parse(await readFile(join(temp, "page/doc.json"), "utf8")) as DocDocument;
  return doc.blocks[blockId]?.props.entries;
}
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-tree-color-"));
  await mkdir(join(temp, "page"), { recursive: true });
  await writeFile(join(temp, "page/doc.json"), serializeDocDocument(fixture));
  tools = createDocsTools({ resolveProject: async (id) => ({ id, docsRoot: temp }) });
});
afterEach(async () => { await rm(temp, { recursive: true, force: true }); });

describe("file-tree and file-explorer color through MCP tools", () => {
  test("the add and update entry tools expose color with the roster in its description", () => {
    for (const name of ["docs_file_tree_add_entry", "docs_file_tree_update_entry", "docs_file_explorer_add_entry", "docs_file_explorer_update_entry"]) {
      const params = (toolNamed(name).inputSchema.properties as Record<string, any>).params;
      const color = params.properties.color;
      expect(color).toBeDefined();
      for (const name of DOCS_COLORS) expect(color.description).toContain(`"${name}"`);
    }
  });

  test("adds, updates and clears a color, and rejects one outside the roster", async () => {
    let read = await call("docs_read", {});
    const added = await call("docs_file_tree_add_entry", { blockId: "ft", expected_hash: read.hash, params: { path: "docs/", color: "teal" } });
    expect(added.ok).toBe(true);
    expect(await entries("ft")).toEqual([{ path: "src/" }, { path: "docs/", color: "teal" }]);

    read = await call("docs_read", {});
    const updated = await call("docs_file_explorer_update_entry", { blockId: "fe", expected_hash: read.hash, params: { path: "src/", color: "violet" } });
    expect(updated.ok).toBe(true);
    expect(await entries("fe")).toEqual([{ path: "src/", color: "violet" }]);

    read = await call("docs_read", {});
    const cleared = await call("docs_file_explorer_update_entry", { blockId: "fe", expected_hash: read.hash, params: { path: "src/", color: null } });
    expect(cleared.ok).toBe(true);
    expect(await entries("fe")).toEqual([{ path: "src/" }]);

    read = await call("docs_read", {});
    const invalid = await call("docs_file_tree_update_entry", { blockId: "ft", expected_hash: read.hash, params: { path: "src/", color: "magenta" } });
    expect(invalid.ok).toBe(false);
  });

  test("docs_apply_ops updateBlock accepts entries[].color and rejects a color outside the roster", async () => {
    let read = await call("docs_read", {});
    const ok = await call("docs_apply_ops", { expected_hash: read.hash, ops: [{ type: "updateBlock", blockId: "ft", props: { entries: [{ path: "src/", color: "blue" }] } }] });
    expect(ok.ok).toBe(true);
    expect(await entries("ft")).toEqual([{ path: "src/", color: "blue" }]);

    read = await call("docs_read", {});
    const bad = await call("docs_apply_ops", { expected_hash: read.hash, ops: [{ type: "updateBlock", blockId: "ft", props: { entries: [{ path: "src/", color: "magenta" }] } }] });
    expect(bad.ok).toBe(false);
    expect(await entries("ft")).toEqual([{ path: "src/", color: "blue" }]);
  });
});
