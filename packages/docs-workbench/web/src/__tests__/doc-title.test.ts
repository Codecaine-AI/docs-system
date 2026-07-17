import { describe, expect, it } from "bun:test";
import { docSegmentFromTitle, docTitleFromPath } from "../lib/doc-title";

describe("docTitleFromPath", () => {
  it("prettifies the sidebar segment into Title Case", () => {
    expect(docTitleFromPath("docs/10-system-design/00-interaction-surfaces")).toBe(
      "Interaction Surfaces",
    );
    expect(docTitleFromPath("00-manifesto")).toBe("Manifesto");
    expect(docTitleFromPath("10-doc-architecture")).toBe("Doc Architecture");
  });

  it("keeps minor words lowercase mid-title but capitalizes edges", () => {
    expect(docTitleFromPath("10-state-of-the-union")).toBe("State of the Union");
    expect(docTitleFromPath("20-the-save-pipeline")).toBe("The Save Pipeline");
    expect(docTitleFromPath("30-ready-to-go")).toBe("Ready to Go");
  });

  it("uppercases domain acronyms", () => {
    expect(docTitleFromPath("60-docs-cli")).toBe("Docs CLI");
    expect(docTitleFromPath("40-system-ui")).toBe("System UI");
    expect(docTitleFromPath("50-api-notes")).toBe("API Notes");
  });

  it("handles numberless and trailing-slash segments", () => {
    expect(docTitleFromPath("docs/20-implementation/")).toBe("Implementation");
    expect(docTitleFromPath("overview")).toBe("Overview");
  });
});

describe("docSegmentFromTitle", () => {
  it("re-slugs the title while keeping the numeric prefix", () => {
    expect(docSegmentFromTitle("Fresh Coat", "00-interaction-surfaces")).toBe("00-fresh-coat");
    expect(docSegmentFromTitle("Docs CLI", "60-docs-cli")).toBe("60-docs-cli");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    expect(docSegmentFromTitle("State: of the union!", "10-old")).toBe("10-state-of-the-union");
    expect(docSegmentFromTitle("  spaced   out  ", "20-x")).toBe("20-spaced-out");
  });

  it("handles prefixless segments and hopeless titles", () => {
    expect(docSegmentFromTitle("New Name", "plain-folder")).toBe("new-name");
    expect(docSegmentFromTitle("!!!", "10-x")).toBeNull();
    expect(docSegmentFromTitle("   ", "10-x")).toBeNull();
  });

  it("round-trips with docTitleFromPath", () => {
    const segment = docSegmentFromTitle("Interaction Surfaces", "00-old")!;
    expect(docTitleFromPath(segment)).toBe("Interaction Surfaces");
  });
});
