import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
} from "../docs-blocks/interaction-surface/InteractionSurfaceDocsBlock";

afterEach(() => {
  cleanup();
});

describe("InteractionSurfaceBlock", () => {
  it("renders one row per operation with its mono signature", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-1"
        title="File-tree block surface"
        operations={[
          {
            name: "file-tree.addEntry",
            description: "Append a path entry to the tree",
            params: [
              { name: "path", type: "string", required: true },
              { name: "note", type: "string", required: false },
            ],
            returns: "props patch",
            kind: "action",
          },
          { name: "file-tree.removeEntry", params: [{ name: "path", type: "string", required: true }] },
        ]}
      />,
    );

    expect(screen.getByText("File-tree block surface")).toBeTruthy();
    expect(screen.getByText("2 operations")).toBeTruthy();
    const rows = document.querySelectorAll("[data-interaction-operation]");
    expect(rows).toHaveLength(2);

    // Full signature text: name(params) -> returns, with `?` marking
    // required: false params.
    const addEntry = document.querySelector('[data-interaction-operation="file-tree.addEntry"]');
    expect(addEntry?.querySelector("code")?.textContent).toBe(
      "file-tree.addEntry(path: string, note?: string) -> props patch",
    );
    expect(addEntry?.textContent).toContain("Append a path entry to the tree");

    const removeEntry = document.querySelector(
      '[data-interaction-operation="file-tree.removeEntry"]',
    );
    expect(removeEntry?.querySelector("code")?.textContent).toBe(
      "file-tree.removeEntry(path: string)",
    );
  });

  it("renders kind badges with their per-kind tints (action=cyan, query=sky, event=violet)", () => {
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

    const action = screen.getByText("action");
    expect(action.className).toContain("cyan");
    const query = screen.getByText("query");
    expect(query.className).toContain("sky");
    const event = screen.getByText("event");
    expect(event.className).toContain("violet");
    // Dark-mode tint variants ride the same badge classes.
    expect(action.className).toContain("dark:");
    // An operation without a kind renders no badge in its row.
    const unbadged = document.querySelector('[data-interaction-operation="state.unbadged"]');
    expect(unbadged?.textContent).toBe("state.unbadged()");
  });

  it("renders params without types and threads param descriptions as title tooltips", () => {
    render(
      <InteractionSurfaceBlock
        id="surface-params"
        operations={[
          {
            name: "table.updateCell",
            params: [
              { name: "rowIndex", type: "number", required: true, description: "Row position" },
              { name: "column" },
            ],
          },
        ]}
      />,
    );

    const row = document.querySelector('[data-interaction-operation="table.updateCell"]');
    expect(row?.querySelector("code")?.textContent).toBe("table.updateCell(rowIndex: number, column)");
    expect(row?.querySelector('[title="Row position"]')).toBeTruthy();
  });

  it("pluralizes the operation-count badge", () => {
    render(<InteractionSurfaceBlock id="surface-one" operations={[{ name: "only.op" }]} />);
    expect(screen.getByText("1 operation")).toBeTruthy();
  });

  it("exports the label and an agent description covering the props contract", () => {
    expect(INTERACTION_SURFACE_LABEL).toBe("Interaction Surface");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("operations");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("required?: boolean");
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain('"action" | "query" | "event"');
    // The block is about operations on a state/system, explicitly not HTTP.
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("NOT HTTP");
  });
});
