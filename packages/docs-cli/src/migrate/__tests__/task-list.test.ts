import { describe, expect, it } from "bun:test";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { projectToMarkdown } from "@codecaine-ai/docs-model/project-markdown";
import { mdxToDoc } from "../mdx-to-doc";

const DOC_PATH = "docs/90-scratch/tasks.mdx";

function listItems(source: string): DocBlock[] {
  const { doc } = mdxToDoc(source, DOC_PATH);
  return Object.values(doc.blocks).filter((block) => block.type === "list-item");
}

/** Projection with blank lines dropped: the projection separates nesting levels with blank lines. */
function roundTrip(lines: string[]): string {
  const { doc } = mdxToDoc(`# Tasks\n\n${lines.join("\n")}\n`, DOC_PATH);
  return projectToMarkdown(doc)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

describe("mdxToDoc — task lists", () => {
  it("parses [ ], [x] and [X] into props.checked and strips the marker from the text", () => {
    const items = listItems("- [ ] Install Bun.\n- [x] Retire the dev-01 key.\n- [X] Rotate the token.\n");
    expect(items.map((item) => item.props.checked)).toEqual([false, true, true]);
    expect(items.map((item) => item.text?.map((span) => span.insert).join(""))).toEqual([
      "Install Bun.",
      "Retire the dev-01 key.",
      "Rotate the token.",
    ]);
  });

  it("leaves plain bullets without a checked key", () => {
    const items = listItems("- Plain item.\n1. Plain step.\n");
    expect(items.map((item) => item.props)).toEqual([{ ordered: false }, { ordered: true }]);
  });

  it("does not treat a bracket without a following space as a marker", () => {
    const [item] = listItems("- [x]ray vision\n");
    expect(item!.props).toEqual({ ordered: false });
    expect(item!.text?.map((span) => span.insert).join("")).toBe("[x]ray vision");
  });
});

describe("task lists round-trip through mdxToDoc -> projectToMarkdown", () => {
  it("keeps open and done boxes", () => {
    const lines = ["- [ ] Install Bun.", "- [x] Retire the dev-01 key (due 2026-10-21)."];
    expect(roundTrip(lines)).toContain(lines.join("\n"));
  });

  it("normalizes [X] to [x]", () => {
    expect(roundTrip(["- [X] Done."])).toContain("- [x] Done.");
  });

  it("keeps nested task items and their depth", () => {
    const lines = ["- [ ] Ship the release.", "  - [x] Tag the commit.", "  - [ ] Publish notes.", "- Plain follow-up."];
    expect(roundTrip(lines)).toContain(lines.join("\n"));
  });

  it("keeps ordered task items", () => {
    const lines = ["1. [ ] Install Bun.", "2. [x] Run the tests."];
    expect(roundTrip(lines)).toContain(lines.join("\n"));
  });

  it("leaves a plain list unchanged", () => {
    const lines = ["- First item.", "  - Nested item.", "- Second item."];
    const projection = roundTrip(lines);
    expect(projection).toContain(lines.join("\n"));
    expect(projection).not.toContain("[ ]");
  });
});
