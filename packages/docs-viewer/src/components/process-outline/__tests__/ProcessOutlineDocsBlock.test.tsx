import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { parseProcessOutline } from "@codecaine-ai/docs-model";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors } from "../descriptor";
import { ProcessOutlineDocsBlock } from "../ProcessOutlineDocsBlock";

const NOTATION = `Run mode
  -> Get epoch-size candidates from the ranked worker system
       -> Exclude locked, cooled-down, or unschedulable work
  -> Drain the epoch with workers
       -> Spawn workers through the kernel until the epoch is drained
       > workers produce tentative evidence; the epoch boundary makes the map authoritative
  -> Finish the epoch
       -> Run the full build`;

/** Derived nodes for direct component renders; the descriptor path reads from blocks. */
const STEPS = parseProcessOutline(NOTATION);

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

afterEach(() => {
  cleanup();
});

describe("ProcessOutlineDocsBlock", () => {
  it("renders the step tree as nested step lines", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-1" steps={STEPS} />);

    const section = document.querySelector('[data-docs-block-type="process-outline"]');
    expect(section?.getAttribute("data-source-id")).toBe("process-outline-1");
    expect(document.querySelector('[data-process-outline-depth="0"]')?.textContent).toContain(
      "Run mode",
    );
    expect(document.querySelectorAll('[data-process-outline-node="true"]')).toHaveLength(7);
    expect(document.body.textContent).toContain(
      "Spawn workers through the kernel until the epoch is drained",
    );
  });

  it("renders a lone clarification note as a single-bullet card off the step line", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-note" steps={STEPS} />);

    const note = document.querySelector('[data-process-outline-note="true"]');
    expect(note?.textContent).toBe(
      "workers produce tentative evidence; the epoch boundary makes the map authoritative",
    );
    expect(note?.querySelector("div.docs-process-outline__note-card")).not.toBeNull();
    expect(note?.querySelectorAll('[data-process-outline-note-item="true"]')).toHaveLength(1);
    expect(note?.getAttribute("data-process-outline-node")).toBeNull();
    // No list elements anywhere — host document li styles must never leak in.
    expect(note?.querySelector("ul, ol, li")).toBeNull();
  });

  it("groups consecutive note siblings into one card with a bullet per note", () => {
    const steps = parseProcessOutline(`Refresh
  -> Keep the ranked queue current
       > workers produce tentative evidence
       > the epoch boundary makes the map authoritative again
       -> Save the boundary`);
    render(<ProcessOutlineDocsBlock id="process-outline-note-group" steps={steps} />);

    const notes = document.querySelectorAll('[data-process-outline-note="true"]');
    expect(notes).toHaveLength(1);
    const cards = notes[0].querySelectorAll("div.docs-process-outline__note-card");
    expect(cards).toHaveLength(1);
    const bullets = cards[0].querySelectorAll('div[data-process-outline-note-item="true"]');
    expect(Array.from(bullets).map((bullet) => bullet.textContent)).toEqual([
      "workers produce tentative evidence",
      "the epoch boundary makes the map authoritative again",
    ]);
    // The trailing step after the note run stays a rail node.
    expect(document.body.textContent).toContain("Save the boundary");
    expect(document.querySelectorAll('[data-process-outline-node="true"]')).toHaveLength(3);
  });

  it("renders code chips and loop keywords with the prototype emphasis rules", () => {
    render(
      <ProcessOutlineDocsBlock
        id="process-outline-emphasis"
        steps={parseProcessOutline("Repeat `worker` until the epoch is drained")}
      />,
    );

    expect(document.querySelector('[data-process-outline-code="true"]')?.textContent).toBe("worker");
    expect(
      Array.from(document.querySelectorAll("[data-process-outline-keyword]")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Repeat", "until"]);
  });

  it("injects the var-driven rail stylesheet once with an opaque rail fallback", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-style-a" steps={STEPS} />);
    render(<ProcessOutlineDocsBlock id="process-outline-style-b" steps={STEPS} />);

    const styles = document.querySelectorAll("#docs-process-outline-style");
    expect(styles).toHaveLength(1);
    const css = styles[0]?.textContent ?? "";

    // All rail geometry derives from the --po-* vars; every knob rides a
    // style-rail token with the prototype defaults as fallback.
    expect(css).toContain("--po-line: var(--docs-process-outline-line-height, 22px)");
    expect(css).toContain("--po-gap: var(--docs-process-outline-row-gap, 12px)");
    expect(css).toContain("--po-indent: var(--docs-process-outline-indent, 46px)");
    // Root and branch separation are tokens now, not hard-coded margins.
    expect(css).toContain("--po-root-gap: var(--docs-process-outline-root-gap, 30px)");
    expect(css).toContain("--po-branch-gap: var(--docs-process-outline-branch-gap, 20px)");
    expect(css).toContain("margin-top: var(--po-root-gap)");
    expect(css).toContain("font-size: var(--docs-process-outline-root-text-size, 13.5px)");
    expect(css).toContain("font-size: var(--docs-process-outline-empty-text-size, 12px)");
    expect(css).toContain("--po-arrow-gap: var(--docs-process-outline-arrow-gap, 4px)");
    expect(css).toContain("--po-stroke: var(--docs-process-outline-stroke, 1.5px)");
    expect(css).toContain("--po-arrow: var(--docs-process-outline-arrow-size, 6px)");
    expect(css).toContain("font-size: var(--docs-process-outline-text-size, 12.5px)");
    // Children indent by the full per-level indent; the elbow hangs off it.
    expect(css).toContain("padding-left: var(--po-indent)");
    expect(css).toContain("left: calc(-1 * var(--po-indent))");
    // Elbow lands on the first-line center; trunk overlaps into both gaps.
    expect(css).toContain("height: calc(var(--po-gap) + 2px + var(--po-line) / 2)");
    expect(css).toContain("bottom: calc(-1 * var(--po-gap) - 2px)");
    // The shaft fills the indent and runs through the arrowhead's open
    // middle to just shy of its tip — one drawn arrow, never detached.
    expect(css).toContain("width: calc(var(--po-indent) - 2px)");
    // Arrowhead centers on the first line, anchored to the text column edge;
    // arrow-gap is pure text offset (padding on the step line), so the knob
    // spaces tip-to-text without moving or resizing the drawn arrow.
    expect(css).toContain("top: calc(var(--po-line) / 2 - var(--po-arrow) / 2 - 0.75px)");
    expect(css).toContain("left: calc(-1.2 * var(--po-arrow) - 1px)");
    expect(css).toContain("padding-left: var(--po-arrow-gap)");
    // The trunk never dangles toward a trailing note.
    expect(css).toContain(
      ":not(\n      :has(~ .docs-process-outline__node:not(.docs-process-outline__node--note))\n    )::after",
    );
    // Note-card ink still tracks the step ink; size and rhythm are the note's
    // own tokens, and the card carries a muted fill.
    expect(css).toContain(
      "color: var(--docs-process-outline-note-fg, var(--docs-process-outline-ink, var(--foreground)))",
    );
    expect(css).toContain("font-size: var(--docs-process-outline-note-text-size, inherit)");
    expect(css).toContain("background: var(--docs-process-outline-note-bg, transparent)");
    expect(css).toContain("--po-line: var(--po-note-line)");
    expect(css).toContain("margin-left: var(--docs-process-outline-note-inset, 10px)");
    // Rail fallback is opaque — alpha stacking at elbow/trunk overlaps reads broken.
    expect(css).toContain("var(--docs-process-outline-rail, #909498)");
    expect(css).not.toContain("--docs-process-outline-rail, color-mix");
  });

  it("colors every stroke, chip and note rule from one cascading depth var", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-depth" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // One var per nesting level, five hues, then it repeats — no per-node
    // classes, so the renderer never has to know a node's depth.
    for (const level of [1, 2, 3, 4, 5]) {
      expect(css).toContain(
        `--po-c: var(--docs-process-outline-cycle-${level}, var(--docs-process-outline-rail, #909498))`,
      );
    }
    expect(css).not.toContain("docs-process-outline__node--cycle");
    // Elbow, trunk and arrowhead all resolve from the level's color.
    expect(css.match(/solid var\(--po-c\)/g)).toHaveLength(5);
    // Strength knobs travel as unitless percentages and mix at the USE SITE,
    // because a var() inside a custom property resolves at :root — where the
    // depth color does not exist.
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-chip-tint, 13) * 1%)");
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-chip-ink-mix, 60) * 1%)");
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-note-accent, 55) * 1%)");
    // Loop keywords stay outside the cycle on their own accent.
    expect(css).toContain("color: var(--docs-process-outline-keyword-fg, inherit)");
  });

  it("bolds only the top layer and reads every sublayer at one regular weight", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-weight" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Root steps carry the only bold weight in the block.
    expect(css).toContain("font-weight: var(--docs-process-outline-root-weight, 650)");
    // Every level under a root falls back to the SAME regular weight — there
    // is no ramp, so depth-one must not be heavier than depth-four.
    expect(css).toContain("font-weight: var(--docs-process-outline-branch-weight, 400)");
    expect(css).toContain("font-weight: var(--docs-process-outline-step-weight, 400)");
    // The old ramp is gone: no hardcoded sublayer weight survives.
    expect(css).not.toContain("font-weight: 600");
    // Loop keywords keep their inline emphasis — that is not hierarchy.
    expect(css).toContain(".docs-process-outline__keyword");
    expect(css).toMatch(/__keyword \{[^}]*font-weight: 650/);
  });

  // The mark used to be a thickened arrowhead plus a dot in the gutter; it is
  // a mini pill reading "trace" at the end of the step's text now, because two
  // silent glyphs did not say what they meant.
  it("ends a trace-marked step's line with a `trace` pill and leaves the rest bare", () => {
    const steps = parseProcessOutline("Run\n  => Drain\n  -> Sweep");
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-trace" steps={steps} />);

    const marked = container.querySelectorAll("[data-process-outline-trace='true']");
    expect(marked).toHaveLength(1);
    const line = marked[0].querySelector(".docs-process-outline__line");
    // The pill is the LAST thing on the line, after the step's own text.
    expect(line?.textContent).toBe("Draintrace");
    expect(line?.lastElementChild?.getAttribute("data-process-outline-trace-pill")).toBe("true");
    expect(line?.lastElementChild?.textContent).toBe("trace");
    // Unmarked siblings carry no pill at all.
    expect(container.querySelectorAll("[data-process-outline-trace-pill]")).toHaveLength(1);
    // The mark is an attribute on the node, never a character in the text.
    expect(container.textContent).not.toContain("=>");

    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";
    // Kin to the backtick chips: the SAME tint/mix formula on the line's own
    // depth colour, so the pill introduces no hue of its own.
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-trace-tint, 16) * 1%)");
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-trace-ink-mix, 70) * 1%)");
    expect(css).toContain("var(--docs-process-outline-trace-bg, transparent)");
    expect(css).toContain("font-size: var(--docs-process-outline-trace-text-size, 9.5px)");
    // The old dot and arrowhead-thickening treatment is gone entirely.
    expect(css).not.toContain("--po-trace-dot");
    expect(css).not.toContain("--po-trace-stroke");
    expect(css).not.toContain("border-top-width");
  });

  it("tints a selected line in its own depth colour, per line, never as a block wash", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-select" steps={parseProcessOutline("Root")} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Same tint formula family as the chips and the trace pill, on --po-c, so
    // a run of selected steps reads as part of the rail it is drawn on.
    expect(css).toContain('.docs-process-outline [data-process-outline-step-selected="true"]');
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-select-tint, 22) * 1%)");
    expect(css).toContain("var(--docs-process-outline-select-bg, transparent)");
    expect(css).toContain("box-shadow: 0 0 0 var(--docs-process-outline-select-pad, 2px)");
    // The highlight is attached to LINES; nothing here paints the block.
    expect(css).not.toContain(".docs-process-outline {\n    background");
  });

  it("marks a trace root too, where there is no arrowhead at all", () => {
    const steps = parseProcessOutline("=> Run\n  -> Drain");
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-trace-root" steps={steps} />);
    const root = container.querySelector("[data-process-outline-depth='0']");
    expect(root?.getAttribute("data-process-outline-trace")).toBe("true");
    expect(root?.querySelector(".docs-process-outline__line")?.textContent).toBe("Runtrace");
    expect(
      root?.querySelector(".docs-process-outline__line > [data-process-outline-trace-pill]"),
    ).toBeTruthy();
  });

  it("renders notes as bare bullets, with the box expressed in zeroed tokens", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-note-box" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Boxless by default: border, left rule, padding and fill all resolve to
    // nothing unless a theme sets them, so the same DOM serves both looks.
    expect(css).toContain("var(--docs-process-outline-note-border-width, 0px) solid");
    expect(css).toContain("border-left: var(--docs-process-outline-note-rule-width, 0px) solid");
    expect(css).toContain("padding: var(--docs-process-outline-note-pad-y, 0px)");
    expect(css).toContain("var(--docs-process-outline-note-pad-x, 0px)");
    expect(css).toContain("background: var(--docs-process-outline-note-bg, transparent)");
    // No hard-coded card padding survives.
    expect(css).not.toContain("padding: 7px 12px 8px");
    // Nothing caps the run's height — it grows with however many bullets it holds.
    expect(css).not.toMatch(/__note-card \{[^}]*(max-height|overflow)/);
  });

  it("leaves the focused edit line without a block-wide wash", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-focus" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // The only focus affordance the block owns is an OPT-IN hairline ring on
    // the focused line; it is off by default, leaving just the caret.
    expect(css).toContain("--po-focus-ring: var(--docs-process-outline-focus-ring, 0px)");
    expect(css).toContain('[data-process-outline-step-editing="true"]');
    expect(css).toMatch(/step-editing="true"\] \{[^}]*box-shadow: 0 0 0 var\(--po-focus-ring\)/);
    // No edit-mode background anywhere in the block's own stylesheet.
    expect(css).not.toMatch(/step-editing="true"\] \{[^}]*background/);
  });

  it("replaces a stale injected stylesheet in place (HMR-safe)", () => {
    // Simulate Vite HMR: an old module load left the tag behind with frozen CSS.
    document.getElementById("docs-process-outline-style")?.remove();
    const stale = document.createElement("style");
    stale.id = "docs-process-outline-style";
    stale.textContent = "/* stale css from a previous module load */";
    document.head.appendChild(stale);

    render(<ProcessOutlineDocsBlock id="process-outline-hmr" steps={STEPS} />);

    const styles = document.querySelectorAll("#docs-process-outline-style");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).not.toContain("stale css");
    expect(styles[0]?.textContent).toContain(".docs-process-outline");
  });

  it("renders a quiet placeholder when there are no steps", () => {
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-empty" steps={[]} />);

    expect(container.querySelector('[data-process-outline-empty="true"]')?.textContent).toBe(
      "empty process outline — no steps yet",
    );
    expect(container.querySelector('[data-process-outline-flow="true"]')).toBeNull();
  });
});

