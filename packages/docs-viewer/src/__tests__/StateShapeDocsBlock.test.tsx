import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import {
  STATE_SHAPE_AGENT_DESCRIPTION,
  STATE_SHAPE_LABEL,
  StateShapeBlock,
} from "../components/state-shape/StateShapeDocsBlock";
import { descriptors } from "../components/state-shape/descriptor";
import type { DocBlockRenderContext } from "../render/block-registry";

afterEach(() => {
  cleanup();
});

/**
 * Mockup-shaped fixture. The example pretty-prints (printJsonLines canon) to:
 *
 *   1  {
 *   2    "name": "StateShapeState",
 *   3    "source": {
 *   4      "path": "state.ts",
 *   5      "symbol": "StateShapeState"
 *   6    },
 *   7    "fields": [
 *   8      {
 *   9        "name": "operations",
 *  10        "required": false
 *  11      },
 *  12      {
 *  13        "name": "params",
 *  14        "required": true
 *  15      }
 *  16    ]
 *  17  }
 */
const FIELDS = [
  { name: "name", type: "string", description: "Shape display name" },
  {
    name: "source",
    type: "object",
    required: false,
    fields: [
      { name: "path", type: "string" },
      { name: "symbol", type: "string", required: false },
    ],
  },
  {
    name: "fields",
    type: "Field[]",
    fields: [
      { name: "name", type: "string" },
      { name: "required", type: "boolean", required: false },
    ],
  },
  // Declared but absent from the example: must render inert (no chip, no link).
  { name: "missing", type: "string", required: false },
];

const EXAMPLE = JSON.stringify({
  name: "StateShapeState",
  source: { path: "state.ts", symbol: "StateShapeState" },
  fields: [
    { name: "operations", required: false },
    { name: "params", required: true },
  ],
});

function renderTwoPane() {
  return render(
    <StateShapeBlock
      id="shape-1"
      name="StateShapeState"
      description="The state-shape block's own props."
      source={{
        path: "packages/docs-model/src/components/state-shape/state.ts",
        symbol: "StateShapeState",
      }}
      fields={FIELDS}
      example={EXAMPLE}
    />,
  );
}

function treeRow(path: string): HTMLElement | null {
  return document.querySelector(`[data-shape-tree] [data-shape-path="${path}"]`);
}

function exampleLine(number: number): HTMLElement | null {
  return document.querySelector(`[data-shape-example] [data-code-line="${number}"]`);
}

