import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeDocDocument, type DocBlock, type DocDocument } from "@codecaine-ai/docs-model";
import { createDocsTools, type DocsTool } from "../tools";

const fixture: DocDocument = {
  schemaVersion: 1, id: "fixture", title: "Fixture", root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["intro", "a", "b"] },
    intro: { id: "intro", type: "paragraph", props: {}, text: [{ insert: "Work through these tasks." }], children: [] },
    a: { id: "a", type: "list-item", props: { ordered: false }, text: [{ insert: "Install Bun." }], children: [] },
    b: { id: "b", type: "list-item", props: {}, text: [{ insert: "Retire the dev-01 key (due 2026-10-21)." }], children: [] },
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
async function block(blockId: string): Promise<DocBlock | undefined> {
  const doc = JSON.parse(await readFile(join(temp, "page/doc.json"), "utf8")) as DocDocument;
  return doc.blocks[blockId];
}
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "docs-mcp-list-checked-"));
  await mkdir(join(temp, "page"), { recursive: true });
  await writeFile(join(temp, "page/doc.json"), serializeDocDocument(fixture));
  tools = createDocsTools({ resolveProject: async (id) => ({ id, docsRoot: temp }) });
});
afterEach(async () => { await rm(temp, { recursive: true, force: true }); });

describe("list-item task state through MCP tools", () => {
  test("docs_list_item_set_checked exists and requires a boolean checked param", () => {
    const params = (toolNamed("docs_list_item_set_checked").inputSchema.properties as Record<string, any>).params;
    expect(params.properties.checked.type).toBe("boolean");
    expect(params.required).toContain("checked");
  });

  test("existing docs without checked load as plain bullets", async () => {
    const read = await call("docs_read", {});
    expect(read.ok).toBe(true);
    expect(read.markdown).toContain("- Install Bun.");
    expect(read.markdown).not.toContain("[ ]");
    expect((await block("b"))?.props).toEqual({});
  });

  test("sets, flips and keeps the block id", async () => {
    let read = await call("docs_read", {});
    const done = await call("docs_list_item_set_checked", { blockId: "a", expected_hash: read.hash, params: { checked: true } });
    expect(done.ok).toBe(true);
    expect(await block("a")).toEqual({ ...fixture.blocks.a!, props: { ordered: false, checked: true } });
    expect((await call("docs_read", {})).markdown).toContain("- [x] Install Bun.");

    read = await call("docs_read", {});
    const open = await call("docs_list_item_set_checked", { blockId: "a", expected_hash: read.hash, params: { checked: false } });
    expect(open.ok).toBe(true);
    expect((await block("a"))?.props).toEqual({ ordered: false, checked: false });

    read = await call("docs_read", {});
    const bad = await call("docs_list_item_set_checked", { blockId: "a", expected_hash: read.hash, params: { checked: "yes" } });
    expect(bad.ok).toBe(false);
    const wrongType = await call("docs_list_item_set_checked", { blockId: "intro", expected_hash: read.hash, params: { checked: true } });
    expect(wrongType.ok).toBe(false);
    expect((await block("a"))?.props).toEqual({ ordered: false, checked: false });
  });

  test("docs_apply_ops updateBlock sets checked too", async () => {
    const read = await call("docs_read", {});
    const ok = await call("docs_apply_ops", { expected_hash: read.hash, ops: [{ type: "updateBlock", blockId: "b", props: { checked: true } }] });
    expect(ok.ok).toBe(true);
    expect(await block("b")).toEqual({ ...fixture.blocks.b!, props: { checked: true } });
  });
});
