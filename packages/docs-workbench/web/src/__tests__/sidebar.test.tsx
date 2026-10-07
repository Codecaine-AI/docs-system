import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

import { Sidebar } from "../_components/RouterShell/_components/Sidebar";

/**
 * Sidebar expansion: a fresh load collapses every branch except the
 * ancestors of the open doc, navigating into a collapsed branch reveals it,
 * and double-clicking a row collapses everything off that row's path.
 */

const tree: DocsTreeNode[] = [
  {
    name: "guides",
    path: "guides",
    kind: "dir",
    children: [{ name: "intro", path: "guides/intro", kind: "bundle" }],
  },
  {
    name: "reference",
    path: "reference",
    kind: "dir",
    children: [
      {
        name: "api",
        path: "reference/api",
        kind: "dir",
        children: [{ name: "auth", path: "reference/api/auth", kind: "bundle" }],
      },
    ],
  },
];

function row(container: HTMLElement, path: string): HTMLElement {
  return container.querySelector(`[data-docs-tree-path="${path}"]`)!;
}

function expanded(container: HTMLElement, path: string): string | null {
  return container
    .querySelector(`[data-docs-tree-kind="dir"][data-docs-tree-path="${path}"]`)!
    .getAttribute("aria-expanded");
}

afterEach(cleanup);

describe("Sidebar", () => {
  it("collapses every branch when no doc is open", () => {
    const { container } = render(<Sidebar tree={tree} selectedPath={null} />);
    expect(expanded(container, "guides")).toBe("false");
    expect(expanded(container, "reference")).toBe("false");
  });

  it("expands only the ancestors of the open doc", () => {
    const { container } = render(<Sidebar tree={tree} selectedPath="reference/api/auth" />);
    expect(expanded(container, "guides")).toBe("false");
    expect(expanded(container, "reference")).toBe("true");
    expect(expanded(container, "reference/api")).toBe("true");
  });

  it("reveals a collapsed branch when navigation moves into it", () => {
    const { container, rerender } = render(<Sidebar tree={tree} selectedPath="guides/intro" />);
    expect(expanded(container, "reference")).toBe("false");
    rerender(<Sidebar tree={tree} selectedPath="reference/api/auth" />);
    expect(expanded(container, "reference")).toBe("true");
    expect(expanded(container, "reference/api")).toBe("true");
    expect(expanded(container, "guides")).toBe("true");
  });

  it("double-clicking a folder collapses everything off its path", () => {
    const { container } = render(<Sidebar tree={tree} selectedPath="guides/intro" />);
    fireEvent.click(row(container, "reference"));
    fireEvent.click(row(container, "reference/api"));
    expect(expanded(container, "guides")).toBe("true");

    fireEvent.doubleClick(row(container, "reference"));
    expect(expanded(container, "guides")).toBe("false");
    expect(expanded(container, "reference")).toBe("true");
    expect(expanded(container, "reference/api")).toBe("false");
  });

  it("double-clicking a doc keeps only its ancestors open", () => {
    const { container } = render(<Sidebar tree={tree} selectedPath="reference/api/auth" />);
    fireEvent.click(row(container, "guides"));

    fireEvent.doubleClick(row(container, "reference/api/auth"));
    expect(expanded(container, "guides")).toBe("false");
    expect(expanded(container, "reference")).toBe("true");
    expect(expanded(container, "reference/api")).toBe("true");
  });

  it("re-applies on a repeat double-click of the same row", () => {
    const { container } = render(<Sidebar tree={tree} selectedPath={null} />);
    fireEvent.click(row(container, "guides"));
    fireEvent.doubleClick(row(container, "reference"));
    fireEvent.click(row(container, "guides"));
    expect(expanded(container, "guides")).toBe("true");

    fireEvent.doubleClick(row(container, "reference"));
    expect(expanded(container, "guides")).toBe("false");
  });
});
