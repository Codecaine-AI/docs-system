import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import type { TableCell } from "@codecaine-ai/docs-model";
import {
  BLOCK_LANE,
  CODE_METRICS,
  INLINE_MARK_METRICS,
  LANE_CODE_CH,
  LANE_TEXT_CH,
  LANE_WIDE_PX,
  NESTED_INSET_PX,
  STACK_METRICS,
  TABLE_METRICS,
  TREE_METRICS,
  chipKind as modelChipKind,
  chipNeedsPieces as modelChipNeedsPieces,
  chipPieces as modelChipPieces,
  codeDisplayText,
  codeHasNotes,
  liftBacktickCode as modelLiftBacktickCode,
  monoBreakPieces,
  stackDetailSegments,
  tableCellKinds as modelTableCellKinds,
  tableColumnFits as modelTableColumnFits,
} from "@codecaine-ai/docs-model/layout";
import { docBlockLayoutClasses } from "../render/block-layout";
import {
  CODE_BLOCK_CLASSES,
  LIST_ITEM_BULLET_CLASSES,
  LIST_ITEM_CHILDREN_CLASSES,
  LIST_ITEM_CLASSES,
  LIST_ITEM_CONTENT_CLASSES,
} from "../render/block-classes";
import { getDocBlockDescriptor } from "../render/block-registry";
import {
  CODE_ANNOTATED_PRE_CLASSES,
  CODE_BODY_GRID_CLASSES,
  CODE_CELL_CLASSES,
  CODE_CONTENT_WRAPPER_CLASSES,
  CODE_LAYOUT_CLASSES,
  CODE_LINE_HEIGHT_PX,
  CODE_LINE_ROW_CLASSES,
  CODE_LINE_TEXT_CELL_CLASSES,
} from "../components/code/classes";
import { parseCodeAnnotations } from "../components/code/annotations";
import { prettyPrintIfJson } from "../components/code/highlight";
import {
  TABLE_BODY_CELL_TEXT_CLASSES,
  TABLE_CELL_SPACING_CLASS,
  TABLE_COLUMN_FIT_CLASSES,
  TABLE_COLUMN_RULE_CLASSES,
  TABLE_ELEMENT_CLASSES,
  TABLE_HEADER_CELL_TEXT_CLASSES,
  TABLE_PROSE_MEASURE_CLASS,
  TABLE_ROW_MIN_HEIGHT_CLASS,
  TABLE_WRAPPER_CLASSES,
} from "../components/structured-table/table-classes";
import { WRAP_THRESHOLD, tableColumnFits } from "../components/structured-table/column-layout";
import { tableCellKinds } from "../components/structured-table/cell-kind";
import { liftBacktickCode } from "../components/structured-table/cell-code";
import { chipKind } from "../components/typed-chip";
import { chipNeedsPieces, chipPieces, monoBreaks } from "../components/mono-breaks";
import { INLINE_CODE_CLASSES } from "../render/block-classes";
import { renderDeltaSpans } from "../render/delta-spans";
import { StackBlock } from "../components/stack/StackDocsBlock";
import { TREE_ROWS_CSS } from "../components/outline-rows/tree-rows";
import { FILE_TREE_VARS } from "../components/file-tree/FileTreeDocsBlock";
import { OutlineRows } from "../components/outline-rows/OutlineRows";

/**
 * docs-model's layout metrics (src/layout/metrics.ts) copy the numbers this
 * package renders with, because Tailwind can only see literal class tokens.
 * Layout lints read the copy, so each value here must equal the class
 * string, inline stylesheet or display rule it was copied from. When one of
 * these fails, change both sides together.
 */

afterEach(cleanup);

/** The declarations of one rule in an inline stylesheet, by exact selector. */
function declarations(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  if (body === undefined) throw new Error(`No rule for ${selector}`);
  return Object.fromEntries(
    body.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const colon = part.indexOf(":");
      return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
    }),
  );
}

