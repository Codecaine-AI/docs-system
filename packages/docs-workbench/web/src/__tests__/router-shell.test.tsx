import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

import { RouterShell, SIDEBAR_STORAGE_KEY } from "../_components/RouterShell";

/**
 * The workbench's app shell wiring: the docs tree in the sidebar, its
 * section rail when collapsed, the current page marked once, and the sidebar
 * state stored only where the host may persist (layout.md rule 4; a static
 * export and a theme-locked serve persist nothing).
 */

const tree: DocsTreeNode[] = [
  {
    name: "guides",
    path: "guides",
    kind: "bundle",
    children: [{ name: "intro", path: "guides/intro", kind: "bundle" }],
  },
  {
    name: "reference",
    path: "reference",
    kind: "dir",
    children: [{ name: "auth", path: "reference/auth", kind: "bundle" }],
  },
  { name: "notes.md", path: "notes.md", kind: "file" },
];

function shell(props: { isStatic?: boolean; persistSidebar?: boolean } = {}) {
  return render(
    <RouterShell
      appName="Docs"
      title="Intro"
      tree={tree}
      treeError={null}
      selectedPath="guides/intro"
      isStatic={props.isStatic ?? false}
      persistSidebar={props.persistSidebar ?? true}
    >
      <p>Body</p>
    </RouterShell>,
  );
}

function pressToggleShortcut() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", code: "Backslash", metaKey: true }));
  });
}

const shellState = () => document.querySelector(".ds-shell")?.getAttribute("data-sidebar");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("RouterShell", () => {
  it("renders the docs tree expanded, with one current page and its section active", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "expanded");
    shell();
    expect(shellState()).toBe("expanded");
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0]!.getAttribute("data-docs-tree-path")).toBe("guides/intro");
    expect(document.querySelector('[data-docs-tree-path="guides"]')!.getAttribute("data-active")).toBe("true");
    expect(document.querySelector("nav[aria-label='Docs sections']")).toBeNull();
  });

  it("collapses to a section rail with tooltips, landing links and the active section", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    shell();
    expect(shellState()).toBe("collapsed");
    const rows = [...document.querySelectorAll<HTMLAnchorElement>("nav[aria-label='Docs sections'] .ds-nav-item")];
    // The legacy markdown file is inert in the tree and left out of the rail.
    expect(rows.map((row) => row.getAttribute("title"))).toEqual(["guides", "reference"]);
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["#/guides", "#/reference/auth"]);
    expect(rows[0]!.getAttribute("data-active")).toBe("true");
    expect(rows[1]!.getAttribute("data-active")).toBeNull();
    expect(document.querySelector("nav[aria-label='Docs tree']")).toBeNull();
  });

  it("stores an explicit toggle on a live, unlocked serve", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "expanded");
    shell();
    fireEvent.click(document.querySelector(".ds-sidebar-toggle")!);
    expect(shellState()).toBe("collapsed");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");
    pressToggleShortcut();
    expect(shellState()).toBe("expanded");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("expanded");
  });

  it("persists nothing on a theme-locked serve, but still toggles", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "expanded");
    shell({ persistSidebar: false });
    fireEvent.click(document.querySelector(".ds-sidebar-toggle")!);
    pressToggleShortcut();
    pressToggleShortcut();
    expect(shellState()).toBe("collapsed");
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("expanded");
    expect(Object.keys(localStorage)).toEqual([SIDEBAR_STORAGE_KEY]);
  });

  it("neither reads nor writes the sidebar state on a static export", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    shell({ isStatic: true, persistSidebar: true });
    // The origin's stored choice is ignored: the viewport default applies.
    expect(shellState()).toBe(window.matchMedia("(max-width: 800px)").matches ? "collapsed" : "expanded");
    fireEvent.click(document.querySelector(".ds-sidebar-toggle")!);
    pressToggleShortcut();
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("collapsed");
    expect(Object.keys(localStorage)).toEqual([SIDEBAR_STORAGE_KEY]);
  });
});
