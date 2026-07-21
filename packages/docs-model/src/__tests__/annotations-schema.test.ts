import { describe, expect, it } from "bun:test";

import type { DocDocument } from "../doc-schema";
import {
  detectDanglingTargets,
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