describe("page lanes", () => {
  test("the lane class fallbacks equal the lane caps", () => {
    expect(docBlockLayoutClasses({ width: "text" })).toContain(`max-w-[var(--style-content-width,${LANE_TEXT_CH}ch)]`);
    expect(docBlockLayoutClasses({ width: "code" })).toContain(`max-w-[var(--style-code-width,${LANE_CODE_CH}ch)]`);
    expect(docBlockLayoutClasses({ width: "wide" })).toContain(`max-w-[var(--style-wide-width,${LANE_WIDE_PX}px)]`);
  });

  test("every block type claims the lane BLOCK_LANE records", () => {
    const lanes = Object.fromEntries(DOC_BLOCK_TYPES.map((type) => {
      const layout = getDocBlockDescriptor(type)?.layout;
      return [type, layout?.customWidthClass ?? layout?.width ?? "text"];
    }));
    expect(lanes).toEqual({ ...BLOCK_LANE });
  });

  test("a list item's marker column is the nested inset", () => {
    // w-6 is 1.5rem; the workbench stylesheet sizes the column with the same fallback.
    expect(LIST_ITEM_BULLET_CLASSES.split(" ")).toContain("w-6");
    const markers = readFileSync(new URL("../styles/list-markers.css", import.meta.url), "utf8");
    expect(declarations(markers, ".docs-markdown [data-doc-list-marker]").width).toBe("var(--docs-list-indent, 1.5rem)");
    expect(NESTED_INSET_PX["list-item"]).toBe(1.5 * 16);
    // Nothing else in the row takes horizontal room from the nested blocks.
    for (const classes of [LIST_ITEM_CLASSES, LIST_ITEM_CONTENT_CLASSES, LIST_ITEM_CHILDREN_CLASSES]) {
      expect(classes).not.toMatch(/(?:^|\s)(?:p|px|pl|pr|ml|mr|mx|gap|gap-x|space-x)-/);
    }
  });
});

describe("code panel", () => {
  const m = CODE_METRICS;

  test("type, gutter, padding, frame and notes column equal CODE_METRICS", () => {
    expect(CODE_CONTENT_WRAPPER_CLASSES).toContain(`grid-cols-[var(--docs-code-gutter-width,${m.gutterPx}px)_1fr]`);
    expect(CODE_CONTENT_WRAPPER_CLASSES).toContain(`text-[length:var(--docs-code-text-size,${m.fontSizePx}px)]`);
    expect(CODE_CONTENT_WRAPPER_CLASSES).toContain(`leading-[var(--docs-code-line-height,${m.lineHeightPx}px)]`);
    expect(CODE_LINE_HEIGHT_PX).toBe(m.lineHeightPx);
    expect(CODE_LINE_ROW_CLASSES).toContain(`grid-cols-[var(--docs-code-gutter-width,${m.gutterPx}px)_1fr]`);
    expect(CODE_ANNOTATED_PRE_CLASSES).toContain(`text-[length:var(--docs-code-text-size,${m.fontSizePx}px)]`);
    expect(CODE_ANNOTATED_PRE_CLASSES).toContain(`max-h-[${m.annotatedMaxHeightPx}px]`);
    for (const cell of [CODE_CELL_CLASSES, CODE_LINE_TEXT_CELL_CLASSES]) {
      expect(cell).toContain(`px-[var(--docs-code-pad-x,${m.padXPx}px)]`);
    }
    expect(CODE_BLOCK_CLASSES).toContain(`border-[length:var(--docs-code-border-width,${m.borderPx}px)]`);
    expect(CODE_BODY_GRID_CLASSES).toContain(
      `@min-[${m.notesBesideMinWidthPx}px]:grid-cols-[minmax(0,1fr)_var(--docs-code-notes-width,${m.notesColumnPx}px)]`,
    );
    // The notes breakpoint queries the block's own width: its layout wrapper is the size container.
    expect(CODE_LAYOUT_CLASSES.split(" ")).toContain("@container");
  });

  test("code lines never wrap: the content is as wide as its widest line", () => {
    expect(CODE_CONTENT_WRAPPER_CLASSES.split(" ")).toContain("w-max");
    expect(CODE_LINE_TEXT_CELL_CLASSES.split(" ")).toContain("whitespace-pre");
  });

  test.each([
    ['{"a":1,"b":[1,2]}', undefined],
    ['{"a":1}', "json"],
    ['{"a":1}', " JSONC "],
    ['{"a":1}', "ts"],
    ["[1,2,3]", ""],
    ["  {not json", undefined],
    ['{"a":1} // comment', "jsonc"],
    ["plain text", undefined],
    ["", "json"],
    ["   ", undefined],
  ])("the lint reads %p (%p) as the read surface displays it", (code, language) => {
    expect(codeDisplayText(code, language)).toBe(prettyPrintIfJson(code, language));
  });

  test.each([
    [undefined],
    [[]],
    [[{ lines: "1", note: "Note." }]],
    [[{ lines: "1", label: "Label", note: "Note." }]],
    [[{ lines: " ", note: "Note." }]],
    [[{ lines: "1", note: "  " }]],
    [[{ lines: "1" }]],
    [[{ lines: 1, note: "Note." }]],
    [["1"]],
    [[null, { lines: "2-3", note: "Note." }]],
    [{ lines: "1", note: "Note." }],
  ])("the lint sees a notes column exactly when the viewer renders one: %p", (annotations) => {
    expect(codeHasNotes(annotations)).toBe(parseCodeAnnotations(annotations) !== null);
  });
});

