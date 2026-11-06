import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Field } from "@codecaine-ai/docs-model";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import {
  STATE_SHAPE_AGENT_DESCRIPTION,
  STATE_SHAPE_LABEL,
  StateShapeBlock,
  buildShapeModel,
  classifyTypeText,
  splitTypeUnion,
} from "../components/state-shape/StateShapeDocsBlock";
import { ledgerGuides } from "../components/state-shape/field-ledger";
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

describe("ledgerGuides", () => {
  it("draws tree connectors: pipes for ancestors with later siblings, blanks after a last ancestor", () => {
    // a / a.b / a.b.c / a.d / a.d.e / f
    const depths = [0, 1, 2, 1, 2, 0].map((depth) => ({ depth }));
    expect(ledgerGuides(depths)).toEqual([[], ["tee"], ["pipe", "end"], ["end"], ["blank", "end"], []]);
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
    // The whole panel is a code surface: the dark code panel in both page modes.
    expect(section.getAttribute("data-code-surface")).toBe("true");
    const header = section.querySelector(":scope > [data-shape-header]") as HTMLElement;
    expect(header.tagName).toBe("HEADER");
    const parts = Array.from(header.children).map((child) =>
      child.hasAttribute("data-ref-tile") ? "tile" : child.hasAttribute("data-shape-name") ? "name" : child.querySelector(":scope > [data-shape-source-ref]") ? "source" : "other",
    );
    expect(parts).toEqual(["tile", "name", "source"]);
    expect(header.querySelector("[data-ref-tile]")?.getAttribute("aria-hidden")).toBe("true");
    expect(header.querySelector("[data-shape-name]")?.textContent).toBe("StateShapeState");
    // The source is a source reference showing only basename#Symbol; the full
    // path#Symbol opens in a tooltip on hover / focus.
    const source = header.querySelector("[data-shape-source-ref]") as HTMLElement;
    expect(source.textContent).toBe("state.ts#StateShapeState");
    expect(source.getAttribute("tabindex")).toBe("0");
    const sourceTip = document.getElementById(source.getAttribute("aria-describedby")!) as HTMLElement;
    expect(sourceTip.getAttribute("role")).toBe("tooltip");
    expect(sourceTip.textContent).toBe("packages/docs-model/src/components/state-shape/state.ts#StateShapeState");
    expect(source.getAttribute("data-spectre-ref")).toBe("true");
    expect(source.getAttribute("data-ref-kind")).toBe("source");
    expect(source.getAttribute("data-ref-path")).toBe("packages/docs-model/src/components/state-shape/state.ts");
    expect(source.getAttribute("data-ref-symbol")).toBe("StateShapeState");
    expect(section.getAttribute("data-shape-source")).toBe(sourceTip.textContent);
  });

  it("is always open: no disclosure, the shape's description prints beneath the head", () => {
    renderTwoPane();
    expect(document.querySelector("details")).toBeNull();
    expect(document.querySelector("summary")).toBeNull();
    // The head's own description is a paragraph, never a tooltip.
    expect(document.querySelector("[data-shape-description]")?.closest("[data-described]")).toBeNull();
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
    // The depth drives the indent through one custom property.
    expect(treeRow("source.path")?.style.getPropertyValue("--field-depth")).toBe("1");
    // Nested fields hang off their parent with the file tree's elbows: a tee
    // for a middle child, an end for the last; top-level rows draw none.
    const guides = (path: string) => Array.from(treeRow(path)?.querySelectorAll(".docs-tree__guides > i") ?? []).map((guide) => guide.getAttribute("data-g"));
    expect(guides("source")).toEqual([]);
    expect(guides("source.path")).toEqual(["tee"]);
    expect(guides("source.symbol")).toEqual(["end"]);
    expect(guides("fields.name")).toEqual(["tee"]);
    expect(guides("fields.required")).toEqual(["end"]);
    expect(treeRow("source.path")?.querySelector(".docs-tree__guides")?.getAttribute("aria-hidden")).toBe("true");
    // One fixed name column on every ledger: no per-block width that would
    // move the type column from one stacked block to the next.
    const ledger = document.querySelector("[data-shape-tree] [data-field-ledger]") as HTMLElement;
    expect(ledger.getAttribute("style")).toBeNull();
  });

  it("wraps a name longer than the fixed column at its underscores instead of widening the column", () => {
    render(<StateShapeBlock id="long-name" name="Signal" fields={[{ name: "commercial_interpretation_of_the_signal", type: "string" }, { name: "id", type: "string" }]} />);
    const name = document.querySelector('[data-field-row="commercial_interpretation_of_the_signal"] [data-field-token="name"]') as HTMLElement;
    expect(name.textContent).toBe("commercial_interpretation_of_the_signal");
    expect(name.querySelectorAll("wbr")).toHaveLength(4);
  });

  it("breaks a lone identifier type between camel humps, never a union member", () => {
    render(<StateShapeBlock id="camel" name="Window" fields={[{ name: "noncommercial_topics", type: "NoncommercialTopic[]" }, { name: "kind", type: "DocsChangeEvent | null" }]} />);
    const lone = document.querySelector('[data-field-row="noncommercial_topics"] [data-field-token="type"]') as HTMLElement;
    expect(lone.innerHTML).toContain("Noncommercial<wbr>Topic");
    const union = document.querySelector('[data-field-row="kind"] [data-field-token="type"]') as HTMLElement;
    expect(union.querySelectorAll("wbr")).toHaveLength(0);
  });

  it("renders names, types, an accessible optional mark, and prints each description beside its type", () => {
    renderTwoPane();
    const row = treeRow("source.symbol") as HTMLElement;
    expect(row.querySelector('[data-field-token="name"]')?.textContent).toBe("symbol");
    expect(row.querySelector('[data-field-token="type"]')?.textContent).toBe("string");
    // The `?` is visual; assistive tech reads "(optional)".
    const optional = row.querySelector('[data-field-token="optional"]') as HTMLElement;
    expect(optional.querySelector('[aria-hidden="true"]')?.textContent).toBe("?");
    expect(optional.querySelector("[data-sr-only]")?.textContent).toBe(" (optional)");
    expect(treeRow("fields.name")?.querySelector('[data-field-token="optional"]')).toBeNull();
    // A static or touch reader sees the description: it prints in the type
    // column, after the type, and is never a hover-only tooltip.
    const described = treeRow("name") as HTMLElement;
    const note = described.querySelector('[data-field-token="note"]') as HTMLElement;
    expect(note.textContent).toBe("Shape display name");
    expect(note.closest("[data-field-def]")?.querySelector('[data-field-token="type"]')?.textContent).toBe("string");
    expect(described.querySelector('[role="tooltip"]')).toBeNull();
    expect(described.querySelector('[data-field-token="name"]')?.getAttribute("tabindex")).toBeNull();
    // An undescribed field prints no note.
    expect(row.querySelector('[data-field-token="note"]')).toBeNull();
    // Notes sit in a third column when the ledger is 600px wide, else under the type.
    expect(sheet()).toContain('@container (min-width:600px){[data-field-def]:has(>[data-field-token="note"]){display:flex');
  });

  it("colors type text as Dark+ colors a TS type: literals by role, pipes and braces as punctuation", () => {
    render(<StateShapeBlock id="shape-union" fields={[{ name: "value", type: '"color" | "length" | null' }, { name: "range", type: "{ min: number; max?: 24 }" }]} />);
    const type = treeRow("value")?.querySelector('[data-field-token="type"]') as HTMLElement;
    expect(Array.from(type.querySelectorAll("[data-type-member]")).map((node) => node.textContent)).toEqual(['"color"', '"length"', "null"]);
    expect(type.querySelectorAll("[data-type-sep]")).toHaveLength(2);
    expect(type.querySelector("[data-type-chip]")).toBeNull();
    const roles = (node: Element) => Array.from(node.querySelectorAll("[data-type-tok]")).map((token) => `${token.getAttribute("data-type-tok")}:${token.textContent}`);
    expect(roles(type)).toEqual(['string:"color"', 'string:"length"', "keyword:null"]);
    // Type names stay plain text in the type color; keys, literals and punctuation carry a role.
    const objectType = treeRow("range")?.querySelector('[data-field-token="type"]') as HTMLElement;
    expect(objectType.textContent).toBe("{ min: number; max?: 24 }");
    expect(roles(objectType)).toEqual(["punct:{", "key:min", "punct::", "punct:;", "key:max", "punct:?", "punct::", "number:24", "punct:}"]);
    const css = sheet();
    for (const declaration of [
      '[data-type-tok="string"]{color:var(--fl-type-string,inherit)}',
      '[data-type-tok="punct"]{color:var(--fl-type-punct,inherit)}',
      "--fl-type-punct:var(--fl-muted)",
      "--fl-type-key:var(--fl-name)",
    ]) {
      expect(css).toContain(declaration);
    }
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
    expect(css).toContain("[data-ref-code] [data-code-lines]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df)");
    // Side by side at 44/56 from a 560px container (the list keeps at least 360px,
    // the code pane at least 260px). Stacking is the narrow-screen last resort.
    expect(css).toContain("@container (min-width:560px){[data-shape-grid][data-has-example]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)}");
    // The pane soft-wraps: lines grow with their text (so a lit line's wash
    // covers every visual line), strings break anywhere, and continuation
    // lines hang 2ch past the line's own indent.
    expect(css).toContain("[data-ref-code] [data-code-line]{height:auto;white-space:pre-wrap;tab-size:2}");
    expect(css).toContain("[data-ref-code] [data-hang]{display:block;padding-left:calc(var(--hang,0ch) + 2ch);text-indent:calc(-1*(var(--hang,0ch) + 2ch))}");
    expect(css).toContain('[data-ref-code] :is([data-json-token="string"],[data-sig-token="string"]){overflow-wrap:anywhere}');
    const hangs = Array.from(region.querySelectorAll("[data-code-line] > [data-line-text] > [data-hang]")) as HTMLElement[];
    expect(hangs.length).toBe(region.querySelectorAll("[data-code-line]").length);
    expect(hangs[0]?.style.getPropertyValue("--hang")).toBe("0ch");
    expect(hangs[1]?.style.getPropertyValue("--hang")).toBe("2ch");
  });

  it("keeps an example far taller than its ledger beside the fields", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `block-${i}`, type: "paragraph", children: [`child-${i}`, `other-${i}`] }));
    render(<StateShapeBlock id="shape-tall" name="Doc" fields={[{ name: "blocks", type: "Block[]" }]} example={JSON.stringify({ blocks: rows })} />);
    const grid = document.querySelector("[data-shape-grid]") as HTMLElement;
    expect(grid.getAttribute("data-has-example")).toBe("true");
    expect(grid.hasAttribute("data-example-below")).toBe(false);
  });

  it("reads its knobs through the shared ledger locals, defaults as fallbacks", () => {
    renderTwoPane();
    const css = sheet();
    for (const declaration of [
      // Code-panel colors: the code theme's syntax roles, Dark+ literals.
      "--fl-name:var(--docs-shape-name,var(--syntax-key,#9cdcfe))",
      "--fl-type:var(--docs-shape-type,var(--syntax-type,#4ec9b0))",
      "--fl-muted:var(--docs-shape-muted,var(--syntax-punctuation,#d4d4d4))",
      "--fl-optional:var(--docs-shape-optional-fg,var(--syntax-punctuation,#d4d4d4))",
      "--fl-type-string:var(--syntax-string,#ce9178)",
      "--fl-desc:var(--docs-shape-desc-fg,var(--docs-muted,#666562))",
      // The name column fits the longest name, capped by the shared knob.
      "--fl-name-w:min(var(--docs-shape-name-width,24ch),var(--shape-name-fit,24ch))",
      "--fl-pad-x:var(--docs-shape-pad-x,16px)",
      "--fl-row-min-h:var(--docs-shape-row-min-height,28px)",
      "--fl-indent:var(--docs-shape-indent,16px)",
      "background:var(--docs-shape-bg,var(--docs-panel,#f8f8f7))",
      "border:var(--docs-shape-border-width,1px) solid var(--docs-shape-border,var(--docs-rule,#e6e5e3))",
      "background:var(--docs-fam-ref-solid,#6940a5)",
      // The shared ledger: one fixed name column (the indent eats into it, so
      // the type column never moves); a longer name wraps inside it; a type
      // that cannot fit beside it wraps whole onto its own line (never
      // mid-word), focus ring on linked rows.
      "[data-field-name-cell]{flex:0 0 calc(var(--fl-name-w) - var(--field-depth,0)*var(--fl-indent));min-width:0;",
      "[data-field-def]{flex:1 1 0;min-width:0}",
      // One unwrapping row: the type never drops under its name; it wraps
      // inside its own column, 24px past the name column.
      "[data-field-row]{position:relative;display:flex;flex-wrap:nowrap;align-items:baseline;column-gap:var(--ds-space-6);",
      "--fl-row-pad:var(--docs-shape-row-pad,5px)",
      "overflow-wrap:anywhere;word-break:normal",
      "[data-field-row]:focus-visible{outline:var(--ds-border-width-focus) solid var(--docs-focus-ring,#0078df)",
      // Nested fields: the file tree's elbow connectors, ink at 75%.
      "--fl-guide:var(--docs-shape-child-rule,color-mix(in srgb,var(--docs-ink,#1f1f1f) 75%,transparent))",
      ".docs-tree__guides > i[data-g=\"end\"]::before",
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
    // Every object of this example is wider than the 40-column fold, so it prints expanded (the fixture comment).
    expect(exampleLine(1)?.getAttribute("data-link-key")).toBeNull();
    expect(exampleLine(17)?.getAttribute("data-link-key")).toBeNull();
    expect(exampleLine(4)?.getAttribute("data-link-key")).toBe("source.path source");
    expect(exampleLine(9)?.getAttribute("data-link-key")).toBe("fields.name fields");
    expect(exampleLine(14)?.getAttribute("data-link-key")).toBe("fields.required fields");
    expect(exampleLine(3)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(6)?.getAttribute("data-link-key")).toBe("source");
    expect(exampleLine(7)?.getAttribute("data-link-key")).toBe("fields");
    expect(exampleLine(16)?.getAttribute("data-link-key")).toBe("fields");
  });

  it("folds an object that fits in 40 columns onto one line that keys every field on it", () => {
    const fields: Field[] = [{ name: "label", type: "string" }, { name: "pos", type: "object", fields: [{ name: "x", type: "number" }, { name: "y", type: "number" }] }];
    const lines = buildShapeModel(fields, JSON.stringify({ label: "a label long enough to keep the root open", pos: { x: 1, y: 2 } })).exampleLines!;
    expect(lines).toHaveLength(4);
    expect(lines[2]!.linkKey).toEqual(["pos.y", "pos.x", "pos"]);
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
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("opens in a tooltip");
    expect(STATE_SHAPE_AGENT_DESCRIPTION).toContain("elbow connectors");
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

describe("StateShapeBlock — name column fit", () => {
  const shapeStyle = (fields: Field[]) => {
    render(<StateShapeBlock id="fit" name="Fit" fields={fields} />);
    return (document.querySelector('[data-docs-block-type="state-shape"]') as HTMLElement).style.getPropertyValue("--shape-name-fit");
  };

  it("gives short names a narrow column, so the type and description get the space", () => {
    expect(shapeStyle([{ name: "id", type: "number" }, { name: "url", type: "string" }])).toBe("10ch");
  });

  it("widens the column for a long or nested name, up to the shared 24ch column", () => {
    expect(shapeStyle([{ name: "entries", type: "Entry[]", fields: [{ name: "packageRoot", type: "string", required: false }] }])).toBe("16ch");
    cleanup();
    expect(shapeStyle([{ name: "aVeryLongFieldNameThatPassesTheCap", type: "string" }])).toBe("24ch");
  });

  it("keeps a string literal of a union type on one line", () => {
    render(<StateShapeBlock id="lit" fields={[{ name: "set", type: '"climb" | "held-out"' }]} />);
    expect(sheet()).toContain('[data-docs-block-type="state-shape"] [data-type-tok="string"]{white-space:nowrap}');
    expect(Array.from(document.querySelectorAll('[data-type-tok="string"]')).map((n) => n.textContent)).toEqual(['"climb"', '"held-out"']);
  });
});

describe("StateShapeBlock — optionality legend and path wrapping", () => {
  const legend = () => document.querySelector("[data-shape-legend]");

  it("says every field is required when no field is optional", () => {
    render(<StateShapeBlock id="req" fields={[{ name: "url", type: "string" }, { name: "pid", type: "number" }]} />);
    expect(legend()?.textContent).toBe("Every field is required.");
  });

  it("explains the ? marker when a nested field is optional", () => {
    render(<StateShapeBlock id="opt" fields={[{ name: "source", type: "object", fields: [{ name: "symbol", type: "string", required: false }] }]} />);
    expect(legend()?.getAttribute("data-shape-legend")).toBe("optional");
    expect(legend()?.textContent).toBe("? marks an optional field. Every other field is required.");
  });

  it("breaks a path value only after a slash, and leaves prose strings whole", () => {
    render(<StateShapeBlock id="path" fields={[{ name: "root", type: "string" }, { name: "note", type: "string" }]} example={JSON.stringify({ root: "packages/docs-mcp/src", note: "a and/or b" })} />);
    const [root, note] = Array.from(document.querySelectorAll('[data-json-token="string"]'));
    expect(Array.from(root!.querySelectorAll("[data-json-seg]")).map((n) => n.textContent)).toEqual(['"packages/', "docs-mcp/", 'src"']);
    expect(root!.querySelectorAll("wbr")).toHaveLength(2);
    expect(note!.querySelector("[data-json-seg]")).toBeNull();
  });
});

describe("StateShapeBlock — code in descriptions", () => {
  it("sets each backtick span of a description as code and hides the backticks", () => {
    render(<StateShapeBlock id="code" fields={[{ name: "replace", type: "string", description: 'What to write. `""` deletes the word; `daemonFetch` reads it.' }]} />);
    const note = document.querySelector('[data-field-token="note"]')!;
    expect(Array.from(note.querySelectorAll("[data-note-code]")).map((n) => n.textContent)).toEqual(['""', "daemonFetch"]);
    expect(note.textContent).toBe('What to write. "" deletes the word; daemonFetch reads it.');
  });

  it("keeps a short code span on one line and lets a long one wrap", () => {
    render(<StateShapeBlock id="wrap" fields={[{ name: "token", type: "string", description: "Sent as `Authorization: Bearer <token>` or `" + "x".repeat(40) + "`." }]} />);
    expect(Array.from(document.querySelectorAll("[data-note-code]")).map((n) => n.getAttribute("data-note-code"))).toEqual(["", "long"]);
    expect(sheet()).toContain('[data-docs-block-type="state-shape"] [data-note-code]{font-family:var(--docs-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);color:var(--docs-shape-name,var(--syntax-key,#9cdcfe));white-space:nowrap}');
  });

  it("prints a description with no backticks as plain text", () => {
    render(<StateShapeBlock id="plain" fields={[{ name: "pid", type: "number", description: "Process ID." }]} />);
    expect(document.querySelector("[data-note-code]")).toBeNull();
  });
});
