import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

import { Sidebar } from "../shell/Sidebar";

/**
 * Sidebar expansion: a fresh load collapses every branch except the
 * ancestors of the open doc, and navigating into a collapsed branch
 * reveals it.
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
});
