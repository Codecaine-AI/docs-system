import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { TableCell } from "@codecaine-ai/docs-model";
import { StructuredTableBlock } from "../components/structured-table/StructuredTableDocsBlock";
import { renderStaticCellInto } from "../components/structured-table/editor/EditableCell";
import { TABLE_PROSE_FLOOR_CLASS } from "../components/structured-table/table-classes";

afterEach(() => {
  cleanup();
});

const flag: TableCell = [{ insert: "Pass " }, { insert: "--root <path>", attributes: { code: true } }, { insert: " to export another docs folder." }];
const list: TableCell = [{ insert: "One of " }, { insert: "climb|held-out|all", attributes: { code: true } }];

/** Each code element's classes, its text and the pieces a line may break between. */
function chips(root: ParentNode) {
  return Array.from(root.querySelectorAll("code")).map((code) => ({
    nowrap: code.classList.contains("whitespace-nowrap"),
    printWraps: code.classList.contains("print:whitespace-normal"),
    pieces: Array.from(code.querySelectorAll("[data-chip-piece]")).map((piece) => ({
      text: piece.textContent,
      printWraps: piece.classList.contains("print:whitespace-normal"),
      inlineStyle: piece.getAttribute("style"),
    })),
    breaks: code.querySelectorAll("wbr").length,
  }));
}

const expected = [
  { nowrap: true, printWraps: true, pieces: [], breaks: 0 },
  {
    nowrap: true,
    printWraps: true,
    pieces: [
      { text: "climb|", printWraps: true, inlineStyle: null },
      { text: "held-out|", printWraps: true, inlineStyle: null },
      { text: "all", printWraps: true, inlineStyle: null },
    ],
    breaks: 2,
  },
];

describe("structured-table code chips break the same on every surface", () => {
  it("a read cell keeps a flag and its value whole and breaks a list chip only at its separators, and print wraps both", () => {
    const { container } = render(<StructuredTableBlock id="t" columns={["Option", "Notes"]} rows={[["--root", flag], ["--set", list]]} />);
    expect(chips(container)).toEqual(expected);
  });

  it("an idle editable cell renders its chips as the read cell does", () => {
    const cells = [flag, list].map((value) => {
      const element = document.createElement("div");
      renderStaticCellInto(element, value);
      return chips(element)[0];
    });
    expect(cells).toEqual(expected);
  });
});

describe("the prose floor", () => {
  it("applies on screen only, since PDF export gives every column an equal share", () => {
    expect(TABLE_PROSE_FLOOR_CLASS.split(" ")).toContain("print:min-w-0");
  });
});
