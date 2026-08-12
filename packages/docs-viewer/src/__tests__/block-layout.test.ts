import { describe, expect, it } from "bun:test";
import { DOC_BLOCK_TYPES, type DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import { getDocBlockDescriptor } from "../render/block-registry";
import {
  CENTERED_MEDIA_BLOCK_LAYOUT,
  DEFAULT_DOC_BLOCK_LAYOUT,
  WIDE_DATA_BLOCK_LAYOUT,
  docBlockLaneName,
  docBlockLayoutClasses,
} from "../render/block-layout";

/**
 * The page is left-anchored and full-width; each block type claims its own
 * lane inside it (render/block-layout.ts). This is the guard on that map: the
 * lane assignment is a DESIGN decision, so it gets asserted here rather than
 * left to whatever a component happens to render.
 */

/** The data-heavy block types that share the wide lane, left-anchored. */
const WIDE_DATA_TYPES: DocBlockType[] = [
  "state-shape",
  "interaction-surface",
  "structured-table",
  "process-outline",
];

/** Media: wide lane, centered on the page (text stays on the left rail). */
const CENTERED_MEDIA_TYPES: DocBlockType[] = ["image", "video", "canvas", "sequence"];

describe("per-block-type page layout", () => {
  it("defaults every unlisted block type to the text measure, left-justified", () => {
    const laned = new Set<string>([...WIDE_DATA_TYPES, ...CENTERED_MEDIA_TYPES]);
    const textTypes = DOC_BLOCK_TYPES.filter((type) => !laned.has(type));

    // Sanity: the default set is the text-like blocks, not an empty list.
    expect(textTypes).toContain("paragraph");
    expect(textTypes).toContain("heading");

    for (const type of textTypes) {
      const descriptor = getDocBlockDescriptor(type);
      if (!descriptor) throw new Error(`no descriptor for ${type}`);
      // Declaring nothing IS the declaration — the resolver supplies the default.
      expect(descriptor.layout).toBeUndefined();
      expect(docBlockLayoutClasses(descriptor.layout)).toBe(
        "w-full max-w-[var(--style-content-width,100ch)] ml-0 mr-auto",
      );
    }
  });

  it("puts the data-heavy block types in the wide lane, left-anchored", () => {
    for (const type of WIDE_DATA_TYPES) {
      const descriptor = getDocBlockDescriptor(type);
      if (!descriptor) throw new Error(`no descriptor for ${type}`);
      expect(descriptor.layout).toEqual(WIDE_DATA_BLOCK_LAYOUT);
      expect(docBlockLayoutClasses(descriptor.layout)).toBe(
        "w-full max-w-[var(--style-wide-width,1700px)] ml-0 mr-auto",
      );
    }
  });

  it("centers media on the page while prose stays on the left rail", () => {
    for (const type of CENTERED_MEDIA_TYPES) {
      const descriptor = getDocBlockDescriptor(type);
      if (!descriptor) throw new Error(`no descriptor for ${type}`);
      expect(descriptor.layout).toEqual(CENTERED_MEDIA_BLOCK_LAYOUT);
      expect(docBlockLayoutClasses(descriptor.layout)).toBe(
        "w-full max-w-[var(--style-wide-width,1700px)] mx-auto",
      );
    }
  });

  it("covers every registered block type", () => {
    // No block type may be left without a resolvable lane.
    for (const type of DOC_BLOCK_TYPES) {
      const descriptor = getDocBlockDescriptor(type);
      if (!descriptor) throw new Error(`no descriptor for ${type}`);
      expect(docBlockLayoutClasses(descriptor.layout)).toContain("w-full");
      expect(docBlockLaneName(descriptor.layout)).toMatch(/^(text|wide|full|custom)-(left|center)$/);
    }
  });

  it("lets a block type override the named lanes with a custom width", () => {
    // The escape hatch: a literal Tailwind token wins over `width`.
    expect(
      docBlockLayoutClasses({ customWidthClass: "max-w-[880px]", justify: "center" }),
    ).toBe("w-full max-w-[880px] mx-auto");
    expect(docBlockLaneName({ customWidthClass: "max-w-[880px]" })).toBe("custom-left");
  });

  it("resolves an absent declaration to the documented default", () => {
    expect(DEFAULT_DOC_BLOCK_LAYOUT).toEqual({ width: "text", justify: "left" });
    expect(docBlockLayoutClasses()).toBe(docBlockLayoutClasses(DEFAULT_DOC_BLOCK_LAYOUT));
  });
});
