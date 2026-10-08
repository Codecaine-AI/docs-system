import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { TREE_ROWS_CSS } from "../../outline-rows/tree-rows";
import { descriptors } from "../descriptor";

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

function renderTree(entries: Array<Record<string, unknown>>) {
  const block = { id: "tree", type: "file-tree", props: { entries }, text: [] } as unknown as DocBlock;
  render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
}

const treeRows = () => Array.from(document.querySelectorAll('.docs-tree__row[role="listitem"]'));

/** Each rendered row as "name color head seam", e.g. "src/ blue head". */
const colorRows = () =>
  treeRows().map((row) =>
    [
      row.querySelector(".docs-tree__name")?.textContent,
      row.getAttribute("data-color"),
      row.hasAttribute("data-color-head") && "head",
      row.hasAttribute("data-color-seam") && "seam",
    ]
      .filter(Boolean)
      .join(" "),
  );

afterEach(() => {
  cleanup();
});

describe("file tree group color", () => {
  it("washes a colored directory's whole subtree and lets a nested color take over its own", () => {
    renderTree([
      { path: "src/", color: "blue" },
      { path: "src/lib/util.ts" },
      { path: "src/ui/", color: "teal" },
      { path: "src/ui/button.tsx" },
      { path: "src/zeta.ts" },
      { path: "docs/readme.md" },
    ]);
    expect(colorRows()).toEqual([
      "docs/",
      "readme.md",
      "src/ blue head",
      "lib/ blue",
      "util.ts blue",
      "ui/ teal head seam",
      "button.tsx teal",
      "zeta.ts blue seam",
    ]);
  });

  it("colors a file entry's own row only and ignores an off-roster color", () => {
    renderTree([
      { path: "src/", color: "blue" },
      { path: "src/a.ts", color: "pink" },
      { path: "src/b.ts" },
      { path: "bad.md", color: "magenta" },
      { path: "notes.md", color: "pink" },
      { path: "todo.md" },
    ]);
    expect(colorRows()).toEqual([
      "src/ blue head",
      "a.ts pink head seam",
      "b.ts blue seam",
      "bad.md",
      "notes.md pink head",
      "todo.md",
    ]);
  });

  it("splits two adjacent bands of the same color with a seam", () => {
    renderTree([
      { path: "a/", color: "blue" },
      { path: "a/x.ts" },
      { path: "b/", color: "blue" },
      { path: "b/y.ts" },
    ]);
    expect(colorRows()).toEqual(["a/ blue head", "x.ts blue", "b/ blue head seam", "y.ts blue"]);
  });

  it("keeps a changed row's change inside a band, and the stylesheet lets the change win", () => {
    renderTree([
      { path: "src/", color: "blue", change: "modified" },
      { path: "src/a.ts", change: "added" },
    ]);
    const [head, file] = treeRows();
    expect(head?.getAttribute("data-change")).toBe("modified");
    expect(head?.getAttribute("data-color")).toBe("blue");
    expect(head?.hasAttribute("data-color-head")).toBe(true);
    expect(file?.getAttribute("data-change")).toBe("added");
    expect(file?.getAttribute("data-color")).toBe("blue");
    // Cascade contract: the hover wash skips changed rows, and the change name
    // color comes after the head name color at equal specificity.
    expect(TREE_ROWS_CSS).toContain(".docs-tree__row[data-color-active]:not([data-change]) { background: var(--tr-grp-soft); }");
    expect(TREE_ROWS_CSS.indexOf(".docs-tree__row[data-color-head] .docs-tree__name {")).toBeLessThan(
      TREE_ROWS_CSS.indexOf(".docs-tree__row[data-change] .docs-tree__name {"),
    );
  });

  it("washes only the color group under the pointer, innermost group first", () => {
    renderTree([
      { path: "a/", color: "blue" },
      { path: "a/x.ts" },
      { path: "a/in/", color: "pink" },
      { path: "a/in/y.ts" },
      { path: "b.ts" },
    ]);
    const active = () => treeRows().map((row) => row.hasAttribute("data-color-active"));
    const rows = treeRows();
    expect(active()).toEqual([false, false, false, false, false]);
    // Folders list first: a/, in/, y.ts, x.ts, b.ts.
    fireEvent.mouseOver(rows[3]!);
    expect(active()).toEqual([true, false, false, true, false]);
    fireEvent.mouseOver(rows[2]!);
    expect(active()).toEqual([false, true, true, false, false]);
    fireEvent.mouseLeave(document.querySelector(".docs-tree__rows")!);
    expect(active()).toEqual([false, false, false, false, false]);
  });
});
