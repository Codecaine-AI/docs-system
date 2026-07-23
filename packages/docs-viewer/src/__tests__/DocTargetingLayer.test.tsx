import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocTargetingLayer from "../annotate/doc-targeting-layer";
import type { ResolvedDocsTarget } from "../annotate/docs-targeting";

afterEach(() => {
  cleanup();
  window.getSelection()?.removeAllRanges();
});

const bundleDoc: DocDocument = {
  schemaVersion: 1,
  id: "doc-1",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["para-1", "call-1"] },
    "para-1": {
      id: "para-1",
      type: "paragraph",
      props: {},
      text: [{ insert: "Hello targeting" }],
      children: [],
    },
    "call-1": {
      id: "call-1",
      type: "callout",
      props: { kind: "Decision", title: "Pick the layer" },
      text: [{ insert: "We extract it." }],
      children: [],
    },
  },
};

describe("DocTargetingLayer (source/MDX mode)", () => {
  it("pinpoint click opens the built-in toolbar and creates a delete annotation", () => {
    const created: unknown[] = [];
    render(
      <DocTargetingLayer
        mode="pinpoint"
        content={"A paragraph to target."}
        contentHash="hash-1"
        documentPath="docs/a.mdx"
        onCreateAnnotation={(input) => created.push(input)}
      >
        <p>A paragraph to target.</p>
      </DocTargetingLayer>,
    );

    fireEvent.click(screen.getByText("A paragraph to target."));

    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeTruthy();
    expect(screen.getByText("Paragraph")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Mark for deletion"));

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      intent: "delete",
      body: "Delete this selection.",
      resolution_target: "agent",
      anchor: {
        document_path: "docs/a.mdx",
        content_hash: "hash-1",
        text_quote: "A paragraph to target.",
        target_kind: "block",
        target: { kind: "block", block_type: "paragraph" },
      },
    });
    // Toolbar submit clears the ring.
    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeNull();
  });

  it("pinpoint click ignores a non-collapsed selection outside the targeting layer", () => {
    render(
      <>
        <p data-testid="outside-selection">Unrelated selection.</p>
        <DocTargetingLayer
          mode="pinpoint"
          content={"Target this paragraph."}
          contentHash="hash-outside-selection"
          documentPath="docs/outside-selection.mdx"
        >
          <p>Target this paragraph.</p>
        </DocTargetingLayer>
      </>,
    );

    const outside = screen.getByTestId("outside-selection");
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.isCollapsed).toBe(false);

    fireEvent.click(screen.getByText("Target this paragraph."));

    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeTruthy();
    expect(screen.getByText("Paragraph")).toBeTruthy();
  });

  it("hovering in pinpoint mode outlines the block and shows the label chip", () => {
    render(
      <DocTargetingLayer
        mode="pinpoint"
        content={"Hover me now."}
        contentHash="hash-2"
        documentPath="docs/b.mdx"
      >
        <p>Hover me now.</p>
      </DocTargetingLayer>,
    );

    const paragraph = screen.getByText("Hover me now.");
    fireEvent.mouseMove(paragraph);

    expect(paragraph.classList.contains("docs-target-hovered")).toBe(true);
    const chip = document.querySelector('[data-docs-target-overlay-label="hover"]');
    expect(chip?.textContent).toBe("paragraph: Hover me now.");

    fireEvent.mouseLeave(paragraph.parentElement!);
    expect(paragraph.classList.contains("docs-target-hovered")).toBe(false);
  });
});

describe("DocTargetingLayer (bundle mode)", () => {
  function renderBundle(props?: {
    onTargetSelect?: (target: ResolvedDocsTarget) => void;
    selectedTargetId?: string | null;
  }) {
    return render(
      <DocTargetingLayer
        mode="pinpoint"
        contentHash="doc-hash-1"
        documentPath="docs/10-guide"
        document={bundleDoc}
        {...props}
      >
        {/* Mirrors the block-registry wrapper attributes DocBlockRenderer emits. */}
        <div
          data-doc-block="paragraph"
          data-block-id="para-1"
          data-docs-target="true"
          data-docs-target-type="paragraph"
        >
          Hello targeting
        </div>
        <section
          data-doc-block="callout"
          data-block-id="call-1"
          data-docs-target="true"
          data-docs-target-type="callout"
        >
          Pick the layer We extract it.
        </section>
      </DocTargetingLayer>,
    );
  }

  it("hover chips use the block registry descriptor label and real block ids", () => {
    const selected: ResolvedDocsTarget[] = [];
    renderBundle({ onTargetSelect: (target) => selected.push(target) });

    const callout = document.querySelector('[data-block-id="call-1"]')!;
    fireEvent.mouseMove(callout);

    expect(callout.classList.contains("docs-target-hovered")).toBe(true);
    const chip = document.querySelector('[data-docs-target-overlay-label="hover"]');
    expect(chip?.textContent).toBe("Callout: Pick the layer We extract it.");

    fireEvent.click(callout);
    expect(selected).toHaveLength(1);
    expect(selected[0].label).toBe("Callout: Pick the layer We extract it.");
    expect(selected[0].anchor.block_id).toBe("call-1");
    expect(selected[0].anchor.target).toMatchObject({
      kind: "block",
      block_id: "call-1",
      block_type: "callout",
    });
  });

  it("controlled selectedTargetId drives the ring; null clears it; dangling ids render none", () => {
    const { rerender } = renderBundle({ selectedTargetId: "para-1" });
    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeTruthy();
    expect(
      document.querySelector('[data-docs-target-overlay-label="selected"]')?.textContent,
    ).toBe("Paragraph");

    rerender(
      <DocTargetingLayer
        mode="pinpoint"
        contentHash="doc-hash-1"
        documentPath="docs/10-guide"
        document={bundleDoc}
        selectedTargetId={null}
      >
        <div
          data-doc-block="paragraph"
          data-block-id="para-1"
          data-docs-target="true"
          data-docs-target-type="paragraph"
        >
          Hello targeting
        </div>
      </DocTargetingLayer>,
    );
    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeNull();

    rerender(
      <DocTargetingLayer
        mode="pinpoint"
        contentHash="doc-hash-1"
        documentPath="docs/10-guide"
        document={bundleDoc}
        selectedTargetId="gone-block"
      >
        <div
          data-doc-block="paragraph"
          data-block-id="para-1"
          data-docs-target="true"
          data-docs-target-type="paragraph"
        >
          Hello targeting
        </div>
      </DocTargetingLayer>,
    );
    // Dangling: no crash, no ring.
    expect(document.querySelector('[data-docs-target-overlay="selected"]')).toBeNull();
  });
});
