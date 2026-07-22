/**
 * Batch-rewrite the eight rich-text type pages (10-paragraph .. 17-video)
 * per Ford's 2026-07-21 interview:
 * - Section skeleton: lead, [Example], State Schema, Doc Renderer (old "In
 *   the editor"), Agent Renderer (old "Markdown render"), Agent Notes, Theme.
 * - Example only on 14-callout (live variants) and 17-video (provider URL
 *   embed); 16-image skipped — no asset exists under its bundle.
 * - Fact fixes vs code: input-rule set (bold+code only), divider input rule
 *   (no trailing space), reference-span render (insert, fallback path — no
 *   label), heading H1 convention, image editor props UI, callout coercion
 *   count, quote's labeled-prefix family (mermaid retired).
 * - Source refs (existsSync-gated) on THEME_TOKEN_REGISTRY, ATOM_BLOCK_TYPES,
 *   VideoDocsBlock; doc refs on "block vocabulary" leads + Theming pointer.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const ROOT = "docs/10-system-design/40-block-vocabulary/10-rich-text";

type Span = { insert: string; attributes?: Record<string, unknown> };
const t = (insert: string): Span => ({ insert });
const c = (insert: string): Span => ({ insert, attributes: { code: true } });
const bold = (insert: string): Span => ({ insert, attributes: { bold: true } });

/** Typed source ref, only when the repo path exists on disk. */
const srcRef = (insert: string, path: string): Span => {
  if (!existsSync(path)) {
    console.warn(`source path missing, keeping plain code: ${path}`);
    return c(insert);
  }
  return { insert, attributes: { code: true, reference: { kind: "source", path } } };
};

/** Doc ref, only when the corpus bundle exists on disk. */
const docRef = (insert: string, path: string): Span => {
  if (!existsSync(`docs/${path}/doc.json`)) {
    console.warn(`doc path missing, keeping plain text: ${path}`);
    return t(insert);
  }
  return { insert, attributes: { reference: { kind: "doc", path } } };
};

const THEME_FOLDERS = "packages/docs-workbench/web/src/theme/theme-folders.ts";

/** Shared Theme-section paragraph (per-page theme file name). */
const themePara = (file: string): Span[] => [
  t("This block's theme file is "),
  c(`components/${file}.json`),
  t(" in a theme folder ("),
  c("themes/<id>/"),
  t("; see "),
  docRef("Theming", "20-implementation/40-theming"),
  t("). Every value is one string for both modes or a "),
  c("{ light, dark }"),
  t(" pair, validated against "),
  srcRef("THEME_TOKEN_REGISTRY", THEME_FOLDERS),
  t("."),
];

type Blocks = Record<string, any>;

function setHeading(blocks: Blocks, id: string, text: string, level?: number) {
  const block = blocks[id];
  if (!block) throw new Error(`missing heading block ${id}`);
  block.text = [{ insert: text }];
  if (level !== undefined) block.props.level = level;
}

/** Link the bare "block vocabulary" span in a page lead to the family index. */
function linkLeadVocab(blocks: Blocks, leadId: string) {
  const lead = blocks[leadId];
  const span = (lead.text as Span[]).find(
    (s) => s.insert === "block vocabulary" && !s.attributes,
  );
  if (!span) throw new Error(`no bare "block vocabulary" span in ${leadId}`);
  Object.assign(span, docRef("block vocabulary", "10-system-design/40-block-vocabulary"));
}

