import { describe, expect, it } from "bun:test";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import {
  CLOSED_PEEK_STATE,
  docPeekReducer,
  isSamePeekTarget,
  type DocPeekState,
} from "../peek-state";

/**
 * Pure reducer semantics for the side peek: open/replace/close transitions,
 * requestId monotonicity (so a repeat click on the same chip refetches), and
 * the stale-load guard (a result for a replaced or closed target is dropped).
 */

const refA: SpectreRef = { kind: "doc", path: "guides/a", label: "Doc A" };
const refB: SpectreRef = { kind: "doc", path: "guides/b", label: "Doc B" };

const docA: DocDocument = {
  schemaVersion: 1,
  id: "doc-a",
  title: "Doc A",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: [] },
  },
};

function openOn(ref: SpectreRef): DocPeekState {
  return docPeekReducer(CLOSED_PEEK_STATE, { type: "open", ref });
}

describe("docPeekReducer", () => {
  it("open from closed starts loading the ref with requestId 1", () => {
    const state = openOn(refA);
    expect(state).toEqual({ open: true, ref: refA, requestId: 1, load: { status: "loading" } });
  });

  it("open while open replaces the target and bumps requestId", () => {
    const first = openOn(refA);
    const replaced = docPeekReducer(first, { type: "open", ref: refB });
    expect(replaced).toEqual({ open: true, ref: refB, requestId: 2, load: { status: "loading" } });
  });

  it("re-opening the SAME ref still bumps requestId so the load effect re-fires", () => {
    const first = openOn(refA);
    const again = docPeekReducer(first, { type: "open", ref: refA });
    expect(again.open && again.requestId).toBe(2);
    expect(again.open && again.load.status).toBe("loading");
  });

  it("close returns the closed state", () => {
    expect(docPeekReducer(openOn(refA), { type: "close" })).toEqual(CLOSED_PEEK_STATE);
  });

  it("load-success for the current target stores the document", () => {
    const loaded = docPeekReducer(openOn(refA), {
      type: "load-success",
      ref: refA,
      document: docA,
      documentPath: "guides/a/doc.json",
    });
    expect(loaded).toEqual({
      open: true,
      ref: refA,
      requestId: 1,
      load: { status: "loaded", document: docA, documentPath: "guides/a/doc.json" },
    });
  });

  it("load-success matches by target identity (kind+path), not ref object identity", () => {
    const clickedTwice: SpectreRef = { kind: "doc", path: "guides/a" };
    const loaded = docPeekReducer(openOn(clickedTwice), {
      type: "load-success",
      ref: refA,
      document: docA,
    });
    expect(loaded.open && loaded.load.status).toBe("loaded");
  });

  it("drops a stale load-success after the target was replaced", () => {
    const replaced = docPeekReducer(openOn(refA), { type: "open", ref: refB });
    const afterStale = docPeekReducer(replaced, {
      type: "load-success",
      ref: refA,
      document: docA,
    });
    expect(afterStale).toBe(replaced);
  });

  it("drops load results while closed", () => {
    expect(
      docPeekReducer(CLOSED_PEEK_STATE, { type: "load-success", ref: refA, document: docA }),
    ).toBe(CLOSED_PEEK_STATE);
    expect(
      docPeekReducer(CLOSED_PEEK_STATE, { type: "load-error", ref: refA, message: "nope" }),
    ).toBe(CLOSED_PEEK_STATE);
  });

  it("load-error for the current target stores the message", () => {
    const errored = docPeekReducer(openOn(refA), {
      type: "load-error",
      ref: refA,
      message: "Doc not found.",
    });
    expect(errored.open && errored.load).toEqual({ status: "error", message: "Doc not found." });
  });
});

describe("isSamePeekTarget", () => {
  it("compares kind and path only", () => {
    expect(isSamePeekTarget(refA, { kind: "doc", path: "guides/a", label: "renamed" })).toBe(true);
    expect(isSamePeekTarget(refA, refB)).toBe(false);
    expect(isSamePeekTarget(refA, { kind: "source", path: "guides/a" })).toBe(false);
  });
});
