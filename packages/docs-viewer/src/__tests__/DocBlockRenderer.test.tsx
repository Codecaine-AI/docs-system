import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import sampleDoc from "@codecaine-ai/docs-model/fixtures/sample.doc.json";
import { DOC_BLOCK_TYPES, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "../render/DocBlockRenderer";
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
  it("fixture is schema-valid and covers its established v1 block types", () => {
    const doc = loadFixture();
    const blockTypes = new Set(Object.values(doc.blocks).map((block) => block.type));
    // The legacy fixture predates these types; dedicated tests cover each of them.
    const absentFromFixture = new Set<string>([
      "process-outline",
      "html",
      "image-grid",
      "stack",
      "call-stack",
      "component-tree",
      "flow-strip",
      "pseudocode",
      "file-explorer",
    ]);
    for (const blockType of DOC_BLOCK_TYPES.filter((type) => !absentFromFixture.has(type))) {
      expect(blockTypes.has(blockType)).toBe(true);
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
    // A source reference is a mono link on a hairline rule — inline text on
    // the baseline, told apart from a doc reference by its face, not color.
    expect(chip?.classList.contains("font-mono")).toBe(true);
    expect(chip?.classList.contains("border-b")).toBe(true);
    expect(chip?.classList.contains("inline-flex")).toBe(false);

    // Nested list items.
    expect(screen.getByText("First item")).toBeTruthy();
    expect(screen.getByText("Nested item under the first")).toBeTruthy();
    const bulletItems = document.querySelectorAll(
      '[role="listitem"][data-doc-bullet="true"]',
    );
    expect(bulletItems).toHaveLength(3);
    for (const item of bulletItems) {
      const marker = item.querySelector(':scope > [data-doc-list-marker="true"]');
      expect(marker).toBeTruthy();
      expect(marker?.textContent).toBe("");
    }

    // Code (the fixture's code block carries annotations, so it renders the
    // annotated variant with click-pairable side notes), divider.
    // Highlighted lines are hljs token spans, so match on the <code>
    // element's textContent rather than a single text node.
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "CODE" && element.textContent === "export const answer = 42;",
      ),
    ).toBeTruthy();
    expect(document.querySelector('[data-code-annotations="code-1"]')).toBeTruthy();
    expect(screen.getByText("The canonical answer constant.")).toBeTruthy();
    expect(screen.getByText("Helper that doubles the answer.")).toBeTruthy();
    expect(screen.getByText("Stable ids are a system invariant.")).toBeTruthy();
    expect(document.querySelector('hr[data-doc-block="divider"]')).toBeTruthy();

    // Adapted docs-block components: the callout keeps its semantic box and
    // content with its printed type label, and file-tree follows it.
    const callout = document.querySelector('[data-docs-block-type="callout"]');
    expect(callout).toBeTruthy();
    expect(callout?.getAttribute("data-mdx-block")).toBe("Callout");
    expect(callout?.getAttribute("data-source-id")).toBe("callout-1");
    expect(callout?.classList.contains("not-prose")).toBe(true);
    expect(callout?.classList.contains("my-[var(--docs-callout-margin,20px)]")).toBe(true);
    expect(callout?.textContent).toContain("Heads up");
    // The type is printed, never tooltip-only: the kind label, then the title.
    expect(callout?.querySelector("[data-callout-label]")?.textContent).toBe("Decision");
    const title = screen.getByText("Heads up");
    expect(title.getAttribute("data-callout-title")).toBe("true");
    // File-tree renders `tree`-style: rows carry the full entry path as a
    // data attribute while showing only the basename, with drawn elbow guides
    // (fixture-shape-tolerant: paths may evolve with the v2 fixture).
    const fileTree = document.querySelector('[data-docs-block-type="file-tree"]');
    expect(fileTree).toBeTruthy();
    expect(document.querySelectorAll("[data-docs-file-tree-entry]").length).toBeGreaterThan(0);
    expect(fileTree?.querySelector('[data-g="end"]')).toBeTruthy();

    // Props-driven structured blocks.
    expect(document.querySelector('[data-docs-block-type="structured-table"]')).toBeTruthy();
    expect(screen.getByText("Structured table sample")).toBeTruthy();
    expect(screen.getByText("question")).toBeTruthy();
    expect(document.querySelector('[data-docs-block-type="interaction-surface"]')).toBeTruthy();
    expect(
      document.querySelector('[data-interaction-operation="file-tree.addEntry"]'),
    ).toBeTruthy();
    expect(screen.getByText("Append a path entry to the tree")).toBeTruthy();

    // Canvas embed goes through the injected slot with src + view.
    const canvas = screen.getByTestId("fake-canvas-embed");
    expect(canvas.getAttribute("data-src")).toBe("./assets/canvases/sample.canvas.json");
    expect(canvas.getAttribute("data-view")).toBe("container-architecture");
    const canvasWrapper = document.querySelector('[data-doc-block="canvas"]');
    expect(canvasWrapper?.getAttribute("data-canvas-view")).toBe("container-architecture");

    // Image.
    expect(document.querySelector('img[src="./assets/images/sample.png"]')).toBeTruthy();

    // Video: the fixture's external YouTube url renders the link card (nothing
    // third-party loads until Watch swaps in the nocookie player).
    const videoCard = document.querySelector('[data-doc-block="video"] [data-video-link-card]');
    expect(videoCard).toBeTruthy();
    expect(videoCard?.getAttribute("data-video-provider")).toBe("youtube");
    fireEvent.click(videoCard as Element);
    const videoFrame = document.querySelector('[data-doc-block="video"] iframe');
    expect(videoFrame?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );

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
        root: { id: "root", type: "paragraph" as const, props: {}, children: ["p-solo"] },
        "p-solo": {
          id: "p-solo",
          type: "paragraph" as const,
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

  it("wraps each top-level block in its declared page lane, and leaves nested blocks unlaned", () => {
    const doc = loadFixture();
    const { container } = render(
      <DocsClientProvider canvasEmbed={FakeCanvasEmbed}>
        <DocBlockRenderer document={doc} />
      </DocsClientProvider>,
    );

    const docRoot = container.querySelector("[data-doc-root]");
    if (!docRoot) throw new Error("doc root not rendered");

    // Every direct child of the doc root is a lane element — that is what
    // makes the page left-anchored and full-width instead of one centered
    // column (render/block-layout.ts).
    const topLevel = [...docRoot.children];
    expect(topLevel.length).toBe(doc.blocks[doc.root]!.children.length);
    for (const lane of topLevel) {
      expect(lane.getAttribute("data-doc-lane")).toBeTruthy();
      expect(lane.className).toContain("w-full");
      // The lane also carries its block type — the pair
      // [data-doc-lane][data-doc-block-type=…] is the per-block-type override
      // hook a theme uses to retune one type's width/justification.
      expect(lane.getAttribute("data-doc-block-type")).toBeTruthy();
    }
    const stateShapeByType = docRoot.querySelector(
      ':scope > [data-doc-lane][data-doc-block-type="state-shape"]',
    );
    expect(stateShapeByType).toBeTruthy();

    // A text block takes the text measure on the left rail...
    const paragraphLane = docRoot.querySelector(':scope > [data-doc-lane="text-left"]');
    expect(paragraphLane).toBeTruthy();
    expect(paragraphLane?.className).toContain("max-w-[var(--style-content-width,60ch)]");
    expect(paragraphLane?.className).toContain("ml-0 mr-auto");

    // ...a state-shape takes the shared wide lane, still left-anchored...
    const stateShapeLane = [...topLevel].find((lane) =>
      lane.querySelector('[data-doc-block="state-shape"]'),
    );
    expect(stateShapeLane?.getAttribute("data-doc-lane")).toBe("wide-left");
    expect(stateShapeLane?.className).toContain("max-w-[var(--style-wide-width,1040px)]");

    // ...and media also stays on that left rail by default. Centering is an
    // explicit theme/rail blockLayout override.
    const canvasLane = [...topLevel].find((lane) =>
      lane.querySelector('[data-doc-block="canvas"]'),
    );
    expect(canvasLane?.getAttribute("data-doc-lane")).toBe("wide-left");
    expect(canvasLane?.className).toContain("ml-0 mr-auto");

    // Nested blocks inherit their ancestor's lane rather than claiming their
    // own — otherwise a paragraph inside a callout would escape the callout.
    const nestedLane = docRoot.querySelector("[data-doc-lane] [data-doc-lane]");
    expect(nestedLane).toBeNull();
  });

  it("marks every code panel as a code surface and leaves inline code chips unmarked", () => {
    // [data-code-surface] is the hook the host's "code panels" setting keys
    // on to render these dark on a light page; an unmarked panel would stay
    // light, and a marked inline chip would turn into a dark box mid-sentence.
    const doc = loadFixture();
    const plainCode = {
      ...doc,
      root: "root",
      blocks: {
        root: { id: "root", type: "paragraph" as const, props: {}, children: ["code-plain"] },
        "code-plain": {
          id: "code-plain",
          type: "code" as const,
          props: { language: "ts" },
          text: [{ insert: "const a = 1;" }],
          children: [],
        },
      },
    };
    render(<DocBlockRenderer document={plainCode} />);
    const frame = screen
      .getByText((_content, element) => element?.tagName === "CODE" && element.textContent === "const a = 1;")
      .closest("[data-code-surface]");
    expect(frame?.className).toContain("group/code");
    cleanup();

    const { container } = render(<DocBlockRenderer document={doc} />);
    const surfaceOf = (selector: string) =>
      container.querySelector(selector)?.closest("[data-code-surface]") ?? null;
    // Annotated code: the frame inside the annotations section.
    expect(surfaceOf('[data-code-annotations="code-1"] pre')).toBeTruthy();
    // State shape and interaction surface: only the code pane (the example
    // JSON / the signature lines) is a panel; the block, its header and its
    // field table stay on the page theme.
    expect(surfaceOf("[data-shape-example-pane] [data-code-line]")?.hasAttribute("data-code-lines")).toBe(true);
    expect(surfaceOf("[data-op-sig] [data-code-line]")?.hasAttribute("data-code-lines")).toBe(true);
    for (const type of ["state-shape", "interaction-surface"]) {
      const block = container.querySelector(`section[data-docs-block-type="${type}"]`);
      expect(block).toBeTruthy();
      expect(block?.closest("[data-code-surface]")).toBeNull();
    }
    expect(surfaceOf("[data-shape-header]")).toBeNull();
    expect(surfaceOf("[data-shape-example-head]")).toBeNull();
    expect(surfaceOf("[data-signature-head]")).toBeNull();
    // Inline code in prose is not a panel.
    expect(screen.getByText("inline code").closest("[data-code-surface]")).toBeNull();
  });
});
