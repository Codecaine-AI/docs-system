import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  INTERACTION_SURFACE_AGENT_DESCRIPTION,
  INTERACTION_SURFACE_LABEL,
  InteractionSurfaceBlock,
} from "../components/interaction-surface/InteractionSurfaceDocsBlock";

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

    const title = screen.getByText("File-tree block surface");
    expect(title.className).toBe("mb-1.5 text-sm font-medium text-foreground");
    expect(screen.queryByText("Interaction Surface")).toBeNull();
    expect(screen.queryByText("2 operations")).toBeNull();
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

    const code = document.querySelector('[data-interaction-operation="state.update"] code');
    // The flat signature is still the code element's full textContent.
    expect(code?.textContent).toBe("state.update(key: string, value?) -> State");

    const name = code?.querySelector('[data-sig-token="name"]');
    expect(name?.textContent).toBe("state.update");
    expect(name?.className).toContain("text-cyan-700");
    expect(name?.className).toContain("dark:text-cyan-300");

    const paramName = code?.querySelector('[data-sig-token="param"]');
    expect(paramName?.textContent).toBe("key");

    const type = code?.querySelector('[data-sig-token="type"]');
    expect(type?.textContent).toBe("string");
    expect(type?.className).toContain("text-amber-700");
    expect(type?.className).toContain("dark:text-amber-300");

    const returns = code?.querySelector('[data-sig-token="returns"]');
    expect(returns?.textContent).toBe(" -> State");
    expect(returns?.className).toContain("text-amber-700");

    const optional = code?.querySelector('[data-sig-token="optional"]');
    expect(optional?.textContent).toBe("?");
    expect(optional?.className).toContain("text-muted-foreground");

    // Punctuation spans, in DOM order: "(", ": ", ", ", ")".
    const puncts = Array.from(code?.querySelectorAll('[data-sig-token="punct"]') ?? []);
    expect(puncts.map((punct) => punct.textContent).join("")).toBe("(: , )");
    for (const punct of puncts) {
      expect(punct.className).toContain("text-muted-foreground");
    }
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
    // The block is about operations on a state/system, explicitly not HTTP.
    expect(INTERACTION_SURFACE_AGENT_DESCRIPTION).toContain("NOT HTTP");
  });
});
