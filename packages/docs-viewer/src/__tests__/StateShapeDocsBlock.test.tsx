import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import {
  STATE_SHAPE_AGENT_DESCRIPTION,
  STATE_SHAPE_LABEL,
  StateShapeBlock,
  classifyTypeText,
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

describe("classifyTypeText", () => {
  it("classifies safe unions and preserves their separators", () => {
    expect(classifyTypeText("string | null")).toEqual({
      kind: "union",
      parts: ["string", " | ", "null"],
    });
  });

  it("classifies a single machine token", () => {
    expect(classifyTypeText("Map<string,int>")).toEqual({ kind: "token" });
  });

  it("classifies prose", () => {
    expect(classifyTypeText("score and validation refs")).toEqual({ kind: "prose" });
  });
});

describe("StateShapeBlock — bounded header", () => {
  it("renders the bounded header and Example column", () => {
    renderTwoPane();
    // The shared CardShell is replaced by the approved component header.
    expect(document.querySelector("[data-card-shell]")).toBeNull();
    expect(document.querySelector("[data-card-shell-bar]")).toBeNull();
    expect(document.querySelector("[data-card-shell-label]")).toBeNull();
    expect(document.querySelector("[data-card-shell-legend]")).toBeNull();
    // Targeting attributes stay on the section.
    const section = document.querySelector('[data-docs-block-type="state-shape"]');
    expect(section?.getAttribute("data-source-id")).toBe("shape-1");
    // The approved default split assigns 46% of the wide lane to fields.
    const grid = document.querySelector("[data-shape-grid]");
    // The left pane's share is the style rail's Column split knob
    // (--docs-pane-split); the literal fallback is what renders unset.
    expect(grid?.className).toContain(
      "xl:grid-cols-[minmax(0,var(--docs-pane-split,46%))_minmax(0,1fr)]",
    );
    expect(document.querySelector("[data-shape-tree]")).not.toBeNull();
    expect(document.querySelector("[data-shape-example]")).not.toBeNull();
    // The example and its separator end at content height.
    const examplePane = document.querySelector("[data-shape-example-pane]") as HTMLElement;
    expect(examplePane.className).not.toContain("xl:sticky");
    expect(examplePane.firstElementChild?.textContent).toBe("Example");
    expect(examplePane.className).toContain("xl:self-start");
    expect(grid?.className).toContain("xl:items-start");
    expect(document.querySelector("[data-shape-example]")?.className).toContain("overflow-y-auto");
    // The block fills its lane rather than capping itself: the renderer
    // hands state-shape the wide lane.
    expect(section?.className).toContain("not-prose");
    expect(section?.className).toContain("w-full");
    expect(section?.className).not.toContain("mx-auto");
  });

  it("renders headerless when the block has no name", () => {
    render(<StateShapeBlock fields={[{ name: "a" }]} id="shape-anon" />);
    expect(document.querySelector("[data-card-shell-label]")).toBeNull();
    expect(document.querySelector("[data-shape-name]")).toBeNull();
  });

  it("shows title and description while retaining source provenance", () => {
    renderTwoPane();
    // The header section is set off from the fields by a thicker (2px) bar.
    expect(document.querySelector("[data-shape-header]")?.className).toContain("border-b-2");
    const heading = document.querySelector("[data-shape-name]");
    expect(heading?.textContent).toBe("StateShapeState");
    expect(heading?.className).toContain("font-mono");
    expect(heading?.className).toContain("font-bold");
    const source = document.querySelector("[data-shape-source]") as HTMLElement;
    expect(source.getAttribute("data-shape-source")).toBe(
      "packages/docs-model/src/components/state-shape/state.ts#StateShapeState",
    );
    expect(document.querySelector("[data-shape-description]")?.textContent).toBe(
      "The state-shape block's own props.",
    );
  });

  it("separates field rows and ends branches at the last child", () => {
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
    expect(rows.every(row=>row.className.includes("border-b"))).toBe(true);
    expect(treeRow("source")?.getAttribute("data-shape-depth")).toBe("0");
    expect(treeRow("source.path")?.getAttribute("data-shape-depth")).toBe("1");
    expect(treeRow("source.path")?.querySelector("[data-tree-tick]")).not.toBeNull();
    expect(treeRow("source.path")?.querySelector("[data-tree-vertical]")?.getAttribute("data-last")).toBe("false");
    expect(treeRow("source.symbol")?.querySelector("[data-tree-vertical]")?.getAttribute("data-last")).toBe("true");
  });

  it("renders field names, type chips, accessible optional markers, and descriptions", () => {
    renderTwoPane();
    const row = treeRow("source.symbol") as HTMLElement;
    const name = row.querySelector('[data-field-token="name"]');
    expect(name?.textContent).toBe("symbol");
    expect(name?.className).toContain("font-mono");
    expect(name?.className).toContain("font-semibold");
    const type = row.querySelector('[data-field-token="type"]');
    expect(type?.textContent).toBe("string");
    expect(type?.className).toContain("--docs-shape-type");
    // The compact marker retains an accessible optional label.
    const optional = row.querySelector('[data-field-token="optional"]');
    expect(optional?.textContent).toBe("?");
    expect(optional?.getAttribute("aria-label")).toBe("optional");
    expect(optional?.className).toContain("--docs-shape-optional-fg");
    // Description renders as a muted second line inside the row.
    const described = treeRow("name") as HTMLElement;
    const description = described.querySelector('[data-field-token="description"]');
    expect(description?.textContent).toBe("Shape display name");
    expect(description?.className).toContain("--docs-shape-desc-fg");
    // Descriptions retain the approved compact line height.
    expect(description?.className).toContain("leading-5");
    // A required field renders no `?`.
    expect(treeRow("fields.name")?.querySelector('[data-field-token="optional"]')).toBeNull();
  });

  it("chips union members in their original order", () => {
    const rawType = "string | null | undefined";
    render(<StateShapeBlock id="shape-union" fields={[{ name: "value", type: rawType }]} />);
    const type = treeRow("value")?.querySelector('[data-field-token="type"]');
    expect(type?.querySelectorAll("[data-type-chip]")).toHaveLength(3);
    expect(Array.from(type?.querySelectorAll("[data-type-chip]")??[]).map(n=>n.textContent)).toEqual(["string", "null", "undefined"]);
    expect(type?.querySelectorAll("[data-type-sep]")).toHaveLength(2);
  });

  it("leaves prose types unchipped", () => {
    render(
      <StateShapeBlock
        id="shape-prose"
        fields={[{ name: "refs", type: "score and validation refs" }]}
      />,
    );
    expect(treeRow("refs")?.querySelectorAll("[data-type-chip]")).toHaveLength(0);
  });

  it("chips a single machine type token", () => {
    render(
      <StateShapeBlock
        id="shape-token"
        fields={[{ name: "items", type: "Map<string,int>" }]}
      />,
    );
    expect(treeRow("items")?.querySelectorAll("[data-type-chip]")).toHaveLength(1);
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
    // No example means no second column at all — the field list takes the
    // whole lane instead of leaving an empty half.
    expect(document.querySelector("[data-shape-example-pane]")).toBeNull();
    expect(document.querySelector("[data-shape-grid]")?.className).not.toContain("xl:grid-cols-");
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

  it("exports the label and agent description for the approved interaction", () => {
    expect(STATE_SHAPE_LABEL).toBe("State Shape");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("field inspector");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("field paths");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("JSON");
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
