/**
 * Targeted enhancement pass over the rich-text family page + eight type pages
 * (Ford's 2026-07-22 directives):
 * - Example H2 (after the lead) on 10-paragraph, 11-heading, 12-list-item,
 *   13-quote, 15-divider, 16-image (live SVG bundle asset — two-renders.svg).
 * - State Schema sections present state as live state-shape blocks sourced
 *   from packages/docs-model/src/components/rich-text/state.ts (family page:
 *   the DeltaSpan shape from doc-schema.ts); prose the block now states is
 *   cut, remaining facts kept.
 * - Theme role-split: contract sentence links block-design 50-theming,
 *   where-files-live sentence keeps the 20-implementation/40-theming link.
 * - Count-phrasing: drop the maintained "eight" from the family intro.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const ROOT = "docs/10-system-design/40-block-vocabulary/10-rich-text";
const RT_STATE = "packages/docs-model/src/components/rich-text/state.ts";
const CONTRACT_THEMING = "10-system-design/30-data-model/20-block-design/50-theming";

type Span = { insert: string; attributes?: Record<string, unknown> };
const t = (insert: string): Span => ({ insert });
const c = (insert: string): Span => ({ insert, attributes: { code: true } });

/** Doc ref, only when the corpus bundle exists on disk. */
const docRef = (insert: string, path: string): Span => {
  if (!existsSync(`docs/${path}/doc.json`)) {
    console.warn(`doc path missing, keeping plain text: ${path}`);
    return t(insert);
  }
  return { insert, attributes: { reference: { kind: "doc", path } } };
};

if (!existsSync(RT_STATE)) throw new Error(`missing source file: ${RT_STATE}`);
if (!existsSync("packages/docs-model/src/doc-schema.ts")) {
  throw new Error("missing source file: doc-schema.ts");
}

type Field = {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
  fields?: Field[];
};

/** State-shape block over a rich-text TypeBox schema symbol in state.ts. */
const stateShape = (
  id: string,
  name: string,
  description: string,
  fields: Field[],
  example?: unknown,
) => ({
  id,
  type: "state-shape",
  props: {
    name,
    description,
    source: { path: RT_STATE, symbol: name },
    fields,
    ...(example === undefined ? {} : { example: JSON.stringify(example, null, 2) }),
  },
  children: [],
});

const heading = (id: string, text: string, level = 2) => ({
  id,
  type: "heading",
  props: { level },
  text: [t(text)],
  children: [],
});

const para = (id: string, text: Span[]) => ({
  id,
  type: "paragraph",
  props: {},
  text,
  children: [],
});

type Blocks = Record<string, any>;

function addBlock(blocks: Blocks, block: { id: string }) {
  if (blocks[block.id]) throw new Error(`id collision: ${block.id}`);
  blocks[block.id] = block;
}

function dropBlock(blocks: Blocks, root: any, id: string) {
  if (!blocks[id]) throw new Error(`missing block to drop: ${id}`);
  delete blocks[id];
  root.children = root.children.filter((child: string) => child !== id);
}

/** Insert ids into root.children right after an anchor id. */
function insertAfter(root: any, anchor: string, ids: string[]) {
  const index = root.children.indexOf(anchor);
  if (index === -1) throw new Error(`anchor not in root children: ${anchor}`);
  root.children.splice(index + 1, 0, ...ids);
}

/** Append the block-design contract sentence to a Theme paragraph. */
function appendContractSentence(blocks: Blocks, id: string) {
  const block = blocks[id];
  if (!block) throw new Error(`missing theme paragraph: ${id}`);
  const flat = block.text.map((s: Span) => s.insert).join("");
  if (flat.includes("The contract is")) throw new Error(`${id} already has contract sentence`);
  const hasImplLink = block.text.some(
    (s: Span) => (s.attributes?.reference as any)?.path === "20-implementation/40-theming",
  );
  if (!hasImplLink) throw new Error(`${id} lacks the implementation Theming link`);
  block.text.push(t(" The contract is "), docRef("Theming", CONTRACT_THEMING), t("."));
}

