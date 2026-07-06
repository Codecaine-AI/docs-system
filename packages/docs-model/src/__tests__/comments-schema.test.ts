import { describe, expect, it } from "bun:test";

import type { DocDocument } from "../doc-schema";
import {
  detectDanglingTargets,
  validateCommentsDocument,
  type CommentsDocument,
} from "../comments-schema";

const doc: DocDocument = {
  schemaVersion: 1,
  id: "doc1",
  root: "root",
  blocks: {
    root: {
      id: "root",
      flavour: "paragraph",
      props: {},
      children: ["b1"],
    },
    b1: {
      id: "b1",
      flavour: "paragraph",
      props: {},
      children: [],
    },
  },
};

describe("comments schema", () => {
  it("accepts valid block and canvas comments", () => {
    const value: CommentsDocument = {
      schemaVersion: 1,
      comments: [
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

    const result = validateCommentsDocument(value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.comments).toEqual(value.comments);
    }
  });

  it("rejects bad schemaVersion", () => {
    const result = validateCommentsDocument({ schemaVersion: 2, comments: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "$.schemaVersion",
        message: "Comments schemaVersion must be 1.",
      });
    }
  });

  it("rejects duplicate comment ids", () => {
    const result = validateCommentsDocument({
      schemaVersion: 1,
      comments: [
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
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[1].id");
    }
  });

  it("rejects unknown intent and status", () => {
    const result = validateCommentsDocument({
      schemaVersion: 1,
      comments: [
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
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[0].intent");
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[0].status");
    }
  });

  it("rejects canvas object targets with both selectors or no selectors", () => {
    const result = validateCommentsDocument({
      schemaVersion: 1,
      comments: [
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
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[0].target");
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[1].target");
    }
  });

  it("rejects region with non-positive width", () => {
    const result = validateCommentsDocument({
      schemaVersion: 1,
      comments: [
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
      expect(result.issues.map((issue) => issue.path)).toContain("$.comments[0].target.region.width");
    }
  });

  it("detects dangling targets", () => {
    const comments: CommentsDocument = {
      schemaVersion: 1,
      comments: [
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

    expect(detectDanglingTargets(comments, doc, canvases)).toEqual([
      { commentId: "missing-block", reason: 'Block "gone" no longer exists.' },
      { commentId: "missing-object", reason: 'Canvas object "missing-obj" no longer exists.' },
      { commentId: "missing-canvas", reason: 'Canvas "canvas-missing" not loaded or missing.' },
    ]);
    expect(detectDanglingTargets(comments, null, canvases)).toContainEqual({
      commentId: "existing-block",
      reason: 'Block "b1" no longer exists.',
    });
  });

  it("skips canvas-target checks while the canvas index is not loaded (undefined/null), but still runs block checks", () => {
    const comments: CommentsDocument = {
      schemaVersion: 1,
      comments: [
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
          id: "canvas-comment",
          target: { kind: "canvas-object", canvasSrc: "canvas-a", objectId: "obj1" },
          body: "Canvas comment",
          intent: "note",
          author: "Ford",
          status: "open",
          createdAt: "2026-07-03T00:00:01.000Z",
        },
      ],
    };

    for (const notLoaded of [undefined, null]) {
      expect(detectDanglingTargets(comments, doc, notLoaded)).toEqual([
        { commentId: "missing-block", reason: 'Block "gone" no longer exists.' },
      ]);
    }

    // Loaded-but-empty index is different: the canvas is genuinely absent.
    expect(detectDanglingTargets(comments, doc, {})).toContainEqual({
      commentId: "canvas-comment",
      reason: 'Canvas "canvas-a" not loaded or missing.',
    });
  });
});
