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

/** The op's example-call text per CodeLines row, in order. */
function callLines(operationName: string): string[] {
  return Array.from(opRow(operationName)?.querySelectorAll("[data-op-call] [data-code-line]") ?? []).map(
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

  it("keeps the real dotted name everywhere: line and DOM hook", () => {
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
    expect(name.querySelector("[data-has-description]")?.textContent).toBe("state-shape.addField");
    // Colored as a member call: receiver (variable role), dot, method (function role).
    expect(name.querySelector('[data-sig-token="receiver"]')?.textContent).toBe("state-shape");
    expect(name.querySelector('[data-sig-token="name"]')?.lastChild?.textContent).toBe("addField");
    // Collapsed, params are elided: the full list is the signature pane's.
    expect(name.querySelector('[data-operation-tail]')?.textContent).toBe("(…)");
    expect(name.querySelector('[data-operation-tail] [data-sig-token="param"]')).toBeNull();
    expect(summaryOf("insertBlock").querySelector('[data-sig-token="receiver"]')).toBeNull();
    // The whole panel is one code surface (dark in both page modes).
    expect(document.querySelector('[data-docs-block-type="interaction-surface"]')?.getAttribute("data-code-surface")).toBe("true");
    expect(document.body.textContent).not.toContain("Add Field");
  });

  it("shows the authored example call as Dark+ code, never a typed signature", () => {
    const exampleCall = 'file-tree.addEntry({\n  path: "src/config.ts",\n  change: "added",\n  done: true,\n  depth: 2,\n})';
    render(
      <InteractionSurfaceBlock
        id="surface-call"
        operations={[
          {
            name: "file-tree.addEntry",
            description: "Append a path entry to the tree",
            params: [{ name: "path", type: "string" }, { name: "change", type: '"added" | "removed"', required: false }],
            returns: "FileTreeEntriesPatch",
            exampleCall,
          },
          { name: "file-tree.removeEntry", params: [{ name: "path", type: "string" }] },
        ]}
      />,
    );
    // The authored text, line for line; the purpose is never in the code.
    expect(callLines("file-tree.addEntry")).toEqual(exampleCall.split("\n"));
    expect(opRow("file-tree.addEntry")?.querySelector("[data-op-call]")?.textContent).not.toContain("Append");
    // No typed signature pane: names and types live in the params ledger only.
    expect(document.querySelector("[data-op-sig]")).toBeNull();
    const call = opRow("file-tree.addEntry")!.querySelector("[data-op-call]")!;
    const roles = (line: number) =>
      Array.from(call.querySelectorAll("[data-code-line]")[line]!.querySelectorAll("[data-sig-token]")).map((token) => `${token.getAttribute("data-sig-token")}:${token.textContent}`);
    expect(roles(0)).toEqual(["receiver:file-tree", "punct:.", "name:addEntry", "punct:(", "punct:{"]);
    expect(roles(1)).toEqual(["key:path", "punct::", 'string:"src/config.ts"', "punct:,"]);
    expect(roles(3)).toEqual(["key:done", "punct::", "boolean:true", "punct:,"]);
    expect(roles(4)).toEqual(["key:depth", "punct::", "number:2", "punct:,"]);
    // No exampleCall: the Call row is the params list alone, no empty pane.
    const remove = opRow("file-tree.removeEntry")!.querySelector('[data-op-row="call"]') as HTMLElement;
    expect(remove.querySelector("[data-op-call]")).toBeNull();
    expect(remove.hasAttribute("data-has-code")).toBe(false);
    expect(remove.querySelector("[data-op-params] [data-field-row]")).not.toBeNull();
  });

  it("colors code with the code syntax roles on the line, in the call, and in the Returns card head", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-tokens"
        operations={[{ name: "state.update", params: [{ name: "key", type: "string" }], returns: "(result: { ok: boolean }) => void", exampleCall: 'state.update({ key: "a" })' }]}
      />,
    );
    const rule = opRow("state.update")!.querySelector('[data-op-card-head="returns"] [data-op-return-type]')!;
    expect(Array.from(rule.querySelectorAll('[data-sig-token="type"] [data-sig-token]')).map((token) => `${token.getAttribute("data-sig-token")}:${token.textContent}`))
      .toEqual(["punct:(", "key:result", "punct::", "punct:{", "key:ok", "punct::", "type-name:boolean", "punct:}", "punct:)", "punct:=>", "keyword:void"]);
    const css = sheet();
    expect(css).toContain('[data-op-call] [data-sig-token="name"]{color:var(--docs-interaction-sig-name,var(--syntax-function,');
    // Operators read as typed (`=>` never a ligature) on the line, in the code panes, the ledgers and the
    // rules, beating code.css's per-line ligature rule (0,3,0).
    expect(css).toContain('[data-docs-block-type="interaction-surface"][data-docs-block-type] :is([data-operation-name],[data-operation-name] *,[data-op-row] [data-code-line],[data-op-row] [data-code-line] *,[data-op-row],[data-op-row] *,[data-op-card-head] *){font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0}');
    // The same roles color the call, the operation line, and the card heads.
    const sig = ":is([data-op-call],[data-operation-name],[data-op-card-head])";
    expect(css).toContain(`${sig} :is([data-sig-token="receiver"],[data-sig-token="param"],[data-sig-token="key"]){color:var(--syntax-key,`);
    expect(css).toContain(`${sig} :is([data-sig-token="type"],[data-sig-token="type-name"]){color:var(--docs-interaction-sig-type,var(--syntax-type,`);
    expect(css).toContain(`${sig} :is([data-sig-token="punct"],[data-sig-token="optional"],[data-sig-token="returns"]){color:var(--docs-interaction-sig-punct,var(--syntax-punctuation,`);
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
      expect(details.querySelector(":scope > summary [data-operation-tip]")).not.toBeNull();
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

  it("draws each line as chevron and described name with the elided tail; the kind and purpose live in the name's tooltip", () => {
    render(<InteractionSurfaceBlock id="surface-rows" operations={OPERATIONS} />);
    for (const [name, kind] of [["table.walk", "query"], ["table.put", "action"], ["table.changed", "event"], ["table.unbadged", "action"]] as const) {
      const summary = summaryOf(name);
      expect(opRow(name)?.getAttribute("data-operation-kind")).toBe(kind);
      expect(summary.querySelector("[data-disclosure-chevron]")?.getAttribute("aria-hidden")).toBe("true");
      // No visible badge or purpose line anywhere outside the tooltip.
      expect(opRow(name)!.querySelector("[data-operation-body] [data-operation-kind-badge]")).toBeNull();
      expect(opRow(name)!.querySelector("[data-operation-intro]")).toBeNull();
      // The name is a described name whose tooltip leads with the kind badge.
      const nameEl = summary.querySelector("[data-operation-name]") as HTMLElement;
      const target = nameEl.querySelector("[data-has-description]") as HTMLElement;
      const tip = nameEl.querySelector('[role="tooltip"][data-operation-tip]') as HTMLElement;
      expect(target.textContent).toBe(name);
      expect(tip.querySelector("[data-operation-kind-badge]")?.textContent).toBe(kind);
      // Inside the summary (already one tab stop) the name adds no second one.
      expect(target.hasAttribute("tabindex")).toBe(false);
      expect(target.hasAttribute("aria-describedby")).toBe(false);
      // The kind still reaches assistive tech while closed: the summary is
      // labelled by its name (with tail) and the visually hidden kind word.
      const kindEl = summary.querySelector("[data-operation-sr]") as HTMLElement;
      expect(kindEl.textContent).toBe(kind);
      expect(summary.getAttribute("aria-labelledby")).toBe(`${nameEl.id} ${kindEl.id}`);
    }
    expect(summaryOf("table.walk").querySelector("[data-operation-tail]")?.textContent).toBe("(…) → Row[]");
    expect(summaryOf("table.walk").querySelector("[data-operation-returns]")?.getAttribute("title")).toBe("Row[]");
    expect(summaryOf("table.changed").querySelector("[data-operation-tail]")?.textContent).toBe("() → () => void");
    expect(summaryOf("table.unbadged").querySelector("[data-operation-tail]")?.textContent).toBe("()");
    const css = sheet();
    expect(css).toContain("white-space:pre");
    expect(css).toContain("[data-operation-returns]{min-width:0;overflow:hidden;text-overflow:ellipsis}");
    // Keyboard: focusing the summary shows the tooltip; hover uses the shared dwell.
    expect(css).toContain("[data-operation-line]:focus-visible [data-description-tip]{opacity:1;visibility:visible");
    expect(css).toContain("transition-delay:var(--docs-tip-delay,450ms)");
    // The panel never clips the tooltip: no overflow clip on the block itself.
    expect(css).not.toMatch(/\[data-docs-block-type="interaction-surface"\]\{[^}]*overflow:hidden/);
    // The purpose is the tooltip's second line and the summary's description.
    const purpose = summaryOf("table.walk").querySelector("[data-operation-tip] [data-operation-tip-purpose]") as HTMLElement;
    expect(purpose.textContent).toBe("Walk the table");
    expect(summaryOf("table.walk").getAttribute("aria-describedby")).toBe(purpose.id);
    expect(summaryOf("table.put").hasAttribute("aria-describedby")).toBe(false);
  });

  it("builds the collapsed tail from elided params and the return type", () => {
    expect(signatureTail({ name: "a.b" })).toBe("()");
    expect(signatureTail({ name: "a.b", returns: "R" })).toBe("() → R");
    expect(signatureTail({ name: "a.b", params: [{ name: "x", type: "string" }, { name: "y", required: false }], returns: "R" })).toBe("(…) → R");
  });

  it("gives every param a shared ledger row with its type, the description as a name tooltip", () => {
    render(<InteractionSurfaceBlock id="surface-notes" operations={OPERATIONS} />);
    const op = opRow("table.walk")!;
    expect(op.querySelector('[data-op-card="params"] > [data-op-card-head]')?.textContent).toBe("Parameters");
    const rows = Array.from(op.querySelectorAll("[data-op-params] [data-field-row]")) as HTMLElement[];
    expect(rows.map((row) => row.getAttribute("data-param-note"))).toEqual(["table.walk.opts", "table.walk.opts.depth", "table.walk.opts.filter", "table.walk.visitor"]);
    expect(rows.map((row) => row.getAttribute("data-field-depth"))).toEqual(["0", "1", "1", "0"]);
    const opts = rows[0]!;
    expect(opts.querySelector('[data-field-token="name"]')?.textContent).toBe("opts");
    expect(opts.querySelector('[data-field-token="optional"] [data-sr-only]')?.textContent).toBe(" (optional)");
    // The shared ledger: the description opens as a tooltip on the focusable name.
    const tip = opts.querySelector('[data-field-token="description"]') as HTMLElement;
    expect(tip.textContent).toBe("Traversal options");
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(opts.querySelector('[data-field-token="name"]')?.getAttribute("aria-describedby")).toBe(tip.id);
    // Nested params hang off their parent with the file tree's elbows.
    expect(Array.from(rows[1]!.querySelectorAll(".docs-tree__guides > i")).map((guide) => guide.getAttribute("data-g"))).toEqual(["tee"]);
    expect(Array.from(rows[2]!.querySelectorAll(".docs-tree__guides > i")).map((guide) => guide.getAttribute("data-g"))).toEqual(["end"]);
    expect(rows[2]!.querySelector('[data-field-token="type"]')?.textContent).toBe("string");
    expect(rows[2]!.querySelector('[data-field-token="description"]')).toBeNull();
    // No parameters and no example call: no Parameters card, no empty ledger.
    expect(opRow("table.changed")?.querySelector('[data-op-card="params"]')).toBeNull();
    expect(opRow("table.changed")?.querySelector("[data-op-params]")).toBeNull();
  });

  it("puts Parameters and Returns in separate full-width cards; a bare return type is a Returns head alone", () => {
    render(<InteractionSurfaceBlock id="surface-returns" operations={OPERATIONS} />);
    const returns = opRow("table.changed")?.querySelector('[data-op-card="returns"]') as HTMLElement;
    expect(returns.querySelector("[data-op-card-head]")?.textContent).toBe("Returns() => void");
    expect(returns.querySelector("[data-op-return-type]")?.textContent).toBe("() => void");
    // No returnShape: the card is its head and nothing else.
    expect(returns.querySelector('[data-op-row="returns"]')).toBeNull();
    const cards = (name: string) => Array.from(opRow(name)!.querySelectorAll("[data-operation-body] [data-op-cards] > [data-op-card]")).map((card) => card.getAttribute("data-op-card"));
    expect(cards("table.changed")).toEqual(["returns"]);
    expect(cards("table.walk")).toEqual(["params", "returns"]);
    // Neither params, example call, nor returns: an empty body, no cards.
    expect(opRow("table.unbadged")?.querySelector("[data-op-cards]")).toBeNull();
    const css = sheet();
    // Full panel width (no side inset), so the ledger columns line up with a
    // State Shape's; 12px apart and 12px above the next operation.
    expect(css).toContain("[data-op-cards]{display:flex;flex-direction:column;gap:var(--ds-space-3);padding:0 0 var(--ds-space-3)}");
    // Raised a step toward ink, ruled top and bottom only (the panel frames the sides).
    expect(css).toContain("[data-op-card]{min-width:0;container-type:inline-size;background:color-mix(in srgb,var(--docs-ink,#1f1f1f) 5%,");
    expect(css).toContain("border-block:var(--op-rule-w) solid var(--docs-interaction-border,var(--docs-shape-border,var(--docs-rule,#e6e5e3)))}");
    // The head bar is a sans heading in ink.
    expect(css).toContain("font-size:var(--docs-interaction-column-head-text-size,13px);font-weight:var(--ds-font-weight-semibold);line-height:1.4;color:var(--docs-interaction-column-head-fg,var(--docs-ink,#1f1f1f))");
    // List beside code at the shared 44/56 split once the CARD (the size
    // container) is 560px; the code pane keeps at least 260px. Stacking is
    // the narrow-screen last resort only.
    expect(css).toContain("@container (min-width:560px){[data-op-row][data-has-list][data-has-code]{grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)}");
  });

  it("links param rows to the example-call lines that set them: hover lights both sides, click pins, Escape clears", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-link"
        operations={[
          { name: "table.put", params: [{ name: "cell", description: "The target cell", fields: [{ name: "row", type: "number" }] }], exampleCall: "table.put({\n  cell: {\n    row: 2,\n  },\n})" },
          { name: "table.clear", params: [{ name: "cell", type: "string" }], exampleCall: 'table.clear({ cell: "a" })' },
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
    expect(card.querySelector('[data-op-row="returns"]')?.getAttribute("data-has-code")).toBe("true");
    fireEvent.mouseEnter(output.querySelector('[data-shape-path="path"]')!);
    expect(example.querySelectorAll("[data-code-line][data-lit]").length).toBeGreaterThan(0);
    // The returned field and the same-named param never light each other.
    expect(card.querySelectorAll('[data-op-row="call"] [data-lit]')).toHaveLength(0);
  });

  it("makes both code panes focusable labelled regions on the code surface", () => {
    render(<InteractionSurfaceBlock id="surface-panes" operations={[{ ...OPERATIONS[0]!, exampleCall: "table.walk({ depth: 1 })" }]} />);
    const call = opRow("table.walk")?.querySelector("[data-op-call]") as HTMLElement;
    expect(call.hasAttribute("data-code-surface")).toBe(true);
    expect(call.hasAttribute("data-ref-code")).toBe(true);
    const region = call.querySelector("[data-code-lines]") as HTMLElement;
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("table.walk example call");
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
      "--op-pad-x:var(--docs-interaction-pad-x,16px)",
      "--fl-name-w:var(--docs-shape-name-width,24ch)",
      "--op-rule:var(--docs-interaction-rule,var(--docs-shape-rule,var(--docs-rule-soft,#efeeec)))",
      "--op-rule-w:var(--docs-interaction-rule-width,1px)",
      // Title in the head.
      "font-size:var(--docs-interaction-title-text-size,13.5px);font-weight:var(--docs-interaction-title-weight,600)",
      "color:var(--docs-interaction-title-fg,var(--docs-ink,#1f1f1f))",
      // Operation line: the name in the function role.
      "padding:var(--docs-interaction-header-pad-y,9px) 0",
      "font-size:var(--docs-interaction-header-text-size,13px);font-weight:var(--docs-interaction-header-weight,500)",
      '[data-operation-name] [data-sig-token="name"]{color:var(--docs-interaction-header-fg,var(--syntax-function,',
      "font-size:var(--docs-interaction-desc-text-size,13.5px);line-height:var(--docs-interaction-desc-line-height,20px)",
      // Card head bars.
      "padding:var(--docs-interaction-column-head-pad-y,8px) var(--op-pad-x);",
      "font-size:var(--docs-interaction-column-head-text-size,13px)",
      "color:var(--docs-interaction-column-head-fg,var(--docs-ink,#1f1f1f))",
      // Ledger locals: this block's knob first, State Shape behind it.
      "--fl-row-pad:var(--docs-interaction-row-pad,5px)",
      "--fl-indent:var(--docs-interaction-indent,16px)",
      "--fl-name:var(--docs-interaction-note-name,var(--docs-shape-name,var(--syntax-key,var(--docs-syn-prop,#0d7164))))",
      "--fl-name-weight:var(--docs-interaction-note-name-weight,500)",
      "--fl-name-size:var(--docs-interaction-note-name-text-size,13px)",
      "--fl-type:var(--docs-interaction-note-type,var(--docs-shape-type,var(--syntax-type,var(--docs-syn-type,#805f01))))",
      "--fl-type-size:var(--docs-interaction-note-type-text-size,13px)",
      "--fl-desc:var(--docs-interaction-note-fg,var(--docs-shape-desc-fg,var(--docs-muted,#666562)))",
      "--fl-guide:var(--docs-interaction-child-rule,var(--docs-shape-child-rule,var(--docs-rule,#e6e5e3)))",
      // The kind badge reads the role tokens: text, line, and soft fill.
      '[data-operation-kind-badge="query"]{--op-kind:var(--docs-kind-query,#0b6e99);--op-kind-line:var(--docs-kind-query-line,',
      "font-size:var(--ds-font-size-ui-xs);font-weight:var(--ds-font-weight-medium)",
      // Focus ring and hover on the line.
      "[data-disclosure]>summary:focus-visible{outline:2px solid var(--docs-focus-ring,#0078df);outline-offset:-2px}",
      "[data-disclosure]>summary:hover{background:var(--docs-hover,",
      // List beside code at the shared split.
      "grid-template-columns:minmax(min(360px,calc(100% - 260px)),var(--docs-pane-split,44%)) minmax(260px,1fr)",
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
    expect(document.querySelectorAll('[data-op-row="call"] [data-lit]')).toHaveLength(0);
  });

  it("passes an authored exampleCall through and rejects a non-string one", async () => {
    const { descriptors } = await import("../components/interaction-surface/descriptor");
    const renderOps = (operations: unknown[]) => descriptors[0]!.render(
      { id: "native-call", type: "interaction-surface", props: { operations }, children: [] },
      { renderText: () => null, renderChildren: () => null, renderMarkdown: () => null },
    );
    const { container, unmount } = render(<>{renderOps([{ name: "prepare", params: [{ name: "path", type: "string" }], exampleCall: 'prepare({ path: "src/a.ts" })' }])}</>);
    expect(container.querySelector('[data-op-call] [data-line-text="true"]')?.textContent).toBe('prepare({ path: "src/a.ts" })');
    unmount();
    const invalid = render(<>{renderOps([{ name: "prepare", exampleCall: 42 }])}</>);
    expect(invalid.container.textContent).toContain("Invalid Interaction Surface block");
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
