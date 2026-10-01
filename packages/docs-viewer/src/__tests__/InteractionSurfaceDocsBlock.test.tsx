import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
  signatureTail,
  type InteractionSurfaceOperation,
} from "../components/interaction-surface/InteractionSurfaceDocsBlock";

afterEach(() => {
  cleanup();
});

function opRow(operationName: string): Element | null {
  return document.querySelector(`[data-interaction-operation="${operationName}"]`);
}

function summaryOf(operationName: string): HTMLElement {
  const summary = opRow(operationName)?.querySelector<HTMLElement>(":scope > details > summary");
  if (!summary) throw new Error(`no summary row for ${operationName}`);
  return summary;
}

/** The op's signature text per CodeLines row, in order. */
function sigLines(operationName: string): string[] {
  return Array.from(opRow(operationName)?.querySelectorAll("[data-op-sig] [data-code-line]") ?? []).map(
    (line) => line.querySelector('[data-line-text="true"]')?.textContent ?? "",
  );
}

function sheet(): string {
  return Array.from(document.querySelectorAll('[data-docs-block-type="interaction-surface"] style'))
    .map((style) => style.textContent ?? "")
    .join("\n");
}

describe("InteractionSurfaceBlock — one reference panel", () => {
  it("puts the title, as written, in the panel head beside the family tile", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-1"
        title="file-tree entry operations"
        operations={[{ name: "file-tree.addEntry", params: [{ name: "path", type: "string" }] }]}
      />,
    );
    expect(document.querySelector("[data-card-shell]")).toBeNull();
    const header = document.querySelector("[data-operations-header]") as HTMLElement;
    expect(header.querySelector("[data-ref-tile]")?.getAttribute("aria-hidden")).toBe("true");
    // Not title-cased: the author's words stand.
    expect(header.querySelector("[data-operations-title]")?.textContent).toBe("file-tree entry operations");
    expect(document.querySelector("[data-operations-count]")).toBeNull();
  });

  it("falls back to a plain Operations head without a title", () => {
    render(<InteractionSurfaceBlock id="surface-untitled" operations={[{ name: "only.op" }]} />);
    expect(document.querySelector("[data-operations-title]")?.textContent).toBe("Operations");
  });

  it("keeps the real dotted name everywhere: line, signature, and DOM hook", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-names"
        operations={[
          { name: "state-shape.addField", params: [{ name: "field", type: "Field" }] },
          { name: "insertBlock", params: [{ name: "blockId", type: "string" }] },
        ]}
      />,
    );
    const name = summaryOf("state-shape.addField").querySelector("[data-operation-name]") as HTMLElement;
    // A span, not <code>: hosts paint inline-code chips on every <code>.
    expect(name.tagName).toBe("SPAN");
    expect(name.firstChild?.textContent).toBe("state-shape.addField");
    expect(sigLines("state-shape.addField")[0]).toBe("state-shape.addField(");
    expect(sigLines("insertBlock")[0]).toBe("insertBlock(");
    expect(document.body.textContent).not.toContain("Add Field");
  });

  it("preserves the signature grammar, one param per line, with a → return", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-2"
        operations={[
          {
            name: "file-tree.addEntry",
            description: "Append a path entry to the tree",
            params: [
              { name: "path", type: "string", required: true },
              { name: "note", type: "string", required: false },
            ],
            returns: "props patch",
          },
          { name: "file-tree.removeEntry", params: [{ name: "path", type: "string" }] },
          { name: "state.snapshot", returns: "State" },
          { name: "state.reset" },
        ]}
      />,
    );
    expect(sigLines("file-tree.addEntry")).toEqual(["file-tree.addEntry(", "  path: string,", "  note?: string,", ") → props patch"]);
    expect(sigLines("file-tree.removeEntry")).toEqual(["file-tree.removeEntry(", "  path: string,", ")"]);
    // Zero-param operations stay on one line.
    expect(sigLines("state.snapshot")).toEqual(["state.snapshot() → State"]);
    expect(sigLines("state.reset")).toEqual(["state.reset()"]);
    // The purpose is on the line, never in the signature.
    expect(opRow("file-tree.addEntry")?.querySelector("[data-operation-purpose]")?.textContent).toBe("Append a path entry to the tree");
    expect(opRow("file-tree.addEntry")?.querySelector("[data-code-lines]")?.textContent).not.toContain("Append");
  });

  it("renders nested param fields as an indented object literal", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-nested"
        operations={[
          {
            name: "table.walk",
            params: [
              {
                name: "opts",
                required: false,
                fields: [
                  { name: "depth", type: "number" },
                  { name: "filter", type: "string", required: false },
                ],
              },
            ],
          },
        ]}
      />,
    );
    expect(sigLines("table.walk")).toEqual(["table.walk(", "  opts?: {", "    depth: number,", "    filter?: string,", "  },", ")"]);
  });

  it("tags signature tokens with code syntax roles, params as the property role", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-tokens"
        operations={[{ name: "state.update", params: [{ name: "key", type: "string", required: true }, { name: "value", required: false }], returns: "State" }]}
      />,
    );
    const op = opRow("state.update")!;
    expect(sigLines("state.update")).toEqual(["state.update(", "  key: string,", "  value?,", ") → State"]);
    expect(op.querySelector('[data-sig-token="name"]')?.textContent).toBe("state.update");
    expect(op.querySelector('[data-sig-token="param"]')?.textContent).toBe("key");
    expect(op.querySelector('[data-sig-token="type"] [data-sig-token="type-name"]')?.textContent).toBe("string");
    const returns = op.querySelector('[data-sig-token="returns"]');
    expect(returns?.textContent).toBe(" → State");
    expect(returns?.querySelector('[data-sig-token="type-name"]')?.textContent).toBe("State");
    expect(op.querySelector('[data-sig-token="optional"]')?.textContent).toBe("?");
    const css = sheet();
    expect(css).toContain('[data-op-sig] [data-sig-token="name"]{color:var(--docs-interaction-sig-name,var(--syntax-function,');
    expect(css).toContain('[data-op-sig] :is([data-sig-token="param"],[data-sig-token="key"]){color:var(--syntax-key,');
    expect(css).toContain('[data-op-sig] :is([data-sig-token="type"],[data-sig-token="type-name"]){color:var(--docs-interaction-sig-type,var(--syntax-type,');
    expect(css).toMatch(/\[data-op-sig\] :is\(\[data-sig-token="punct"\],\[data-sig-token="optional"\],\[data-sig-token="returns"\]\)\{color:var\(--docs-interaction-sig-punct,var\(--syntax-punctuation,/);
  });

  it("splits type text into Dark+ roles: type names, string literals, keys, punctuation", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-roles"
        operations={[
          {
            name: "decision_made",
            params: [
              { name: "answers", type: "Record<questionId, Decision result>", required: true },
              { name: "source", type: '"native" | "none"', required: true },
              { name: "onDone", type: "(result: { ok: boolean }) => void", required: false },
            ],
          },
        ]}
      />,
    );
    const op = opRow("decision_made")!;
    const roles = (line: number) =>
      Array.from(op.querySelectorAll("[data-op-sig] [data-code-line]")[line]!.querySelectorAll('[data-sig-token="type"] [data-sig-token]')).map(
        (token) => `${token.getAttribute("data-sig-token")}:${token.textContent}`,
      );
    expect(roles(1)).toEqual(["type-name:Record", "punct:<", "type-name:questionId", "punct:,", "type-name:Decision", "type-name:result", "punct:>"]);
    expect(roles(2)).toEqual(['string:"native"', "punct:|", 'string:"none"']);
    expect(roles(3)).toEqual(["punct:(", "key:result", "punct::", "punct:{", "key:ok", "punct::", "type-name:boolean", "punct:}", "punct:)", "keyword:=>", "type-name:void"]);
  });
});

