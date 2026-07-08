import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DOC_BLOCK_TYPES, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocsBlockLibrary from "../render/DocsBlockLibrary";
import { DocsClientProvider, type CanvasEmbedProps } from "../client";

/**
 * The library's canvas example renders through the host-injected
 * `CanvasEmbedComponent` slot (in the workbench that's StandaloneCanvasEmbed
 * showing the synthetic fixture canvas); the viewer package has no canvas
 * dependency, so a recording fake stands in — the same pattern as
 * DocBlockRenderer.test.tsx.
 */
const embedCalls: CanvasEmbedProps[] = [];

function FakeCanvasEmbed(props: CanvasEmbedProps) {
  embedCalls.push(props);
  return <div data-testid="fake-canvas-embed">canvas embed: {props.canvasId}</div>;
}

afterEach(() => {
  embedCalls.length = 0;
  cleanup();
});

describe("DocsBlockLibrary", () => {
  it("renders a catalog entry for every doc.json block type", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Block Library" })).toBeTruthy();

    for (const blockType of DOC_BLOCK_TYPES) {
      // The catalog card for the block type exists...
      const card = document.querySelector(`[data-library-type="${blockType}"]`);
      expect(card).toBeTruthy();
      // ...and its example rendered through the block registry's real
      // wrapper (DocBlockRenderer output), not bespoke preview markup.
      expect(card?.querySelector(`[data-doc-block="${blockType}"]`)).toBeTruthy();
    }
  });

  it("renders a sidebar entry for every doc.json block type", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    const sidebar = document.querySelector("[data-library-sidebar]");
    expect(sidebar).toBeTruthy();
    for (const blockType of DOC_BLOCK_TYPES) {
      const navEntry = sidebar?.querySelector(`[data-library-nav="${blockType}"]`);
      expect(navEntry).toBeTruthy();
      // The compact row shows the descriptor label (type name dropped by design).
      expect(navEntry?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("marks a sidebar entry active on click", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    const navEntry = document.querySelector('[data-library-nav="interaction-surface"]');
    expect(navEntry).toBeTruthy();
    fireEvent.click(navEntry!);
    expect(navEntry?.getAttribute("aria-current")).toBe("true");
    // The card it targets exists as a same-page anchor.
    expect(document.getElementById("library-block-interaction-surface")).toBeTruthy();
  });

  it("shows real rendered examples with delta marks and component chrome", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    // Delta-span marks render as real inline elements.
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("inline code").tagName).toBe("CODE");
    const link = screen.getByText("linked");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://example.com");

    // Callout with a kind: the kind text replaces the tone in the label chip.
    expect(screen.getByText("One tool registry")).toBeTruthy();
    expect(screen.getByText("Decision")).toBeTruthy();

    // Code as an annotated JSON state object: the annotated variant renders
    // the JSON source with its click-pairable design-decision notes.
    expect(document.querySelector('[data-code-annotations="code-1"]')).toBeTruthy();
    expect(
      screen.getByText(
        '"from" keeps the old path, so a rename stays one entry instead of a remove plus an add.',
      ),
    ).toBeTruthy();
    // Highlighted code lines are hljs token spans — match on textContent.
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "CODE" &&
          element.textContent === '  "title": "Agent runtime layout",',
      ),
    ).toBeTruthy();

    // Structured blocks render from typed props.
    expect(screen.getByText("Agent roster")).toBeTruthy();
    expect(screen.getByText("Decomposes the request into tasks")).toBeTruthy();
    expect(
      document.querySelector('[data-interaction-operation="file-tree.addEntry"]'),
    ).toBeTruthy();
    expect(screen.getByText("Append a path entry to the tree")).toBeTruthy();
    expect(
      document.querySelector('[data-docs-file-tree-entry="src/runtime/registry.ts"]'),
    ).toBeTruthy();

    // Media atoms render without any asset backend (inline data: srcs; the
    // video example is an external provider url embedding an iframe).
    expect(document.querySelector('figure[data-doc-block="image"] img')).toBeTruthy();
    expect(document.querySelector('hr[data-doc-block="divider"]')).toBeTruthy();
    const videoFrame = document.querySelector('[data-doc-block="video"] iframe');
    expect(videoFrame).toBeTruthy();
    expect(videoFrame?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("routes the canvas example through the injected embed slot", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    expect(screen.getByText("canvas embed: synthetic")).toBeTruthy();
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0].canvasId).toBe("synthetic");
    expect(embedCalls[0].title).toBe("Synthetic fixture canvas");
  });

  it("falls back to the neutral canvas card without a provider", () => {
    render(<DocsBlockLibrary />);
    expect(document.querySelector('[data-canvas-embed-unavailable="true"]')).toBeTruthy();
  });

  it("exposes schema-valid doc.json source for every example", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    // Each card carries the example's blocks as pretty-printed doc.json;
    // reassembling them under a root must satisfy the doc schema — the
    // catalog can never drift from the vocabulary it showcases.
    const sources = Array.from(document.querySelectorAll("details pre"));
    expect(sources.length).toBe(DOC_BLOCK_TYPES.length);
    for (const source of sources) {
      const blocks = JSON.parse(source.textContent ?? "{}") as Record<
        string,
        { id: string; children: string[] }
      >;
      const ids = Object.keys(blocks);
      expect(ids.length).toBeGreaterThan(0);
      const nested = new Set(ids.flatMap((id) => blocks[id].children));
      const result = validateDocDocument({
        schemaVersion: 1,
        id: "library-roundtrip",
        root: "root",
        blocks: {
          root: {
            id: "root",
            type: "paragraph",
            props: {},
            children: ids.filter((id) => !nested.has(id)),
          },
          ...blocks,
        },
      });
      expect(result.ok).toBe(true);
    }
  });

  it("colorizes doc.json source panels without changing their textContent", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    const source = document.querySelector('[data-library-type="paragraph"] details pre');
    expect(source).toBeTruthy();
    // Pretty-printed nested JSON: multi-line with 2-space indentation.
    expect(source?.textContent).toContain('{\n  "paragraph-1": {\n    "id": "paragraph-1",');
    // ...and its textContent is still exactly parseable JSON.
    expect(Object.keys(JSON.parse(source?.textContent ?? ""))).toEqual(["paragraph-1"]);

    // Token tints: keys sky, strings emerald, punctuation muted...
    const key = source?.querySelector('[data-json-token="key"]');
    expect(key?.textContent).toBe('"paragraph-1"');
    expect(key?.className).toContain("text-sky-700");
    expect(key?.className).toContain("dark:text-sky-300");
    const stringToken = source?.querySelector('[data-json-token="string"]');
    expect(stringToken?.className).toContain("text-emerald-700");
    expect(stringToken?.className).toContain("dark:text-emerald-300");
    expect(source?.querySelector('[data-json-token="punct"]')?.className).toContain(
      "text-muted-foreground",
    );

    // ...numbers amber (heading props.level) and booleans violet
    // (interaction-surface params.required).
    const heading = document.querySelector('[data-library-type="heading"] details pre');
    const numberToken = heading?.querySelector('[data-json-token="number"]');
    expect(numberToken?.textContent).toBe("2");
    expect(numberToken?.className).toContain("text-amber-700");
    expect(numberToken?.className).toContain("dark:text-amber-300");
    const surface = document.querySelector(
      '[data-library-type="interaction-surface"] details pre',
    );
    const booleanToken = surface?.querySelector('[data-json-token="boolean"]');
    expect(booleanToken?.textContent).toBe("true");
    expect(booleanToken?.className).toContain("text-violet-700");
    expect(booleanToken?.className).toContain("dark:text-violet-300");
  });

  it("filters the catalog by block type name", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("Filter block types"), {
      target: { value: "mermaid" },
    });
    expect(document.querySelector('[data-library-type="mermaid"]')).toBeTruthy();
    expect(document.querySelector('[data-library-type="paragraph"]')).toBeNull();
    // The sidebar filters in lockstep with the example cards.
    expect(document.querySelector('[data-library-nav="mermaid"]')).toBeTruthy();
    expect(document.querySelector('[data-library-nav="paragraph"]')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Filter block types"), {
      target: { value: "no-such-block-type" },
    });
    expect(screen.getByText("No matching block types.")).toBeTruthy();
  });
});
