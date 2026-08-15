import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";

import { OutlineList } from "../outline/OutlineList";
import { deriveDocOutline } from "../outline/outline-model";

afterEach(cleanup);

function fixtureDoc(): DocDocument {
  return {
    schemaVersion: 1,
    id: "outline-fixture",
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["intro", "h1", "h3"] },
      intro: { id: "intro", type: "paragraph", props: {}, children: [] },
      h1: {
        id: "h1",
        type: "heading",
        props: { level: 1 },
        text: [{ insert: "Getting " }, { insert: "started" }],
        children: ["h2", "empty"],
      },
      h2: {
        id: "h2",
        type: "heading",
        props: { level: 2 },
        text: [{ insert: "Install" }],
        children: [],
      },
      empty: {
        id: "empty",
        type: "heading",
        props: { level: 2 },
        text: [{ insert: "  " }],
        children: [],
      },
      h3: {
        id: "h3",
        type: "heading",
        props: { level: 3 },
        text: [{ insert: "Advanced" }],
        children: [],
      },
    },
  };
}

describe("deriveDocOutline", () => {
  it("returns H1/H2 headings in document order with delta text labels", () => {
    expect(deriveDocOutline(fixtureDoc())).toEqual([
      { blockId: "h1", label: "Getting started", depth: 1 },
      { blockId: "h2", label: "Install", depth: 2 },
      { blockId: "empty", label: "Untitled section", depth: 2 },
    ]);
  });

  it("filters headings above the requested maximum level", () => {
    expect(deriveDocOutline(fixtureDoc(), { maxLevel: 3 }).map((section) => section.blockId)).toEqual([
      "h1",
      "h2",
      "empty",
      "h3",
    ]);
  });
});

describe("OutlineList", () => {
  it("marks the active section and scrolls when a section is clicked", () => {
    const scrollToSection = mock(() => {});
    render(
      <OutlineList
        sections={[
          { blockId: "h1", label: "Getting started", depth: 1 },
          { blockId: "h2", label: "Install", depth: 2 },
        ]}
        activeBlockId="h1"
        scrollToSection={scrollToSection}
      />,
    );

    const active = screen.getByRole("button", { name: "Getting started" });
    expect(screen.getByRole("navigation", { name: "Document outline" })).toBeTruthy();
    expect(active.getAttribute("aria-current")).toBe("location");
    expect(active.getAttribute("data-block-id")).toBe("h1");

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(scrollToSection).toHaveBeenCalledWith("h2");
  });
});
