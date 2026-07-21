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

    // The card-shell header bar is gone; the title is a plain bold caption.
    expect(document.querySelector("[data-card-shell]")).toBeNull();
    expect(document.querySelector("[data-card-shell-bar]")).toBeNull();
    expect(screen.queryByText("signature ↔ notes")).toBeNull();
    const title = screen.getByText("File-tree block surface");
    expect(title.className).toBe("mb-1.5 text-sm font-medium text-foreground");
    // The card keeps the interaction theme tokens.
    const section = document.querySelector('[data-docs-block-type="interaction-surface"]');
    const card = section?.querySelector("div.overflow-hidden");
    expect(card?.className).toContain("--docs-interaction-border");
    expect(card?.className).toContain("--docs-interaction-bg");
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
    expect(opRow("file-tree.addEntry")?.querySelector('[data-op-note="description"]')?.textContent).toBe(
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
    expect(op?.querySelector('[data-op-note="description"]')?.textContent).toBe("Walk the table");
    // opts spans its braces (L2–5); children indent one step.
    const opts = op?.querySelector('[data-param-note="table.walk.opts"]');
    expect(opts?.querySelector("[data-range-chip]")).toBeNull();
    expect(opts?.querySelector("[data-note-description]")?.textContent).toBe("Traversal options");
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
    const visitor = op?.querySelector('[data-param-note="table.walk.visitor"]');
    expect(visitor).not.toBeNull();
    // The blue L# range chips are gone everywhere.
    expect(document.querySelector("[data-range-chip]")).toBeNull();
  });

  it("opens each operation row with a humanized header pair: name left, Description right", () => {
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
    expect(op?.querySelector("[data-op-header]")?.textContent).toBe("Add Field");
    expect(op?.querySelector("[data-op-notes-header]")?.textContent).toBe("Description");
    // A "Params" section header separates the description from the rows.
    expect(op?.querySelector("[data-op-params-header]")?.textContent).toBe("Params");
  });

  it("labels the top notes band Params when the operation has no description", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-no-desc"
        operations={[{ name: "table.clear", params: [{ name: "cell", type: "string" }] }]}
      />,
    );
    const op = opRow("table.clear");
    expect(op?.querySelector("[data-op-notes-header]")?.textContent).toBe("Params");
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

  it("badges only query/event in the operation header (action is the unbadged default)", () => {
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
    const query = screen.getByText("query");
    expect(query.className).toContain("sky");
    expect(query.closest("[data-op-header]")).not.toBeNull();
    expect(screen.getByText("event").className).toContain("violet");
    expect(screen.queryByText("action")).toBeNull();
    expect(opRow("state.unbadged")?.querySelector("[data-op-header]")?.textContent).toBe("Unbadged");
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
    expect(name?.className).toContain("--docs-interaction-sig-name");
    const type = op?.querySelector('[data-sig-token="type"]');
    expect(type?.className).toContain("--docs-interaction-sig-type");
    const returns = op?.querySelector('[data-sig-token="returns"]');
    expect(returns?.textContent).toBe(" -> State");
    const optional = op?.querySelector('[data-sig-token="optional"]');
    expect(optional?.textContent).toBe("?");
    expect(optional?.className).toContain("--docs-interaction-sig-punct");
  });

  it("preserves targeting attributes without outer framing or count banners", () => {
    render(<InteractionSurfaceBlock id="surface-one" operations={[{ name: "only.op" }]} />);
    const section = document.querySelector('[data-docs-block-type="interaction-surface"]');
    expect(section?.getAttribute("data-source-id")).toBe("surface-one");
    expect(section?.className).toBe("not-prose my-4");
    expect(screen.queryByText("1 operation")).toBeNull();
  });

  it("exports the label and an agent description covering the props contract", () => {
    expect(INTERACTION_SURFACE_LABEL).toBe("Interaction Surface");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("operations");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("required?: boolean");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain('"action" | "query" | "event"');
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("NOT HTTP");
    // The header + bare-verb display rules are stated for agents reading the doc view.
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("Add Operation");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("bare-verb");
  });
});