function processPage(dir: string, mutate: (doc: any, blocks: Blocks, root: any) => void) {
  const path = dir === "." ? `${ROOT}/doc.json` : `${ROOT}/${dir}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const blocks = doc.blocks as Blocks;
  const root = blocks[doc.root];
  mutate(doc, blocks, root);

  for (const id of root.children) {
    if (!blocks[id]) throw new Error(`${dir}: root child ${id} missing`);
  }

  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${dir} INVALID:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  writeFileSync(path, serializeDocDocument(result.document));

  const bytes = readFileSync(path, "utf8");
  const revalidated = validateDocDocument(JSON.parse(bytes));
  if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
    console.error(`${dir}: NOT CANONICAL after write`);
    process.exit(1);
  }
  console.log(`ok — ${dir}`);
}

// ------------------------------------------------------------------ family page
processPage(".", (_doc, blocks, root) => {
  // Count-phrasing: drop the maintained "eight".
  const intro = blocks["b-rich-text-overview-intro-2"];
  intro.text[0].insert = intro.text[0].insert.replace(
    "owns the eight text-and-media block types",
    "owns the text-and-media block types",
  );
  if (intro.text[0].insert.includes("eight")) throw new Error("family intro still counts");

  // Live DeltaSpan shape leading the annotated JSON example.
  addBlock(blocks, {
    id: "b-rtfam-span-shape-43",
    type: "state-shape",
    props: {
      name: "DeltaSpan",
      description: "One rich-text span: a string insert plus optional marks.",
      source: { path: "packages/docs-model/src/doc-schema.ts", symbol: "DeltaSpan" },
      fields: [
        {
          name: "insert",
          type: "string",
          description: "The span's text; for a reference span, the display text.",
        },
        {
          name: "attributes",
          type: "object",
          required: false,
          description: "Marks on this span; an empty object is dropped on canonicalization.",
          fields: [
            { name: "bold", type: "true", required: false },
            { name: "italic", type: "true", required: false },
            { name: "strike", type: "true", required: false },
            { name: "code", type: "true", required: false },
            {
              name: "link",
              type: "string",
              required: false,
              description: "Outbound URL mark.",
            },
            {
              name: "reference",
              type: "SpectreRef",
              required: false,
              description: "Doc or code mention chip; kind plus repo-relative path.",
            },
          ],
        },
      ],
      example: JSON.stringify(
        [
          { insert: "Validated by " },
          {
            insert: "validateDocDocument",
            attributes: {
              code: true,
              reference: { kind: "source", path: "packages/docs-model/src/doc-schema.ts" },
            },
          },
          { insert: "." },
        ],
        null,
        2,
      ),
    },
    children: [],
  });
  insertAfter(root, "b-rtfam-state-lead-21", ["b-rtfam-span-shape-43"]);

  appendContractSentence(blocks, "b-rich-text-overview-theming-note-12");
});

// ---------------------------------------------------------------- 10-paragraph
processPage("10-paragraph", (_doc, blocks, root) => {
  addBlock(blocks, heading("b-10-paragraph-example-h-20", "Example"));
  addBlock(
    blocks,
    para("b-10-paragraph-example-para-21", [
      t("This paragraph is a live example: it carries "),
      { insert: "bold", attributes: { bold: true } },
      t(", "),
      { insert: "italic", attributes: { italic: true } },
      t(", "),
      { insert: "strike", attributes: { strike: true } },
      t(", and "),
      c("code"),
      t(" marks, "),
      { insert: "an outbound link", attributes: { link: "https://example.com" } },
      t(", and a reference chip to "),
      docRef("Cross-doc linking", "10-system-design/10-doc-standards/30-cross-doc-linking"),
      t("."),
    ]),
  );
  insertAfter(root, "b-10-paragraph-lead-2", [
    "b-10-paragraph-example-h-20",
    "b-10-paragraph-example-para-21",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-10-paragraph-state-shape-22",
      "ParagraphState",
      "Closed empty object — any prop is a validation error.",
      [],
    ),
  );
  insertAfter(root, "b-10-paragraph-state-h-3", ["b-10-paragraph-state-shape-22"]);

  // The block now states the no-props fact; keep the delta-text facts.
  blocks["b-10-paragraph-state-4"].text = [
    t("Carries delta text ("),
    c("carriesText: true"),
    t("): an array of spans with optional "),
    c("bold"),
    t(" / "),
    c("italic"),
    t(" / "),
    c("strike"),
    t(" / "),
    c("code"),
    t(" marks, a "),
    c("link"),
    t(" URL, or a reference chip (a shared SpectreRef pointing at a doc or code location)."),
  ];

  appendContractSentence(blocks, "b-10-paragraph-theming-para");
});

// ------------------------------------------------------------------ 11-heading
processPage("11-heading", (_doc, blocks, root) => {
  addBlock(blocks, heading("b-11-heading-example-h-20", "Example"));
  addBlock(blocks, heading("b-11-heading-example-h3-21", "A Live Level-3 Heading", 3));
  insertAfter(root, "b-11-heading-lead-2", [
    "b-11-heading-example-h-20",
    "b-11-heading-example-h3-21",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-11-heading-state-shape-22",
      "HeadingState",
      "Closed schema — level is the only prop.",
      [
        {
          name: "level",
          type: "integer 1-6",
          required: false,
          description:
            "Heading depth; absent reads as level 2 in the renderer, editor, and agent surface alike.",
        },
      ],
      { level: 3 },
    ),
  );
  insertAfter(root, "b-11-heading-state-h-3", ["b-11-heading-state-shape-22"]);
  dropBlock(blocks, root, "b-11-heading-state-4");

  // The block now states the closed-schema fact; keep the carriesText fact.
  blocks["b-11-heading-state-note-5"].text = [
    t("Carries delta text ("),
    c("carriesText: true"),
    t(") with the full mark set."),
  ];

  appendContractSentence(blocks, "b-11-heading-theming-para");
});

// ---------------------------------------------------------------- 12-list-item
processPage("12-list-item", (_doc, blocks, root) => {
  addBlock(blocks, heading("b-12-list-item-example-h-20", "Example"));
  addBlock(blocks, {
    id: "b-12-list-item-example-bullet-21",
    type: "list-item",
    props: {},
    text: [t("A bullet item.")],
    children: ["b-12-list-item-example-nested-22"],
  });
  addBlock(blocks, {
    id: "b-12-list-item-example-nested-22",
    type: "list-item",
    props: {},
    text: [t("A nested item — a child list-item block, not markup.")],
    children: [],
  });
  addBlock(blocks, {
    id: "b-12-list-item-example-ordered-23",
    type: "list-item",
    props: { ordered: true },
    text: [t("An ordered item ("), c("ordered: true"), t(").")],
    children: [],
  });
  addBlock(blocks, {
    id: "b-12-list-item-example-ordered2-24",
    type: "list-item",
    props: { ordered: true },
    text: [t("Numbering is derived from the sibling run.")],
    children: [],
  });
  insertAfter(root, "b-12-list-item-lead-2", [
    "b-12-list-item-example-h-20",
    "b-12-list-item-example-bullet-21",
    "b-12-list-item-example-ordered-23",
    "b-12-list-item-example-ordered2-24",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-12-list-item-state-shape-25",
      "ListItemState",
      "Closed schema — ordered is the only prop.",
      [
        {
          name: "ordered",
          type: "boolean",
          required: false,
          description: "true renders a numbered item; absent or false renders a bullet.",
        },
      ],
      { ordered: true },
    ),
  );
  insertAfter(root, "b-12-list-item-state-h-3", ["b-12-list-item-state-shape-25"]);
  dropBlock(blocks, root, "b-12-list-item-state-4");

  appendContractSentence(blocks, "b-12-list-item-theming-para");
});

// ------------------------------------------------------------------- 13-quote
processPage("13-quote", (_doc, blocks, root) => {
  addBlock(blocks, heading("b-13-quote-example-h-20", "Example"));
  addBlock(blocks, {
    id: "b-13-quote-example-quote-21",
    type: "quote",
    props: {},
    text: [t("A live quote: prose set apart from the flow — no label, no tone, plain delta text.")],
    children: [],
  });
  insertAfter(root, "b-13-quote-lead-2", [
    "b-13-quote-example-h-20",
    "b-13-quote-example-quote-21",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-13-quote-state-shape-22",
      "QuoteState",
      "Closed empty object — any prop is a validation error.",
      [],
    ),
  );
  insertAfter(root, "b-13-quote-state-h-3", ["b-13-quote-state-shape-22"]);

  // The block now states the no-props fact; keep the carriesText fact.
  blocks["b-13-quote-state-4"].text = [
    t("Carries delta text ("),
    c("carriesText: true"),
    t(") with the full mark set."),
  ];

  appendContractSentence(blocks, "b-13-quote-theming-para");
});

// ------------------------------------------------------------------ 14-callout
processPage("14-callout", (_doc, blocks, root) => {
  addBlock(
    blocks,
    stateShape(
      "b-15-callout-state-shape-25",
      "CalloutState",
      "Closed schema; all three props are optional.",
      [
        {
          name: "tone",
          type: '"info" | "decision" | "risk" | "warning" | "success"',
          required: false,
          description:
            "Color/intent; the agent render's label falls back to the uppercased tone (default INFO).",
        },
        {
          name: "kind",
          type: "string",
          required: false,
          description:
            "Free-form label chip; wins over tone in the agent render. Coerced legacy types land their old type name here.",
        },
        {
          name: "title",
          type: "string",
          required: false,
          description: "Optional bold title after the label.",
        },
      ],
      { tone: "warning", kind: "Boundary under review", title: "Vocabulary growth" },
    ),
  );
  insertAfter(root, "b-15-callout-state-h-3", ["b-15-callout-state-shape-25"]);
  dropBlock(blocks, root, "b-15-callout-state-4");

  appendContractSentence(blocks, "b-15-callout-theming-para");
});

// ------------------------------------------------------------------ 15-divider
processPage("15-divider", (_doc, blocks, root) => {
  addBlock(blocks, heading("b-16-divider-example-h-20", "Example"));
  addBlock(
    blocks,
    para("b-16-divider-example-intro-21", [t("The rule below is a live divider block.")]),
  );
  addBlock(blocks, {
    id: "b-16-divider-example-hr-22",
    type: "divider",
    props: {},
    children: [],
  });
  insertAfter(root, "b-16-divider-lead-2", [
    "b-16-divider-example-h-20",
    "b-16-divider-example-intro-21",
    "b-16-divider-example-hr-22",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-16-divider-state-shape-23",
      "DividerState",
      "Closed empty object — no props.",
      [],
    ),
  );
  insertAfter(root, "b-16-divider-state-h-3", ["b-16-divider-state-shape-23"]);

  // The block now states the no-props fact; keep the no-text fact.
  blocks["b-16-divider-state-4"].text = [
    t("No text ("),
    c("carriesText: false"),
    t(") — the simplest block in the vocabulary."),
  ];

  appendContractSentence(blocks, "b-16-divider-theming-para");
});

// -------------------------------------------------------------------- 16-image
processPage("16-image", (_doc, blocks, root) => {
  const asset = `${ROOT}/16-image/assets/images/two-renders.svg`;
  if (!existsSync(asset)) throw new Error(`missing bundle asset: ${asset}`);

  addBlock(blocks, heading("b-30-image-example-h-20", "Example"));
  addBlock(
    blocks,
    para("b-30-image-example-intro-21", [
      t("A live block over a real bundle asset — the SVG lives at "),
      c("assets/images/two-renders.svg"),
      t(" in this doc's bundle."),
    ]),
  );
  addBlock(blocks, {
    id: "b-30-image-example-img-22",
    type: "image",
    props: {
      src: "./assets/images/two-renders.svg",
      alt: "A doc.json box with arrows to a doc render and an agent render.",
      caption: "One doc.json, two renders.",
    },
    children: [],
  });
  insertAfter(root, "b-30-image-lead-2", [
    "b-30-image-example-h-20",
    "b-30-image-example-intro-21",
    "b-30-image-example-img-22",
  ]);

  addBlock(
    blocks,
    stateShape(
      "b-30-image-state-shape-23",
      "ImageState",
      "Closed schema; src is the only required prop.",
      [
        {
          name: "src",
          type: "string",
          description: "Image source — conventionally a bundle-relative path under assets/images/.",
        },
        {
          name: "alt",
          type: "string",
          required: false,
          description: "Alt text; the agent render falls back to caption, then empty.",
        },
        {
          name: "caption",
          type: "string",
          required: false,
          description: "Caption under the image; an italic line in the agent render.",
        },
      ],
      {
        src: "./assets/images/two-renders.svg",
        alt: "A doc.json box with arrows to a doc render and an agent render.",
        caption: "One doc.json, two renders.",
      },
    ),
  );
  insertAfter(root, "b-30-image-state-h-3", ["b-30-image-state-shape-23"]);
  dropBlock(blocks, root, "b-30-image-state-4");

  // The block now states the required/optional split; keep the no-text fact.
  blocks["b-30-image-state-note-5"].text = [
    t("No text ("),
    c("carriesText: false"),
    t(")."),
  ];

  appendContractSentence(blocks, "b-30-image-theming-para");
});

// -------------------------------------------------------------------- 17-video
processPage("17-video", (_doc, blocks, root) => {
  addBlock(
    blocks,
    stateShape(
      "b-31-video-state-shape-25",
      "VideoState",
      "Closed schema; all four props are optional.",
      [
        {
          name: "src",
          type: "string",
          required: false,
          description: "Bundle-local video file, uploaded to the bundle's assets/videos/.",
        },
        {
          name: "url",
          type: "string",
          required: false,
          description: "External video URL; wins over src when both are present.",
        },
        {
          name: "title",
          type: "string",
          required: false,
          description: "Display title, also the agent render's label.",
        },
        {
          name: "caption",
          type: "string",
          required: false,
          description: "Caption appended to the agent render line.",
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=YE7VzlLtp-4",
        title: "Big Buck Bunny",
        caption: "Blender Foundation's open-movie short, embedded from an external URL.",
      },
    ),
  );
  insertAfter(root, "b-31-video-state-h-3", ["b-31-video-state-shape-25"]);
  dropBlock(blocks, root, "b-31-video-state-4");

  // The block now states the all-optional fact; keep the useful-block fact.
  blocks["b-31-video-state-note-5"].text = [
    t("No text ("),
    c("carriesText: false"),
    t("); a useful block sets at least one of "),
    c("src"),
    t(" / "),
    c("url"),
    t("."),
  ];

  appendContractSentence(blocks, "b-31-video-theming-para");
});

console.log("family page + eight type pages updated, canonical");
