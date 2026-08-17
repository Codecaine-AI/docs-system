import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";
import { rescanAll } from "@codecaine-ai/docs-index/backlinks";
import type { AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

import { getBacklinksDb } from "../../backlinks-cache";
import { getStoredPatch } from "../../patch-ledger";
import { stageBundleProposal, stageBundleProposalAgainstDocument } from "../../proposal-ops";
import { acceptChangeSet, createChangeSet, undoChangeSet } from "../changeset-ops";
import { readChangeSetRecord } from "../changesets-sidecar";
import { mergeDocsChangeSet, moveBlocksChangeSet, splitDocChangeSet } from "../move-blocks";
import { createEmptyDocDocument } from "../tree-ops";

const SESSION = "roundtrip-seed";

function doc(path: string, collision = false): DocDocument {
  return {
    schemaVersion: 1, id: `doc-${path}`, title: path, root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: collision ? ["a", "b", "drop", "moved"] : ["a", "b", "drop", "moved"] },
      a: { id: "a", type: "heading", props: { level: 1 }, text: [{ insert: "Alpha text" }], children: [] },
      b: { id: "b", type: "paragraph", props: {}, text: [{ insert: "Beta text" }], children: [] },
      drop: { id: "drop", type: "paragraph", props: {}, text: [{ insert: "Drop me" }], children: [] },
      moved: { id: "moved", type: "heading", props: { level: 2 }, text: [{ insert: collision ? "Existing collision" : "Move me" }], children: collision ? [] : ["nested"] },
      ...(collision ? {} : { nested: { id: "nested", type: "paragraph" as const, props: {}, text: [{ insert: "Nested" }], children: [] } }),
    },
  };
}

function refDoc(path: string): DocDocument {
  const value = doc(path);
  value.blocks.a.text = [
    { insert: "block", attributes: { reference: { kind: "doc", path: "10-a", section: "moved" } } },
    { insert: " doc", attributes: { reference: { kind: "doc", path: "10-a" } } },
  ];
  return value;
}

function annotations(prefix = "ann"): AnnotationsDocument {
  const common = { body: "seed", intent: "agent-request" as const, author: "tester", status: "open" as const, createdAt: "2026-08-17T00:00:00.000Z" };
  return { schemaVersion: 1, annotations: [
    { id: `${prefix}-block`, target: { kind: "block", blockId: "moved" }, ...common },
    { id: `${prefix}-range`, target: { kind: "text-range", blockId: "moved", start: 0, end: 4, quote: "Move" }, ...common },
  ] };
}

async function putDoc(root: string, path: string, value: DocDocument): Promise<void> {
  await mkdir(join(root, path), { recursive: true });
  await writeFile(join(root, path, "doc.json"), serializeDocDocument(value));
}

async function putAnnotations(root: string, path: string, prefix = "ann"): Promise<void> {
  await writeFile(join(root, path, "annotations.json"), `${JSON.stringify(annotations(prefix), null, 2)}\n`);
}

async function baseCorpus(root: string): Promise<void> {
  await putDoc(root, "10-a", doc("10-a"));
  await putDoc(root, "20-b", doc("20-b", true));
  await putDoc(root, "30-c", refDoc("30-c"));
  await putAnnotations(root, "10-a");
  await putAnnotations(root, "20-b", "dest");
}

async function files(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replaceAll("\\", "/");
      if (rel === ".index" || rel.startsWith(".index/")) continue;
      if (entry.isDirectory()) await walk(abs);
      else result[rel] = Buffer.from(await readFile(abs)).toString("base64");
    }
  }
  await walk(root);
  return result;
}

async function indexRows(root: string): Promise<unknown[]> {
  const db = await getBacklinksDb(root);
  await rescanAll(root, db);
  return db.query(`SELECT source_path, source_block_id, target_kind, target_path,
    target_symbol, target_line, target_section FROM backlinks
    ORDER BY source_path, source_block_id, target_kind, target_path,
      COALESCE(target_symbol,''), COALESCE(target_line,-1), COALESCE(target_section,'')`).all();
}

async function proposal(root: string, path: string, ops: DocOp[]) {
  const staged = await stageBundleProposal(root, path, { ops, summary: `Seed ${path}`, sessionId: SESSION }, SESSION);
  if (!staged.ok) throw new Error(staged.detail);
  return staged.proposal.id;
}