describe("InteractionSurfaceBlock — operation rows", () => {
  const OPERATIONS: InteractionSurfaceOperation[] = [
    {
      name: "table.walk",
      kind: "query",
      description: "Walk the table",
      params: [
        { name: "opts", required: false, description: "Traversal options", fields: [{ name: "depth", type: "number", description: "How deep to walk" }, { name: "filter", type: "string", required: false }] },
        { name: "visitor", type: "fn" },
      ],
      returns: "Row[]",
    },
    { name: "table.put", kind: "action", params: [{ name: "cell", type: "string" }] },
    { name: "table.changed", kind: "event", returns: "() => void" },
    { name: "table.unbadged" },
  ];

  it("starts every operation closed, re-renders without resetting a toggle", () => {
    const { rerender } = render(<InteractionSurfaceBlock id="surface-rows" operations={OPERATIONS} />);
    for (const { name } of OPERATIONS) {
      const details = summaryOf(name).parentElement as HTMLDetailsElement;
      expect(details.hasAttribute("open")).toBe(false);
      expect(details.querySelector(":scope > [data-operation-body] [data-op-sig]")).not.toBeNull();
    }
    fireEvent.click(summaryOf("table.put"));
    rerender(<InteractionSurfaceBlock id="surface-rows" title="Renamed" operations={OPERATIONS} />);
    expect(summaryOf("table.put").parentElement?.hasAttribute("open")).toBe(true);
    expect(summaryOf("table.walk").parentElement?.hasAttribute("open")).toBe(false);
  });

  it("mirrors the open state onto the summary's aria-expanded", () => {
    render(<InteractionSurfaceBlock id="surface-aria" operations={OPERATIONS} />);
    const summary = summaryOf("table.walk");
    const details = summary.parentElement as HTMLDetailsElement;
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    details.open = false;
    details.dispatchEvent(new Event("toggle"));
    expect(summary.getAttribute("aria-expanded")).toBe("false");
  });

  it("draws each line as chevron, name with the collapsed signature tail, and a kind text badge", () => {
    render(<InteractionSurfaceBlock id="surface-rows" operations={OPERATIONS} />);
    for (const [name, kind] of [["table.walk", "query"], ["table.put", "action"], ["table.changed", "event"], ["table.unbadged", "action"]] as const) {
      const summary = summaryOf(name);
      expect(opRow(name)?.getAttribute("data-operation-kind")).toBe(kind);
      expect(summary.querySelector("[data-disclosure-chevron]")?.getAttribute("aria-hidden")).toBe("true");
      // The kind is a word, not a color or an icon alone.
      const badge = summary.querySelector("[data-operation-kind-badge]") as HTMLElement;
      expect(badge.getAttribute("data-operation-kind-badge")).toBe(kind);
      expect(badge.textContent).toBe(kind);
      expect(summary.querySelector("[data-operation-kind-icon]")).toBeNull();
      // Named by its name (with tail) and kind; described by its purpose.
      const nameEl = summary.querySelector("[data-operation-name]") as HTMLElement;
      expect(summary.getAttribute("aria-labelledby")).toBe(`${nameEl.id} ${badge.id}`);
    }
    expect(summaryOf("table.walk").querySelector("[data-operation-tail]")?.textContent).toBe("(opts?: {…}, visitor: fn) → Row[]");
    const purpose = summaryOf("table.walk").querySelector("[data-operation-purpose]") as HTMLElement;
    expect(purpose.textContent).toBe("Walk the table");
    expect(summaryOf("table.walk").getAttribute("aria-describedby")).toBe(purpose.id);
    expect(summaryOf("table.put").hasAttribute("aria-describedby")).toBe(false);
  });

  it("builds the collapsed tail from top-level params and the return type", () => {
    expect(signatureTail({ name: "a.b" })).toBe("()");
    expect(signatureTail({ name: "a.b", params: [{ name: "x", type: "string" }, { name: "y", required: false }], returns: "R" })).toBe("(x: string, y?) → R");
  });

  it("gives every param a shared ledger row with its type and inline description", () => {
    render(<InteractionSurfaceBlock id="surface-notes" operations={OPERATIONS} />);
    const op = opRow("table.walk")!;
    expect(op.querySelector("[data-op-params] [data-op-section-label]")?.textContent).toBe("Parameters");
    const rows = Array.from(op.querySelectorAll("[data-op-params] [data-field-row]")) as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-param-note"))).toEqual(["table.walk.opts", "table.walk.opts.depth", "table.walk.opts.filter", "table.walk.visitor"]);
    expect(rows.map((row) => row.getAttribute("data-field-depth"))).toEqual(["0", "1", "1", "0"]);
    const opts = rows[0]!;
    expect(opts.querySelector('[data-field-token="name"]')?.textContent).toBe("opts");
    expect(opts.querySelector('[data-field-token="optional"] [data-sr-only]')?.textContent).toBe(" (optional)");
    expect(opts.querySelector('[data-field-token="description"]')?.textContent).toBe("Traversal options");
    expect(opts.querySelector('[role="tooltip"]')).toBeNull();
    expect(rows[2]!.querySelector('[data-field-token="type"]')?.textContent).toBe("string");
    expect(rows[2]!.querySelector('[data-field-token="description"]')).toBeNull();
    // No parameters: one muted line, not an empty ledger.
    expect(opRow("table.changed")?.querySelector("[data-op-none]")?.textContent).toBe("No parameters");
  });

  it("shows a bare return type beside the Returns label, the signature spanning both rows", () => {
    render(<InteractionSurfaceBlock id="surface-returns" operations={OPERATIONS} />);
    const returns = opRow("table.changed")?.querySelector("[data-op-returns]") as HTMLElement;
    expect(returns.querySelector("[data-op-section-label]")?.textContent).toBe("Returns() => void");
    expect(returns.querySelector("[data-op-return-type]")?.textContent).toBe("() => void");
    const grid = opRow("table.changed")?.querySelector("[data-op-grid]") as HTMLElement;
    expect(grid.hasAttribute("data-has-example")).toBe(false);
    expect(sheet()).toContain("[data-op-grid][data-has-ledger]:not([data-has-example])>[data-op-sig]{grid-row:1/span 2}");
    // An op with neither params nor returns is just its signature pane.
    const bare = opRow("table.unbadged")?.querySelector("[data-op-grid]") as HTMLElement;
    expect(bare.hasAttribute("data-has-ledger")).toBe(false);
    expect(bare.querySelector("[data-op-params]")).toBeNull();
    expect(bare.querySelector("[data-op-sig]")).not.toBeNull();
  });

  it("links ledger rows to signature lines: hover lights both sides, click pins, Escape clears", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-link"
        operations={[
          { name: "table.put", params: [{ name: "cell", description: "The target cell", fields: [{ name: "row", type: "number" }] }] },
          { name: "table.clear", params: [{ name: "cell", type: "string" }] },
        ]}
      />,
    );
    const put = opRow("table.put")!;
    const note = put.querySelector('[data-param-note="table.put.cell"]') as HTMLElement;
    const litLines = () => Array.from(put.querySelectorAll("[data-code-line][data-lit]")).map((line) => line.getAttribute("data-code-line"));
    fireEvent.mouseEnter(note);
    expect(litLines()).toEqual(["2", "3", "4"]);
    fireEvent.mouseLeave(note);
    const rowNote = put.querySelector('[data-param-note="table.put.cell.row"]') as HTMLElement;
    fireEvent.mouseEnter(rowNote);
    expect(litLines()).toEqual(["3"]);
    fireEvent.mouseLeave(rowNote);
    fireEvent.mouseEnter(note);
    // Same-named param in ANOTHER op never lights (separate LinkGroups).
    expect(opRow("table.clear")?.querySelectorAll("[data-lit]")).toHaveLength(0);
    fireEvent.mouseLeave(note);
    fireEvent.click(note);
    expect(put.querySelectorAll("[data-pinned]").length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(put.querySelectorAll("[data-pinned]")).toHaveLength(0);
  });

  it("shows a returned object as a Returns ledger beside its example, linked on its own", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-return"
        operations={[
          {
            name: "prepare",
            params: [{ name: "path", type: "string" }],
            returns: "Prepared",
            returnShape: { fields: [{ name: "path", type: "string", description: "Where it landed." }], example: '{"path":"src/a.ts"}' },
          },
        ]}
      />,
    );
    const card = opRow("prepare")!;
    expect(card.querySelectorAll("details")).toHaveLength(1);
    const output = card.querySelector("[data-operation-body] [data-operation-output]") as HTMLElement;
    expect(output.querySelector("[data-op-return-type]")?.textContent).toBe("Prepared");
    expect(output.querySelector('[data-shape-path="path"] [data-field-token="description"]')?.textContent).toBe("Where it landed.");
    const example = card.querySelector("[data-op-example]") as HTMLElement;
    expect(example.hasAttribute("data-code-surface")).toBe(true);
    expect(example.querySelector("[data-shape-example]")?.getAttribute("aria-label")).toBe("Prepared example");
    expect(card.querySelector("[data-op-grid]")?.getAttribute("data-has-example")).toBe("true");
    fireEvent.mouseEnter(output.querySelector('[data-shape-path="path"]')!);
    expect(example.querySelectorAll("[data-code-line][data-lit]").length).toBeGreaterThan(0);
    // The returned field and the same-named param never light each other.
    expect(card.querySelectorAll("[data-op-sig] [data-lit]")).toHaveLength(0);
  });

  it("makes both code panes focusable labelled regions on the code surface", () => {
    render(<InteractionSurfaceBlock id="surface-panes" operations={OPERATIONS} />);
    const sig = opRow("table.walk")?.querySelector("[data-op-sig]") as HTMLElement;
    expect(sig.hasAttribute("data-code-surface")).toBe(true);
    expect(sig.hasAttribute("data-ref-code")).toBe(true);
    const region = sig.querySelector("[data-code-lines]") as HTMLElement;
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("table.walk signature");
  });

  it("preserves targeting attributes; the section is the panel", () => {
    render(<InteractionSurfaceBlock id="surface-one" operations={[{ name: "only.op" }]} />);
    const section = document.querySelector('[data-docs-block-type="interaction-surface"]');
    expect(section?.getAttribute("data-source-id")).toBe("surface-one");
    expect(section?.className).toContain("not-prose");
    expect(section?.className).not.toContain("max-w-");
    expect(section?.className).not.toContain("mx-auto");
    expect(screen.queryByText("1 operation")).toBeNull();
  });

  it("exports the label and an agent description covering the props contract", () => {
    expect(INTERACTION_SURFACE_LABEL).toBe("Interaction Surface");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("operations");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("required?: boolean");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain('"action" | "query" | "event"');
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("returnShape");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("State Shape");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("real dotted name");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("start collapsed as one-line rows");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("open on click, Enter, or Space");
  });
});