describe("structured table", () => {
  const m = TABLE_METRICS;

  test("cell type, padding, frame and column sizing equal TABLE_METRICS", () => {
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain(`text-[length:var(--docs-table-font-size,${m.fontSizePx}px)]`);
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain(`[font-weight:var(--docs-table-body-weight,${m.bodyWeight})]`);
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain(
      `text-[length:calc(var(--docs-table-font-size,${m.fontSizePx}px)-${m.fontSizePx - m.identifierFontSizePx}px)]`,
    );
    expect(TABLE_HEADER_CELL_TEXT_CLASSES).toContain(
      `text-[length:var(--docs-table-header-text-size,var(--docs-table-font-size,${m.headerFontSizePx}px))]`,
    );
    expect(TABLE_HEADER_CELL_TEXT_CLASSES).toContain(`[font-weight:var(--docs-table-header-weight,${m.headerWeight})]`);
    expect(TABLE_HEADER_CELL_TEXT_CLASSES).toContain(`min-w-[${m.minColumnPx}px]`);
    expect(TABLE_ELEMENT_CLASSES).toContain(`leading-[var(--docs-table-line-height,${m.lineHeight})]`);
    expect(TABLE_CELL_SPACING_CLASS).toContain(`py-[length:var(--docs-table-cell-pad-y,${m.cellPadYPx}px)]`);
    expect(TABLE_CELL_SPACING_CLASS).toContain(`px-[length:var(--docs-table-cell-pad-x,${m.cellPadXPx}px)]`);
    expect(TABLE_WRAPPER_CLASSES).toContain(`border-[length:var(--docs-table-border-width,${m.borderPx}px)]`);
    expect(TABLE_COLUMN_RULE_CLASSES).toContain(`var(--docs-table-column-rule-width,${m.columnRulePx}px)`);
    expect(TABLE_ROW_MIN_HEIGHT_CLASS).toContain(`var(--docs-table-row-min-height,${m.rowMinHeightPx}px)`);
    expect(TABLE_PROSE_MEASURE_CLASS.split(" ")).toContain(`max-w-[${m.proseMeasureCh}ch]`);
    expect(TABLE_PROSE_MEASURE_CLASS.split(" ")).toContain("min-w-min");
    expect(WRAP_THRESHOLD).toBe(m.wrapThresholdChars);
    expect(TABLE_COLUMN_FIT_CLASSES.fit.split(" ")).toContain("whitespace-nowrap");
    // Print CSS resets white-space on th/td only, so every inline element in a fit column stays nowrap in a PDF.
    expect(TABLE_COLUMN_FIT_CLASSES.fit.split(" ")).toContain("**:whitespace-nowrap");
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain("data-[cell-kind]:**:whitespace-nowrap");
    // An identifier cell zeroes the chip: no padding, the cell's own size.
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain("data-[cell-kind]:[--docs-inline-code-pad-x:0]");
    expect(TABLE_BODY_CELL_TEXT_CLASSES).toContain("data-[cell-kind]:[--docs-inline-code-text-size:1]");
  });

  test("an inline code chip's size, padding and border equal INLINE_MARK_METRICS", () => {
    const i = INLINE_MARK_METRICS;
    expect(INLINE_CODE_CLASSES).toContain(`text-[length:calc(var(--docs-inline-code-text-size,${i.codeTextEm})*1em)]`);
    expect(INLINE_CODE_CLASSES).toContain(`px-[calc(var(--docs-inline-code-pad-x,${i.codePadXEm})*1em)]`);
    expect(INLINE_CODE_CLASSES).toContain(`border-[length:var(--docs-inline-code-border-width,${i.codeBorderPx}px)]`);
    // The padding repeats on every line a chip spans, and the chip itself never breaks mid-word.
    expect(INLINE_CODE_CLASSES).toContain("[box-decoration-break:clone]");
    expect(INLINE_CODE_CLASSES).toContain("[overflow-wrap:normal]");
  });
});