describe("process-outline descriptor", () => {
  it("renders a structured-steps block through the descriptor path", () => {
    const block: DocBlock = {
      id: "process-outline-steps",
      type: "process-outline",
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

    const wrapper = document.querySelector('[data-block-id="process-outline-steps"]');
    expect(wrapper?.getAttribute("data-doc-block")).toBe("process-outline");
    expect(wrapper?.getAttribute("data-docs-target-type")).toBe("process-outline");
    expect(wrapper?.querySelectorAll('[data-process-outline-node="true"]')).toHaveLength(3);
    // Both notes collapse into one bulleted card.
    expect(wrapper?.querySelectorAll('[data-process-outline-note="true"]')).toHaveLength(1);
    expect(wrapper?.querySelectorAll('[data-process-outline-note-item="true"]')).toHaveLength(2);
  });

  it("renders an empty-steps block through the descriptor path as the placeholder", () => {
    const block: DocBlock = {
      id: "process-outline-empty",
      type: "process-outline",
      props: { steps: [] },
      children: [],
    };

    render(<>{descriptors[0].render(block, RENDER_CTX)}</>);

    const wrapper = document.querySelector('[data-block-id="process-outline-empty"]');
    expect(wrapper?.getAttribute("data-doc-block")).toBe("process-outline");
    expect(wrapper?.querySelector('[data-process-outline-empty="true"]')?.textContent).toBe(
      "empty process outline — no steps yet",
    );
    expect(wrapper?.querySelector('[data-process-outline-flow="true"]')).toBeNull();
  });
});
