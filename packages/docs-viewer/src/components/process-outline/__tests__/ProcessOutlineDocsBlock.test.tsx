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

  it("injects one stylesheet whose geometry rides style-rail tokens with their defaults as fallbacks", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-style-a" steps={STEPS} />);
    render(<ProcessOutlineDocsBlock id="process-outline-style-b" steps={STEPS} />);

    const styles = document.querySelectorAll("#docs-process-outline-style");
    expect(styles).toHaveLength(1);
    const css = styles[0]?.textContent ?? "";

    // Every knob reads its token; the literal fallback IS the token's default
    // (theme-folders.ts / semantic.css), so the block renders the same where
    // semantic.css is absent.
    for (const declaration of [
      "--po-line: var(--docs-process-outline-line-height, 22px)",
      "--po-note-line: var(--docs-process-outline-note-line-height, 17px)",
      "--po-row-gap: var(--docs-process-outline-row-gap, 12px)",
      "--po-branch-gap: var(--docs-process-outline-branch-gap, 12px)",
      "--po-root-gap: var(--docs-process-outline-root-gap, 30px)",
      "--po-indent: var(--docs-process-outline-indent, 46px)",
      "--po-arrow-gap: var(--docs-process-outline-arrow-gap, 2px)",
      "--po-arrow: var(--docs-process-outline-arrow-size, 6px)",
      "--po-stroke: var(--docs-process-outline-stroke, 1.5px)",
      "--po-pad-y: var(--docs-process-outline-pad-y, 14px)",
      "--po-pad-x: var(--docs-process-outline-pad-x, 16px)",
      "--po-note-inset: var(--docs-process-outline-note-inset, 8px)",
      "--po-note-rule-gap: var(--docs-process-outline-note-rule-gap, 8px)",
    ]) {
      expect(css).toContain(declaration);
    }
    // Text sizes keep the approved floor (12px; 13px on the root line).
    expect(css).toContain("font-size:max(12px,var(--docs-process-outline-text-size, 12.5px))");
    expect(css).toContain("font-size:max(13px,var(--docs-process-outline-root-text-size, 13.5px))");
    expect(css).toContain("font-size:max(12px,var(--docs-process-outline-empty-text-size, 12px))");
    expect(css).toContain("font-size:max(12px,var(--docs-process-outline-note-text-size, 12px))");

    // The rail geometry is built from those vars — no hardcoded stroke, arrow
    // or gap survives, so each knob moves what it names.
    expect(css).toContain("margin-top:var(--po-root-gap)");
    expect(css).toContain("padding-left:var(--po-indent)");
    expect(css).toContain("left:calc(-1 * var(--po-indent))");
    expect(css).toContain("height:calc(var(--po-gap) + var(--po-line)/2)");
    expect(css.match(/var\(--po-stroke\) solid var\(--po-c\)/g)).toHaveLength(5);
    expect(css).not.toMatch(/1px solid var\(--po-c\)/);
    // The arrowhead scales about a fixed tip, centred on the first line;
    // arrow-gap is pure text offset on the step line.
    expect(css).toContain("width:var(--po-arrow); height:var(--po-arrow)");
    expect(css).toContain("top:calc(var(--po-line)/2 - var(--po-arrow)/2)");
    expect(css).toContain("left:calc(-1.2 * var(--po-arrow) - 2.8px)");
    expect(css).toContain("padding-left:var(--po-arrow-gap)");
    // Branch gap applies to the children of a root step only; every deeper
    // level re-declares the row gap so the wider gap never leaks down.
    expect(css).toContain(
      ".docs-process-outline__flow>.docs-process-outline__node>.docs-process-outline__children { --po-gap: var(--po-branch-gap); }",
    );
    expect(css).toMatch(/\.docs-process-outline__children \{\s+--po-gap: var\(--po-row-gap\);/);
    // The flow frame: rules and padding are tokens (bottom = pad-y + 1px).
    expect(css).toContain("padding:var(--po-pad-y) var(--po-pad-x) calc(var(--po-pad-y) + 1px)");
    expect(css).toContain(
      "border-block:var(--docs-process-outline-border-width, 1px) solid var(--docs-process-outline-border,color-mix(in srgb,var(--border) 72%,transparent))",
    );
    // The trunk never dangles toward a trailing note.
    expect(css).toContain(
      ":not(:has(~.docs-process-outline__node:not(.docs-process-outline__node--note)))::after { display:none; }",
    );
    // Narrow screens CAP the spacing knobs instead of replacing them.
    expect(css).toContain("--po-indent: min(22px, var(--docs-process-outline-indent, 46px))");
    expect(css).toContain("--po-row-gap: min(8px, var(--docs-process-outline-row-gap, 12px))");
  });

  it("colors each nesting level from its own depth token, with nothing pinned by !important", () => {
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-depth" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Depth 0 takes the rail token; depths 1..6 take the approved palette as
    // the fallback of their own cycle token, light and dark.
    expect(css).toContain("--po-c: var(--docs-process-outline-rail, color-mix(");
    const light = ["#527b9d", "#568365", "#876797", "#99723f", "#438285", "#94646f"];
    const dark = ["#8ab5d8", "#92bd9c", "#bca0cf", "#d1b180", "#83bdc0", "#d0a0ac"];
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(css).toContain(
        `.docs-process-outline [data-process-outline-depth="${level}"] { --po-c: var(--docs-process-outline-cycle-${level}, ${light[level - 1]}); }`,
      );
      expect(css).toContain(
        `.dark .docs-process-outline [data-process-outline-depth="${level}"] { --po-c: var(--docs-process-outline-cycle-${level}, ${dark[level - 1]}); }`,
      );
    }
    // The block never re-declares a token or pins a value with !important —
    // either would make a rail/theme override set on :root a dead knob. (The
    // only !important left is the reduced-motion reset.)
    expect(css).not.toMatch(/^\s*--docs-process-outline-[a-z0-9-]+\s*:/m);
    expect(css.replace(/@media\(prefers-reduced-motion:reduce\)[^\n]*/, "")).not.toContain("!important");
    expect(container.querySelector("style[data-variator-tokens]")).toBeNull();
    // Strength knobs travel as unitless percentages and mix at the USE SITE,
    // because a var() inside a custom property resolves at :root — where the
    // depth color does not exist.
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-chip-tint, 10) * 1%)");
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-chip-ink-mix, 64) * 1%)");
    expect(css).toContain("var(--docs-process-outline-code-bg,transparent)");
    // Loop keywords stay outside the depth colors on their own accent.
    expect(css).toContain("color:var(--docs-process-outline-keyword-fg,inherit)");
    expect(css).toContain("font-weight:var(--docs-process-outline-keyword-weight, 700)");
  });

  it("bolds only the top layer and reads every sublayer at one regular weight", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-weight" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Root steps carry the only bold weight in the block.
    expect(css).toContain("font-weight:var(--docs-process-outline-root-weight, 650)");
    // Every level under a root falls back to the SAME regular weight — there
    // is no ramp, so depth-one must not be heavier than depth-four.
    expect(css).toContain("font-weight:var(--docs-process-outline-branch-weight, 400)");
    expect(css).toContain("font-weight:var(--docs-process-outline-step-weight, 400)");
    // Depth >= 3 lines take the deep-ink token.
    expect(css).toContain("color:var(--docs-process-outline-deep-ink,");
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
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-trace-tint, 10) * 1%)");
    expect(css).toContain("var(--po-c) calc(var(--docs-process-outline-trace-ink-mix, 70) * 1%)");
    expect(css).toContain("var(--docs-process-outline-trace-bg,transparent)");
    expect(css).toContain("font-size:max(12px,var(--docs-process-outline-trace-text-size, 12px))");
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
    expect(
      css.match(/var\(--po-c\) calc\(var\(--docs-process-outline-select-tint, 15\) \* 1%\),var\(--docs-process-outline-select-bg,transparent\)/g),
    ).toHaveLength(2);
    expect(css).toContain("box-shadow:0 0 0 var(--docs-process-outline-select-pad, 2px)");
    // The highlight is attached to LINES; nothing here paints the block.
    expect(css).not.toMatch(/\.docs-process-outline \{[^}]*background/);
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

  it("renders notes as ruled bullets whose text, rule, dots and box are all tokens", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-note-box" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Text, rule and bullet dots are three independent colours (light and
    // dark fallbacks are the approved values).
    expect(css).toContain("--po-note-fg: var(--docs-process-outline-note-fg, #302f2c)");
    expect(css).toContain("--po-note-rule: var(--docs-process-outline-note-rule, #737373)");
    expect(css).toContain("--po-note-bullet: var(--docs-process-outline-note-bullet, #737373)");
    expect(css).toContain("--po-note-fg: var(--docs-process-outline-note-fg, #dedbd5)");
    expect(css).toContain("--po-note-rule: var(--docs-process-outline-note-rule, #bca0cf)");
    expect(css).toContain("--po-note-bullet: var(--docs-process-outline-note-bullet, #dedbd5)");
    expect(css).toContain("color:var(--po-note-fg)");
    // Note accent mixes the level's depth colour into rule and dots; 0 by
    // default, so both render as their flat colour.
    expect(css).toContain(
      "border-left:var(--docs-process-outline-note-rule-width, 1px) solid color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-rule))",
    );
    expect(css).toContain(
      "background:color-mix(in srgb,var(--po-c) calc(var(--docs-process-outline-note-accent, 0) * 1%),var(--po-note-bullet))",
    );
    // The card box is expressed in tokens that default to nothing, so the
    // same DOM serves the boxless and the bordered look.
    expect(css).toContain(
      "border:var(--docs-process-outline-note-border-width, 0px) solid var(--docs-process-outline-note-border,var(--border))",
    );
    expect(css).toContain("background:var(--docs-process-outline-note-bg,transparent)");
    expect(css).toContain(
      "padding:var(--docs-process-outline-note-pad-y, 1px) var(--docs-process-outline-note-pad-x, 0px) var(--docs-process-outline-note-pad-y, 1px) calc(var(--po-note-rule-gap) + var(--docs-process-outline-note-pad-x, 0px))",
    );
    expect(css).toContain("margin-left:var(--po-note-inset)");
    expect(css).toContain("--po-line:var(--po-note-line)");
    // Nothing caps the run's height — it grows with however many bullets it holds.
    expect(css).not.toMatch(/__note-card \{[^}]*(max-height|overflow)/);
  });

  it("marks the focused edit line with a token-width outline and no block-wide wash", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-focus" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // The only focus affordance the block owns is a hairline outline on the
    // focused line in that line's depth colour; the width is a knob (0 = just
    // the caret).
    expect(css).toContain('[data-process-outline-step-editing="true"]');
    expect(css).toMatch(
      /step-editing="true"\] \{[^}]*outline:var\(--docs-process-outline-focus-ring, 1px\) solid color-mix\(in srgb,var\(--po-c\) 45%,transparent\)/,
    );
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
