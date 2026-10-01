import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors } from "../descriptor";

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

const BASE = "packages/docs-model/src/components/file-tree";
const ENTRIES = [
  { path: `${BASE}/actions/update-entry.ts`, change: "added" },
  { path: `${BASE}/agent-view.ts`, change: "modified", note: "tree drawing" },
  { path: `${BASE}/lib.ts`, change: "renamed", from: `${BASE}/render.ts` },
  { path: `${BASE}/manifest.ts` },
  { path: `${BASE}/state.ts`, note: "entry schema + tolerant read" },
];

function renderBlock(props: Record<string, unknown>) {
  const block = { id: "tree", type: "file-explorer", props } as unknown as DocBlock;
  render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
}

const rowNames = () =>
  Array.from(document.querySelectorAll('[role="treeitem"] [data-docs-file-tree-name]')).map(
    (node) => node.textContent,
  );

afterEach(() => {
  cleanup();
});

describe("file explorer", () => {
  it("compacts the single-child folder chain and lists rows dirs-first", () => {
    renderBlock({ entries: ENTRIES });
    expect(rowNames()).toEqual([
      BASE,
      "actions",
      "update-entry.ts",
      "agent-view.ts",
      "lib.ts",
      "manifest.ts",
      "state.ts",
    ]);
    const renamed = document.querySelector('[data-docs-file-tree-change="renamed"]');
    expect(renamed?.querySelector(".docs-tree__from")?.textContent).toBe("render.ts");
    expect(renamed?.querySelector(".docs-tree__from")?.getAttribute("title")).toBe(`${BASE}/render.ts`);
    expect(document.querySelector(".docs-tree__note")?.textContent).toBe("tree drawing");
  });

  it("signals a change by the gutter glyph alone, with no letter badge", () => {
    renderBlock({ entries: ENTRIES });
    const marks = Array.from(document.querySelectorAll('[role="treeitem"]')).map(
      (row) => row.querySelector(".docs-tree__mark")?.textContent,
    );
    expect(marks).toEqual(["", "", "+added", "~modified", ">renamed", "", ""]);
    for (const badge of ["A", "M", "R"]) {
      expect(Array.from(document.querySelectorAll('[role="treeitem"] span')).some((node) => node.textContent === badge)).toBe(false);
    }
  });

  it("heads with the title alone, and has no header without one", () => {
    renderBlock({ entries: ENTRIES, title: "File-tree refactor" });
    expect(document.querySelector("figcaption")?.textContent).toBe("File-tree refactor");
    cleanup();
    renderBlock({ entries: ENTRIES });
    expect(document.querySelector("figcaption")).toBeNull();
  });

  const folderRow = (name: string) =>
    Array.from(document.querySelectorAll("[role='treeitem'][aria-expanded]")).find(
      (node) => node.querySelector("[data-docs-file-tree-name]")?.textContent === name,
    ) as HTMLElement;

  it("collapses a folder when its row is clicked", () => {
    renderBlock({ entries: ENTRIES });
    const actions = folderRow("actions");
    fireEvent.click(actions);
    expect(rowNames()).not.toContain("update-entry.ts");
    expect(actions.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles a folder from the keyboard", () => {
    renderBlock({ entries: ENTRIES });
    const actions = folderRow("actions");
    expect(actions.tabIndex).toBe(0);
    fireEvent.keyDown(actions, { key: "Enter" });
    expect(rowNames()).not.toContain("update-entry.ts");
    fireEvent.keyDown(actions, { key: " " });
    expect(rowNames()).toContain("update-entry.ts");
  });

  it("folds past maxRows and toggles between all and first rows", () => {
    renderBlock({ entries: ENTRIES, maxRows: 3 });
    expect(rowNames()).toHaveLength(3);
    const more = Array.from(document.querySelectorAll("button")).find((node) =>
      node.textContent?.startsWith("Show all"),
    )!;
    expect(more.textContent).toBe("Show all 7 rows");
    fireEvent.click(more);
    expect(rowNames()).toHaveLength(7);
    expect(more.textContent).toBe("Show first 3 rows");
  });

  it("folds at 8 rows by default", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ path: `src/file-${i}.ts` }));
    renderBlock({ entries: many });
    expect(rowNames()).toHaveLength(8);
  });
});