/** Every structured table in this repo's corpus, as the layout lints and the viewer read it. */
function corpusTables(): Array<{ columns: TableCell[]; rows: TableCell[][] }> {
  const tables: Array<{ columns: TableCell[]; rows: TableCell[][] }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "doc.json") {
        const doc = JSON.parse(readFileSync(full, "utf8")) as { blocks: Record<string, { type: string; props: Record<string, unknown> }> };
        for (const block of Object.values(doc.blocks)) {
          const { columns, rows } = block.props;
          if (block.type === "structured-table" && Array.isArray(columns) && Array.isArray(rows)) tables.push({ columns: columns as TableCell[], rows: rows as TableCell[][] });
        }
      }
    }
  };
  walk(new URL("../../../../docs", import.meta.url).pathname);
  return tables;
}

describe("structured table cell kinds and column fits (docs-model layout/table-columns.ts)", () => {
  const code = (insert: string) => ({ insert, attributes: { code: true as const } });
  const fixtures: Array<{ columns: TableCell[]; rows: TableCell[][] }> = [
    { columns: ["Token", "Default", "Notes"], rows: [["--docs-table-bg", "#f8f8f7", "The panel fill under every row, read by the frame and the pinned column."], ["headerRuleWidth", "1px", "Short"]] },
    { columns: ["Name", "Path"], rows: [[[code("tableColumnFits")], "`packages/docs-viewer/src/column-layout.ts`"], ["up-to-date", "end-to-end"], ["read-only data", ""]] },
    { columns: ["A", "B", "C"], rows: [["MAX_ROWS", "file-tree.addEntry()", [{ insert: "Use " }, code("x"), { insert: " here" }]], ["1.5px", "120ms", "a"], ["", "", ""], ["x"]] },
    { columns: ["Only"], rows: [] },
    { columns: ["Left", "Right"], rows: [["a long sans cell that is well over forty characters wide", "short"], ["tiny", "another long sans cell that runs past forty characters"]] },
  ];

  test("both copies type the same cells and size the same columns", () => {
    const tables = [...fixtures, ...corpusTables()];
    expect(tables.length).toBeGreaterThan(fixtures.length);
    for (const { columns, rows } of tables) {
      for (const row of rows) for (const cell of row) expect(modelLiftBacktickCode(cell)).toEqual(liftBacktickCode(cell));
      const kinds = tableCellKinds(rows, columns.length);
      expect(modelTableCellKinds(rows, columns.length)).toEqual(kinds);
      expect(modelTableColumnFits(rows, columns.length, kinds)).toEqual(tableColumnFits(rows, columns.length, kinds));
    }
  });
});

