/**
 * Targeted enhancement pass on the three family pages (Ford, 2026-07-22):
 * 20-code-block, 30-structured-table, 40-file-tree.
 *
 * Per page: (1) a live state-shape block leads the State Schema section,
 * fields mirroring the real TypeBox schema in the family's state.ts, with
 * source {path, symbol} and a small valid JSON example; the now-verbatim
 * prop table is cut. (2) Theme-link role split: contract sentence links
 * dm-block-design/50-theming, where-files-live sentence links
 * 20-implementation/40-theming (span "Theming"). (3) Maintained-count
 * phrasing dropped ("seventh op in the vocabulary", "seven doc ops").
 * (4) 20-code-block doc id: ...-14-code -> ...-20-code-block.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const VOCAB = "docs/10-system-design/40-block-vocabulary";

// ---------- helpers ----------

function loadDoc(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveCanonical(path: string, doc: any): void {
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${path} INVALID:\n` + JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));
  const bytes = readFileSync(path, "utf8");
  const revalidated = validateDocDocument(JSON.parse(bytes));
  if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
    console.error(`${path} NOT CANONICAL after write`);
    process.exit(1);
  }
  console.log(`ok — ${path} canonical`);
}

function requireSource(path: string): string {
  if (!existsSync(path)) {
    console.error(`missing source file: ${path}`);
    process.exit(1);
  }
  return path;
}

function assertParses(json: string): string {
  JSON.parse(json); // throws on bad authoring; validator also enforces this
  return json;
}

/** Replace the exact insert text of one span in a block, asserting the match. */
function replaceSpan(doc: any, blockId: string, from: string, to: string): void {
  const spans = doc.blocks[blockId].text as Array<{ insert: string; attributes?: unknown }>;
  const hits = spans.filter((s) => s.insert === from);
  if (hits.length !== 1) {
    console.error(`expected exactly one span "${from}" in ${blockId}, found ${hits.length}`);
    process.exit(1);
  }
  hits[0].insert = to;
}

/**
 * In a Theme paragraph, turn "(themes/<id>/). Every value..." into
 * "(themes/<id>/; the system is [Theming -> 20-implementation/40-theming]). Every value..."
 * — the where-files-live role of the theme-link split.
 */
function addSystemThemeLink(doc: any, blockId: string, tailText: string): void {
  const spans = doc.blocks[blockId].text as Array<{ insert: string; attributes?: unknown }>;
  const index = spans.findIndex((s) => s.insert === tailText && !s.attributes);
  if (index === -1) {
    console.error(`tail span not found in ${blockId}: "${tailText}"`);
    process.exit(1);
  }
  // Insert the link inside the paren: "(themes/<id>/; the system is Theming). Every value..."
  spans.splice(
    index,
    0,
    { insert: "; the system is " },
    { insert: "Theming", attributes: { reference: { kind: "doc", path: "20-implementation/40-theming" } } },
  );
}

/** Insert newId into root children directly after anchorId; delete removeId everywhere. */
function restructureStateSection(doc: any, anchorId: string, newId: string, removeId: string): void {
  const root = doc.blocks[doc.root];
  const children = root.children as string[];
  const at = children.indexOf(anchorId);
  if (at === -1) {
    console.error(`anchor ${anchorId} not in root children`);
    process.exit(1);
  }
  children.splice(at + 1, 0, newId);
  const rm = children.indexOf(removeId);
  if (rm === -1) {
    console.error(`${removeId} not in root children`);
    process.exit(1);
  }
  children.splice(rm, 1);
  if (!doc.blocks[removeId]) {
    console.error(`${removeId} not in blocks`);
    process.exit(1);
  }
  delete doc.blocks[removeId];
}

