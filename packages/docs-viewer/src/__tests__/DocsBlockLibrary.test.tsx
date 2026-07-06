import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DOC_BLOCK_FLAVOURS, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocsBlockLibrary from "../DocsBlockLibrary";
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
  it("renders a catalog entry for every doc.json flavour", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Block Library" })).toBeTruthy();

    for (const flavour of DOC_BLOCK_FLAVOURS) {
      // The catalog card for the flavour exists...
      const card = document.querySelector(`[data-library-flavour="${flavour}"]`);
      expect(card).toBeTruthy();
      // ...and its example rendered through the flavour registry's real
      // wrapper (DocBlockRenderer output), not bespoke preview markup.
      expect(card?.querySelector(`[data-doc-block="${flavour}"]`)).toBeTruthy();
    }
  });

  it("shows real rendered examples with delta marks and semantic chrome", () => {
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

    // Adapted docs-block components render their card chrome.
    expect(screen.getByText("Docs are doc.json bundles")).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("Review anchor")).toBeTruthy();
    expect(screen.getAllByText("Docs Revisor").length).toBeGreaterThan(0);
    expect(screen.getByText("packages/docs-viewer/src/DocBlockRenderer.tsx")).toBeTruthy();

    // Media atoms render without any asset backend (inline data: srcs).
    expect(document.querySelector('figure[data-doc-block="image"] img')).toBeTruthy();
    expect(screen.getByText("design-notes.txt")).toBeTruthy();
    expect(document.querySelector('hr[data-doc-block="divider"]')).toBeTruthy();
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
    expect(sources.length).toBe(DOC_BLOCK_FLAVOURS.length);
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
            flavour: "paragraph",
            props: {},
            children: ids.filter((id) => !nested.has(id)),
          },
          ...blocks,
        },
      });
      expect(result.ok).toBe(true);
    }
  });

  it("filters the catalog by flavour name", () => {
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocsBlockLibrary />
      </DocsClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("Filter flavours"), {
      target: { value: "decision" },
    });
    expect(document.querySelector('[data-library-flavour="decision"]')).toBeTruthy();
    expect(document.querySelector('[data-library-flavour="paragraph"]')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Filter flavours"), {
      target: { value: "no-such-flavour" },
    });
    expect(screen.getByText("No matching flavours.")).toBeTruthy();
  });
});
