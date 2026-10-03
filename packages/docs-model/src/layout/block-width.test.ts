import { expect, test } from "bun:test";
import type { DocBlock, DocBlockType, DocDocument } from "../doc-schema";
import { blockPdfWidthsPx, blockWidthsPx } from "./block-width";

const block = (id: string, type: DocBlockType, children: string[] = []): DocBlock => ({ id, type, props: {}, children });

/**
 * Stock lane caps in Chromium: text 60ch and code 88ch of the 18px body font
 * (Inter, 1ch = 11.25px), wide 1100px. A list item keeps a 24px marker column.
 */
test("a block takes its top-level ancestor's lane, less 24px per enclosing list item", () => {
  const doc: DocDocument = {
    schemaVersion: 1,
    id: "widths",
    root: "root",
    blocks: {
      root: block("root", "paragraph", ["code", "table", "para", "item", "callout"]),
      code: block("code", "code", ["code-child"]),
      "code-child": block("code-child", "paragraph"),
      table: block("table", "structured-table"),
      para: block("para", "paragraph", ["para-code"]),
      "para-code": block("para-code", "code"),
      item: block("item", "list-item", ["item-code", "sub"]),
      "item-code": block("item-code", "code"),
      sub: block("sub", "list-item", ["sub-table"]),
      "sub-table": block("sub-table", "structured-table"),
      callout: block("callout", "callout", ["callout-code"]),
      "callout-code": block("callout-code", "code"),
    },
  };
  const widths = Object.fromEntries([...blockWidthsPx(doc)].map(([id, px]) => [id, Math.round(px * 10) / 10]));
  expect(widths).toEqual({
    code: 990,
    "code-child": 990,
    table: 1100,
    para: 675,
    "para-code": 675,
    item: 675,
    "item-code": 651,
    sub: 651,
    "sub-table": 627,
    callout: 675,
    "callout-code": 675,
  });
});

test("PDF export drops the lanes: every block spans the 688px printable width, less 24px per enclosing list item", () => {
  const doc: DocDocument = {
    schemaVersion: 1,
    id: "pdf-widths",
    root: "root",
    blocks: {
      root: block("root", "paragraph", ["table", "item"]),
      table: block("table", "structured-table"),
      item: block("item", "list-item", ["item-table"]),
      "item-table": block("item-table", "structured-table"),
    },
  };
  expect(Object.fromEntries(blockPdfWidthsPx(doc))).toEqual({ table: 688, item: 688, "item-table": 664 });
});
