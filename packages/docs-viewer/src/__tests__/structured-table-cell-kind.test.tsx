import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { TableCell } from "@codecaine-ai/docs-model";
import { tableCellKinds } from "../components/structured-table/cell-kind";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { TableGrid } from "../components/structured-table/editor/TableGrid";

afterEach(() => {
  cleanup();
});

const code = (text: string): TableCell => [{ insert: text, attributes: { code: true } }];
const noop = () => {};

describe("tableCellKinds", () => {
  it("types identifier columns mono and colors only the key column", () => {
    // The overrides table from the structured-table vocabulary page.
    const rows: TableCell[][] = [
      ["headerRuleWidth", code("--docs-table-header-rule-width"), "1.5px"],
      ["cellPaddingY", code("--docs-table-cell-pad-y"), "12px"],
      ["rowRuleOpacity", code("--docs-table-row-rule-opacity"), "0.8"],
    ];
    expect(tableCellKinds(rows, 3)).toEqual([
      ["key", "mono", "mono"],
      ["key", "mono", "mono"],
      ["key", "mono", "mono"],
    ]);
  });

  it("keeps plain-word and prose columns sans", () => {
    // The token reference table: Kind holds single plain words, Notes is prose.
    const rows: TableCell[][] = [
      ["border", "--docs-table-border", "color", "Outer wrapper border (default: grey)"],
      ["headerBg", "--docs-table-header-bg", "color", "Header row background"],
      ["headerRuleWidth", "--docs-table-header-rule-width", "length", "Header rule thickness"],
    ];
    expect(tableCellKinds(rows, 4)).toEqual([
      // "border" is a plain word, but its column qualifies through headerBg.
      ["key", "mono", undefined, undefined],
      ["key", "mono", undefined, undefined],
      ["key", "mono", undefined, undefined],
    ]);
  });

  it("never turns ordinary words mono", () => {
    const rows: TableCell[][] = [
      ["Alpha", "done", "read-only", "up-to-date", "e.g."],
      ["Beta", "in-progress", "built-in", "end-to-end", "Item"],
    ];
    expect(tableCellKinds(rows, 5)).toEqual([
      [undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined],
    ]);
  });

  it("recognizes each strict identifier shape", () => {
    for (const identifier of [
      "file-tree.addEntry",
      "editor.commands.focus()",
      "row_rule",
      "MAX_ROWS",
      "--docs-shape-*",
      "120ms",
      "50%",
      "structured-table-overrides",
    ]) {
      expect(tableCellKinds([["Name", identifier]], 2)[0]).toEqual([undefined, "mono"]);
    }
  });

  it("leaves prose cells (inline code included) sans inside an identifier column", () => {
    const rows: TableCell[][] = [
      ["actionHeaderBg", "Card header background"],
      ["State Shape tokens", [{ insert: "Use " }, { insert: "--docs-shape-*", attributes: { code: true } }]],
      ["", "x"],
    ];
    expect(tableCellKinds(rows, 2)).toEqual([
      ["key", undefined],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });

  it("types a whole-cell code span mono in any column, and pads ragged rows", () => {
    expect(tableCellKinds([["Run", code("npm i")], ["Lint"]], 2)).toEqual([
      [undefined, "mono"],
      [undefined, undefined],
    ]);
  });
});

describe("identifier cells on both surfaces", () => {
  const columns = ["Key", "CSS variable", "Kind"];
  const rows: TableCell[][] = [
    ["headerRuleWidth", code("--docs-table-header-rule-width"), "length"],
    ["fontSize", code("--docs-table-font-size"), "length"],
  ];
  const surfaces: Array<[string, () => HTMLElement]> = [
    ["read block", () => render(<StructuredTableBlock id="t" columns={columns} rows={rows} />).container],
    [
      "editor grid",
      () =>
        render(
          <TableGrid
            data={{ columns, rows }}
            editable
            onCommitHeader={noop}
            onCommitCell={noop}
            onHoverCell={noop}
          />,
        ).container,
    ],
  ];

  for (const [name, mount] of surfaces) {
    it(`${name} marks key and mono cells on the td`, () => {
      const container = mount();
      const kinds = Array.from(container.querySelectorAll("tbody td")).map((cell) =>
        cell.getAttribute("data-cell-kind"),
      );
      expect(kinds).toEqual(["key", "mono", null, "key", "mono", null]);
      // Header cells are labels, never typed.
      for (const header of Array.from(container.querySelectorAll("thead th"))) {
        expect(header.hasAttribute("data-cell-kind")).toBe(false);
      }
      // The chip vars are zeroed on identifier cells, so a whole-cell code
      // span reads as plain mono rather than a chip.
      const mono = container.querySelector('tbody td[data-cell-kind="mono"]')!;
      expect(mono.className).toContain("data-[cell-kind]:[--docs-inline-code-bg:transparent]");
      // The typed-chip color lives on the code element, so it is reset there.
      expect(mono.className).toContain("data-[cell-kind]:[&_code]:[--docs-chip-kind-fg:currentColor]");
      expect(mono.className).toContain("data-[cell-kind=mono]:text-[color:var(--docs-ink,#1f1f1f)]");
    });
  }
});

describe("backtick code in a plain-string cell", () => {
  // A table written through block props stores cells verbatim, so the
  // code-colors page's `--syntax-function` cells reached the page with
  // literal backticks. They render as chips and type as whole code cells.
  it("renders each backtick pair as an inline code chip", () => {
    const { container } = render(
      <StructuredTableBlock
        id="cc-roles"
        columns={["Role", "Variable", "Colors"]}
        rows={[["function", "`--syntax-function`", "`return`, `throw`, and the `?` of a branch row"]]}
      />,
    );
    const cells = container.querySelectorAll("tbody td");
    expect(cells[1].textContent).toBe("--syntax-function");
    expect(cells[1].querySelector("code")?.textContent).toBe("--syntax-function");
    expect(cells[1].getAttribute("data-cell-kind")).toBe("mono");
    expect(Array.from(cells[2].querySelectorAll("code"), (chip) => chip.textContent)).toEqual(["return", "throw", "?"]);
    expect(cells[2].textContent).toBe("return, throw, and the ? of a branch row");
  });
});