describe("inline code chips (docs-model layout/chips.ts)", () => {
  const texts = [
    "", "  ", "x", "packages/docs-viewer/src", "--docs-kind-*", "docs-cli code-theme import", "DocsChangeEvent", "a.b.c",
    "headerRuleWidth", "verification.json", "foo_bar", "./path/to/file.ts", "camelCaseIdentifierThatIsVeryLong", "a/b c/d",
    "\"quoted\"", "1.5px", "true", "fn()", "editor.setContent", "useState", "Type", "some text with spaces", "brand-huggingface",
    "costEstimate?", "CORE_HARNESS_PROMPT_EDITOR_MODEL", "<kernel root>/pi-sessions", "calc(var(--x))", "@scope/pkg",
  ];

  test.each(texts)("both copies type and cut %p alike", (text) => {
    expect(modelChipKind(text)).toBe(chipKind(text));
    expect(modelChipPieces(text)).toEqual(chipPieces(text));
    expect(modelChipNeedsPieces(text)).toBe(chipNeedsPieces(text));
  });

  test.each(texts.filter((text) => text.trim()))("a chip of %p renders the pieces and breaks the lint measures", (text) => {
    const html = renderToStaticMarkup(createElement(Fragment, null, renderDeltaSpans([{ insert: text, attributes: { code: true } }])));
    const inner = /^<code[^>]*>([\s\S]*)<\/code>$/.exec(html)?.[1] ?? "";
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    if (!modelChipNeedsPieces(text)) {
      expect(inner).toBe(escape(text));
      return;
    }
    // Each non-space piece is one nowrap span, with a <wbr> between two adjacent pieces.
    let expected = "";
    let previousWord = false;
    for (const piece of modelChipPieces(text)) {
      if (/^\s+$/.test(piece)) {
        expected += piece;
        previousWord = false;
      } else {
        expected += `${previousWord ? "<wbr/>" : ""}<span data-chip-piece="" style="white-space:nowrap">${escape(piece)}</span>`;
        previousWord = true;
      }
    }
    expect(inner).toBe(expected);
  });
});

describe("stack", () => {
  const m = STACK_METRICS;

  test("detail, name, card and gap styles equal STACK_METRICS", () => {
    const { container } = render(createElement(StackBlock, {
      nodes: [{ name: "Leaf", detail: "one · two  ·  three", badge: "role" }],
      boundaries: [],
    }));
    const css = container.querySelector("style")!.textContent ?? "";
    expect(declarations(css, "[data-stack-detail]")).toMatchObject({
      "max-width": `${m.detailMaxCh}ch`,
      "font-size": `${m.detailFontSizePx}px`,
      "line-height": `${m.detailLineHeight}`,
    });
    expect(declarations(css, "[data-stack-detail][data-mono]")).toMatchObject({
      "font-size": `${m.pathDetailFontSizePx}px`,
      "line-height": `${m.pathDetailLineHeight}`,
    });
    expect(declarations(css, "[data-stack-name]")).toMatchObject({
      "font-size": `${m.nameFontSizePx}px`,
      "font-weight": `${m.nameWeight}`,
    });
    expect(declarations(css, "[data-stack-role]")["font-size"]).toBe(`${m.roleFontSizePx}px`);
    expect(declarations(css, "[data-stack-box]")).toMatchObject({
      padding: `${m.boxPadYPx}px ${m.boxPadXPx}px`,
      border: expect.stringMatching(new RegExp(`^${m.boxBorderPx}px solid `)),
    });
    expect(declarations(css, "[data-stack-box][data-role]")).toMatchObject({
      "padding-left": `${m.roleBoxPadLeftPx}px`,
      "border-left": expect.stringMatching(new RegExp(`^${m.roleEdgePx}px solid `)),
    });
    expect(declarations(css, "[data-stack-head-row]")["column-gap"]).toBe(`${m.headRowGapPx}px`);
    expect(declarations(css, "[data-stack-group]").border).toMatch(new RegExp(`^${m.groupBorderPx}px solid `));
    expect(declarations(css, "[data-stack]")["--stack-gap"]).toBe(`var(--docs-stack-gap,${m.gapPx}px)`);
    // Prose segments join on one wrapped line, split exactly as the model splits them.
    expect(container.querySelector("[data-stack-detail]")!.textContent).toBe(
      stackDetailSegments("one · two  ·  three").join(m.proseDetailJoiner),
    );
  });

  test.each([
    "@spectre/* · @/* · apps/{web,api}/",
    "packages/docs-model/src/layout/metrics.ts",
    "metrics.ts · columns.ts",
    "Owns the lane widths · reads the theme",
    "one segment only",
  ])("the model reads %p as path or prose exactly as the stack renders it", (detail) => {
    const { container } = render(createElement(StackBlock, { nodes: [{ name: "Leaf", detail }], boundaries: [] }));
    const rendered = container.querySelector("[data-stack-detail]")!;
    const path = modelChipKind(detail) === "path";
    expect(rendered.hasAttribute("data-mono")).toBe(path);
    if (path) {
      expect([...rendered.querySelectorAll("[data-stack-detail-line]")].map((line) => line.textContent)).toEqual(stackDetailSegments(detail));
    } else {
      expect(rendered.textContent).toBe(stackDetailSegments(detail).join(m.proseDetailJoiner));
    }
  });
});

