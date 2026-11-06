import { describe, expect, it } from "bun:test";
import type { TableCell } from "@codecaine-ai/docs-model";
import { tableCellKinds } from "../components/structured-table/cell-kind";
import { tableColumnFits, WRAP_THRESHOLD } from "../components/structured-table/column-layout";

const fits = (rows: TableCell[][], columnCount = rows[0]?.length ?? 0) =>
  tableColumnFits(rows, columnCount, tableCellKinds(rows, columnCount));

describe("tableColumnFits", () => {
  it("picks the text column with the longest average as the one prose column", () => {
    expect(
      fits([
        ["headerRuleWidth", "Thickness of the rule under the header row", "short note"],
        ["cellPaddingY", "Vertical padding", "another short one"],
      ]),
    ).toEqual(["fit", "prose", "fit"]);
  });

  it("never makes an identifier column the prose column, however long", () => {
    expect(
      fits([
        ["--docs-table-header-rule-opacity-extra-long-name", "The opacity of the rule under the header"],
        ["--docs-table-row-rule", "c d"],
      ]),
    ).toEqual(["fit", "prose"]);
  });

  it("lets a second long text column wrap without becoming the prose column", () => {
    const long = "x ".repeat(WRAP_THRESHOLD).trim();
    expect(fits([[long, `${long} ${long}`]])).toEqual(["wrap", "prose"]);
  });

  it("leaves a table with no body text without a prose column", () => {
    expect(fits([["", ""]])).toEqual(["fit", "fit"]);
    expect(fits([], 2)).toEqual(["fit", "fit"]);
  });

  it("breaks ties toward the leftmost column", () => {
    expect(fits([["alpha beta gamma delta epsilon zeta", "zeta epsilon delta gamma beta alpha"]])).toEqual(["prose", "text"]);
  });

  it("lets a second sentence column wrap at the full measure, and a run of short values at half of it", () => {
    const sentence = "A static image of the board, drawn at build time";
    expect(fits([["a", sentence, `${sentence}.`]])).toEqual(["fit", "text", "prose"]);
    expect(fits([["a", "--root <path> --port <port>", `${sentence} from its sidecar file.`]])).toEqual(["fit", "wrap", "prose"]);
  });

  it("gives a table whose text cells are all 30 characters or shorter no prose column", () => {
    expect(fits([["Lists the available targets", "4802"]])).toEqual(["wrap", "fit"]);
  });
});
