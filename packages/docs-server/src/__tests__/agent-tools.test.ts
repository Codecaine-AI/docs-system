import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  canvas_apply_patch,
  canvas_get,
  comment_list,
  comment_resolve,
  doc_get,
  doc_update_blocks,
  getStoredPatch,
  undo_patch,
} from "../agent-tools";
import { addBundleComment } from "../index";
import { draftLockStore } from "../draft-locks";

const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: {
    root: { id: "root", flavour: "paragraph", props: {}, children: ["h1"] },
    h1: {
      id: "h1",
      flavour: "heading",
      props: { level: 1 },
      text: [{ insert: "Title" }],
      children: [],
    },
  },
};

const SAMPLE_CANVAS = {
  schemaVersion: 1,
  id: "canvas-1",
  mode: "diagram",
  objects: [
    {
      id: "obj-1",
      type: "process",
      label: "Step one",
      geometry: { x: 0, y: 0, width: 100, height: 60 },
    },
  ],
  connections: [],
};

describe("agent-tools: doc_get / doc_update_blocks (TG9.1)", () => {
  let docsRoot: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "spectre-agent-tools-doc-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  test("doc_get returns the doc, hash, and a markdown projection", async () => {
    const result = await doc_get(docsRoot, "guide");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.blocks.h1?.flavour).toBe("heading");
      expect(result.hash).toBeTruthy();
      expect(result.markdown).toContain("Title");
    }
  });

  test("doc_get returns 404 for a missing bundle", async () => {
    const result = await doc_get(docsRoot, "missing");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  test("doc_update_blocks validates, applies, persists atomically, and stores an inverse", async () => {
    const result = await doc_update_blocks(
      docsRoot,
      "guide",
      [
        {
          type: "insertBlock",
          blockId: "p1",
          parentId: "root",
          index: 0,
          flavour: "paragraph",
          props: {},
          text: [{ insert: "New paragraph" }],
        },
      ],
      undefined,
      "agent-session",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.blocks.p1?.flavour).toBe("paragraph");
      expect(result.patchId).toBeTruthy();

      const onDisk = JSON.parse(await Bun.file(join(docsRoot, "guide", "doc.json")).text());
      expect(onDisk.blocks.p1).toBeTruthy();

      const stored = getStoredPatch(result.patchId);
      expect(stored?.kind).toBe("doc");
      if (stored?.kind === "doc") {
        expect(stored.inverse).toEqual([{ type: "deleteBlock", blockId: "p1", mode: "subtree" }]);
      }
    }
  });

  test("doc_update_blocks returns 409 and does not write when expected_hash is stale", async () => {
    const result = await doc_update_blocks(
      docsRoot,
      "guide",
      [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
      "stale-hash",
      "agent-session",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);

    const onDisk = JSON.parse(await Bun.file(join(docsRoot, "guide", "doc.json")).text());
    expect(onDisk.blocks.h1.props.level).toBe(1);
  });

  test("doc_update_blocks is blocked (423) by a foreign live draft lock (D22)", async () => {
    draftLockStore.acquire({ kind: "doc", path: "guide" }, "editor-session");
    try {
      const result = await doc_update_blocks(
        docsRoot,
        "guide",
        [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
        undefined,
        "agent-session",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(423);
        expect(result.detail).toContain("Draft in progress");
      }
      const onDisk = JSON.parse(await Bun.file(join(docsRoot, "guide", "doc.json")).text());
      expect(onDisk.blocks.h1.props.level).toBe(1);
    } finally {
      draftLockStore.release({ kind: "doc", path: "guide" }, "editor-session");
    }
  });

  test("doc_update_blocks is NOT blocked by the caller's own held lock", async () => {
    draftLockStore.acquire({ kind: "doc", path: "guide" }, "editor-session");
    try {
      const result = await doc_update_blocks(
        docsRoot,
        "guide",
        [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
        undefined,
        "editor-session",
      );
      expect(result.ok).toBe(true);
    } finally {
      draftLockStore.release({ kind: "doc", path: "guide" }, "editor-session");
    }
  });

  test("undo_patch replays the stored inverse and removes the block that was inserted (D12)", async () => {
    const applied = await doc_update_blocks(
      docsRoot,
      "guide",
      [
        {
          type: "insertBlock",
          blockId: "p1",
          parentId: "root",
          index: 0,
          flavour: "paragraph",
          props: {},
          text: [{ insert: "New paragraph" }],
        },
      ],
      undefined,
      "agent-session",
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const undone = await undo_patch(docsRoot, applied.patchId);
    expect(undone.ok).toBe(true);
    if (undone.ok && undone.kind === "doc") {
      expect(undone.doc.blocks.p1).toBeUndefined();
    }

    const onDisk = JSON.parse(await Bun.file(join(docsRoot, "guide", "doc.json")).text());
    expect(onDisk.blocks.p1).toBeUndefined();

    // A patch can only be undone once.
    const secondAttempt = await undo_patch(docsRoot, applied.patchId);
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) expect(secondAttempt.status).toBe(404);
  });

  test("undo_patch fails loudly (409) if the doc changed since the patch was applied", async () => {
    const applied = await doc_update_blocks(
      docsRoot,
      "guide",
      [{ type: "updateBlock", blockId: "h1", props: { level: 2 } }],
      undefined,
      "agent-session",
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    // Someone else edits the doc after the patch was applied.
    await doc_update_blocks(
      docsRoot,
      "guide",
      [{ type: "updateBlock", blockId: "h1", props: { level: 3 } }],
      undefined,
      "other-session",
    );

    const undone = await undo_patch(docsRoot, applied.patchId);
    expect(undone.ok).toBe(false);
    if (!undone.ok) {
      expect(undone.status).toBe(409);
      expect(undone.detail).toContain("changed since");
    }

    // The later edit must survive untouched — undo never force-applies.
    const onDisk = JSON.parse(await Bun.file(join(docsRoot, "guide", "doc.json")).text());
    expect(onDisk.blocks.h1.props.level).toBe(3);
  });

  test("undo_patch returns 404 for an unknown patch id", async () => {
    const result = await undo_patch(docsRoot, "does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("agent-tools: canvas_get / canvas_apply_patch (TG9.1)", () => {
  let docsRoot: string;
  const canvasRelPath = "guide/assets/canvases/flow.canvas.json";

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "spectre-agent-tools-canvas-"));
    await mkdir(join(docsRoot, "guide", "assets", "canvases"), { recursive: true });
    await writeFile(join(docsRoot, canvasRelPath), `${JSON.stringify(SAMPLE_CANVAS, null, 2)}\n`, "utf8");
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  test("canvas_get returns the validated canvas document and a hash", async () => {
    const result = await canvas_get(docsRoot, canvasRelPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canvas.objects).toHaveLength(1);
      expect(result.hash).toBeTruthy();
    }
  });

  test("canvas_get returns 404 for a missing sidecar", async () => {
    const result = await canvas_get(docsRoot, "guide/assets/canvases/missing.canvas.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  test("canvas_apply_patch validates, applies an addObject op, persists atomically, stores an inverse snapshot, and returns changedIds", async () => {
    const result = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [
        {
          type: "addObject",
          object: {
            id: "obj-2",
            type: "process",
            label: "Step two",
            geometry: { x: 200, y: 0, width: 100, height: 60 },
          },
        },
      ],
      undefined,
      "agent-session",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canvas.objects.map((o) => o.id)).toEqual(["obj-1", "obj-2"]);
      expect(result.changedIds).toEqual(["obj-2"]);
      expect(result.patchId).toBeTruthy();

      const onDisk = JSON.parse(await Bun.file(join(docsRoot, canvasRelPath)).text());
      expect(onDisk.objects).toHaveLength(2);

      const stored = getStoredPatch(result.patchId);
      expect(stored?.kind).toBe("canvas");
      if (stored?.kind === "canvas") {
        expect(stored.priorSnapshot.objects).toHaveLength(1);
      }
    }
  });

  test("canvas_apply_patch returns 409 and does not write when expected hash is stale", async () => {
    const result = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [{ type: "updateObject", objectId: "obj-1", patch: { label: "Renamed" } }],
      "stale-hash",
      "agent-session",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);

    const onDisk = JSON.parse(await Bun.file(join(docsRoot, canvasRelPath)).text());
    expect(onDisk.objects[0].label).toBe("Step one");
  });

  test("canvas_apply_patch is blocked (423) by a foreign live draft lock (D22)", async () => {
    draftLockStore.acquire({ kind: "canvas", path: canvasRelPath }, "editor-session");
    try {
      const result = await canvas_apply_patch(
        docsRoot,
        canvasRelPath,
        [{ type: "updateObject", objectId: "obj-1", patch: { label: "Renamed" } }],
        undefined,
        "agent-session",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(423);
    } finally {
      draftLockStore.release({ kind: "canvas", path: canvasRelPath }, "editor-session");
    }
  });

  test("canvas_apply_patch updateObject DEEP-merges style (matches the client reducer): a partial style patch preserves existing style fields", async () => {
    const withStyledObject = {
      ...SAMPLE_CANVAS,
      objects: [
        {
          id: "obj-1",
          type: "process",
          label: "Step one",
          geometry: { x: 0, y: 0, width: 100, height: 60 },
          style: { fill: "#ffffff", stroke: "#123456", shape: "rounded-rect" },
        },
      ],
    };
    await writeFile(join(docsRoot, canvasRelPath), `${JSON.stringify(withStyledObject, null, 2)}\n`, "utf8");

    const result = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [{ type: "updateObject", objectId: "obj-1", patch: { style: { fill: "#ff0000" } } }],
      undefined,
      "agent-session",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const object = result.canvas.objects.find((o) => o.id === "obj-1");
      expect(object?.style?.fill).toBe("#ff0000");
      // Pre-fix these were silently dropped by the shallow `...patch` spread.
      expect(object?.style?.stroke).toBe("#123456");
      expect(object?.style?.shape).toBe("rounded-rect");

      const onDisk = JSON.parse(await Bun.file(join(docsRoot, canvasRelPath)).text());
      expect(onDisk.objects[0].style).toEqual({ fill: "#ff0000", stroke: "#123456", shape: "rounded-rect" });
    }
  });

  test("canvas_apply_patch supports fitContainerToChildren", async () => {
    const withContainer = {
      ...SAMPLE_CANVAS,
      objects: [
        { id: "container-1", type: "container", label: "Group", geometry: { x: 0, y: 0, width: 10, height: 10 } },
        {
          id: "child-1",
          type: "process",
          label: "Child",
          parentId: "container-1",
          geometry: { x: 20, y: 20, width: 50, height: 40 },
        },
      ],
    };
    await writeFile(join(docsRoot, canvasRelPath), `${JSON.stringify(withContainer, null, 2)}\n`, "utf8");

    const result = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [{ type: "fitContainerToChildren", containerId: "container-1", padding: 10 }],
      undefined,
      "agent-session",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const container = result.canvas.objects.find((o) => o.id === "container-1");
      expect(container?.geometry.width).toBeGreaterThan(10);
    }
  });

  test("undo_patch replays the stored prior snapshot for a canvas patch (D12)", async () => {
    const applied = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [
        {
          type: "addObject",
          object: {
            id: "obj-2",
            type: "process",
            label: "Step two",
            geometry: { x: 200, y: 0, width: 100, height: 60 },
          },
        },
      ],
      undefined,
      "agent-session",
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const undone = await undo_patch(docsRoot, applied.patchId);
    expect(undone.ok).toBe(true);
    if (undone.ok && undone.kind === "canvas") {
      expect(undone.canvas.objects.map((o) => o.id)).toEqual(["obj-1"]);
    }

    const onDisk = JSON.parse(await Bun.file(join(docsRoot, canvasRelPath)).text());
    expect(onDisk.objects).toHaveLength(1);
  });

  test("undo_patch fails loudly (409) if the canvas changed since the patch was applied", async () => {
    const applied = await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [{ type: "updateObject", objectId: "obj-1", patch: { label: "Renamed once" } }],
      undefined,
      "agent-session",
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    await canvas_apply_patch(
      docsRoot,
      canvasRelPath,
      [{ type: "updateObject", objectId: "obj-1", patch: { label: "Renamed twice" } }],
      undefined,
      "other-session",
    );

    const undone = await undo_patch(docsRoot, applied.patchId);
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.status).toBe(409);

    const onDisk = JSON.parse(await Bun.file(join(docsRoot, canvasRelPath)).text());
    expect(onDisk.objects[0].label).toBe("Renamed twice");
  });
});

