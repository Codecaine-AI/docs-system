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

  it("renders typed code chips and loop keywords", () => {
    render(
      <ProcessOutlineDocsBlock
        id="process-outline-emphasis"
        steps={parseProcessOutline("Repeat `Worker` until `docs/run.ts` is drained")}
      />,
    );

    // Each chip says what its code is, so the stylesheet can color it by role.
    expect(
      Array.from(document.querySelectorAll('[data-process-outline-code="true"]')).map((chip) => [
        chip.textContent,
        chip.getAttribute("data-chip-kind"),
      ]),
    ).toEqual([
      ["Worker", "type"],
      ["docs/run.ts", "path"],
    ]);
    expect(
      Array.from(document.querySelectorAll("[data-process-outline-keyword]")).map(
        (node) => node.textContent,
      ),
    ).toEqual(["Repeat", "until"]);
  });

  it("draws each root step as a panel whose head names it", () => {
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-panel" steps={STEPS} />);

    const root = container.querySelector<HTMLElement>('[data-process-outline-depth="0"]')!;
    expect(root.classList.contains("docs-process-outline__node--root")).toBe(true);
    // The head carries a decorative family tile, then the root text as the title.
    const head = root.querySelector(":scope > .docs-process-outline__head")!;
    expect(head.querySelector(".docs-process-outline__tile")?.getAttribute("aria-hidden")).toBe("true");
    expect(head.querySelector(".docs-process-outline__line")?.textContent).toBe("Run mode");
    // The phases sit in the panel body, after the head.
    const body = root.querySelector(":scope > .docs-process-outline__children")!;
    expect(head.nextElementSibling).toBe(body);
    expect(body.querySelectorAll(':scope > [data-process-outline-depth="1"]')).toHaveLength(3);
  });

  it("injects one shared stylesheet however many outlines render", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-style-a" steps={STEPS} />);
    render(<ProcessOutlineDocsBlock id="process-outline-style-b" steps={STEPS} />);

    expect(document.querySelectorAll("#docs-process-outline-style")).toHaveLength(1);
  });

  it("keeps rails neutral, puts the depth hue on the arrowhead only, and pins nothing", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-depth" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // Rails, elbows and the trunk all stroke the one neutral rail colour ...
    expect(css.match(/var\(--po-stroke\) solid var\(--po-rail\)/g)).toHaveLength(3);
    expect(css).not.toMatch(/var\(--po-stroke\) solid var\(--po-c\)/);
    // ... and the level's colour (--po-c) draws only the arrowhead closing the elbow.
    expect(css.match(/solid var\(--po-c\)/g)).toHaveLength(2);
    // A rail or theme override set on :root must always win: no !important
    // outside the reduced-motion reset, no re-declared token, no variator pin.
    expect(css.replace(/@media\(prefers-reduced-motion:reduce\)[^\n]*/, "")).not.toContain("!important");
    expect(document.querySelector("style[data-variator-tokens]")).toBeNull();
  });

  // A trace mark is a quiet "trace" tag at the end of the step's text: it says
  // what it means, and it is never a character in the text itself.
  it("ends a trace-marked step's line with a `trace` tag and leaves the rest bare", () => {
    const steps = parseProcessOutline("Run\n  => Drain\n  -> Sweep");
    const { container } = render(<ProcessOutlineDocsBlock id="process-outline-trace" steps={steps} />);

    const marked = container.querySelectorAll("[data-process-outline-trace='true']");
    expect(marked).toHaveLength(1);
    const line = marked[0].querySelector(".docs-process-outline__line");
    expect(line?.textContent).toBe("Draintrace");
    expect(line?.lastElementChild?.getAttribute("data-process-outline-trace-pill")).toBe("true");
    expect(line?.lastElementChild?.textContent).toBe("trace");
    expect(container.querySelectorAll("[data-process-outline-trace-pill]")).toHaveLength(1);
    expect(container.textContent).not.toContain("=>");
  });

  it("tints a selected line in its own depth colour, per line, never as a block wash", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-select" steps={parseProcessOutline("Root")} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    expect(css).toContain('.docs-process-outline [data-process-outline-step-selected="true"]');
    expect(
      css.match(/var\(--po-c\) calc\(var\(--docs-process-outline-select-tint, 15\) \* 1%\)/g),
    ).toHaveLength(2);
    // The highlight is attached to LINES; nothing here paints the whole block.
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

  it("marks the focused edit line with a focus-ring outline and no block-wide wash", () => {
    render(<ProcessOutlineDocsBlock id="process-outline-focus" steps={STEPS} />);
    const css = document.querySelector("#docs-process-outline-style")?.textContent ?? "";

    // The focused line takes the shared focus-ring colour (>= 3:1) at the
    // knob's width (0 = just the caret).
    expect(css).toMatch(
      /step-editing="true"\] \{[^}]*outline:var\(--docs-process-outline-focus-ring, 1px\) solid var\(--docs-focus-ring, #0078df\)/,
    );
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
