import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  STRUCTURED_TABLE_AGENT_DESCRIPTION,
  STRUCTURED_TABLE_LABEL,
  StructuredTableBlock,
} from "../components/structured-table/StructuredTableDocsBlock";

afterEach(() => {
  cleanup();
});

describe("StructuredTableBlock", () => {
  it("renders columns and rows from structured props", () => {
    const { container } = render(
      <StructuredTableBlock
        id="tbl-1"
        title="Rollout matrix"
        columns={["Stage", "Owner", "Status"]}
        rows={[
          ["Alpha", "ford", "done"],
          ["Beta", "ana", "in progress"],
        ]}
      />,
    );

    expect(screen.getByText("Rollout matrix")).toBeTruthy();
    expect(screen.getByText("Stage")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.queryByText("normal")).toBeNull();
    expect(screen.queryByText("tbl-1")).toBeNull();

    const section = container.querySelector('[data-docs-block-type="structured-table"]');
    expect(section?.getAttribute("data-source-id")).toBe("tbl-1");
    expect(section?.className).toBe("not-prose my-4");
    expect(screen.getByText("Rollout matrix").className).toBe(
      "mb-1.5 text-sm font-medium text-foreground",
    );
  });

  it("pads ragged rows with empty cells so every row spans all columns", () => {
    const { container } = render(
      <StructuredTableBlock
        id="tbl-ragged"
        columns={["A", "B", "C"]}
        rows={[["only-a"], ["a", "b", "c", "overflow-dropped"]]}
      />,
    );

    const bodyRows = Array.from(container.querySelectorAll("tbody tr"));
    expect(bodyRows.length).toBe(2);
    for (const row of bodyRows) {
      expect(row.querySelectorAll("td").length).toBe(3);
    }
    // Short row padded with empties.
    const firstRowCells = Array.from(bodyRows[0].querySelectorAll("td")).map(
      (cell) => cell.textContent,
    );
    expect(firstRowCells).toEqual(["only-a", "", ""]);
    // Extra cells beyond the column set are not rendered.
    expect(screen.queryByText("overflow-dropped")).toBeNull();
  });

  it("uses theme tokens for spacing and accent rules regardless of density", () => {
    const { container } = render(
      <StructuredTableBlock
        id="tbl-compact"
        density="compact"
        columns={["A", "B"]}
        rows={[
          ["x", "y"],
          ["z", "w"],
        ]}
      />,
    );

    const wrapper = container.querySelector("section > div");
    const header = container.querySelector("thead");
    const headerCells = container.querySelectorAll("thead th");
    const bodyRows = container.querySelectorAll("tbody tr");
    const bodyCells = container.querySelectorAll("tbody td");

    expect(wrapper?.className).toContain(
      "border-[color:var(--docs-table-border,transparent)]",
    );
    expect(header?.className).toContain(
      "border-b-[length:var(--docs-table-header-rule-width,1.5px)]",
    );
    expect(header?.className).toContain("var(--docs-table-header-rule-opacity,0.5)");
    expect(header?.className).toContain(
      "bg-[color:var(--docs-table-header-bg,transparent)]",
    );
    expect(headerCells[0]?.className).toContain(
      "text-[length:calc(var(--docs-table-font-size,14px)-1px)]",
    );
    expect(headerCells[0]?.className).toContain("font-medium");
    expect(headerCells[0]?.className).not.toContain("uppercase");
    expect(bodyCells[0]?.className).toContain(
      "py-[length:var(--docs-table-cell-pad-y,10px)]",
    );
    expect(bodyCells[0]?.className).toContain(
      "pr-[length:var(--docs-table-cell-pad-x,16px)]",
    );
    expect(bodyCells[1]?.className).toContain("pr-0");
    expect(bodyRows[0]?.className).toContain(
      "border-b-[length:var(--docs-table-row-rule-width,1px)]",
    );
    expect(bodyRows[0]?.className).toContain("var(--docs-table-row-rule-opacity,1)");
    expect(bodyRows[1]?.className).not.toContain("border-b");
    expect(bodyRows[0]?.className).not.toContain("even:bg-muted/30");
    expect(bodyCells[0]?.className).not.toContain("px-2 py-1");
    expect(screen.queryByText("compact")).toBeNull();
  });

  it("exports the label and an agent description covering the structured props", () => {
    expect(STRUCTURED_TABLE_LABEL).toBe("Structured Table");
    expect(STRUCTURED_TABLE_AGENT_DESCRIPTION).toContain("columns: string[]");
    expect(STRUCTURED_TABLE_AGENT_DESCRIPTION).toContain("rows: string[][]");
    expect(STRUCTURED_TABLE_AGENT_DESCRIPTION).toContain("density");
  });
});
