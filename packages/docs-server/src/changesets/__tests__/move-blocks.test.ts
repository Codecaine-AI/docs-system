import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { linksCheckCommand } from "@codecaine-ai/docs-cli";
import { queryInboundToBlocks, rescanAll } from "@codecaine-ai/docs-index/backlinks";
import { detectDanglingTargets, type AnnotationsDocument } from "@codecaine-ai/docs-model/annotations-schema";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

import { getBacklinksDb } from "../../backlinks-cache";
import { readAnnotationsSidecar } from "../../bundle";
import { getBundleProposals } from "../../proposal-ops";
import { acceptChangeSet, undoChangeSet } from "../changeset-ops";
import { readChangeSetRecord } from "../changesets-sidecar";
import {
  mergeDocsChangeSet,
  moveBlocksChangeSet,
  splitDocChangeSet,
} from "../move-blocks";

const ROOT = "root";

function sourceDocument(withSelfRef = false): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-a",
    title: "Source A",
    root: ROOT,
    blocks: {
      [ROOT]: { id: ROOT, type: "paragraph", props: {}, children: ["moved", "stay"] },
      moved: {
        id: "moved",
        type: "heading",
        props: { level: 1 },
        text: withSelfRef
          ? [
              { insert: "Alpha " },
              {
                insert: "self",
                attributes: { reference: { kind: "doc", path: "10-a", section: "moved" } },
              },
            ]
          : [{ insert: "Alpha moved" }],
        children: ["nested"],
      },
      nested: {
        id: "nested",
        type: "paragraph",
        props: {},
        text: [{ insert: "Nested body" }],
        children: [],
      },
      stay: {
        id: "stay",
        type: "paragraph",
        props: {},
        text: [{ insert: "Stays in A" }],
        children: [],
      },
    },
  };
}

function destDocument(collision = false): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-b",
    title: "Destination B",
    root: ROOT,
    blocks: {
      [ROOT]: {
        id: ROOT,
        type: "paragraph",
        props: {},
        children: collision ? ["dest", "moved"] : ["dest"],
      },
      dest: {
        id: "dest",
        type: "heading",
        props: { level: 1 },
        text: [{ insert: "Destination" }],
        children: [],
      },
      ...(collision
        ? {
            moved: {
              id: "moved",
              type: "paragraph" as const,
              props: { existing: true },
              text: [{ insert: "Existing collision" }],
              children: [],
            },
          }
        : {}),
    },
  };
}

function referencingDocument(includeDocLevel = false): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-c",
    title: "Referrer C",
    root: ROOT,
    blocks: {
      [ROOT]: { id: ROOT, type: "paragraph", props: {}, children: ["c-heading", "link"] },
      "c-heading": {
        id: "c-heading",
        type: "heading",
        props: { level: 1 },
        text: [{ insert: "References" }],
        children: [],
      },
      link: {
        id: "link",
        type: "paragraph",
        props: {},
        text: [
          {
            insert: "block link",
            attributes: { reference: { kind: "doc", path: "docs/10-a.md", section: "moved" } },
          },
          ...(includeDocLevel
            ? [{
                insert: " doc link",
                attributes: { reference: { kind: "doc" as const, path: "10-a" } },
              }]
            : []),
        ],
        children: [],
      },
    },
  };
}

function sourceAnnotations(): AnnotationsDocument {
  const common = {
    body: "Move this",
    intent: "agent-request" as const,
    author: "tester",
    status: "open" as const,
    createdAt: "2026-08-17T00:00:00.000Z",
  };
  return {
    schemaVersion: 1,
    annotations: [
      { id: "ann-block", target: { kind: "block", blockId: "moved" }, ...common },
      {
        id: "ann-range",
        target: { kind: "text-range", blockId: "moved", start: 0, end: 5, quote: "Alpha" },
        ...common,
      },
      { id: "ann-stay", target: { kind: "block", blockId: "stay" }, ...common },
    ],
  };
}

function destAnnotations(): AnnotationsDocument {
  return {
    schemaVersion: 1,
    annotations: [{
      id: "ann-dest",
      target: { kind: "block", blockId: "dest" },
      body: "Existing",
      intent: "note",
      author: "tester",
      status: "open",
      createdAt: "2026-08-17T00:00:00.000Z",
    }],
  };
}