async function set(root: string, entries: { docPath: string; proposalId: string }[], treeOps: Parameters<typeof createChangeSet>[1]["treeOps"] = []) {
  const staged = await createChangeSet(root, { summary: "Seeded round trip", sessionId: SESSION, entries, treeOps });
  if (!staged.ok) throw new Error(staged.detail);
  return staged.changeset.id;
}

type Scenario = { name: string; build(root: string): Promise<string>; cycles?: number };

const SEEDED: Scenario[] = [
  { name: "two docs: insert, update, delete, and move", build: async (root) => set(root, [
    { docPath: "10-a", proposalId: await proposal(root, "10-a", [
      { type: "insertBlock", blockId: "inserted", parentId: "root", index: 1, blockType: "paragraph", props: {}, text: [{ insert: "Inserted" }] },
      { type: "updateBlock", blockId: "a", props: { level: 2 } },
      { type: "moveBlock", blockId: "b", toParentId: "a", toIndex: 0 },
    ]) },
    { docPath: "20-b", proposalId: await proposal(root, "20-b", [{ type: "deleteBlock", blockId: "drop", mode: "subtree" }]) },
  ]) },
  { name: "three docs: split, merge, and update", build: async (root) => set(root, [
    { docPath: "10-a", proposalId: await proposal(root, "10-a", [{ type: "splitBlock", blockId: "a", offset: 5 }]) },
    { docPath: "20-b", proposalId: await proposal(root, "20-b", [{ type: "mergeBlocks", blockIds: ["a", "b"] }]) },
    { docPath: "30-c", proposalId: await proposal(root, "30-c", [{ type: "updateBlock", blockId: "b", text: [{ insert: "Changed" }] }]) },
  ]) },
  { name: "create-doc tree op alone", build: (root) => set(root, [], [{ kind: "create-doc", docPath: "40-new", title: "New", position: 0 }]) },
  { name: "create-doc with virtual-base destination entry", build: async (root) => {
    const base = createEmptyDocDocument("40-new", "New");
    const staged = await stageBundleProposalAgainstDocument(root, "40-new", { ops: [{ type: "insertBlock", blockId: "new-h", parentId: "root", index: 0, blockType: "heading", props: { level: 1 }, text: [{ insert: "New" }] }], summary: "Virtual", sessionId: SESSION }, base, SESSION);
    if (!staged.ok) throw new Error(staged.detail);
    return set(root, [{ docPath: "40-new", proposalId: staged.proposal.id }], [{ kind: "create-doc", docPath: "40-new", title: "New", position: 0 }]);
  } },
  { name: "delete-doc tree op preserves all sidecars", build: async (root) => {
    await writeFile(join(root, "10-a", "notes.txt"), "opaque sidecar\n");
    return set(root, [], [{ kind: "delete-doc", docPath: "10-a", position: 0 }]);
  } },
  { name: "move-doc rewrites inbound links", build: (root) => set(root, [], [{ kind: "move-doc", from: "10-a", to: "15-a", position: 0 }]) },
  { name: "move_blocks plain", build: async (root) => {
    const s = await moveBlocksChangeSet(root, { sourceDocPath: "10-a", blockIds: ["moved"], destDocPath: "30-c", destPosition: 1, sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); return s.changeset.id;
  } },
  { name: "move_blocks forced collision remap", build: async (root) => {
    const s = await moveBlocksChangeSet(root, { sourceDocPath: "10-a", blockIds: ["moved"], destDocPath: "20-b", destPosition: 1, sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); return s.changeset.id;
  } },
  { name: "move_blocks carries block and text-range annotations", build: async (root) => {
    const s = await moveBlocksChangeSet(root, { sourceDocPath: "10-a", blockIds: ["moved"], destDocPath: "30-c", destPosition: 2, annotationId: "ann-block", annotationDocPath: "10-a", sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); return s.changeset.id;
  } },
  { name: "move_blocks emits inbound-link retarget entries", build: async (root) => {
    const s = await moveBlocksChangeSet(root, { sourceDocPath: "10-a", blockIds: ["moved"], destDocPath: "20-b", destPosition: 2, sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); expect(s.changeset.entries.map((e) => e.docPath)).toContain("30-c"); return s.changeset.id;
  } },
  { name: "merge_docs composition", build: async (root) => {
    const s = await mergeDocsChangeSet(root, { sourceDocPath: "10-a", destDocPath: "20-b", sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); return s.changeset.id;
  } },
  { name: "split_doc composition is stable over a second cycle", cycles: 2, build: async (root) => {
    const s = await splitDocChangeSet(root, { sourceDocPath: "10-a", blockIds: ["moved"], newDocPath: "40-split", title: "Split", sessionId: SESSION });
    if (!s.ok) throw new Error(s.detail); return s.changeset.id;
  } },
];

describe("seeded change-set accept/undo round trips", () => {
  for (const scenario of SEEDED) test(scenario.name, async () => {
    const root = await mkdtemp(join(tmpdir(), "docs-server-roundtrip-"));
    try {
      await baseCorpus(root);
      const id = await scenario.build(root);
      const beforeFiles = await files(root);
      const beforeRows = await indexRows(root);
      for (let cycle = 0; cycle < (scenario.cycles ?? 1); cycle++) {
        const accepted = await acceptChangeSet(root, id, { sessionId: SESSION });
        if (!accepted.ok) throw new Error(`accept failed: ${JSON.stringify(accepted)}`);
        expect(accepted.ok).toBe(true);
        if (!accepted.ok) return;
        const compoundId = accepted.patchId;
        expect(getStoredPatch(compoundId)?.kind).toBe("compound");
        const undone = await undoChangeSet(root, id, { sessionId: SESSION });
        expect(undone.ok).toBe(true);
        expect(getStoredPatch(compoundId)).toBeUndefined();
        expect(await files(root)).toEqual(beforeFiles);
        expect(await indexRows(root)).toEqual(beforeRows);
        const record = await readChangeSetRecord(root, id);
        expect(record.ok && record.changeset.status).toBe("open");
        if (record.ok) expect(record.changeset.compoundPatchId).toBeUndefined();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("failed accept rolls create, delete, and move back to the exact pre-accept tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "docs-server-roundtrip-rollback-"));
  try {
    await baseCorpus(root);
    await writeFile(join(root, "10-a", "opaque.bin"), new Uint8Array([0, 1, 2, 255]));

    const base = createEmptyDocDocument("40-new", "New");
    const virtual = await stageBundleProposalAgainstDocument(root, "40-new", {
      ops: [{
        type: "insertBlock",
        blockId: "new-h",
        parentId: "root",
        index: 0,
        blockType: "heading",
        props: { level: 1 },
        text: [{ insert: "New" }],
      }],
      summary: "Virtual rollback",
      sessionId: SESSION,
    }, base, SESSION);
    if (!virtual.ok) throw new Error(virtual.detail);

    const staleId = await proposal(root, "30-c", [{
      type: "updateBlock",
      blockId: "b",
      text: [{ insert: "Must fail stale" }],
    }]);
    const id = await set(root, [
      { docPath: "40-new", proposalId: virtual.proposal.id },
      { docPath: "30-c", proposalId: staleId },
    ], [
      { kind: "create-doc", docPath: "40-new", title: "New", position: 0 },
      { kind: "delete-doc", docPath: "10-a", position: 1 },
      { kind: "move-doc", from: "20-b", to: "nested/20-b", position: 1 },
    ]);

    const poisoned = refDoc("30-c");
    poisoned.title = "Changed after staging";
    await writeFile(join(root, "30-c", "doc.json"), serializeDocDocument(poisoned));
    const beforeFiles = await files(root);
    const beforeRows = await indexRows(root);

    const accepted = await acceptChangeSet(root, id, { sessionId: SESSION });
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted).toMatchObject({ status: 409, rolledBack: true });
    expect(accepted.rollbackFailures).toBeUndefined();
    expect(await files(root)).toEqual(beforeFiles);
    expect(await indexRows(root)).toEqual(beforeRows);
    expect(await readdir(root)).not.toContain("nested");
    const record = await readChangeSetRecord(root, id);
    expect(record.ok && record.changeset.status).toBe("open");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
