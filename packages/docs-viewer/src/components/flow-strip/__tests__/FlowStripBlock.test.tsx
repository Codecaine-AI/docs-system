import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors } from "../descriptor";

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

afterEach(() => {
  cleanup();
});

describe("flow-strip", () => {
  it("draws numbered cards with their detail, a title above and the caption below", () => {
    const block: DocBlock = {
      id: "fs",
      type: "flow-strip",
      props: {
        title: "Docs MCP edit loop",
        steps: [{ name: "`docs_begin`", detail: "Pins the guidance snapshot." }, { name: "`docs_check`" }],
        caption: "Call docs_end only after every page passes.",
      },
      children: [],
    };
    render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
    const cards = [...document.querySelectorAll('[data-flow-strip-card="true"]')];
    expect(cards.map((card) => card.textContent)).toEqual(["01docs_beginPins the guidance snapshot.", "02docs_check"]);
    expect(cards[0].querySelector('[data-flow-strip-code="true"]')?.textContent).toBe("docs_begin");
    expect(document.querySelector(".docs-flow-strip__title")?.textContent).toBe("Docs MCP edit loop");
    expect(document.querySelector('[data-flow-strip-caption="true"]')?.textContent).toBe(
      "Call docs_end only after every page passes.",
    );
  });

  it("picks a column count that never strands a lone card on the last row", () => {
    const columnsFor = (count: number) => {
      const block: DocBlock = {
        id: `fs-${count}`,
        type: "flow-strip",
        props: { steps: Array.from({ length: count }, (_, index) => ({ name: `step_${index}` })) },
        children: [],
      };
      const { container, unmount } = render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
      const cols = container.querySelector(".docs-flow-strip__cards")?.getAttribute("data-cols");
      unmount();
      return Number(cols);
    };
    // Up to four cards share one row; past that the last row is never a single card.
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(columnsFor)).toEqual([1, 2, 3, 4, 3, 3, 4, 4, 3]);
  });

  it("types backtick chips by what the code is", () => {
    const block: DocBlock = {
      id: "fs-chips",
      type: "flow-strip",
      props: { steps: [{ name: "docs_begin", detail: "Returns `task_id` from `docs/run.ts`." }] },
      children: [],
    };
    render(<>{descriptors[0]!.render(block, RENDER_CTX)}</>);
    expect(
      [...document.querySelectorAll('[data-flow-strip-code="true"]')].map((chip) => chip.getAttribute("data-chip-kind")),
    ).toEqual(["prop", "path"]);
  });
});