describe("move-blocks change-set generator", () => {
  let docsRoot: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-move-blocks-"));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  async function writeDoc(path: string, document: DocDocument): Promise<string> {
    await mkdir(join(docsRoot, path), { recursive: true });
    const bytes = serializeDocDocument(document);
    await writeFile(join(docsRoot, path, "doc.json"), bytes, "utf8");
    return bytes;
  }

  async function writeAnnotations(path: string, annotations: AnnotationsDocument): Promise<string> {
    const bytes = `${JSON.stringify(annotations, null, 2)}\n`;
    await writeFile(join(docsRoot, path, "annotations.json"), bytes, "utf8");
    return bytes;
  }

  async function annotations(path: string): Promise<AnnotationsDocument> {
    const result = await readAnnotationsSidecar(join(docsRoot, path, "annotations.json"));
    if ("error" in result) throw new Error(result.error.detail);
    return result.annotations;
  }

  async function exists(path: string): Promise<boolean> {
    try { await access(path); return true; }
    catch { return false; }
  }

  test("forced collision remaps only the collider through inserts, internal refs, and migration", async () => {
    await writeDoc("10-a", sourceDocument(true));
    await writeDoc("20-b", destDocument(true));
    await writeAnnotations("10-a", sourceAnnotations());
    await writeAnnotations("20-b", destAnnotations());

    const staged = await moveBlocksChangeSet(docsRoot, {
      sourceDocPath: "10-a",
      blockIds: ["moved"],
      destDocPath: "20-b",
      destPosition: 99,
    });
    expect(staged).toMatchObject({ ok: true });
    if (!staged.ok) return;

    expect(staged.changeset.entries.map((entry) => entry.docPath)).toEqual(["20-b", "10-a"]);
    const migration = staged.changeset.annotationMigrations?.[0];
    const fresh = migration?.remap?.moved;
    expect(fresh).toBeString();
    expect(fresh).not.toBe("moved");
    expect(migration).toMatchObject({
      fromDocPath: "10-a",
      toDocPath: "20-b",
      blockIds: ["moved", "nested"],
      remap: { moved: fresh },
    });
    expect(migration?.remap?.nested).toBeUndefined();

    const proposals = await getBundleProposals(docsRoot, "20-b");
    expect(proposals.ok).toBe(true);
    if (!proposals.ok) return;
    const proposal = proposals.proposals.find(
      (candidate) => candidate.id === staged.changeset.entries[0].proposalId,
    );
    const inserts = proposal?.ops.filter(
      (op): op is Extract<DocOp, { type: "insertBlock" }> => op.type === "insertBlock",
    ) ?? [];
    expect(inserts.map((op) => [op.blockId, op.parentId, op.index])).toEqual([
      [fresh, ROOT, 2],
      ["nested", fresh, 0],
    ]);
    const internal = inserts[0].text?.[1].attributes?.reference;
    expect(internal).toMatchObject({ path: "20-b", section: fresh });

    const sourceProposals = await getBundleProposals(docsRoot, "10-a");
    expect(sourceProposals.ok).toBe(true);
    if (sourceProposals.ok) {
      const sourceProposal = sourceProposals.proposals.find(
        (candidate) => candidate.id === staged.changeset.entries[1].proposalId,
      );
      expect(sourceProposal?.ops).toEqual([{ type: "deleteBlock", blockId: "moved", mode: "subtree" }]);
    }

    const accepted = await acceptChangeSet(docsRoot, staged.changeset.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const migrated = await annotations("20-b");
    expect(migrated.annotations.find((annotation) => annotation.id === "ann-block")?.target)
      .toEqual({ kind: "block", blockId: fresh });
    expect(migrated.annotations.find((annotation) => annotation.id === "ann-range")?.target)
      .toEqual({ kind: "text-range", blockId: fresh, start: 0, end: 5, quote: "Alpha" });
  });

  test("accept migrates block and range annotations, retargets C, and undo is byte-identical", async () => {
    const aBefore = await writeDoc("10-a", sourceDocument());
    const bBefore = await writeDoc("20-b", destDocument());
    const cBefore = await writeDoc("30-c", referencingDocument());
    const aAnnotationsBefore = await writeAnnotations("10-a", sourceAnnotations());
    const bAnnotationsBefore = await writeAnnotations("20-b", destAnnotations());

    const staged = await moveBlocksChangeSet(docsRoot, {
      sourceDocPath: "10-a",
      blockIds: ["moved"],
      destDocPath: "20-b",
      destPosition: 1,
      annotationId: "ann-block",
      annotationDocPath: "10-a",
      sessionId: "move-session",
    });
    expect(staged).toMatchObject({ ok: true });
    if (!staged.ok) return;
    expect(staged.changeset.entries.map((entry) => entry.docPath)).toEqual(["20-b", "10-a", "30-c"]);

    const accepted = await acceptChangeSet(docsRoot, staged.changeset.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const a = JSON.parse(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")) as DocDocument;
    const b = JSON.parse(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")) as DocDocument;
    expect(a.blocks.moved).toBeUndefined();
    expect(b.blocks.moved.children).toEqual(["nested"]);
    expect(b.blocks.nested.props).toEqual({});

    const aSidecar = await annotations("10-a");
    const bSidecar = await annotations("20-b");
    expect(aSidecar.annotations.map((annotation) => annotation.id)).toEqual(["ann-stay"]);
    expect(bSidecar.annotations.map((annotation) => annotation.id)).toEqual([
      "ann-dest",
      "ann-block",
      "ann-range",
    ]);
    expect(bSidecar.annotations.find((annotation) => annotation.id === "ann-block"))
      .toMatchObject({
        status: "resolved",
        agentRun: { sessionId: "move-session", summary: "Move blocks from 10-a to 20-b" },
      });
    expect(detectDanglingTargets(bSidecar, b, {})).toEqual([]);
    expect(bSidecar.annotations.find((annotation) => annotation.id === "ann-range")?.target)
      .toEqual({ kind: "text-range", blockId: "moved", start: 0, end: 5, quote: "Alpha" });

    const c = JSON.parse(await readFile(join(docsRoot, "30-c", "doc.json"), "utf8")) as DocDocument;
    expect(c.blocks.link.text?.[0].attributes?.reference).toMatchObject({ path: "20-b", section: "moved" });
    const db = await getBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);
    expect(queryInboundToBlocks(db, "10-a", ["moved"])).toEqual([]);
    expect(queryInboundToBlocks(db, "20-b", ["moved"]).map((row) => row.sourcePath))
      .toEqual(["30-c/doc.json"]);

    const undone = await undoChangeSet(docsRoot, staged.changeset.id);
    expect(undone.ok).toBe(true);
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);
    expect(await readFile(join(docsRoot, "30-c", "doc.json"), "utf8")).toBe(cBefore);
    expect(await readFile(join(docsRoot, "10-a", "annotations.json"), "utf8")).toBe(aAnnotationsBefore);
    expect(await readFile(join(docsRoot, "20-b", "annotations.json"), "utf8")).toBe(bAnnotationsBefore);
  });

  test("a poisoned retarget entry rolls the prefix back and leaves the record open", async () => {
    const aBefore = await writeDoc("10-a", sourceDocument());
    const bBefore = await writeDoc("20-b", destDocument());
    await writeDoc("30-c", referencingDocument());
    const aAnnotationsBefore = await writeAnnotations("10-a", sourceAnnotations());
    const bAnnotationsBefore = await writeAnnotations("20-b", destAnnotations());
    const staged = await moveBlocksChangeSet(docsRoot, {
      sourceDocPath: "10-a",
      blockIds: ["moved"],
      destDocPath: "20-b",
      destPosition: 1,
    });
    expect(staged).toMatchObject({ ok: true });
    if (!staged.ok) return;

    const poisoned = referencingDocument();
    poisoned.title = "Poisoned after staging";
    await writeFile(join(docsRoot, "30-c", "doc.json"), serializeDocDocument(poisoned), "utf8");
    const accepted = await acceptChangeSet(docsRoot, staged.changeset.id);
    expect(accepted).toMatchObject({ ok: false, status: 409, rolledBack: true });
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);
    expect(await readFile(join(docsRoot, "10-a", "annotations.json"), "utf8")).toBe(aAnnotationsBefore);
    expect(await readFile(join(docsRoot, "20-b", "annotations.json"), "utf8")).toBe(bAnnotationsBefore);
    const record = await readChangeSetRecord(docsRoot, staged.changeset.id);
    expect(record.ok && record.changeset.status).toBe("open");
    if (record.ok) expect(record.changeset.compoundPatchId).toBeUndefined();
  });

  test("merge moves all children, retargets block and doc links, deletes A, and undo restores A", async () => {
    const aBefore = await writeDoc("10-a", sourceDocument());
    const bBefore = await writeDoc("20-b", destDocument());
    const cBefore = await writeDoc("30-c", referencingDocument(true));
    const aAnnotationsBefore = await writeAnnotations("10-a", sourceAnnotations());
    const bAnnotationsBefore = await writeAnnotations("20-b", destAnnotations());

    const staged = await mergeDocsChangeSet(docsRoot, {
      sourceDocPath: "10-a",
      destDocPath: "20-b",
    });
    expect(staged).toMatchObject({ ok: true });
    if (!staged.ok) return;
    expect(staged.changeset.treeOps).toEqual([
      { kind: "delete-doc", docPath: "10-a", position: staged.changeset.entries.length },
    ]);
    const accepted = await acceptChangeSet(docsRoot, staged.changeset.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(await exists(join(docsRoot, "10-a"))).toBe(false);
    const b = JSON.parse(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")) as DocDocument;
    expect(b.blocks[ROOT].children).toEqual(["dest", "moved", "stay"]);
    const c = JSON.parse(await readFile(join(docsRoot, "30-c", "doc.json"), "utf8")) as DocDocument;
    expect(c.blocks.link.text?.map((span) => span.attributes?.reference?.path)).toEqual(["20-b", "20-b"]);
    expect(await linksCheckCommand(docsRoot)).toEqual([]);

    const undone = await undoChangeSet(docsRoot, staged.changeset.id);
    expect(undone.ok).toBe(true);
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);
    expect(await readFile(join(docsRoot, "30-c", "doc.json"), "utf8")).toBe(cBefore);
    expect(await readFile(join(docsRoot, "10-a", "annotations.json"), "utf8")).toBe(aAnnotationsBefore);
    expect(await readFile(join(docsRoot, "20-b", "annotations.json"), "utf8")).toBe(bAnnotationsBefore);
  });

  test("split creates a titled valid bundle and moves the selected subtree", async () => {
    const aBefore = await writeDoc("10-a", sourceDocument());
    const annotationsBefore = await writeAnnotations("10-a", sourceAnnotations());
    const staged = await splitDocChangeSet(docsRoot, {
      sourceDocPath: "10-a",
      blockIds: ["moved"],
      newDocPath: "40-split",
      title: "Split Document",
    });
    expect(staged).toMatchObject({ ok: true });
    if (!staged.ok) return;
    expect(staged.changeset.treeOps).toEqual([
      { kind: "create-doc", docPath: "40-split", title: "Split Document", position: 0 },
    ]);
    const proposalsBefore = await readFile(join(docsRoot, "40-split", "proposals.json"), "utf8");

    const accepted = await acceptChangeSet(docsRoot, staged.changeset.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const raw = await readFile(join(docsRoot, "40-split", "doc.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateDocDocument(parsed);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.document.title).toBe("Split Document");
      expect(validated.document.blocks[ROOT].children).toEqual(["moved"]);
      expect(validated.document.blocks.moved.children).toEqual(["nested"]);
    }
    expect(detectDanglingTargets(await annotations("40-split"), validated.ok ? validated.document : null, {}))
      .toEqual([]);

    const undone = await undoChangeSet(docsRoot, staged.changeset.id);
    expect(undone.ok).toBe(true);
    expect(await readdir(join(docsRoot, "40-split"))).toEqual(["proposals.json"]);
    expect(await readFile(join(docsRoot, "40-split", "proposals.json"), "utf8"))
      .toBe(proposalsBefore);
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "10-a", "annotations.json"), "utf8"))
      .toBe(annotationsBefore);
  });
});
