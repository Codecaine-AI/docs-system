import { describe, expect, it } from "bun:test";
import { docPageTitle, docTitleFromPath } from "../shared/doc-title";

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
    expect(docTitleFromPath("docs-mcp-setup")).toBe("Docs MCP Setup");
  });

  it("handles numberless and trailing-slash segments", () => {
    expect(docTitleFromPath("docs/20-implementation/")).toBe("Implementation");
    expect(docTitleFromPath("overview")).toBe("Overview");
  });
});

describe("docPageTitle", () => {
  it("shows the doc's title field, not the folder name", () => {
    expect(docPageTitle("Package Layers and Import Rules", "05-package-layers")).toBe("Package Layers and Import Rules");
    expect(docPageTitle("Core Overview", "06-core-handbook-overview")).toBe("Core Overview");
  });

  it("falls back to the folder name when the title is empty", () => {
    expect(docPageTitle("  ", "10-docs-cli")).toBe("Docs CLI");
    expect(docPageTitle(undefined, "20-the-save-pipeline")).toBe("The Save Pipeline");
  });
});
