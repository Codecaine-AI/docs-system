import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
} from "../components/interaction-surface/InteractionSurfaceDocsBlock";

afterEach(() => {
  cleanup();
});

function opRow(operationName: string): Element | null {
  return document.querySelector(`[data-interaction-operation="${operationName}"]`);
}

/** The op's signature text per CodeLines row (gutter number excluded), in order. */
function sigLines(operationName: string): string[] {
  return Array.from(opRow(operationName)?.querySelectorAll("[data-code-line]") ?? []).map(
    (line) => line.querySelector('[data-line-text="true"]')?.textContent ?? "",
  );
}

describe("InteractionSurfaceBlock", () => {
  it("renders a caption title above a bare card — no header bar", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-1"
        title="File-tree block surface"
        operations={[
          {
            name: "file-tree.addEntry",
            description: "Append a path entry to the tree",
            params: [{ name: "path", type: "string", required: true }],
            returns: "props patch",
          },
        ]}
      />,
    );

    expect(document.querySelector("[data-card-shell]")).toBeNull();
    expect(document.querySelector("[data-operations-title]")?.textContent).toBe("File-Tree Block Surface");
    expect(document.querySelectorAll("[data-operation-card-header]")).toHaveLength(1);
    expect(document.querySelector("[data-operations-count]")).toBeNull();
  });

  it("renders no caption at all when the block has no title", () => {
    render(<InteractionSurfaceBlock id="surface-untitled" operations={[{ name: "only.op" }]} />);
    expect(screen.queryByText("operations")).toBeNull();
    expect(document.querySelector("[data-card-shell-label]")).toBeNull();
  });

  it("titles each operation with its bare verb — namespace stripped", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-verbs"
        operations={[
          { name: "state-shape.addField", params: [{ name: "field", type: "Field" }] },
          { name: "state-shape.removeField", params: [{ name: "path", type: "string" }] },
          { name: "insertBlock", params: [{ name: "blockId", type: "string" }] },
        ]}
      />,
    );

    // data-interaction-operation keeps the FULL name; the display is bare.
    expect(sigLines("state-shape.addField")[0]).toBe("addField(");
    expect(sigLines("state-shape.removeField")[0]).toBe("removeField(");
    // Namespace-free names display unchanged.
    expect(sigLines("insertBlock")[0]).toBe("insertBlock(");
  });

  it("falls back to full names when bare verbs would collide within the block", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-collide"
        operations={[
          { name: "structured-table.updateCell" },
          { name: "grid.updateCell" },
        ]}
      />,
    );
    expect(sigLines("structured-table.updateCell")).toEqual(["structured-table.updateCell()"]);
    expect(sigLines("grid.updateCell")).toEqual(["grid.updateCell()"]);
  });

  it("preserves the signature grammar through numbered CodeLines rows", () => {
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
        ]}
      />,
    );

    expect(sigLines("file-tree.addEntry")).toEqual([
      "addEntry(",
      "  path: string,",
      "  note?: string,",
      ") -> props patch",
    ]);
    expect(sigLines("file-tree.removeEntry")).toEqual([
      "removeEntry(",
      "  path: string,",
      ")",
    ]);

    // Numbering restarts per op; zebra on even lines.
    const first = Array.from(opRow("file-tree.addEntry")?.querySelectorAll("[data-code-line]") ?? []);
    expect(first.map((line) => line.getAttribute("data-code-line"))).toEqual(["1", "2", "3", "4"]);
    expect(first[1]?.className).toContain("--docs-zebra");
    expect(first[0]?.className).not.toContain("--docs-zebra");
    const second = Array.from(
      opRow("file-tree.removeEntry")?.querySelectorAll("[data-code-line]") ?? [],
    );
    expect(second.map((line) => line.getAttribute("data-code-line"))).toEqual(["1", "2", "3"]);

    // The description lands in the notes pane, never in the signature.
    expect(opRow("file-tree.addEntry")?.querySelector('[data-operation-purpose]')?.textContent).toBe(
      "Append a path entry to the tree",
    );
    expect(opRow("file-tree.addEntry")?.querySelector("[data-code-lines]")?.textContent).not.toContain(
      "Append",
    );
  });

  it("keeps zero-param operations on one line", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-zero"
        operations={[{ name: "state.snapshot", returns: "State" }, { name: "state.reset" }]}
      />,
    );
    expect(sigLines("state.snapshot")).toEqual(["snapshot() -> State"]);
    expect(sigLines("state.reset")).toEqual(["reset()"]);
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
                description: "Traversal options",
                fields: [
                  { name: "depth", type: "number", description: "How deep to walk" },
                  { name: "filter", type: "string", required: false },
                ],
              },
            ],
          },
        ]}
      />,
    );
    expect(sigLines("table.walk")).toEqual([
      "walk(",
      "  opts?: {",
      "    depth: number,",
      "    filter?: string,",
      "  },",
      ")",
    ]);
  });

  it("gives EVERY param a note row — described or not — with name and type", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-notes"
        operations={[
          {
            name: "table.walk",
            description: "Walk the table",
            params: [
              {
                name: "opts",
                required: false,
                description: "Traversal options",
                fields: [
                  { name: "depth", type: "number", description: "How deep to walk" },
                  { name: "filter", type: "string", required: false },
                ],
              },
              { name: "visitor", type: "fn" },
            ],
          },
        ]}
      />,
    );

    const op = opRow("table.walk");
    // Headline first.
    expect(op?.querySelector('[data-operation-purpose]')?.textContent).toBe("Walk the table");
    // opts spans its braces (L2–5); children indent one step.
    const opts = op?.querySelector('[data-param-note="table.walk.opts"]');
    expect(opts?.querySelector("[data-range-chip]")).toBeNull();
    const description = opts?.querySelector("[data-note-description]");
    expect(description?.textContent).toContain("Traversal options");
    expect(description?.getAttribute("role")).toBe("tooltip");
    expect(description?.className).toContain("--docs-shape-desc-fg");
    const describedName = opts?.querySelector("[data-note-name]");
    expect(describedName?.getAttribute("data-has-description")).toBe("true");
    expect(describedName?.getAttribute("tabindex")).toBe("0");
    expect(describedName?.getAttribute("aria-describedby")).toBe(description?.id);
    expect(opts?.querySelector('[data-described="true"]')).not.toBeNull();
    expect(describedName?.closest('[data-name-row="true"]')).not.toBeNull();
    const depth = op?.querySelector('[data-param-note="table.walk.opts.depth"]');
    // Children nest inside the parent's group behind a left rule.
    expect(depth?.getAttribute("data-note-indent")).toBe("1");
    expect(depth?.closest("[data-note-children]")).not.toBeNull();
    expect(
      depth?.closest('[data-note-group="table.walk.opts"]'),
    ).not.toBeNull();
    // UNDESCRIBED params still get rows: name · type · chip, no description div.
    const filter = op?.querySelector('[data-param-note="table.walk.opts.filter"]');
    expect(filter).not.toBeNull();
    expect(filter?.querySelector("[data-note-name]")?.textContent).toContain("filter");
    expect(filter?.querySelector("[data-note-type]")?.textContent).toContain("string");
    expect(filter?.querySelector("[data-note-description]")).toBeNull();
    expect(filter?.querySelector("[data-note-name]")?.getAttribute("data-has-description")).toBeNull();
    expect(filter?.querySelector("[data-note-name]")?.getAttribute("tabindex")).toBeNull();
    expect(filter?.querySelector("[data-note-name]")?.getAttribute("aria-describedby")).toBeNull();
    expect(filter?.querySelector('[data-described="true"]')).toBeNull();
    const visitor = op?.querySelector('[data-param-note="table.walk.visitor"]');
    expect(visitor).not.toBeNull();
    // The blue L# range chips are gone everywhere.
    expect(document.querySelector("[data-range-chip]")).toBeNull();
  });

  it("injects hover, keyboard-focus, and print tooltip styles", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-styles"
        operations={[
          { name: "table.walk", params: [{ name: "path", description: "Path to visit" }] },
        ]}
      />,
    );
    const styles = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(styles).toContain(":has(:focus-visible)");
    expect(styles).toContain("@media print");
    expect(styles).toContain("[data-described]{display:contents}");
    expect(styles).toContain("flex-basis:100%");
    expect(styles).toMatch(/\[data-param-note\]:has\(\[data-described\]:hover\)[^{]*\{position:relative;z-index:31\}/);
  });

  it("opens each operation card with its name and aligned Field, Type, and Signature headers", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-headers"
        operations={[
          {
            name: "state-shape.addField",
            description: "Insert a field.",
            params: [{ name: "field", type: "Field" }],
          },
        ]}
      />,
    );
    const op = opRow("state-shape.addField");
    expect(op?.querySelector("[data-operation-card-header] h4")?.textContent).toBe("Add Field");
    expect(op?.querySelector("[data-note-ledger-head]")?.textContent).toBe("FieldType");
    expect(op?.querySelector("[data-signature-head]")?.textContent).toBe("Signature");
    expect(op?.querySelector("[data-operation-purpose]")?.textContent).toBe("Insert a field.");
  });

  it("uses the same field headers without a redundant description heading", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-no-desc"
        operations={[{ name: "table.clear", params: [{ name: "cell", type: "string" }] }]}
      />,
    );
    const op = opRow("table.clear");
    expect(op?.querySelector("[data-note-ledger-head]")?.textContent).toBe("FieldType");
    expect(op?.querySelector("[data-op-params-header]")).toBeNull();
  });

  it("links note rows to signature line spans: hover lights both sides, click pins, Escape clears", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-link"
        operations={[
          {
            name: "table.put",
            params: [
              {
                name: "cell",
                description: "The target cell",
                fields: [{ name: "row", type: "number" }],
              },
            ],
          },
          { name: "table.clear", params: [{ name: "cell", type: "string" }] },
        ]}
      />,
    );

    const put = opRow("table.put");
    const note = put?.querySelector('[data-param-note="table.put.cell"]') as HTMLElement;
    fireEvent.mouseEnter(note);
    // The parent extent paints CONTIGUOUSLY, brace to brace — interior
    // lines carry their chain, so the ancestor's activation lights them.
    const lit = Array.from(put?.querySelectorAll("[data-code-line][data-lit]") ?? []).map((line) =>
      line.getAttribute("data-code-line"),
    );
    expect(lit).toEqual(["2", "3", "4"]);
    fireEvent.mouseLeave(note);
    // Pointing at the deeper param activates only its own line.
    const rowNote = put?.querySelector('[data-param-note="table.put.cell.row"]') as HTMLElement;
    fireEvent.mouseEnter(rowNote);
    expect(
      Array.from(put?.querySelectorAll("[data-code-line][data-lit]") ?? []).map((line) =>
        line.getAttribute("data-code-line"),
      ),
    ).toEqual(["3"]);
    fireEvent.mouseLeave(rowNote);
    fireEvent.mouseEnter(note);
    // Same-named param in ANOTHER op never lights (separate LinkGroups).
    expect(opRow("table.clear")?.querySelectorAll("[data-lit]")).toHaveLength(0);
    fireEvent.mouseLeave(note);
    expect(put?.querySelectorAll("[data-lit]")).toHaveLength(0);
    // Pin survives hover-out; Escape clears.
    fireEvent.click(note);
    expect(put?.querySelectorAll("[data-pinned]").length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(put?.querySelectorAll("[data-pinned]")).toHaveLength(0);
  });

  it("collapses to a single column only when no op has params or a description", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-plain"
        operations={[{ name: "state.reset" }, { name: "state.rebuild" }]}
      />,
    );
    const op = opRow("state.reset");
    expect(op?.className).not.toContain("1.15fr");
    expect(document.querySelector("[data-op-notes]")).toBeNull();
  });

  it("labels every kind explicitly, with action as the default", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-kinds"
        operations={[
          { name: "state.reset", kind: "action" },
          { name: "state.snapshot", kind: "query", returns: "State" },
          { name: "state.changed", kind: "event" },
          { name: "state.unbadged" },
        ]}
      />,
    );
    for (const [name, kind] of [["reset","action"],["snapshot","query"],["changed","event"],["unbadged","action"]]) {
      const card = opRow("state." + name);
      expect(card?.getAttribute("data-operation-kind")).toBe(kind);
      expect(card?.querySelector("[data-operation-card-header]")?.textContent).toContain(kind);
    }
  });

  it("colorizes signature tokens: cyan name, amber types and returns, muted punctuation", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-tokens"
        operations={[
          {
            name: "state.update",
            params: [
              { name: "key", type: "string", required: true },
              { name: "value", required: false },
            ],
            returns: "State",
          },
        ]}
      />,
    );

    const op = opRow("state.update");
    expect(sigLines("state.update")).toEqual([
      "update(",
      "  key: string,",
      "  value?,",
      ") -> State",
    ]);
    const name = op?.querySelector('[data-sig-token="name"]');
    expect(name?.textContent).toBe("update");
    expect(name?.className).toContain("--docs-operations-accent");
    const type = op?.querySelector('[data-sig-token="type"]');
    expect(type?.className).toContain("--docs-interaction-sig-type");
    const returns = op?.querySelector('[data-sig-token="returns"]');
    expect(returns?.textContent).toBe(" -> State");
    const optional = op?.querySelector('[data-sig-token="optional"]');
    expect(optional?.textContent).toBe("?");
    expect(optional?.className).toContain("--docs-operations-optional");
  });

  it("preserves targeting attributes without outer framing or count banners", () => {
    render(<InteractionSurfaceBlock id="surface-one" operations={[{ name: "only.op" }]} />);
    const section = document.querySelector('[data-docs-block-type="interaction-surface"]');
    expect(section?.getAttribute("data-source-id")).toBe("surface-one");
    // The block fills whatever layout lane the renderer puts it in: no own
    // max-width and no centering, so the wide lane is what bounds it.
    expect(section?.hasAttribute("data-operations-card-layout")).toBe(true);
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
    // The header + bare-verb display rules are stated for agents reading the doc view.
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("State Shape");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("Query");
  });
});

