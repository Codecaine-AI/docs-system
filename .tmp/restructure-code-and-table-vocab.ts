/**
 * Canonical reference-page restructure for two block-vocabulary pages:
 *   - 20-code-block: lead / Example (NEW live annotated code block) / State /
 *     Typed actions / Renderers (merged "In the editor" + "Markdown render",
 *     doc renderer first) / Agent notes / Theming.
 *   - 30-structured-table: same order; Example is a live structured-table of
 *     the default theme's real overrides (themes/default/components/
 *     structured-table.json) with code-marked CSS-variable cells. The extra
 *     page-specific "Editing" section stays intact, placed directly after
 *     Renderers.
 * All existing block content is preserved; only signpost sentence prefixes
 * change where the merged section would otherwise lose context.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });

const CODE_PATH = "docs/10-system-design/40-block-vocabulary/20-code-block/doc.json";
const TABLE_PATH = "docs/10-system-design/40-block-vocabulary/30-structured-table/doc.json";

function land(path: string, doc: unknown) {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  console.log(`landed ${path}`);
}

function load(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// 20-code-block
// ---------------------------------------------------------------------------

const codeDoc = load(CODE_PATH);
{
  const blocks = codeDoc.blocks;

  // NEW Example section: heading + intro + a live annotated code block.
  blocks["b-14-code-example-h"] = {
    id: "b-14-code-example-h",
    type: "heading",
    props: { level: 2 },
    text: [t("Example")],
    children: [],
  };
  blocks["b-14-code-example-intro"] = {
    id: "b-14-code-example-intro",
    type: "paragraph",
    props: {},
    text: [t("A live instance of the type — a small annotated listing:")],
    children: [],
  };
  blocks["b-14-code-example-block"] = {
    id: "b-14-code-example-block",
    type: "code",
    props: {
      language: "typescript",
      annotations: [
        {
          lines: "3-5",
          label: "Guard",
          note: "Rejects a document whose root pointer names no block — the tree invariant every reader assumes.",
        },
        {
          lines: "6",
          note: "Callers get the resolved root shell, never the raw id.",
        },
      ],
    },
    text: [
      t(
        "export function requireRoot(doc: DocDocument): DocBlock {\n" +
          "  const root = doc.blocks[doc.root];\n" +
          "  if (!root) {\n" +
          "    throw new Error(`missing root block: ${doc.root}`);\n" +
          "  }\n" +
          "  return root;\n" +
          "}",
      ),
    ],
    children: [],
  };

  // "Markdown render" heading becomes the merged "Renderers" heading.
  blocks["b-14-code-proj-h-6"].text = [t("Renderers")];

  // Signpost the editor paragraph now that its own heading is gone.
  const editorSpans = blocks["b-14-code-editor-13"].text;
  if (editorSpans[0].insert !== "Slash menu: ") {
    console.error("unexpected editor-13 first span:", JSON.stringify(editorSpans[0]));
    process.exit(1);
  }
  editorSpans[0] = t("In the editor: slash menu ");

  // Signpost the markdown paragraph as the agent-facing projection.
  const projSpans = blocks["b-14-code-proj-7"].text;
  if (projSpans[0].insert !== "A fenced code block using ") {
    console.error("unexpected proj-7 first span:", JSON.stringify(projSpans[0]));
    process.exit(1);
  }
  projSpans[0] = t("The agent-facing markdown projection: a fenced code block using ");

  // "In the editor" heading is absorbed into Renderers.
  delete blocks["b-14-code-editor-h-12"];

  blocks["b-14-code-root"].children = [
    "b-14-code-lead-2",
    "b-14-code-example-h",
    "b-14-code-example-intro",
    "b-14-code-example-block",
    "b-14-code-state-h-3",
    "b-14-code-state-4",
    "b-14-code-state-note-5",
    "b-14-code-actions-h-9",
    "b-14-code-actions-note-10",
    "b-14-code-actions-11",
    "b-14-code-proj-h-6",
    "b-14-code-editor-13",
    "b-14-code-proj-7",
    "b-14-code-proj-example-8",
    "b-14-code-agent-h-14",
    "b-14-code-agent-1-15",
    "b-14-code-agent-2-16",
    "b-14-code-theming-heading",
    "b-14-code-theming-para",
    "b-14-code-theming-table",
  ];
}
land(CODE_PATH, codeDoc);

// ---------------------------------------------------------------------------
// 30-structured-table
// ---------------------------------------------------------------------------

const tableDoc = load(TABLE_PATH);
{
  const blocks = tableDoc.blocks;

  const codeCell = (text: string) => [{ insert: text, attributes: { code: true } }];

  // NEW Example section: heading + intro + a live structured-table. Rows are
  // the default theme's real overrides (themes/default/components/
  // structured-table.json), CSS variables carried as code-marked span cells.
  blocks["b-20-structured-table-example-h"] = {
    id: "b-20-structured-table-example-h",
    type: "heading",
    props: { level: 2 },
    text: [t("Example")],
    children: [],
  };
  blocks["b-20-structured-table-example-intro"] = {
    id: "b-20-structured-table-example-intro",
    type: "paragraph",
    props: {},
    text: [
      t(
        "A live instance of the type — the default theme's structured-table overrides, with code-marked CSS-variable cells:",
      ),
    ],
    children: [],
  };
  blocks["b-20-structured-table-example-block"] = {
    id: "b-20-structured-table-example-block",
    type: "structured-table",
    props: {
      title: "Default theme — structured-table overrides",
      columns: ["Key", "CSS variable", "Value"],
      rows: [
        ["headerRuleWidth", codeCell("--docs-table-header-rule-width"), "1.5px"],
        ["cellPaddingY", codeCell("--docs-table-cell-pad-y"), "12px"],
        ["rowRuleOpacity", codeCell("--docs-table-row-rule-opacity"), "0.8"],
      ],
      density: "compact",
    },
    children: [],
  };

  // "Markdown render" heading becomes the merged "Renderers" heading.
  blocks["b-20-structured-table-proj-h-6"].text = [t("Renderers")];

  // Signpost the editor paragraph now that its own heading is gone.
  const editorSpans = blocks["b-20-structured-table-editor-12"].text;
  const editorLead = "A non-editable atom leaf node with its own React render surface (";
  if (editorSpans[0].insert !== editorLead) {
    console.error("unexpected editor-12 first span:", JSON.stringify(editorSpans[0]));
    process.exit(1);
  }
  editorSpans[0] = t("In the editor, a non-editable atom leaf node with its own React render surface (");

  // Signpost the markdown paragraph as the agent-facing projection.
  const projSpans = blocks["b-20-structured-table-proj-7"].text;
  if (projSpans[0].insert !== "An optional ") {
    console.error("unexpected proj-7 first span:", JSON.stringify(projSpans[0]));
    process.exit(1);
  }
  projSpans[0] = t("The agent-facing markdown projection: an optional ");

  // "In the editor" heading is absorbed into Renderers.
  delete blocks["b-20-structured-table-editor-h-11"];

  blocks["b-20-structured-table-root"].children = [
    "b-20-structured-table-lead-2",
    "b-20-structured-table-example-h",
    "b-20-structured-table-example-intro",
    "b-20-structured-table-example-block",
    "b-20-structured-table-state-h-3",
    "b-20-structured-table-state-4",
    "b-20-structured-table-state-note-5",
    "b-20-structured-table-actions-h-8",
    "b-20-structured-table-actions-note-9",
    "b-20-structured-table-actions-10",
    "b-20-structured-table-proj-h-6",
    "b-20-structured-table-editor-12",
    "b-20-structured-table-proj-7",
    "b-20-structured-table-editing-heading",
    "b-20-structured-table-editing-para-1",
    "b-20-structured-table-editing-para-2",
    "b-20-structured-table-editing-para-3",
    "b-20-structured-table-agent-h-13",
    "b-20-structured-table-agent-1-14",
    "b-20-structured-table-agent-2-15",
    "b-20-structured-table-theming-heading",
    "b-20-structured-table-theming-para",
    "b-20-structured-table-theming-table",
  ];
}
land(TABLE_PATH, tableDoc);

console.log("done");
