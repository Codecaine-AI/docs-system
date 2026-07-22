import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { parseWaterfall } from "@codecaine-ai/docs-model";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors } from "../descriptor";
import { WaterfallDocsBlock } from "../WaterfallDocsBlock";

const NOTATION = `Run mode
  -> Get epoch-size candidates from the ranked worker system
       -> Exclude locked, cooled-down, or unschedulable work
  -> Drain the epoch with workers
       -> Spawn workers through the kernel until the epoch is drained
       > workers produce tentative evidence; the epoch boundary makes the map authoritative
  -> Finish the epoch
       -> Run the full build`;

/** Derived nodes for direct component renders; the descriptor path reads from blocks. */
const STEPS = parseWaterfall(NOTATION);

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

afterEach(() => {
  cleanup();
});

describe("WaterfallDocsBlock", () => {
  it("renders the step tree as nested step lines", () => {
    render(<WaterfallDocsBlock id="waterfall-1" steps={STEPS} />);

    const section = document.querySelector('[data-docs-block-type="waterfall"]');
    expect(section?.getAttribute("data-source-id")).toBe("waterfall-1");
    expect(document.querySelector('[data-waterfall-depth="0"]')?.textContent).toContain(
      "Run mode",
    );
    expect(document.querySelectorAll('[data-waterfall-node="true"]')).toHaveLength(7);
    expect(document.body.textContent).toContain(
      "Spawn workers through the kernel until the epoch is drained",
    );
  });

  it("renders a lone clarification note as a single-bullet card off the step line", () => {
    render(<WaterfallDocsBlock id="waterfall-note" steps={STEPS} />);

    const note = document.querySelector('[data-waterfall-note="true"]');
    expect(note?.textContent).toBe(
      "workers produce tentative evidence; the epoch boundary makes the map authoritative",
    );
    expect(note?.querySelector("div.docs-waterfall__note-card")).not.toBeNull();
    expect(note?.querySelectorAll('[data-waterfall-note-item="true"]')).toHaveLength(1);
    expect(note?.getAttribute("data-waterfall-node")).toBeNull();
    // No list elements anywhere — host document li styles must never leak in.
    expect(note?.querySelector("ul, ol, li")).toBeNull();
  });

  it("groups consecutive note siblings into one card with a bullet per note", () => {
    const steps = parseWaterfall(`Refresh
  -> Keep the ranked queue current
       > workers produce tentative evidence
       > the epoch boundary makes the map authoritative again
       -> Save the boundary`);
    render(<WaterfallDocsBlock id="waterfall-note-group" steps={steps} />);

    const notes = document.querySelectorAll('[data-waterfall-note="true"]');
    expect(notes).toHaveLength(1);
    const cards = notes[0].querySelectorAll("div.docs-waterfall__note-card");
    expect(cards).toHaveLength(1);
    const bullets = cards[0].querySelectorAll('div[data-waterfall-note-item="true"]');
    expect(Array.from(bullets).map((bullet) => bullet.textContent)).toEqual([
      "workers produce tentative evidence",
      "the epoch boundary makes the map authoritative again",
    ]);
    // The trailing step after the note run stays a rail node.
    expect(document.body.textContent).toContain("Save the boundary");
    expect(document.querySelectorAll('[data-waterfall-node="true"]')).toHaveLength(3);
  });

  it("renders code chips and loop keywords with the prototype emphasis rules", () => {
    render(
      <WaterfallDocsBlock
        id="waterfall-emphasis"
        steps={parseWaterfall("Repeat `worker` until the epoch is drained")}
      />,
    );

    expect(document.querySelector('[data-waterfall-code="true"]')?.textContent).toBe("worker");
    expect(
      Array.from(document.querySelectorAll("[data-waterfall-keyword]")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Repeat", "until"]);
  });

  it("injects the var-driven rail stylesheet once with an opaque rail fallback", () => {
    render(<WaterfallDocsBlock id="waterfall-style-a" steps={STEPS} />);
    render(<WaterfallDocsBlock id="waterfall-style-b" steps={STEPS} />);

    const styles = document.querySelectorAll("#docs-waterfall-style");
    expect(styles).toHaveLength(1);
    const css = styles[0]?.textContent ?? "";

    // All rail geometry derives from the --wf-* vars; every knob rides a
    // style-rail token with the prototype defaults as fallback.
    expect(css).toContain("--wf-line: var(--docs-waterfall-line-height, 22px)");
    expect(css).toContain("--wf-gap: var(--docs-waterfall-row-gap, 7px)");
    expect(css).toContain("--wf-indent: var(--docs-waterfall-indent, 36px)");
    expect(css).toContain("--wf-arrow-gap: var(--docs-waterfall-arrow-gap, 4px)");
    expect(css).toContain("--wf-stroke: var(--docs-waterfall-stroke, 1.5px)");
    expect(css).toContain("--wf-arrow: var(--docs-waterfall-arrow-size, 6px)");
    expect(css).toContain("font-size: var(--docs-waterfall-text-size, 12.5px)");
    // Children indent by the full per-level indent; the elbow hangs off it.
    expect(css).toContain("padding-left: var(--wf-indent)");
    expect(css).toContain("left: calc(-1 * var(--wf-indent))");
    // Elbow lands on the first-line center; trunk overlaps into both gaps.
    expect(css).toContain("height: calc(var(--wf-gap) + 2px + var(--wf-line) / 2)");
    expect(css).toContain("bottom: calc(-1 * var(--wf-gap) - 2px)");
    // The shaft fills the indent and runs through the arrowhead's open
    // middle to just shy of its tip — one drawn arrow, never detached.
    expect(css).toContain("width: calc(var(--wf-indent) - 2px)");
    // Arrowhead centers on the first line, anchored to the text column edge;
    // arrow-gap is pure text offset (padding on the step line), so the knob
    // spaces tip-to-text without moving or resizing the drawn arrow.
    expect(css).toContain("top: calc(var(--wf-line) / 2 - var(--wf-arrow) / 2 - 0.75px)");
    expect(css).toContain("left: calc(-1.2 * var(--wf-arrow) - 1px)");
    expect(css).toContain("padding-left: var(--wf-arrow-gap)");
    // The trunk never dangles toward a trailing note.
    expect(css).toContain(
      ":not(\n      :has(~ .docs-waterfall__node:not(.docs-waterfall__node--note))\n    )::after",
    );
    // Note-card typography inherits the step text by default: same ink, same
    // size, same line rhythm; the note tokens are pure overrides.
    expect(css).toContain(
      "color: var(--docs-waterfall-note-fg, var(--docs-waterfall-ink, var(--foreground)))",
    );
    expect(css).toContain("font-size: var(--docs-waterfall-note-text-size, inherit)");
    // Border-only card: no background at defaults.
    expect(css).toContain("background: var(--docs-waterfall-note-bg, transparent)");
    // Rail fallback is opaque — alpha stacking at elbow/trunk overlaps reads broken.
    expect(css).toContain("var(--docs-waterfall-rail, #909498)");
    expect(css).not.toContain("--docs-waterfall-rail, color-mix");
  });

  it("replaces a stale injected stylesheet in place (HMR-safe)", () => {
    // Simulate Vite HMR: an old module load left the tag behind with frozen CSS.
    document.getElementById("docs-waterfall-style")?.remove();
    const stale = document.createElement("style");
    stale.id = "docs-waterfall-style";
    stale.textContent = "/* stale css from a previous module load */";
    document.head.appendChild(stale);

    render(<WaterfallDocsBlock id="waterfall-hmr" steps={STEPS} />);

    const styles = document.querySelectorAll("#docs-waterfall-style");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).not.toContain("stale css");
    expect(styles[0]?.textContent).toContain(".docs-waterfall");
  });

  it("renders a quiet placeholder when there are no steps", () => {
    const { container } = render(<WaterfallDocsBlock id="waterfall-empty" steps={[]} />);

    expect(container.querySelector('[data-waterfall-empty="true"]')?.textContent).toBe(
      "empty waterfall — no steps yet",
    );
    expect(container.querySelector('[data-waterfall-flow="true"]')).toBeNull();
  });
});

describe("waterfall descriptor", () => {
  it("renders a structured-steps block through the descriptor path", () => {
    const block: DocBlock = {
      id: "wf-steps",
      type: "waterfall",
      props: {
        steps: [
          {
            text: "Run mode",
            steps: [
              {
                text: "Drain the epoch with workers",
                steps: [
                  { text: "Spawn workers through the kernel" },
                  { text: "workers produce tentative evidence", kind: "note" },
                  { text: "the epoch boundary makes the map authoritative", kind: "note" },
                ],
              },
            ],
          },
        ],
      },
      children: [],
    };

    render(<>{descriptors[0].render(block, RENDER_CTX)}</>);

    const wrapper = document.querySelector('[data-block-id="wf-steps"]');
    expect(wrapper?.getAttribute("data-doc-block")).toBe("waterfall");
    expect(wrapper?.getAttribute("data-docs-target-type")).toBe("waterfall");
    expect(wrapper?.querySelectorAll('[data-waterfall-node="true"]')).toHaveLength(3);
    // Both notes collapse into one bulleted card.
    expect(wrapper?.querySelectorAll('[data-waterfall-note="true"]')).toHaveLength(1);
    expect(wrapper?.querySelectorAll('[data-waterfall-note-item="true"]')).toHaveLength(2);
  });

  it("renders an empty-steps block through the descriptor path as the placeholder", () => {
    const block: DocBlock = {
      id: "wf-empty",
      type: "waterfall",
      props: { steps: [] },
      children: [],
    };

    render(<>{descriptors[0].render(block, RENDER_CTX)}</>);

    const wrapper = document.querySelector('[data-block-id="wf-empty"]');
    expect(wrapper?.getAttribute("data-doc-block")).toBe("waterfall");
    expect(wrapper?.querySelector('[data-waterfall-empty="true"]')?.textContent).toBe(
      "empty waterfall — no steps yet",
    );
    expect(wrapper?.querySelector('[data-waterfall-flow="true"]')).toBeNull();
  });
});