function processPage(
  dir: string,
  mutate: (doc: any, blocks: Blocks, root: any) => void,
) {
  const path = `${ROOT}/${dir}/doc.json`;
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const blocks = doc.blocks as Blocks;
  const root = blocks[doc.root];
  mutate(doc, blocks, root);

  // Every listed child must exist; every block must be reachable.
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

// ---------------------------------------------------------------- 10-paragraph
processPage("10-paragraph", (_doc, blocks, root) => {
  setHeading(blocks, "b-10-paragraph-state-h-3", "State Schema");
  setHeading(blocks, "b-10-paragraph-editor-h-7", "Doc Renderer");
  setHeading(blocks, "b-10-paragraph-proj-h-5", "Agent Renderer");
  setHeading(blocks, "b-10-paragraph-agent-h-9", "Agent Notes");
  setHeading(blocks, "b-10-paragraph-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-10-paragraph-lead-2");

  // Doc renderer: only bold + inline code auto-convert (editor-marks.ts,
  // input-rules.ts — dogfood 2026-07-16); Cmd+K opens the link popover on a
  // selection, paste-over-selection applies the mark directly.
  blocks["b-10-paragraph-editor-8"].text = [
    t("Typing lands in a paragraph by default; the slash menu lists it as "),
    bold("Text"),
    t(". Markdown-shortcut input rules auto-convert only "),
    c("**bold**"),
    t(" and "),
    c("`code`"),
    t(" as you type — italic and strike deliberately have no typing shortcut, though their "),
    c("Cmd+I"),
    t(" / "),
    c("Cmd+Shift+S"),
    t(" keybindings and paste conversion still apply the marks. "),
    c("Cmd+K"),
    t(" on a non-empty selection opens the link popover; pasting a URL over a selection applies the link mark directly."),
  ];

  // Agent renderer: reference spans render as their own insert, fallback
  // path — refs carry no label (delta-markdown.ts).
  blocks["b-10-paragraph-proj-6"].text = [
    t("A plain text line. Marks render as standard markdown syntax (code innermost, then bold/italic/strike, link outermost); "),
    c("reference"),
    t(" spans render as plain text — the span's own insert (by the linking standard, the target's name), falling back to the reference path — because the agent surface is a greppable terminal artifact, not a rendered document. Two quirks worth knowing: a paragraph with empty text renders nothing at all, and the document root is itself a paragraph shell whose own line is always skipped — only its children render."),
  ];

  blocks["b-10-paragraph-theming-para"].text = themePara("paragraph");

  root.children = [
    "b-10-paragraph-lead-2",
    "b-10-paragraph-state-h-3",
    "b-10-paragraph-state-4",
    "b-10-paragraph-editor-h-7",
    "b-10-paragraph-editor-8",
    "b-10-paragraph-proj-h-5",
    "b-10-paragraph-proj-6",
    "b-10-paragraph-agent-h-9",
    "b-10-paragraph-agent-1-10",
    "b-10-paragraph-agent-2-11",
    "b-10-paragraph-theming-heading",
    "b-10-paragraph-theming-para",
    "b-10-paragraph-theming-table",
  ];
});

// ------------------------------------------------------------------ 11-heading
processPage("11-heading", (_doc, blocks, root) => {
  setHeading(blocks, "b-11-heading-state-h-3", "State Schema");
  setHeading(blocks, "b-11-heading-editor-h-8", "Doc Renderer");
  setHeading(blocks, "b-11-heading-proj-h-6", "Agent Renderer");
  setHeading(blocks, "b-11-heading-agent-h-10", "Agent Notes");
  setHeading(blocks, "b-11-heading-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-11-heading-lead-2");

  // Corpus H1 convention per writingstyle: title is furniture, most docs
  // carry no level-1 heading.
  blocks["b-11-heading-agent-2-12"].text = [
    t("Corpus convention: at most one "),
    c("level: 1"),
    t(" heading per doc. The page title is furniture rendered above the body, so most docs have none; sections use "),
    c("level: 2"),
    t("."),
  ];

  blocks["b-11-heading-theming-para"].text = themePara("heading");

  root.children = [
    "b-11-heading-lead-2",
    "b-11-heading-state-h-3",
    "b-11-heading-state-4",
    "b-11-heading-state-note-5",
    "b-11-heading-editor-h-8",
    "b-11-heading-editor-9",
    "b-11-heading-proj-h-6",
    "b-11-heading-proj-7",
    "b-11-heading-agent-h-10",
    "b-11-heading-agent-1-11",
    "b-11-heading-agent-2-12",
    "b-11-heading-theming-heading",
    "b-11-heading-theming-para",
    "b-11-heading-theming-table",
  ];
});

// ---------------------------------------------------------------- 12-list-item
processPage("12-list-item", (_doc, blocks, root) => {
  setHeading(blocks, "b-12-list-item-state-h-3", "State Schema");
  setHeading(blocks, "b-12-list-item-editor-h-8", "Doc Renderer");
  setHeading(blocks, "b-12-list-item-proj-h-6", "Agent Renderer");
  setHeading(blocks, "b-12-list-item-agent-h-10", "Agent Notes");
  setHeading(blocks, "b-12-list-item-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-12-list-item-lead-2");

  blocks["b-12-list-item-theming-para"].text = themePara("list-item");

  root.children = [
    "b-12-list-item-lead-2",
    "b-12-list-item-state-h-3",
    "b-12-list-item-state-4",
    "b-12-list-item-state-note-5",
    "b-12-list-item-editor-h-8",
    "b-12-list-item-editor-9",
    "b-12-list-item-proj-h-6",
    "b-12-list-item-proj-7",
    "b-12-list-item-agent-h-10",
    "b-12-list-item-agent-1-11",
    "b-12-list-item-agent-2-12",
    "b-12-list-item-theming-heading",
    "b-12-list-item-theming-para",
    "b-12-list-item-theming-table",
  ];
});

// ------------------------------------------------------------------- 13-quote
processPage("13-quote", (_doc, blocks, root) => {
  setHeading(blocks, "b-13-quote-state-h-3", "State Schema");
  setHeading(blocks, "b-13-quote-editor-h-7", "Doc Renderer");
  setHeading(blocks, "b-13-quote-proj-h-5", "Agent Renderer");
  setHeading(blocks, "b-13-quote-agent-h-9", "Agent Notes");
  setHeading(blocks, "b-13-quote-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-13-quote-lead-2");

  // Labeled `> ` prefix family: callout + video (mermaid is retired from the
  // vocabulary; sequence/canvas replaced it and do not render blockquotes).
  blocks["b-13-quote-agent-2-11"].text = [
    t("In the rendered markdown, quote lines share the "),
    c("> "),
    t(" prefix with callout and video renders; grep for "),
    c("> \\*\\*"),
    t(" to isolate the labeled families from plain quotes."),
  ];

  blocks["b-13-quote-theming-para"].text = themePara("quote");

  root.children = [
    "b-13-quote-lead-2",
    "b-13-quote-state-h-3",
    "b-13-quote-state-4",
    "b-13-quote-editor-h-7",
    "b-13-quote-editor-8",
    "b-13-quote-proj-h-5",
    "b-13-quote-proj-6",
    "b-13-quote-agent-h-9",
    "b-13-quote-agent-1-10",
    "b-13-quote-agent-2-11",
    "b-13-quote-theming-heading",
    "b-13-quote-theming-para",
    "b-13-quote-theming-table",
  ];
});

// ------------------------------------------------------------------ 14-callout
processPage("14-callout", (_doc, blocks, root) => {
  setHeading(blocks, "b-15-callout-state-h-3", "State Schema");
  setHeading(blocks, "b-15-callout-editor-h-10", "Doc Renderer");
  setHeading(blocks, "b-15-callout-proj-h-6", "Agent Renderer");
  setHeading(blocks, "b-15-callout-agent-h-12", "Agent Notes");
  setHeading(blocks, "b-15-callout-theming-heading", "Theme");
  // Coercion demotes to an H3 inside State Schema (the five-H2 contract).
  setHeading(blocks, "b-15-callout-coercion-h-8", "The Coercion Target", 3);
  linkLeadVocab(blocks, "b-15-callout-lead-2");

  // Fix the type count: the canonical list is DOC_BLOCK_TYPES membership,
  // not a frozen number.
  const coercion = blocks["b-15-callout-coercion-9"];
  coercion.text = coercion.text.map((span: Span) =>
    span.insert.includes("14 canonical types")
      ? { ...span, insert: span.insert.replace("one of the 14 canonical types", "one of the canonical block types") }
      : span,
  );

  // The decision box now sits above the Agent Renderer section.
  const proj = blocks["b-15-callout-proj-7"];
  proj.text = proj.text.map((span: Span) =>
    span.insert.includes("This page's own decision box below")
      ? { ...span, insert: span.insert.replace("This page's own decision box below renders", "This page's own decision box renders") }
      : span,
  );

  // Example: live variants showing tone and kind.
  blocks["b-15-callout-example-h-20"] = {
    id: "b-15-callout-example-h-20",
    type: "heading",
    props: { level: 2 },
    text: [t("Example")],
    children: [],
  };
  blocks["b-15-callout-example-intro-21"] = {
    id: "b-15-callout-example-intro-21",
    type: "paragraph",
    props: {},
    text: [
      t("Three live variants: tone only, tone plus "),
      c("title"),
      t(", and a free-form "),
      c("kind"),
      t(" over the tone label."),
    ],
    children: [],
  };
  blocks["b-15-callout-example-info-22"] = {
    id: "b-15-callout-example-info-22",
    type: "callout",
    props: { tone: "info" },
    text: [t("Tone only — the agent render labels this "), c("INFO"), t(".")],
    children: [],
  };
  blocks["b-15-callout-example-success-23"] = {
    id: "b-15-callout-example-success-23",
    type: "callout",
    props: { tone: "success", title: "Golden renders match" },
    text: [t("Tone plus "), c("title"), t(" — the title joins the label line in the agent render.")],
    children: [],
  };
  blocks["b-15-callout-example-kind-24"] = {
    id: "b-15-callout-example-kind-24",
    type: "callout",
    props: { tone: "warning", kind: "Boundary under review", title: "Vocabulary growth" },
    text: [
      t("A free-form "),
      c("kind"),
      t(" wins over the tone label in the agent render; "),
      c("tone"),
      t(" still drives the color."),
    ],
    children: [],
  };

  blocks["b-15-callout-theming-para"].text = themePara("callout");

  root.children = [
    "b-15-callout-lead-2",
    "b-15-callout-example-h-20",
    "b-15-callout-example-intro-21",
    "b-15-callout-example-info-22",
    "b-15-callout-example-success-23",
    "b-15-callout-example-kind-24",
    "b-15-callout-state-h-3",
    "b-15-callout-state-4",
    "b-15-callout-state-note-5",
    "b-15-callout-coercion-h-8",
    "b-15-callout-coercion-9",
    "b-15-callout-editor-h-10",
    "b-15-callout-editor-11",
    "b-15-callout-proj-h-6",
    "b-15-callout-proj-7",
    "b-15-callout-agent-h-12",
    "b-15-callout-agent-1-13",
    "b-15-callout-agent-2-14",
    "b-15-callout-theming-heading",
    "b-15-callout-theming-para",
    "b-15-callout-theming-table",
  ];
});

// ------------------------------------------------------------------ 15-divider
processPage("15-divider", (_doc, blocks, root) => {
  setHeading(blocks, "b-16-divider-state-h-3", "State Schema");
  setHeading(blocks, "b-16-divider-editor-h-7", "Doc Renderer");
  setHeading(blocks, "b-16-divider-proj-h-5", "Agent Renderer");
  setHeading(blocks, "b-16-divider-agent-h-9", "Agent Notes");
  setHeading(blocks, "b-16-divider-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-16-divider-lead-2");

  // Input rule fires on the third hyphen, no trailing space (input-rules.ts);
  // "---" is also a search alias in the slash menu.
  blocks["b-16-divider-editor-8"].text = [
    t("Slash menu: "),
    bold("Divider"),
    t(" (aliases: hr, separator, "),
    c("---"),
    t("). Input rule: typing "),
    c("---"),
    t(" converts the moment the third hyphen lands — no trailing space, matching Notion. It is one of the non-editable atom leaf nodes ("),
    srcRef("ATOM_BLOCK_TYPES", "packages/docs-viewer/src/editor/core/schema.ts"),
    t(" in the viewer's editor schema) — the cursor steps over it, never into it."),
  ];

  blocks["b-16-divider-theming-para"].text = themePara("divider");

  root.children = [
    "b-16-divider-lead-2",
    "b-16-divider-state-h-3",
    "b-16-divider-state-4",
    "b-16-divider-editor-h-7",
    "b-16-divider-editor-8",
    "b-16-divider-proj-h-5",
    "b-16-divider-proj-6",
    "b-16-divider-agent-h-9",
    "b-16-divider-agent-1-10",
    "b-16-divider-theming-heading",
    "b-16-divider-theming-para",
    "b-16-divider-theming-table",
  ];
});

// -------------------------------------------------------------------- 16-image
processPage("16-image", (_doc, blocks, root) => {
  setHeading(blocks, "b-30-image-state-h-3", "State Schema");
  setHeading(blocks, "b-30-image-editor-h-8", "Doc Renderer");
  setHeading(blocks, "b-30-image-proj-h-6", "Agent Renderer");
  setHeading(blocks, "b-30-image-agent-h-10", "Agent Notes");
  setHeading(blocks, "b-30-image-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-30-image-lead-2");

  // The editor has no props UI for image (node-views.tsx reuses the read
  // render); props edit through agent ops. Uploads: generic POST /api/assets
  // stores image/* under assets/images/ (docs-server assets.ts).
  blocks["b-30-image-editor-9"].text = [
    t("Slash menu: "),
    bold("Image"),
    t(" (aliases: picture, photo) — inserts an empty block that renders a missing-"),
    c("src"),
    t(" placeholder card. A non-editable atom leaf node with no props UI in the editor: set "),
    c("src"),
    t("/"),
    c("alt"),
    t("/"),
    c("caption"),
    t(" through agent ops. Asset uploads go through the server's generic "),
    c("POST /api/assets"),
    t(" route, which stores "),
    c("image/*"),
    t(" files under the bundle's "),
    c("assets/images/"),
    t("."),
  ];

  blocks["b-30-image-theming-para"].text = themePara("image");

  root.children = [
    "b-30-image-lead-2",
    "b-30-image-state-h-3",
    "b-30-image-state-4",
    "b-30-image-state-note-5",
    "b-30-image-editor-h-8",
    "b-30-image-editor-9",
    "b-30-image-proj-h-6",
    "b-30-image-proj-7",
    "b-30-image-agent-h-10",
    "b-30-image-agent-1-11",
    "b-30-image-agent-2-12",
    "b-30-image-theming-heading",
    "b-30-image-theming-para",
    "b-30-image-theming-table",
  ];
});

// -------------------------------------------------------------------- 17-video
processPage("17-video", (_doc, blocks, root) => {
  setHeading(blocks, "b-31-video-state-h-3", "State Schema");
  setHeading(blocks, "b-31-video-editor-h-8", "Doc Renderer");
  setHeading(blocks, "b-31-video-proj-h-6", "Agent Renderer");
  setHeading(blocks, "b-31-video-agent-h-10", "Agent Notes");
  setHeading(blocks, "b-31-video-theming-heading", "Theme");
  linkLeadVocab(blocks, "b-31-video-lead-2");

  // Typed source ref on VideoDocsBlock (the file exists on disk).
  const editor = blocks["b-31-video-editor-9"];
  editor.text = editor.text.map((span: Span) =>
    span.insert === "VideoDocsBlock" && span.attributes?.code
      ? srcRef("VideoDocsBlock", "packages/docs-viewer/src/components/rich-text/VideoDocsBlock.tsx")
      : span,
  );

  // Example: a url-only provider embed, no bundle asset needed.
  blocks["b-31-video-example-h-20"] = {
    id: "b-31-video-example-h-20",
    type: "heading",
    props: { level: 2 },
    text: [t("Example")],
    children: [],
  };
  blocks["b-31-video-example-intro-21"] = {
    id: "b-31-video-example-intro-21",
    type: "paragraph",
    props: {},
    text: [
      t("A "),
      c("url"),
      t("-only block — external YouTube URL, no bundle asset. The player is the "),
      c("youtube-nocookie"),
      t(" embed."),
    ],
    children: [],
  };
  blocks["b-31-video-example-embed-22"] = {
    id: "b-31-video-example-embed-22",
    type: "video",
    props: {
      url: "https://www.youtube.com/watch?v=YE7VzlLtp-4",
      title: "Big Buck Bunny",
      caption: "Blender Foundation's open-movie short, embedded from an external URL.",
    },
    children: [],
  };

  blocks["b-31-video-theming-para"].text = themePara("video");

  root.children = [
    "b-31-video-lead-2",
    "b-31-video-example-h-20",
    "b-31-video-example-intro-21",
    "b-31-video-example-embed-22",
    "b-31-video-state-h-3",
    "b-31-video-state-4",
    "b-31-video-state-note-5",
    "b-31-video-editor-h-8",
    "b-31-video-editor-9",
    "b-31-video-proj-h-6",
    "b-31-video-proj-7",
    "b-31-video-agent-h-10",
    "b-31-video-agent-1-11",
    "b-31-video-agent-2-12",
    "b-31-video-theming-heading",
    "b-31-video-theming-para",
    "b-31-video-theming-table",
  ];
});

console.log("all eight rich-text type pages rewritten, canonical");
