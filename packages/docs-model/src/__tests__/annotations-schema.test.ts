import { describe, expect, it } from "bun:test";

import type { DocDocument } from "../doc-schema";
import {
  detectDanglingTargets,
  docTargetFingerprint,
  docTargetFingerprintChanged,
  validateAnnotationsDocument,
  type AnnotationsDocument,
} from "../annotations-schema";

const doc: DocDocument = {
  schemaVersion: 1,
  id: "doc1",
  root: "root",
  blocks: {
    root: {
      id: "root",
      type: "paragraph",
      props: {},
      children: ["b1"],
    },
    b1: {
      id: "b1",
      type: "paragraph",
      props: {},
      children: [],
    },
  },
};

describe("annotations schema", () => {
  it("accepts valid block and canvas annotations", () => {
    const value: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: { kind: "block", blockId: "b1" },
          body: "Note",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "c2",
          target: { kind: "canvas-object", canvasSrc: "canvas-a", objectId: "obj1" },
          body: "Please change",
          intent: "agent-request",
          author: "Ford",
          status: "resolved",
          createdAt: "2026-07-03T00:00:01.000Z",
          agentRun: { sessionId: "s1", patchId: "p1", summary: "Changed it" },
        },
      ],
    };

    const result = validateAnnotationsDocument(value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.annotations).toEqual(value.annotations);
    }
  });

  it("accepts reply threads and rejects malformed replies with engine-compatible issues", () => {
    const base = {
      id: "c1",
      target: { kind: "block" as const, blockId: "b1" },
      body: "Note",
      intent: "note" as const,
      author: "Ford",
      status: "open" as const,
      createdAt: "2026-07-03T00:00:00.000Z",
    };
    const valid = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [{
        ...base,
        replies: [{ id: "r1", author: "Agent", body: "Done", createdAt: "2026-07-03T00:01:00.000Z" }],
      }],
    });

    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.document.annotations[0]?.replies).toEqual([
        { id: "r1", author: "Agent", body: "Done", createdAt: "2026-07-03T00:01:00.000Z" },
      ]);
    }

    const invalid = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [{ ...base, replies: [{ id: "", author: "", body: 4, createdAt: null }] }],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(expect.arrayContaining([
        { path: "$.annotations[0].replies[0].id", message: "Annotation reply requires a valid id." },
        { path: "$.annotations[0].replies[0].author", message: "Annotation reply author must be a non-empty string." },
        { path: "$.annotations[0].replies[0].body", message: "Annotation reply body must be a string." },
        { path: "$.annotations[0].replies[0].createdAt", message: "Annotation reply createdAt must be a string." },
      ]));
    }
  });

  it("preserves optional target fingerprints and reports changed block text", () => {
    const withText: DocDocument = {
      ...doc,
      blocks: {
        ...doc.blocks,
        b1: { ...doc.blocks.b1!, text: [{ insert: "Before   filing" }] },
      },
    };
    const target = { kind: "block" as const, blockId: "b1" };
    const fingerprint = docTargetFingerprint(withText, target);

    expect(fingerprint).toBe("fc33d90f");
    expect(docTargetFingerprint(withText, { kind: "canvas-object", canvasSrc: "a", objectId: "o" })).toBeNull();
    expect(validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [{
        id: "c1", target: { ...target, fingerprint }, body: "Note", intent: "note",
        author: "Ford", status: "open", createdAt: "2026-07-03T00:00:00.000Z",
      }],
    }).ok).toBe(true);
    expect(docTargetFingerprintChanged(withText, {
      id: "c1", target: { ...target, fingerprint: fingerprint! }, body: "Note", intent: "note",
      author: "Ford", status: "open", createdAt: "2026-07-03T00:00:00.000Z",
    })).toBe(false);

    const changed = {
      ...withText,
      blocks: { ...withText.blocks, b1: { ...withText.blocks.b1!, text: [{ insert: "After filing" }] } },
    };
    expect(docTargetFingerprintChanged(changed, {
      id: "c1", target: { ...target, fingerprint: fingerprint! }, body: "Note", intent: "note",
      author: "Ford", status: "open", createdAt: "2026-07-03T00:00:00.000Z",
    })).toBe(true);
  });

  it("rejects a retired comments-keyed sidecar with a typed issue (no throw)", () => {
    const retired = {
      schemaVersion: 1,
      comments: [
        {
          id: "old-1",
          target: { kind: "block", blockId: "b1" },
          body: "Written before the rename",
          intent: "agent-request",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
      ],
    };

    const result = validateAnnotationsDocument(retired);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.annotations",
        message: "Annotations must be an array.",
      });
    }
  });

  it("rejects bad schemaVersion", () => {
    const result = validateAnnotationsDocument({ schemaVersion: 2, annotations: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.schemaVersion",
        message: "Annotations schemaVersion must be 1.",
      });
    }
  });

  it("rejects duplicate annotation ids", () => {
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: { kind: "block", blockId: "b1" },
          body: "One",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "c1",
          target: { kind: "block", blockId: "b1" },
          body: "Two",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:01.000Z",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[1].id");
    }
  });

  it("rejects unknown intent and status", () => {
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: { kind: "block", blockId: "b1" },
          body: "One",
          intent: "unknown",
          author: "Ford",
          status: "stale",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[0].intent");
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[0].status");
    }
  });

  it("rejects canvas object targets with both selectors or no selectors", () => {
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: { kind: "canvas-object", canvasSrc: "canvas-a", objectId: "o1", connectionId: "cxn1" },
          body: "One",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "c2",
          target: { kind: "canvas-object", canvasSrc: "canvas-a" },
          body: "Two",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:01.000Z",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[0].target");
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[1].target");
    }
  });

  it("rejects region with non-positive width", () => {
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: {
            kind: "canvas-object",
            canvasSrc: "canvas-a",
            region: { x: 0, y: 0, width: 0, height: 10 },
          },
          body: "One",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toContain("$.annotations[0].target.region.width");
    }
  });

  it("detects dangling targets", () => {
    const annotations: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [
        {
          id: "missing-block",
          target: { kind: "block", blockId: "gone" },
          body: "Missing block",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "existing-block",
          target: { kind: "block", blockId: "b1" },
          body: "Existing block",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:01.000Z",
        },
        {
          id: "missing-object",
          target: { kind: "canvas-object", canvasSrc: "canvas-a", objectId: "missing-obj" },
          body: "Missing object",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:02.000Z",
        },
        {
          id: "missing-canvas",
          target: { kind: "canvas-object", canvasSrc: "canvas-missing", objectId: "obj1" },
          body: "Missing canvas",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:03.000Z",
        },
        {
          id: "region-ok",
          target: {
            kind: "canvas-object",
            canvasSrc: "canvas-a",
            region: { x: 0, y: 0, width: 10, height: 10 },
          },
          body: "Region",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:04.000Z",
        },
      ],
    };

    const canvases = {
      "canvas-a": {
        objectIds: new Set(["obj1"]),
        connectionIds: new Set(["cxn1"]),
      },
    };

    expect(detectDanglingTargets(annotations, doc, canvases)).toEqual([
      { annotationId: "missing-block", reason: 'Block "gone" no longer exists.' },
      { annotationId: "missing-object", reason: 'Canvas object "missing-obj" no longer exists.' },
      { annotationId: "missing-canvas", reason: 'Canvas "canvas-missing" not loaded or missing.' },
    ]);
    expect(detectDanglingTargets(annotations, null, canvases)).toContainEqual({
      annotationId: "existing-block",
      reason: 'Block "b1" no longer exists.',
    });
  });

  it("accepts a valid text-range annotation", () => {
    const value: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [
        {
          id: "r1",
          target: { kind: "text-range", blockId: "b1", start: 3, end: 8, quote: "lo fr" },
          body: "Reword this",
          intent: "agent-request",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      ],
    };

    const result = validateAnnotationsDocument(value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.annotations).toEqual(value.annotations);
    }
  });

  it("rejects text-range targets with bad offsets or an empty quote", () => {
    const base = {
      body: "One",
      intent: "note",
      author: "Ford",
      status: "open",
      createdAt: "2026-07-30T00:00:00.000Z",
    };
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        // end <= start
        { id: "c1", target: { kind: "text-range", blockId: "b1", start: 5, end: 5, quote: "x" }, ...base },
        // negative / non-integer start
        { id: "c2", target: { kind: "text-range", blockId: "b1", start: -1, end: 4, quote: "x" }, ...base },
        { id: "c3", target: { kind: "text-range", blockId: "b1", start: 1.5, end: 4, quote: "x" }, ...base },
        // empty quote
        { id: "c4", target: { kind: "text-range", blockId: "b1", start: 0, end: 4, quote: "" }, ...base },
        // missing blockId
        { id: "c5", target: { kind: "text-range", start: 0, end: 4, quote: "x" }, ...base },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.issues.map((issue) => issue.path);
      expect(paths).toContain("$.annotations[0].target.end");
      expect(paths).toContain("$.annotations[1].target.start");
      expect(paths).toContain("$.annotations[2].target.start");
      expect(paths).toContain("$.annotations[3].target.quote");
      expect(paths).toContain("$.annotations[4].target.blockId");
    }
  });

  it("reports the three-kind message for an unknown target kind", () => {
    const result = validateAnnotationsDocument({
      schemaVersion: 1,
      annotations: [
        {
          id: "c1",
          target: { kind: "mystery" },
          body: "One",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-30T00:00:00.000Z",
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.annotations[0].target.kind",
        message: "Annotation target kind must be block or canvas-object or text-range.",
      });
    }
  });

  it("detects dangling text-range targets: missing block, quote drift; existence-only for text-less blocks", () => {
    const docWithText: DocDocument = {
      schemaVersion: 1,
      id: "doc2",
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["p1", "img1"] },
        p1: {
          id: "p1",
          type: "paragraph",
          props: {},
          text: [{ insert: "Hello " }, { insert: "world", attributes: { bold: true } }],
          children: [],
        },
        img1: { id: "img1", type: "image", props: { src: "a.png" }, children: [] },
      },
    };
    const base = {
      body: "x",
      intent: "agent-request" as const,
      author: "Ford",
      status: "open" as const,
      createdAt: "2026-07-30T00:00:00.000Z",
    };
    const annotations: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [
        // Quote still present (normalized containment across spans).
        { id: "ok", target: { kind: "text-range", blockId: "p1", start: 4, end: 8, quote: "o wo" }, ...base },
        // Block gone entirely.
        { id: "gone-block", target: { kind: "text-range", blockId: "zap", start: 0, end: 2, quote: "He" }, ...base },
        // Quote drifted out of the block's text.
        { id: "drifted", target: { kind: "text-range", blockId: "p1", start: 0, end: 7, quote: "Goodbye" }, ...base },
        // Text-less block: existence-only, never dangling while it exists.
        { id: "no-text", target: { kind: "text-range", blockId: "img1", start: 0, end: 3, quote: "alt" }, ...base },
      ],
    };

    expect(detectDanglingTargets(annotations, docWithText, {})).toEqual([
      { annotationId: "gone-block", reason: 'Block "zap" no longer exists.' },
      { annotationId: "drifted", reason: 'Quoted text no longer appears in block "p1".' },
    ]);
  });

  it("skips canvas-target checks while the canvas index is not loaded (undefined/null), but still runs block checks", () => {
    const annotations: AnnotationsDocument = {
      schemaVersion: 1,
      annotations: [
        {
          id: "missing-block",
          target: { kind: "block", blockId: "gone" },
          body: "Missing block",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "canvas-annotation",
          target: { kind: "canvas-object", canvasSrc: "canvas-a", objectId: "obj1" },
          body: "Canvas annotation",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:01.000Z",
        },
      ],
    };

    for (const notLoaded of [undefined, null]) {
      expect(detectDanglingTargets(annotations, doc, notLoaded)).toEqual([
        { annotationId: "missing-block", reason: 'Block "gone" no longer exists.' },
      ]);
    }

    // Loaded-but-empty index is different: the canvas is genuinely absent.
    expect(detectDanglingTargets(annotations, doc, {})).toContainEqual({
      annotationId: "canvas-annotation",
      reason: 'Canvas "canvas-a" not loaded or missing.',
    });
  });
});