describe("StateShapeBlock — S1 two-pane card", () => {
  it("frames a bare card: no header bar, no labels, no language tag (R5)", () => {
    renderTwoPane();
    // The card-shell header bar is gone entirely — R5 also means no
    // language tag anywhere on the card.
    expect(document.querySelector("[data-card-shell]")).toBeNull();
    expect(document.querySelector("[data-card-shell-bar]")).toBeNull();
    expect(document.querySelector("[data-card-shell-label]")).toBeNull();
    expect(document.querySelector("[data-card-shell-legend]")).toBeNull();
    // Targeting attributes stay on the section.
    const section = document.querySelector('[data-docs-block-type="state-shape"]');
    expect(section?.getAttribute("data-source-id")).toBe("shape-1");
    // Two panes in the grid.
    const grid = document.querySelector("[data-shape-grid]");
    expect(grid?.className).toContain("1.1fr");
    expect(document.querySelector("[data-shape-tree]")).not.toBeNull();
    expect(document.querySelector("[data-shape-example]")).not.toBeNull();
  });

  it("renders headerless when the block has no name", () => {
    render(<StateShapeBlock fields={[{ name: "a" }]} id="shape-anon" />);
    expect(document.querySelector("[data-card-shell-label]")).toBeNull();
    expect(document.querySelector("[data-shape-name]")).toBeNull();
  });

  it("heads the tree with the bold-mono shape name, muted basename#symbol source ref, and description", () => {
    renderTwoPane();
    // The header section is set off from the fields by a thicker (2px) bar.
    expect(document.querySelector("[data-shape-header]")?.className).toContain("border-b-2");
    const heading = document.querySelector("[data-shape-name]");
    expect(heading?.textContent).toBe("StateShapeState");
    expect(heading?.className).toContain("font-mono");
    expect(heading?.className).toContain("font-bold");
    expect(heading?.className).toContain("--docs-shape-name");
    const source = document.querySelector("[data-shape-source]") as HTMLElement;
    expect(source.textContent).toBe("state.ts#StateShapeState");
    expect(source.getAttribute("title")).toBe(
      "packages/docs-model/src/components/state-shape/state.ts#StateShapeState",
    );
    expect(document.querySelector("[data-shape-description]")?.textContent).toBe(
      "The state-shape block's own props.",
    );
  });

  it("groups fields: top-level rows hairline-divided, children behind a light left rule", () => {
    renderTwoPane();
    const rows = Array.from(
      document.querySelectorAll("[data-shape-tree] [data-shape-path]"),
    ) as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-shape-path"))).toEqual([
      "name",
      "source",
      "source.path",
      "source.symbol",
      "fields",
      "fields.name",
      "fields.required",
      "missing",
    ]);
    // ONLY top-level groups sit in the ProseRows stack — hairlines divide
    // top-level fields, never nested rows.
    const stack = document.querySelector("[data-shape-tree] [data-prose-rows]");
    expect(stack?.children).toHaveLength(4);
    expect(stack?.className).toContain("divide-y");
    // Children nest behind a light left rule inside their parent's group.
    expect(treeRow("source")?.getAttribute("data-shape-depth")).toBe("0");
    expect(treeRow("source.path")?.getAttribute("data-shape-depth")).toBe("1");
    const children = document.querySelector('[data-shape-field-group="source"] [data-shape-children]');
    expect(children?.className).toContain("border-l");
    expect(children?.contains(treeRow("source.path"))).toBe(true);
  });

  it("tones row tokens: bold mono name, shape-type amber, muted ? for required: false, muted description line", () => {
    renderTwoPane();
    const row = treeRow("source.symbol") as HTMLElement;
    const name = row.querySelector('[data-field-token="name"]');
    expect(name?.textContent).toBe("symbol");
    expect(name?.className).toContain("font-mono");
    expect(name?.className).toContain("font-semibold");
    const type = row.querySelector('[data-field-token="type"]');
    expect(type?.textContent).toBe("string");
    expect(type?.className).toContain("--docs-shape-type");
    expect(row.querySelector('[data-field-token="optional"]')?.textContent).toBe("?");
    // Description renders as a muted second line inside the row.
    const described = treeRow("name") as HTMLElement;
    const description = described.querySelector('[data-field-token="description"]');
    expect(description?.textContent).toBe("Shape display name");
    expect(description?.className).toContain("--docs-shape-desc-fg");
    // A required field renders no `?`.
    expect(treeRow("fields.name")?.querySelector('[data-field-token="optional"]')).toBeNull();
  });

  it("renders no line-number chips anywhere; mapped rows are simply linkable", () => {
    renderTwoPane();
    expect(document.querySelector("[data-range-chip]")).toBeNull();
    // Mapped rows stay link targets; hover still paints extents.
    expect(treeRow("source")?.getAttribute("data-link-key")).toBe("source");
    expect(treeRow("fields.name")?.getAttribute("data-link-key")).toBe("fields.name");
  });

  it("leaves unmatched rows inert: no chip, no link key", () => {
    renderTwoPane();
    const row = treeRow("missing") as HTMLElement;
    expect(row.querySelector("[data-range-chip]")).toBeNull();
    expect(row.getAttribute("data-link-key")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    // Mapped rows ARE link targets keyed by their dot-path.
    expect(treeRow("fields.name")?.getAttribute("data-link-key")).toBe("fields.name");
    expect(treeRow("fields.name")?.getAttribute("tabindex")).toBe("0");
  });

  it("keys example lines with their whole chain, deepest first — ancestors still light them", () => {
    renderTwoPane();
    // Braces of the whole document belong to nothing.
    expect(exampleLine(1)?.getAttribute("data-link-key")).toBeNull();
    expect(exampleLine(17)?.getAttribute("data-link-key")).toBeNull();
    // A key line leads with its own field, then its matched ancestors.
    expect(exampleLine(4)?.getAttribute("data-link-key")).toBe("source.path source");
    expect(exampleLine(9)?.getAttribute("data-link-key")).toBe("fields.name fields");
    expect(exampleLine(14)?.getAttribute("data-link-key")).toBe("fields.required fields");
    // Opening/closing lines of `source` and of each array element carry
    // just the enclosing matched field(s).
    expect(exampleLine(3)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(6)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(8)?.getAttribute("data-link-key")).toBe("fields");
    expect(exampleLine(11)?.getAttribute("data-link-key")).toBe("fields");
  });

  it("numbers example lines locally with zebra striping and tones JSON tokens (R1, R4)", () => {
    renderTwoPane();
    const pane = document.querySelector("[data-shape-example]") as HTMLElement;
    expect(pane.getAttribute("data-code-lines")).toBe("true");
    expect(pane.querySelectorAll("[data-code-line]")).toHaveLength(17);
    expect(exampleLine(1)?.querySelector("[data-line-number]")?.textContent).toBe("1");
    // Zebra on even lines only.
    expect(exampleLine(2)?.className).toContain("--docs-zebra");
    expect(exampleLine(3)?.className).not.toContain("--docs-zebra");
    // Tokens: key vs string value on the same line, boolean literal, punctuation.
    const line2 = exampleLine(2) as HTMLElement;
    const key = line2.querySelector('[data-json-token="key"]');
    expect(key?.textContent).toBe('"name"');
    expect(key?.className).toContain("--syntax-key");
    const string = line2.querySelector('[data-json-token="string"]');
    expect(string?.textContent).toBe('"StateShapeState"');
    expect(string?.className).toContain("--syntax-string");
    const boolean = exampleLine(10)?.querySelector('[data-json-token="boolean"]');
    expect(boolean?.textContent).toBe("false");
    expect(boolean?.className).toContain("--syntax-boolean");
    const punct = exampleLine(1)?.querySelector('[data-json-token="punct"]');
    expect(punct?.textContent).toBe("{");
    expect(punct?.className).toContain("text-muted-foreground");
  });

  it("lights the whole extent in both panes on hover and pins on click (R3)", () => {
    const { container } = renderTwoPane();
    const row = treeRow("source") as HTMLElement;
    fireEvent.mouseEnter(row);
    // The row and ALL FOUR lines of the source extent light together —
    // including interior lines owned by deeper fields (contiguous extent).
    expect(row.getAttribute("data-lit")).toBe("true");
    expect(exampleLine(3)?.getAttribute("data-lit")).toBe("true");
    expect(exampleLine(4)?.getAttribute("data-lit")).toBe("true");
    expect(exampleLine(5)?.getAttribute("data-lit")).toBe("true");
    expect(exampleLine(6)?.getAttribute("data-lit")).toBe("true");
    fireEvent.mouseLeave(row);
    expect(exampleLine(3)?.getAttribute("data-lit")).toBeNull();
    // Click pins; Escape clears.
    fireEvent.click(row);
    expect(row.getAttribute("data-pinned")).toBe("true");
    expect(exampleLine(6)?.getAttribute("data-lit")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector("[data-pinned]")).toBeNull();
  });

  it("renders the single-pane tree when there is no example: no legend, no chips, nothing linkable", () => {
    render(
      <StateShapeBlock
        id="shape-bare"
        name="Bare"
        fields={[{ name: "a", type: "string" }, { name: "b", required: false }]}
      />,
    );
    expect(document.querySelector("[data-shape-example]")).toBeNull();
    expect(document.querySelector("[data-range-chip]")).toBeNull();
    expect(document.querySelector("[data-link-key]")).toBeNull();
    expect(document.querySelector("[data-shape-grid]")?.className).not.toContain("1.1fr");
  });

  it("falls back to the single-pane tree when the example is not valid JSON (tolerant)", () => {
    render(
      <StateShapeBlock
        example={'{ "broken": '}
        fields={[{ name: "broken", type: "string" }]}
        id="shape-broken"
      />,
    );
    expect(document.querySelector("[data-shape-example]")).toBeNull();
    expect(document.querySelector("[data-range-chip]")).toBeNull();
  });

  it("shows the empty-tree note when the shape has no fields", () => {
    const { getByText } = render(<StateShapeBlock fields={[]} id="shape-empty" />);
    expect(getByText("(no fields)")).toBeTruthy();
  });

  it("exports the label and an agent description covering the props contract", () => {
    expect(STATE_SHAPE_LABEL).toBe("State Shape");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("fields");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("required?: boolean");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("example?: string");
  });
});