describe("agent-tools: comment_list / comment_resolve (TG9.1)", () => {
  let docsRoot: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "spectre-agent-tools-comments-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  test("comment_list returns an empty list for a bundle with no comments.json", async () => {
    const result = await comment_list(docsRoot, "guide");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.comments).toEqual([]);
  });

  test("comment_list reflects an added comment, and comment_resolve resolves it", async () => {
    const added = await addBundleComment(docsRoot, "guide", {
      target: { kind: "block", blockId: "h1" },
      body: "Please rewrite this heading.",
      intent: "agent-request",
      author: "human-1",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const listed = await comment_list(docsRoot, "guide");
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.comments).toHaveLength(1);
      expect(listed.comments[0]?.status).toBe("open");
    }

    const resolved = await comment_resolve(docsRoot, "guide", added.comment.id, added.hash, "agent-session");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.comments.comments[0]?.status).toBe("resolved");
    }
  });

  test("comment_resolve returns 404 for an unknown comment id", async () => {
    const result = await comment_resolve(docsRoot, "guide", "does-not-exist", undefined, "agent-session");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  test("comment_resolve persists the optional response as the comment's resolution note", async () => {
    const added = await addBundleComment(docsRoot, "guide", {
      target: { kind: "block", blockId: "h1" },
      body: "Please rewrite this heading.",
      intent: "agent-request",
      author: "human-1",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const resolved = await comment_resolve(
      docsRoot,
      "guide",
      added.comment.id,
      added.hash,
      "agent-session",
      "Rewrote the heading per the request.",
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.comments.comments[0]?.status).toBe("resolved");
      expect(resolved.comments.comments[0]?.resolution).toBe("Rewrote the heading per the request.");
    }

    // The note survives the schema-validated round-trip on disk (the
    // validator must preserve the additive `resolution` field rather than
    // stripping unknown keys).
    const onDisk = JSON.parse(await readFile(join(docsRoot, "guide", "comments.json"), "utf8")) as {
      comments: Array<{ resolution?: string; status: string }>;
    };
    expect(onDisk.comments[0]?.resolution).toBe("Rewrote the heading per the request.");

    const relisted = await comment_list(docsRoot, "guide");
    expect(relisted.ok).toBe(true);
    if (relisted.ok) expect(relisted.comments[0]?.resolution).toBe("Rewrote the heading per the request.");
  });
});
