import { describe, expect, it } from "bun:test";
import {
  gapPosition,
  getTargetIndexByDraggingOffset,
  type Rect,
  unionRect,
} from "../components/structured-table/editor/geometry";

const columnEdges = [0, 100, 200, 300, 400];

describe("getTargetIndexByDraggingOffset", () => {
  it("targets the furthest block whose center the trailing edge crossed when dragging right", () => {
    expect(getTargetIndexByDraggingOffset(columnEdges, 0, 160)).toBe(2);
    expect(getTargetIndexByDraggingOffset(columnEdges, 0, 120)).toBe(1);
  });

  it("targets the nearest block whose center the leading edge crossed when dragging left", () => {
    expect(getTargetIndexByDraggingOffset(columnEdges, 3, 120)).toBe(1);
    expect(getTargetIndexByDraggingOffset(columnEdges, 3, 40)).toBe(0);
  });

  it("returns the dragging index when no center has been crossed", () => {
    expect(getTargetIndexByDraggingOffset(columnEdges, 0, 30)).toBe(0);
    expect(getTargetIndexByDraggingOffset(columnEdges, 3, 280)).toBe(3);
    expect(getTargetIndexByDraggingOffset(columnEdges, 2, 200)).toBe(2);
  });

  it("handles vertical offsets with uneven row heights", () => {
    const rowEdges = [0, 40, 100, 140];
    expect(getTargetIndexByDraggingOffset(rowEdges, 2, 10)).toBe(0);
    expect(getTargetIndexByDraggingOffset(rowEdges, 0, 60)).toBe(1);
    expect(getTargetIndexByDraggingOffset(rowEdges, 1, 45)).toBe(1);
  });
});

describe("unionRect", () => {
  it("returns null for an empty list", () => {
    expect(unionRect([])).toBeNull();
  });

  it("returns a copy of a single rect", () => {
    const rect: Rect = { left: 5, top: 10, width: 20, height: 30 };
    const result = unionRect([rect]);
    expect(result).toEqual(rect);
    expect(result).not.toBe(rect);
  });

  it("returns the bounding box of multiple rects", () => {
    const result = unionRect([
      { left: 0, top: 0, width: 10, height: 10 },
      { left: 30, top: 20, width: 10, height: 5 },
      { left: -5, top: 5, width: 2, height: 40 },
    ]);
    expect(result).toEqual({ left: -5, top: 0, width: 45, height: 45 });
  });
});

describe("gapPosition", () => {
  it("returns the edge offset between adjacent slots", () => {
    expect(gapPosition(columnEdges, 0)).toBe(0);
    expect(gapPosition(columnEdges, 2)).toBe(200);
    expect(gapPosition(columnEdges, 4)).toBe(400);
  });

  it("clamps the slot index to the offsets range", () => {
    expect(gapPosition(columnEdges, -3)).toBe(0);
    expect(gapPosition(columnEdges, 99)).toBe(400);
  });

  it("returns 0 for empty offsets", () => {
    expect(gapPosition([], 1)).toBe(0);
  });
});