describe('native return-shape descriptor',()=>{
  it('retains output fields and example with independent linking',async()=>{
    const {descriptors}=await import('../components/interaction-surface/descriptor');
    const node=descriptors[0]!.render({id:'native-return',type:'interaction-surface',props:{operations:[{name:'prepare',params:[{name:'path',type:'string'}],returns:'Prepared',returnShape:{fields:[{name:'path',type:'string'}],example:'{"path":"src/a.ts"}'}}]},children:[]},{renderText:()=>null,renderChildren:()=>null,renderMarkdown:()=>null});
    render(<>{node}</>);const output=document.querySelector('[data-operation-output]')!;
    expect(output.querySelector('[data-shape-name]')?.textContent).toBe('Prepared');
    expect(output.querySelector('[data-shape-example]')?.textContent).toContain('src/a.ts');
    fireEvent.mouseEnter(output.querySelector('[data-shape-path="path"]')!);
    expect(output.querySelectorAll('[data-code-line][data-lit]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-op-sig] [data-lit]')).toHaveLength(0);
  });
  it('rejects malformed returned fields instead of silently dropping them',async()=>{
    const {descriptors}=await import('../components/interaction-surface/descriptor');
    for(const returnShape of [{fields:[{type:'string'}]},{fields:[],example:42}]){
      const node=descriptors[0]!.render({id:'invalid-output',type:'interaction-surface',props:{operations:[{name:'prepare',returnShape}]},children:[]},{renderText:()=>null,renderChildren:()=>null,renderMarkdown:()=>null});
      const {container,unmount}=render(<>{node}</>);expect(container.textContent).toContain('Invalid Interaction Surface block');unmount();
    }
  });
});