describe("InteractionSurfaceBlock style-rail tokens", () => {
  function renderSurface() {
    render(
      <InteractionSurfaceBlock
        id="surface-tokens"
        title="Tokens"
        operations={[
          { name: "table.walk", kind: "query", description: "Walk the table", params: [{ name: "opts", description: "Traversal options", fields: [{ name: "depth", type: "number" }] }], returns: "Row[]" },
          { name: "table.count", returns: "number" },
        ]}
      />,
    );
    return sheet();
  }

  it("maps its knobs onto the panel, the line, and the shared ledger locals", () => {
    const css = renderSurface();
    for (const declaration of [
      // Panel frame.
      "background:var(--docs-interaction-bg,var(--docs-shape-bg,var(--docs-panel,#f8f8f7)))",
      "border:var(--docs-interaction-border-width,1px) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))",
      "border-radius:var(--docs-interaction-radius,var(--radius,2px))",
      "--op-pad-x:var(--docs-interaction-pad-x,12px)",
      "--op-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--docs-rule-soft,#efeeec)))",
      "--op-rule-w:var(--docs-interaction-rule-width,1px)",
      // Title in the head.
      "font-size:var(--docs-interaction-title-text-size,13.5px);font-weight:var(--docs-interaction-title-weight,600)",
      "color:var(--docs-interaction-title-fg,var(--docs-ink,#1f1f1f))",
      // Operation line: the name in the function role.
      "padding:var(--docs-interaction-header-pad-y,9px) 0",
      "font-size:var(--docs-interaction-header-text-size,13px);font-weight:var(--docs-interaction-header-weight,500)",
      "color:var(--docs-interaction-header-fg,var(--docs-syn-fn,#0b6e99))",
      "font-size:var(--docs-interaction-desc-text-size,13.5px);line-height:var(--docs-interaction-desc-line-height,20px)",
      // Section labels at a readable size.
      "padding:var(--docs-interaction-column-head-pad-y,8px) var(--op-pad-x) 4px;font-size:var(--docs-interaction-column-head-text-size,13.5px)",
      "color:var(--docs-interaction-column-head-fg,var(--docs-shape-muted,var(--docs-muted,#666562)))",
      // Ledger locals: this block's knob first, State Shape behind it.
      "--fl-row-pad:var(--docs-interaction-row-pad,4px)",
      "--fl-indent:var(--docs-interaction-indent,16px)",
      "--fl-name:var(--docs-interaction-note-name,var(--docs-shape-name,var(--docs-syn-prop,#0d7164)))",
      "--fl-name-weight:var(--docs-interaction-note-name-weight,500)",
      "--fl-name-size:var(--docs-interaction-note-name-text-size,13px)",
      "--fl-type:var(--docs-interaction-note-type,var(--docs-shape-type,var(--docs-syn-type,#805f01)))",
      "--fl-type-size:var(--docs-interaction-note-type-text-size,13px)",
      "--fl-desc:var(--docs-interaction-note-fg,var(--docs-shape-desc-fg,var(--docs-muted,#666562)))",
      "--fl-guide:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,var(--docs-rule,#e6e5e3)))",
      // The kind badge reads the role tokens: text, line, and soft fill.
      '[data-operation-kind-badge="query"]{--op-kind:var(--docs-kind-query,#0b6e99);--op-kind-line:var(--docs-kind-query-line,',
      "font-size:12px;font-weight:500",
      // Focus ring and hover on the line.
      "[data-disclosure]>summary:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df);outline-offset:-2px}",
      "[data-disclosure]>summary:hover{background:var(--docs-hover,",
      // Ledger beside the signature at the shared split.
      "grid-template-columns:minmax(0,var(--docs-pane-split,46%)) minmax(0,1fr)",
    ]) {
      expect([declaration, css.includes(declaration)]).toEqual([declaration, true]);
    }
  });

  it("leaves rail vars for the rail: no block-level re-declaration, no pinned values, no sub-12px text", () => {
    const css = renderSurface();
    expect(css).not.toMatch(/--docs-(interaction|operation)-[a-z-]+\s*:/);
    expect(css).not.toContain("!important");
    expect(css).not.toContain("--docs-operation-");
    expect(css).not.toContain("text-transform:uppercase");
    expect(css).not.toMatch(/font-size:(10|11|10\.5|11\.5)px/);
    expect(css).not.toMatch(/\[data-code-line\]\{[^}]*font-size/);
    expect(css).not.toContain("radial-gradient");
  });
});

