/**
 * Updates docs/10-system-design/40-block-vocabulary/30-structured-table/doc.json
 * for the landed inline-styling behavior: cells (body + header) are now
 * `string | DeltaSpan[]` with the bold/italic/strike/code/link mark set,
 * canonical plain-string form for unmarked cells, markdown-in/markdown-out
 * on the agent surface, and a per-cell mini rich-text editor.
 * Canonical bytes via validateDocDocument + serializeDocDocument.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

const PATH =
  "docs/10-system-design/40-block-vocabulary/30-structured-table/doc.json";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks: Record<string, any> = doc.blocks;

function block(id: string) {
  const b = blocks[id];
  if (!b) {
    console.error(`missing block ${id}`);
    process.exit(1);
  }
  return b;
}

// 1. Lead — cells are rich text now, not "a grid of strings".
block("b-20-structured-table-lead-2").text = [
  t(
    "The typed table of the block vocabulary: a columns × rows grid of rich-text cells kept in props, not prose — each cell is a plain string or a span array carrying inline marks. Use it for index tables, comparison matrices, and anything an agent should edit cell-by-cell instead of re-flowing text.",
  ),
];

// 2. State table — columns/rows cell types + canonical plain-string rule.
{
  const state = block("b-20-structured-table-state-4");
  const rows: string[][] = state.props.rows;
  if (rows[0][0] !== "title" || rows[1][0] !== "columns" || rows[2][0] !== "rows") {
    console.error("state table rows not in expected order");
    process.exit(1);
  }
  rows[0][3] = "Optional bold caption above the table. Always a plain string — no marks.";
  rows[1][1] = "TableCell[]";
  rows[1][3] =
    "Header names, in order. A TableCell is a plain string or a DeltaSpan[] carrying inline marks.";
  rows[2][1] = "TableCell[][]";
  rows[2][3] =
    "One cell array per row; actions normalize each row to the column count. Unmarked cells are stored as the plain string (canonical).";
}

// 3. State note — cells carry the inline mark set; canonical form.
block("b-20-structured-table-state-note-5").text = [
  t("No text ("),
  c("carriesText: false"),
  t(
    ") — the whole block is typed props. Cells — body and header alike — carry the inline mark set: bold, italic, strike, code, and link; ",
  ),
  c("reference"),
  t(
    " chips are still rejected. An unmarked cell is stored as the plain string (canonical form): a span-array cell with zero attributed spans fails validation, and an all-plain table is byte-identical to what it was before marks existed.",
  ),
];

// 4. Markdown render — marks render as inline markdown in the pipe table.
block("b-20-structured-table-proj-7").text = [
  t("An optional "),
  c("**<title>**"),
  t(" bold line, then a markdown pipe table: header row, "),
  c("---"),
  t(
    " separator row, one line per row. A title-only or table-only block renders just the part it has. Cell marks render as inline markdown — ",
  ),
  c("**bold**"),
  t(", "),
  c("*italic*"),
  t(", "),
  c("~~strike~~"),
  t(", "),
  c("`code`"),
  t(", "),
  c("[text](href)"),
  t(" — so table reads round-trip with table writes."),
];

// 5a. Actions note — cell-content params are inline markdown.
block("b-20-structured-table-actions-note-9").text = [
  t("Five actions cover the grid. Column addressing accepts exactly one of "),
  c("column"),
  t(" (by name) or "),
  c("columnIndex"),
  t(" (by position); "),
  c("addColumn"),
  t(" rejects a duplicate name and back-fills existing rows with "),
  c("fill"),
  t(
    " (default empty string); row inserts default to the end and pad or truncate ",
  ),
  c("cells"),
  t(" to the column count. Cell-content params ("),
  c("value"),
  t(", "),
  c("cells"),
  t(", "),
  c("name"),
  t(", "),
  c("fill"),
  t(
    ") are inline markdown, parsed to spans by the shared inline tokenizer; unmarked input is stored as the plain string. Links the parser classifies as doc or source references downgrade to plain ",
  ),
  c("link"),
  t(" marks ("),
  c("href"),
  t(" = path plus a "),
  c("#section"),
  t(", "),
  c("#L<line>"),
  t(", or "),
  c("#<symbol>"),
  t(
    " suffix). Column addressing and the duplicate-name check compare the header's plain text.",
  ),
];

// 5b. Interaction surface — note markdown parsing in descriptions; param
//     types stay `string`.
{
  const surface = block("b-20-structured-table-actions-10");
  const ops: any[] = surface.props.operations;
  const byName = (name: string) => {
    const op = ops.find((o) => o.name === name);
    if (!op) {
      console.error(`missing operation ${name}`);
      process.exit(1);
    }
    return op;
  };
  byName("structured-table.addRow").description =
    "Insert a row (cells are inline markdown, padded/truncated to the column count); index defaults to the end.";
  byName("structured-table.updateCell").description =
    "Set one cell to inline markdown, addressing the column by name (column) or position (columnIndex).";
  byName("structured-table.addColumn").description =
    "Insert a column (default at the end), extending every row with the fill value; name and fill are inline markdown.";
}

// 6. Editing para 2 — per-cell mini rich-text editor.
block("b-20-structured-table-editing-para-2").text = [
  t(
    "Each cell hosts its own mini rich-text editor: a single paragraph carrying the five cell marks, with hard breaks as in-cell newlines. Marks apply through the main editor's keyboard shortcuts (",
  ),
  c("Cmd+B"),
  t(", "),
  c("Cmd+I"),
  t(", strike, "),
  c("Cmd+E"),
  t(" for code); input rules auto-convert "),
  c("**bold**"),
  t(
    " and backtick code while typing — the italic and strike input rules are off, matching the main editor. Pasting a URL over a selection creates a link; there is no other link UI and no floating toolbar. ",
  ),
  c("Tab"),
  t("/"),
  c("Shift-Tab"),
  t(" move between cells (header first, wrapping across rows), "),
  c("Enter"),
  t(" moves down the column, "),
  c("Shift-Enter"),
  t(" inserts a newline, "),
  c("Escape"),
  t(" exits. "),
  c("Cmd+A"),
  t(" selects only the cell's contents, never the document; "),
  c("Cmd+Z"),
  t(" / "),
  c("Cmd+Shift+Z"),
  t(
    " commit pending text and forward to the editor's history, so table edits undo and redo like any other. The focused cell draws a 2px accent outline plus small gray notches on its column's top edge and row's left edge.",
  ),
];

// Validate + write canonical bytes.
const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));
console.log(`landed ${PATH}`);

// Re-validate the written file.
const reread = validateDocDocument(JSON.parse(readFileSync(PATH, "utf8")));
if (!reread.ok) {
  console.error("re-validation of written file failed:", JSON.stringify(reread.issues, null, 2));
  process.exit(1);
}
console.log("re-validation of written bytes: ok");