// ---------- 20-code-block ----------
{
  const path = `${VOCAB}/20-code-block/doc.json`;
  const doc = loadDoc(path);

  // 4) Stale doc id from two renumbers ago -> current convention
  //    (vocab-prefix + current directory slug, as the newest sibling ids use).
  if (doc.id !== "10-system-design-10-block-vocabulary-14-code") {
    console.error(`unexpected code-block doc id: ${doc.id}`);
    process.exit(1);
  }
  doc.id = "10-system-design-10-block-vocabulary-20-code-block";

  // 1) State-shape block leads the State Schema section; the verbatim
  //    prop table (b-14-code-state-4) is cut. The annotated TypeBox excerpt
  //    stays as source evidence; the carrier paragraph stays (carriesText +
  //    editor marks facts the block cannot carry).
  doc.blocks["b-codefam-state-shape"] = {
    id: "b-codefam-state-shape",
    type: "state-shape",
    props: {
      name: "CodeState",
      source: {
        path: requireSource("packages/docs-model/src/components/code/state.ts"),
        symbol: "CodeState",
      },
      fields: [
        {
          name: "language",
          type: "string",
          required: false,
          description: 'Fence tag for highlighting and the header label, e.g. "json", "ts".',
        },
        {
          name: "annotations",
          type: "CodeAnnotation[]",
          required: false,
          description: "Line annotations, each keyed by its exact lines string.",
          fields: [
            {
              name: "lines",
              type: "string",
              description: '1-indexed range string — "4", "4-9", "1,4-6" — and the entry\'s identity key.',
            },
            {
              name: "label",
              type: "string",
              required: false,
              description: "Short heading on the note.",
            },
            {
              name: "note",
              type: "string",
              description: "The annotation body.",
            },
          ],
        },
      ],
      example: assertParses(
        JSON.stringify(
          {
            language: "typescript",
            annotations: [
              {
                lines: "3-5",
                label: "Guard",
                note: "Rejects a document whose root pointer names no block.",
              },
            ],
          },
          null,
          2,
        ),
      ),
    },
    children: [],
  };
  restructureStateSection(doc, "b-14-code-state-h-3", "b-codefam-state-shape", "b-14-code-state-4");

  // 2) Theme-link role split: add the where-files-live link (the contract
  //    sentence already links dm-block-design/50-theming with span "Theming").
  addSystemThemeLink(doc, "b-14-code-theming-para", "). Every value is one string for both modes or a ");

  // 3) Count phrasing: drop the maintained op number.
  replaceSpan(
    doc,
    "b-codefam-adapter-1",
    " op — the seventh op in the vocabulary, alongside ",
    " op — one of the generic doc ops, alongside ",
  );

  saveCanonical(path, doc);
}

// ---------- 30-structured-table ----------
{
  const path = `${VOCAB}/30-structured-table/doc.json`;
  const doc = loadDoc(path);

  // 1) State-shape block leads; verbatim prop table (b-20-structured-table-state-4)
  //    is cut. TypeBox excerpt (cell-union evidence) and the canonical-encoding
  //    note paragraph stay.
  doc.blocks["b-stfam-state-shape"] = {
    id: "b-stfam-state-shape",
    type: "state-shape",
    props: {
      name: "StructuredTableState",
      source: {
        path: requireSource("packages/docs-model/src/components/structured-table/state.ts"),
        symbol: "StructuredTableState",
      },
      fields: [
        {
          name: "title",
          type: "string",
          required: false,
          description: "Optional caption above the table; always a plain string — cell marks never apply.",
        },
        {
          name: "columns",
          type: "TableCell[]",
          description:
            "Header cells in order. A TableCell is a plain string or a span array whose closed mark set is bold/italic/strike/code/link.",
        },
        {
          name: "rows",
          type: "TableCell[][]",
          description:
            "One cell array per row; actions normalize each row to the column count. An unmarked cell stores as the plain string (canonical).",
        },
        {
          name: "density",
          type: '"compact" | "normal" | "relaxed"',
          required: false,
          description: "Accepted by the schema; the renderer ignores it — spacing comes from the theme tokens.",
        },
      ],
      example: assertParses(
        JSON.stringify(
          {
            title: "Registry kinds",
            columns: ["Key", "Kind"],
            rows: [
              ["headerRuleWidth", "length"],
              [[{ insert: "rowRuleOpacity", attributes: { code: true } }], "number"],
            ],
          },
          null,
          2,
        ),
      ),
    },
    children: [],
  };
  restructureStateSection(
    doc,
    "b-20-structured-table-state-h-3",
    "b-stfam-state-shape",
    "b-20-structured-table-state-4",
  );

  // Intro paragraph: drop the state.ts source sentence the block now carries;
  // keep the closed-schema fact and the contract link.
  doc.blocks["b-stfam-state-intro"].text = [
    { insert: "All state is four typed props — " },
    { insert: "carriesText: false", attributes: { code: true } },
    { insert: ", no " },
    { insert: "text", attributes: { code: true } },
    { insert: " key; the schema is a closed TypeBox object. The contract is " },
    {
      insert: "State schema",
      attributes: {
        reference: { kind: "doc", path: "10-system-design/30-data-model/20-block-design/10-state-schema" },
      },
    },
    { insert: "." },
  ];

  // 2) Theme links already role-split on this page (both roles present once).
  // 3) Count phrasing: drop the maintained op number.
  const adapter = doc.blocks["b-stfam-adapter-p"].text as Array<{ insert: string }>;
  const opSpan = adapter.find((s) => s.insert.includes("one of the seven doc ops"));
  if (!opSpan) {
    console.error("seven-doc-ops span not found in b-stfam-adapter-p");
    process.exit(1);
  }
  opSpan.insert = opSpan.insert.replace("one of the seven doc ops", "one of the generic doc ops");

  saveCanonical(path, doc);
}