describe("mono break points (docs-model layout/chips.ts monoBreakPieces)", () => {
  test.each([
    "plain", "a/b", "a//b", `${"x".repeat(80)}/`, "-a", "a-", "@spectre/*", "apps/{frontend,backend,data-backend,tailer}/",
    "packages/docs-model/src/layout/metrics.ts", "one two/three", "a|b,c.d-e", "",
  ])("monoBreaks(%p) puts a <wbr> exactly between the model's pieces", (text) => {
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = renderToStaticMarkup(createElement(Fragment, null, monoBreaks(text)));
    expect(html).toBe(monoBreakPieces(text).map(escape).join("<wbr/>"));
  });
});

describe("tree rows", () => {
  const m = TREE_METRICS;

  test("rows, notes and sources equal TREE_METRICS", () => {
    expect(declarations(TREE_ROWS_CSS, ".docs-tree__note")).toMatchObject({
      "max-width": `${m.noteMaxCh}ch`,
      padding: `0 0 4px ${m.notePadLeftPx}px`,
      font: `400 var(--tr-note-size, ${m.noteFontSizePx}px) / ${m.noteLineHeight} var(--tr-sans)`,
    });
    expect(declarations(TREE_ROWS_CSS, ".docs-tree")).toMatchObject({
      "--tr-indent": `${m.indentPx}px`,
      "--tr-gutter": `${m.diffGutterPx}px`,
    });
    expect(declarations(TREE_ROWS_CSS, ".docs-tree__rows")["grid-template-columns"]).toContain(`[note] minmax(${m.noteMinColumnPx}px, 1fr)`);
    expect(declarations(TREE_ROWS_CSS, ".docs-tree__row")["white-space"]).toBe("nowrap");
    expect(declarations(TREE_ROWS_CSS, ".docs-tree__src")).toMatchObject({
      "margin-left": `${m.sourceGapPx}px`,
      font: expect.stringContaining(`var(--tr-source-size, ${m.sourceFontSizePx}px)`),
    });
  });

  test.each([
    ["file-tree", FILE_TREE_VARS as Record<string, string>, "file-tree", "note-text-size", "line-height"],
    ["call-stack", null, "outline-rows", "comment-text-size", "line-height"],
  ])("%s maps its knobs onto the tree rows at the TREE_METRICS sizes", (_type, vars, knob, noteKnob, rowKnob) => {
    let resolved = vars;
    if (!resolved) {
      const rows = [{ text: "run()", kind: "call" as const, children: [] }];
      const { container } = render(createElement(OutlineRows, { id: "o", blockType: "call-stack", rows, flavor: "call-stack" }));
      const style = (container.querySelector("figure.docs-tree") as HTMLElement).style;
      resolved = Object.fromEntries(["--tr-note-size", "--tr-text-size", "--tr-row", "--tr-pad-x", "--tr-pad-y", "--tr-border-width"]
        .map((name) => [name, style.getPropertyValue(name)]));
    }
    expect(resolved["--tr-note-size"]).toBe(`var(--docs-${knob}-${noteKnob},${m.noteFontSizePx}px)`);
    expect(resolved["--tr-text-size"]).toBe(`var(--docs-${knob}-text-size,${m.textSizePx}px)`);
    expect(resolved["--tr-row"]).toBe(`var(--docs-${knob}-${rowKnob},${m.rowHeightPx}px)`);
    expect(resolved["--tr-pad-x"]).toBe(`var(--docs-${knob}-pad-x,${m.padXPx}px)`);
    expect(resolved["--tr-pad-y"]).toBe(`var(--docs-${knob}-pad-y,${m.padYPx}px)`);
    expect(resolved["--tr-border-width"]).toBe(`var(--docs-${knob}-border-width,${m.borderPx}px)`);
  });
});
