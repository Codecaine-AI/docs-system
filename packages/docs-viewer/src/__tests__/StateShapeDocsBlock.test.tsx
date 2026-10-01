import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Field } from "@codecaine-ai/docs-model";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import {
  STATE_SHAPE_AGENT_DESCRIPTION,
  STATE_SHAPE_LABEL,
  StateShapeBlock,
  classifyTypeText,
  splitTypeUnion,
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
const FIELDS: Field[] = [
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
  // Declared but absent from the example: must render inert (no link).
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

/** The block's own stylesheet (other blocks' global sheets may linger in <head> across tests). */
function sheet(): string {
  return Array.from(document.querySelectorAll('[data-docs-block-type="state-shape"] style'))
    .map((style) => style.textContent ?? "")
    .join("\n");
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

describe("splitTypeUnion", () => {
  it("splits at top-level pipes only, keeping nested pipes inside their member", () => {
    expect(splitTypeUnion('"a" | "b"')).toEqual(['"a"', " | ", '"b"']);
    expect(splitTypeUnion("string | { light: string | null }")).toEqual(["string", " | ", "{ light: string | null }"]);
    expect(splitTypeUnion("(event: Change) => void")).toEqual(["(event: Change) => void"]);
    expect(splitTypeUnion("Map<string, A | B>")).toEqual(["Map<string, A | B>"]);
  });
});

describe("StateShapeBlock — plain reference panel", () => {
  it("heads the panel with the family tile, the mono name, and the source reference", () => {
    renderTwoPane();
    expect(document.querySelector("[data-card-shell]")).toBeNull();
    const section = document.querySelector('[data-docs-block-type="state-shape"]') as HTMLElement;
    expect(section.getAttribute("data-source-id")).toBe("shape-1");
    expect(section.className).toContain("not-prose");
    expect(section.className).toContain("w-full");
    const header = section.querySelector(":scope > [data-shape-header]") as HTMLElement;
    expect(header.tagName).toBe("HEADER");
    const parts = Array.from(header.children).map((child) =>
      child.hasAttribute("data-ref-tile") ? "tile" : child.hasAttribute("data-shape-name") ? "name" : child.hasAttribute("data-shape-source-ref") ? "source" : "other",
    );
    expect(parts).toEqual(["tile", "name", "source"]);
    expect(header.querySelector("[data-ref-tile]")?.getAttribute("aria-hidden")).toBe("true");
    expect(header.querySelector("[data-shape-name]")?.textContent).toBe("StateShapeState");
    // The source is a source reference (the inline reference-mark convention), path#Symbol.
    const source = header.querySelector("[data-shape-source-ref]") as HTMLElement;
    expect(source.textContent).toBe("packages/docs-model/src/components/state-shape/state.ts#StateShapeState");
    expect(source.getAttribute("data-spectre-ref")).toBe("true");
    expect(source.getAttribute("data-ref-kind")).toBe("source");
    expect(source.getAttribute("data-ref-path")).toBe("packages/docs-model/src/components/state-shape/state.ts");
    expect(source.getAttribute("data-ref-symbol")).toBe("StateShapeState");
    expect(section.getAttribute("data-shape-source")).toBe(source.textContent);
  });

  it("is always open: no disclosure, no tooltip, the description prints beneath the head", () => {
    renderTwoPane();
    expect(document.querySelector("details")).toBeNull();
    expect(document.querySelector("summary")).toBeNull();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.querySelector("[data-described]")).toBeNull();
    const description = document.querySelector("[data-shape-description]") as HTMLElement;
    expect(description.tagName).toBe("P");
    expect(description.textContent).toBe("The state-shape block's own props.");
    // No column heads: the columns are self-evident.
    expect(document.querySelector("[data-shape-ledger-head]")).toBeNull();
    expect(document.querySelector("[data-shape-example-head]")).toBeNull();
    // No field count trails the name.
    expect(document.querySelector("[data-shape-header]")?.textContent).not.toMatch(/\d+ fields?/);
  });

  it("renders headerless when the block has neither a name nor a source", () => {
    render(<StateShapeBlock fields={[{ name: "a" }]} id="shape-anon" />);
    expect(document.querySelector("[data-shape-header]")).toBeNull();
    expect(document.querySelector("[data-shape-name]")).toBeNull();
    expect(treeRow("a")).not.toBeNull();
  });

  it("lists every field in document order with its depth on the row", () => {
    renderTwoPane();
    const rows = Array.from(document.querySelectorAll("[data-shape-tree] [data-shape-path]")) as HTMLElement[];
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
    expect(treeRow("source")?.getAttribute("data-field-depth")).toBe("0");
    expect(treeRow("source.path")?.getAttribute("data-field-depth")).toBe("1");
    // The depth drives the indent and the guide through one custom property.
    expect(treeRow("source.path")?.style.getPropertyValue("--field-depth")).toBe("1");
  });

  it("renders names, types, an accessible optional mark, and inline descriptions", () => {
    renderTwoPane();
    const row = treeRow("source.symbol") as HTMLElement;
    expect(row.querySelector('[data-field-token="name"]')?.textContent).toBe("symbol");
    expect(row.querySelector('[data-field-token="type"]')?.textContent).toBe("string");
    // The `?` is visual; assistive tech reads "(optional)".
    const optional = row.querySelector('[data-field-token="optional"]') as HTMLElement;
    expect(optional.querySelector('[aria-hidden="true"]')?.textContent).toBe("?");
    expect(optional.querySelector("[data-sr-only]")?.textContent).toBe(" (optional)");
    expect(treeRow("fields.name")?.querySelector('[data-field-token="optional"]')).toBeNull();
    // The description is a visible line in the type column, not a tooltip.
    const described = treeRow("name") as HTMLElement;
    const description = described.querySelector('[data-field-token="description"]') as HTMLElement;
    expect(description.textContent).toBe("Shape display name");
    expect(description.getAttribute("role")).toBeNull();
    expect(description.closest("[data-field-def]")).not.toBeNull();
    expect(described.querySelector('[data-field-token="name"]')?.getAttribute("tabindex")).toBeNull();
    expect(row.querySelector('[data-field-token="description"]')).toBeNull();
  });

  it("prints union members in one type color with muted pipes", () => {
    render(<StateShapeBlock id="shape-union" fields={[{ name: "value", type: '"color" | "length" | null' }]} />);
    const type = treeRow("value")?.querySelector('[data-field-token="type"]') as HTMLElement;
    expect(Array.from(type.querySelectorAll("[data-type-member]")).map((node) => node.textContent)).toEqual(['"color"', '"length"', "null"]);
    expect(type.querySelectorAll("[data-type-sep]")).toHaveLength(2);
    expect(type.querySelector("[data-type-chip]")).toBeNull();
    // A type without a top-level pipe is one plain run.
    cleanup();
    render(<StateShapeBlock id="shape-prose" fields={[{ name: "refs", type: "score and validation refs" }]} />);
    const prose = treeRow("refs")?.querySelector('[data-field-token="type"]') as HTMLElement;
    expect(prose.textContent).toBe("score and validation refs");
    expect(prose.children).toHaveLength(0);
  });

  it("puts the example in a code-surface pane: no gutter, a focusable labelled region", () => {
    renderTwoPane();
    const pane = document.querySelector("[data-shape-example-pane]") as HTMLElement;
    expect(pane.hasAttribute("data-code-surface")).toBe(true);
    expect(pane.hasAttribute("data-ref-code")).toBe(true);
    expect(pane.closest("[data-shape-grid]")?.getAttribute("data-has-example")).toBe("true");
    const region = pane.querySelector("[data-shape-example]") as HTMLElement;
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("StateShapeState example");
    const css = sheet();
    expect(css).toContain("[data-ref-code] [data-line-number],[data-ref-code] [data-code-lines-filler]{display:none}");
    expect(css).toContain("[data-ref-code] [data-code-lines]:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df)");
    expect(css).toContain("minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)");
  });

  it("reads its knobs through the shared ledger locals, light defaults as fallbacks", () => {
    renderTwoPane();
    const css = sheet();
    for (const declaration of [
      "--fl-name:var(--docs-shape-name,var(--docs-syn-prop,#0d7164))",
      "--fl-type:var(--docs-shape-type,var(--docs-syn-type,#805f01))",
      "--fl-desc:var(--docs-shape-desc-fg,var(--docs-muted,#666562))",
      "--fl-name-w:var(--docs-shape-name-width,176px)",
      "--fl-row-min-h:var(--docs-shape-row-min-height,28px)",
      "--fl-indent:var(--docs-shape-indent,16px)",
      "background:var(--docs-shape-bg,var(--docs-panel,#f8f8f7))",
      "border:var(--docs-shape-border-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))",
      "background:var(--docs-fam-ref-solid,#6940a5)",
      // The shared ledger: fixed name column, inline description, focus ring on linked rows.
      "grid-template-columns:min(var(--fl-name-w),38%) minmax(0,1fr)",
      "[data-field-row]:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df)",
      "[data-description-line]{display:block;max-width:75ch",
    ]) {
      expect(css).toContain(declaration);
    }
    // No textures, tinted heads, uppercase column heads, or pinned values.
    expect(css).not.toContain("radial-gradient");
    expect(css).not.toContain("text-transform:uppercase");
    expect(css).not.toContain("!important");
  });

  it("renders no line-number chips anywhere; mapped rows are simply linkable", () => {
    renderTwoPane();
    expect(document.querySelector("[data-range-chip]")).toBeNull();
    expect(treeRow("source")?.getAttribute("data-link-key")).toBe("source");
    expect(treeRow("fields.name")?.getAttribute("data-link-key")).toBe("fields.name");
  });

  it("leaves unmatched rows inert: no link key, no tab stop", () => {
    renderTwoPane();
    const row = treeRow("missing") as HTMLElement;
    expect(row.getAttribute("data-link-key")).toBeNull();
    expect(row.getAttribute("tabindex")).toBeNull();
    expect(treeRow("fields.name")?.getAttribute("tabindex")).toBe("0");
  });

  it("keys example lines with their whole chain, deepest first — ancestors still light them", () => {
    renderTwoPane();
    expect(exampleLine(1)?.getAttribute("data-link-key")).toBeNull();
    expect(exampleLine(17)?.getAttribute("data-link-key")).toBeNull();
    expect(exampleLine(4)?.getAttribute("data-link-key")).toBe("source.path source");
    expect(exampleLine(9)?.getAttribute("data-link-key")).toBe("fields.name fields");
    expect(exampleLine(14)?.getAttribute("data-link-key")).toBe("fields.required fields");
    expect(exampleLine(3)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(6)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(8)?.getAttribute("data-link-key")).toBe("fields");
    expect(exampleLine(11)?.getAttribute("data-link-key")).toBe("fields");
  });

  it("tones JSON tokens with the code theme's syntax roles", () => {
    renderTwoPane();
    const pane = document.querySelector("[data-shape-example]") as HTMLElement;
    expect(pane.getAttribute("data-code-lines")).toBe("true");
    expect(pane.querySelectorAll("[data-code-line]")).toHaveLength(17);
    const line2 = exampleLine(2) as HTMLElement;
    const key = line2.querySelector('[data-json-token="key"]');
    expect(key?.textContent).toBe('"name"');
    expect(key?.className).toContain("--syntax-key");
    expect(key?.className).toContain("--syntax-key-font-style");
    expect(line2.querySelector('[data-json-token="string"]')?.className).toContain("--syntax-string");
    expect(exampleLine(10)?.querySelector('[data-json-token="boolean"]')?.className).toContain("--syntax-boolean");
    expect(exampleLine(1)?.querySelector('[data-json-token="punct"]')?.className).toContain("--syntax-punctuation");
  });

  it("lights the whole extent in both panes on hover and pins on click", () => {
    const { container } = renderTwoPane();
    const row = treeRow("source") as HTMLElement;
    fireEvent.mouseEnter(row);
    expect(row.getAttribute("data-lit")).toBe("true");
    for (const line of [3, 4, 5, 6]) expect(exampleLine(line)?.getAttribute("data-lit")).toBe("true");
    fireEvent.mouseLeave(row);
    expect(exampleLine(3)?.getAttribute("data-lit")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("data-pinned")).toBe("true");
    expect(exampleLine(6)?.getAttribute("data-lit")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector("[data-pinned]")).toBeNull();
  });

  it("renders the single-pane ledger when there is no example: nothing linkable", () => {
    render(<StateShapeBlock id="shape-bare" name="Bare" fields={[{ name: "a", type: "string" }, { name: "b", required: false }]} />);
    expect(document.querySelector("[data-shape-example]")).toBeNull();
    expect(document.querySelector("[data-link-key]")).toBeNull();
    expect(document.querySelector("[data-shape-example-pane]")).toBeNull();
    expect(document.querySelector("[data-shape-grid]")?.hasAttribute("data-has-example")).toBe(false);
  });

  it("falls back to the single-pane ledger when the example is not valid JSON (tolerant)", () => {
    render(<StateShapeBlock example={'{ "broken": '} fields={[{ name: "broken", type: "string" }]} id="shape-broken" />);
    expect(document.querySelector("[data-shape-example]")).toBeNull();
    expect(treeRow("broken")).not.toBeNull();
  });

  it("shows the empty note when the shape has no fields", () => {
    const { getByText } = render(<StateShapeBlock fields={[]} id="shape-empty" />);
    expect(getByText("(no fields)")).toBeTruthy();
  });

  it("exports the label and an agent description of the rendering", () => {
    expect(STATE_SHAPE_LABEL).toBe("State Shape");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("field inspector");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("field paths");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("JSON");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("description printed inline");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("always open");
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

  it("renders the two-pane panel from valid props, example included", () => {
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
    const node = descriptors[0].render(shapeBlock({ fields: [{ type: "string" }] }), ctx);
    const { getByText } = render(<>{node}</>);
    expect(getByText("Invalid State Shape block — see agent description for the expected shape.")).toBeTruthy();
  });

  it("tolerates a malformed example: single-pane ledger, not a placeholder", () => {
    const node = descriptors[0].render(shapeBlock({ fields: [{ name: "a" }], example: "{ nope" }), ctx);
    render(<>{node}</>);
    expect(document.querySelector("[data-shape-tree]")).not.toBeNull();
    expect(document.querySelector("[data-shape-example]")).toBeNull();
  });
});