describe("state-shape descriptor", () => {
  const ctx: DocBlockRenderContext = {
    renderText: () => null,
    renderChildren: () => null,
    renderMarkdown: () => null,
  };

  function shapeBlock(props: Record<string, unknown>): DocBlock {
    return { id: "shape-desc-1", type: "state-shape", props, children: [] };
  }

  it("renders the two-pane card from valid props, example included", () => {
    const node = descriptors[0].render(
      shapeBlock({
        name: "StateShapeState",
        fields: [{ name: "name", type: "string" }],
        example: '{ "name": "x" }',
      }),
      ctx,
    );
    render(<>{node}</>);
    expect(document.querySelector("[data-shape-name]")?.textContent).toBe("StateShapeState");
    expect(document.querySelector("[data-shape-example]")).not.toBeNull();
    expect(treeRow("name")?.getAttribute("data-link-key")).toBe("name");
  });

  it("renders the invalid placeholder for malformed fields", () => {
    const node = descriptors[0].render(
      shapeBlock({ fields: [{ type: "string" }] }),
      ctx,
    );
    const { getByText } = render(<>{node}</>);
    expect(
      getByText("Invalid State Shape block — see agent description for the expected shape."),
    ).toBeTruthy();
  });

  it("tolerates a malformed example: single-pane tree, not a placeholder", () => {
    const node = descriptors[0].render(
      shapeBlock({ fields: [{ name: "a" }], example: "{ nope" }),
      ctx,
    );
    render(<>{node}</>);
    expect(document.querySelector("[data-shape-tree]")).not.toBeNull();
    expect(document.querySelector("[data-shape-example]")).toBeNull();
  });
});
