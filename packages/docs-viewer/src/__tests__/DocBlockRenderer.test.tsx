import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import sampleDoc from "@codecaine-ai/docs-model/fixtures/sample.doc.json";
import { DOC_BLOCK_FLAVOURS, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "../DocBlockRenderer";
import { DocsClientProvider, type CanvasEmbedProps } from "../client";

/**
 * Default-embed tests: in Spectre these rendered the REAL CanvasSidecarEmbed
 * with the global fetch stubbed; after extraction the default embed IS the
 * host-injected `CanvasEmbedComponent` slot (see ../client.tsx), so they
 * inject a recording fake through `DocsClientProvider` and assert the slot's
 * prop threading (src canonicalization, view/title pass-through,
 * onObjectSelect wiring). The HTTP behavior of the real embed stays covered
 * in Spectre alongside CanvasSidecarEmbed itself.
 */

const embedCalls: CanvasEmbedProps[] = [];

function FakeCanvasEmbed(props: CanvasEmbedProps) {
  embedCalls.push(props);
  return (
    <div data-testid="fake-canvas-embed" data-src={props.src} data-view={props.view}>
      <span>{props.title ?? "untitled canvas"}</span>
      <button
        type="button"
        data-canvas-object-id="user-brief"
        data-editable={props.onObjectSelect ? "true" : undefined}
        onClick={() => props.onObjectSelect?.("user-brief")}
      >
        user-brief
      </button>
    </div>
  );
}

afterEach(() => {
  embedCalls.length = 0;
  cleanup();
});

function loadFixture() {
  const result = validateDocDocument(sampleDoc);
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.document;
}

describe("DocBlockRenderer", () => {
  it("fixture is schema-valid and covers every v1 flavour", () => {
    const doc = loadFixture();
    const flavours = new Set(Object.values(doc.blocks).map((block) => block.flavour));
    for (const flavour of DOC_BLOCK_FLAVOURS) {
      expect(flavours.has(flavour)).toBe(true);
    }
  });

  it("mounts the full fixture without throwing and renders key content", () => {
    const doc = loadFixture();
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer document={doc} />
      </DocsClientProvider>,
    );

    // Headings + inline delta marks.
    expect(screen.getByText("Docs Model Sample")).toBeTruthy();
    expect(screen.getByText("Structure")).toBeTruthy();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("struck").tagName).toBe("DEL");
    expect(screen.getByText("inline code").tagName).toBe("CODE");
    const link = screen.getByText("link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://example.com");

    // Reference mention chip carries the SpectreRef data attributes.
    const chip = document.querySelector('[data-spectre-ref="true"]');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("data-ref-kind")).toBe("source");
    expect(chip?.getAttribute("data-ref-path")).toBe(
      "apps/frontend/src/lib/docs-model/doc-schema.ts",
    );
    expect(chip?.textContent).toBe("doc-schema.ts");

    // Nested list items.
    expect(screen.getByText("First item")).toBeTruthy();
    expect(screen.getByText("Nested item under the first")).toBeTruthy();

    // Code, quote, divider.
    expect(screen.getByText("export const answer = 42;")).toBeTruthy();
    expect(screen.getByText("Stable ids are a system invariant.")).toBeTruthy();
    expect(document.querySelector('hr[data-doc-block="divider"]')).toBeTruthy();

    // Adapted MDX flavours render through the existing docs-block components.
    expect(document.querySelector('[data-docs-block-type="decision"]')).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    expect(screen.getByText("Normalized block tree")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="callout"]')).toBeTruthy();
    expect(screen.getByText("Heads up")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="agent-contract"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="file-tree"]')).toBeTruthy();
    expect(screen.getByText("src/lib/docs-model/doc-ops.ts")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="constraint"]')).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="assumption"]')).toBeTruthy();

    // Semantic/engineering tracer cards.
    for (const label of ["Observation", "Outcome", "Requirement", "Implementation", "Testing"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    // Canvas embed goes through the injected slot with src + view.
    const canvas = screen.getByTestId("fake-canvas-embed");
    expect(canvas.getAttribute("data-src")).toBe("./assets/canvases/sample.canvas.json");
    expect(canvas.getAttribute("data-view")).toBe("container-architecture");
    const canvasWrapper = document.querySelector('[data-doc-block="canvas"]');
    expect(canvasWrapper?.getAttribute("data-canvas-view")).toBe("container-architecture");

    // Image + attachment.
    expect(document.querySelector('img[src="./assets/images/sample.png"]')).toBeTruthy();
    expect(screen.getByText("spec.pdf")).toBeTruthy();

    // Every non-root block landed in the DOM with its stable id.
    for (const blockId of Object.keys(doc.blocks)) {
      if (blockId === doc.root) continue;
      expect(document.querySelector(`[data-block-id="${blockId}"]`)).toBeTruthy();
    }
  });

  it("default canvas embed renders the injected slot component and threads src, view, and title", () => {
    const doc = loadFixture();
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer document={doc} projectId="proj-1" documentPath="docs/sample.md" />
      </DocsClientProvider>,
    );

    // Block title threads through to the injected embed.
    expect(screen.getByText("Architecture overview")).toBeTruthy();
    expect(embedCalls).toHaveLength(1);
    // Dot-relative src passes through unchanged when no bundlePath is set
    // (in Spectre this is what selects the legacy same-bundle route).
    expect(embedCalls[0].src).toBe("./assets/canvases/sample.canvas.json");
    expect(embedCalls[0].view).toBe("container-architecture");
    expect(embedCalls[0].projectId).toBe("proj-1");
    expect(embedCalls[0].documentPath).toBe("docs/sample.md");
  });

  it("renders the neutral fallback card when no canvas embed component is provided", () => {
    const doc = loadFixture();
    render(<DocBlockRenderer document={doc} projectId="proj-1" documentPath="docs/sample.md" />);

    const fallback = document.querySelector('[data-canvas-embed-unavailable="true"]');
    expect(fallback).toBeTruthy();
    expect(fallback?.textContent).toContain("Canvas embed unavailable");
    expect(fallback?.textContent).toContain("Architecture overview");
  });

  it("renders a minimal document without crashing", () => {
    const doc = loadFixture();
    const minimal = {
      ...doc,
      root: "root",
      blocks: {
        root: { id: "root", flavour: "paragraph" as const, props: {}, children: ["p-solo"] },
        "p-solo": {
          id: "p-solo",
          flavour: "paragraph" as const,
          props: {},
          text: [{ insert: "Alone" }],
          children: [],
        },
      },
    };
    render(<DocBlockRenderer document={minimal} />);
    expect(screen.getByText("Alone")).toBeTruthy();
  });

  it("threads onCanvasObjectSelect into the injected embed, bundling the block's src", () => {
    const doc = loadFixture();
    const selections: Array<{ canvasSrc: string; objectId: string }> = [];
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer
          document={doc}
          projectId="proj-1"
          documentPath="docs/sample.md"
          onCanvasObjectSelect={(input) => selections.push(input)}
        />
      </DocsClientProvider>,
    );

    fireEvent.click(document.querySelector('[data-canvas-object-id="user-brief"]')!);
    expect(selections).toEqual([
      { canvasSrc: "./assets/canvases/sample.canvas.json", objectId: "user-brief" },
    ]);
  });

  it("canonicalizes bundle-relative canvas srcs to root-relative when bundlePath is set", () => {
    const doc = loadFixture();
    const selections: Array<{ canvasSrc: string; objectId: string }> = [];
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer
          document={doc}
          projectId="proj-1"
          documentPath="docs/00-foundation/00-overview"
          bundlePath="00-foundation/00-overview"
          onCanvasObjectSelect={(input) => selections.push(input)}
        />
      </DocsClientProvider>,
    );

    // "./assets/canvases/sample.canvas.json" rewrote against the bundle path
    // (twin-retirement safe — in Spectre this is what selects the cross-doc
    // /docs/canvas-by-src route).
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0].src).toBe(
      "00-foundation/00-overview/assets/canvases/sample.canvas.json",
    );
    // Selection reports the canonical src too.
    fireEvent.click(document.querySelector('[data-canvas-object-id="user-brief"]')!);
    expect(selections).toEqual([
      {
        canvasSrc: "00-foundation/00-overview/assets/canvases/sample.canvas.json",
        objectId: "user-brief",
      },
    ]);
  });

  it("does not thread onObjectSelect into the embed when onCanvasObjectSelect is omitted", () => {
    const doc = loadFixture();
    render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer document={doc} projectId="proj-1" documentPath="docs/sample.md" />
      </DocsClientProvider>,
    );

    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0].onObjectSelect).toBeUndefined();
    // The fake mirrors CanvasStage's convention: objects are marked
    // data-editable only when an onObjectSelect handler is threaded down.
    expect(
      document
        .querySelector('[data-canvas-object-id="user-brief"]')
        ?.getAttribute("data-editable"),
    ).toBeNull();
  });

  it("has no editing affordances of its own (M4: editing lives entirely in DocEditor)", () => {
    const doc = loadFixture();
    render(<DocBlockRenderer document={doc} />);

    // No textarea/edit affordance exists anywhere — DocBlockRenderer is
    // read-only; DocEditor (editor/DocEditor.tsx) is what mounts instead of
    // it when the host enables block editing (see DocsViewer.tsx).
    expect(screen.queryByLabelText("Edit block markdown")).toBeNull();
    // Clicking a block is inert — no handler, nothing to throw.
    fireEvent.click(screen.getByText("Docs Model Sample"));
  });
});