describe("native return-shape descriptor", () => {
  it("retains output fields and example with independent linking", async () => {
    const { descriptors } = await import("../components/interaction-surface/descriptor");
    const node = descriptors[0]!.render(
      { id: "native-return", type: "interaction-surface", props: { operations: [{ name: "prepare", params: [{ name: "path", type: "string" }], returns: "Prepared", returnShape: { fields: [{ name: "path", type: "string" }], example: '{"path":"src/a.ts"}' } }] }, children: [] },
      { renderText: () => null, renderChildren: () => null, renderMarkdown: () => null },
    );
    render(<>{node}</>);
    const output = document.querySelector("[data-operation-output]")!;
    expect(output.querySelector("[data-op-return-type]")?.textContent).toBe("Prepared");
    expect(document.querySelector("[data-op-example] [data-shape-example]")?.textContent).toContain("src/a.ts");
    fireEvent.mouseEnter(output.querySelector('[data-shape-path="path"]')!);
    expect(document.querySelectorAll("[data-op-example] [data-code-line][data-lit]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-op-sig] [data-lit]")).toHaveLength(0);
  });

  it("rejects malformed returned fields instead of silently dropping them", async () => {
    const { descriptors } = await import("../components/interaction-surface/descriptor");
    for (const returnShape of [{ fields: [{ type: "string" }] }, { fields: [], example: 42 }]) {
      const node = descriptors[0]!.render(
        { id: "invalid-output", type: "interaction-surface", props: { operations: [{ name: "prepare", returnShape }] }, children: [] },
        { renderText: () => null, renderChildren: () => null, renderMarkdown: () => null },
      );
      const { container, unmount } = render(<>{node}</>);
      expect(container.textContent).toContain("Invalid Interaction Surface block");
      unmount();
    }
  });
});