// ---------- 40-file-tree ----------
{
  const path = `${VOCAB}/40-file-tree/doc.json`;
  const doc = loadDoc(path);

  // 1) State-shape block leads; the verbatim "One entry" table
  //    (b-21-file-tree-entry-state-5) is cut. Path rules, the trailing-slash
  //    gotcha, and the tolerant-read bullets stay as depth.
  doc.blocks["b-ftfam-state-shape"] = {
    id: "b-ftfam-state-shape",
    type: "state-shape",
    props: {
      name: "FileTreeState",
      source: {
        path: requireSource("packages/docs-model/src/components/file-tree/state.ts"),
        symbol: "FileTreeState",
      },
      fields: [
        {
          name: "entries",
          type: "FileTreeEntry[]",
          description: "Flat list of path entries; the rendered tree derives from path prefixes.",
          fields: [
            {
              name: "path",
              type: "string",
              description: '/-separated, no leading "./"; a trailing "/" marks an explicit directory.',
            },
            {
              name: "note",
              type: "string",
              required: false,
              description: "Short annotation rendered after the path.",
            },
            {
              name: "change",
              type: '"added" | "removed" | "modified" | "renamed"',
              required: false,
              description: "Diff marker for the entry.",
            },
            {
              name: "from",
              type: "string",
              required: false,
              description: 'Previous path, used with change: "renamed".',
            },
          ],
        },
      ],
      example: assertParses(
        JSON.stringify(
          {
            entries: [
              {
                path: "packages/docs-model/src/components/file-tree/state.ts",
                note: "entry schema",
              },
              {
                path: "packages/docs-model/src/components/file-tree/lib.ts",
                change: "renamed",
                from: "packages/docs-model/src/components/file-tree/render.ts",
              },
            ],
          },
          null,
          2,
        ),
      ),
    },
    children: [],
  };
  restructureStateSection(doc, "b-21-file-tree-state-h-3", "b-ftfam-state-shape", "b-21-file-tree-entry-state-5");

  // Lead paragraph: drop the state.ts source span the block now carries.
  doc.blocks["b-ftfam-state-lead"].text = [
    { insert: "All state is one props key: " },
    { insert: "entries", attributes: { code: true } },
    { insert: ", an array of path entries validated by the closed " },
    { insert: "FileTreeState", attributes: { code: true } },
    { insert: " schema. The type carries no delta text (" },
    { insert: "carriesText: false", attributes: { code: true } },
    { insert: ") and no title prop — every fact lives in " },
    { insert: "entries", attributes: { code: true } },
    { insert: ". The contract is " },
    {
      insert: "State schema",
      attributes: {
        reference: { kind: "doc", path: "10-system-design/30-data-model/20-block-design/10-state-schema" },
      },
    },
    { insert: "." },
  ];

  // 2) Theme-link role split: add the where-files-live link (contract link
  //    to dm-block-design/50-theming already present with span "Theming").
  addSystemThemeLink(doc, "b-21-file-tree-theming-para", "). Every value is one string for both modes or a ");

  // 3) No maintained-count phrasing on this page.

  saveCanonical(path, doc);
}

console.log("done — three family pages enhanced");
