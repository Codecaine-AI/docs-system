/**
 * Rewrite 40-block-vocabulary/20-code-block as the CODE family's
 * contract-instantiation page (Ford's 2026-07-21 skeleton): lead paragraphs,
 * optional Example H2, then exactly six H2s — State Schema / Typed Actions /
 * Doc Renderer / Agent Renderer / Theme / Agent Adapter — each explaining
 * how that block-design contract element works for this family, grounded in
 * packages/docs-model/src/components/code and
 * packages/docs-viewer/src/components/code.
 *
 * Fact fixes vs the previous page:
 * - input rule: fires on the third backtick alone, NO typed language tag
 *   (input-rules.ts find: /^```$/) — the old "optional language tag" claim
 *   was wrong.
 * - JSON pretty-print: applies on BOTH read surfaces (CodeAnnotations.tsx
 *   pretty-prints before line-splitting) — old claim said annotation-free
 *   blocks only.
 * - theme table: full 16-key registry (theme-folders.ts `code` entry), not
 *   the 7-key subset.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializeDocDocument, validateDocDocument } from "../packages/docs-model/src/index.ts";

const PATH = "docs/10-system-design/40-block-vocabulary/20-code-block/doc.json";

const doc = JSON.parse(readFileSync(PATH, "utf8"));
const blocks = doc.blocks as Record<string, any>;
const root = blocks[doc.root];

// ---------------------------------------------------------------- helpers
type Span = { insert: string; attributes?: Record<string, unknown> };

const t = (insert: string): Span => ({ insert });
const c = (insert: string): Span => ({ insert, attributes: { code: true } });
/** Source-code path span — existsSync-gated per the linking rule. */
const src = (insert: string, path: string): Span => {
  if (!existsSync(path)) throw new Error(`source ref does not exist on disk: ${path}`);
  return { insert, attributes: { code: true, reference: { kind: "source", path } } };
};
/** Doc reference span — span text must be the target doc's name; no label key. */
const docref = (insert: string, path: string): Span => ({
  insert,
  attributes: { reference: { kind: "doc", path } },
});

function put(id: string, block: Record<string, unknown>) {
  blocks[id] = { id, children: [], ...block };
  return id;
}
const p = (id: string, text: Span[]) => put(id, { type: "paragraph", props: {}, text });
const h = (id: string, level: number, text: string) =>
  put(id, { type: "heading", props: { level }, text: [t(text)] });
const li = (id: string, text: Span[], children: string[] = []) =>
  put(id, { type: "list-item", props: {}, text, children });
const code = (
  id: string,
  language: string | null,
  text: string,
  annotations?: Array<{ lines: string; label?: string; note: string }>,
) =>
  put(id, {
    type: "code",
    props: {
      ...(language ? { language } : {}),
      ...(annotations ? { annotations } : {}),
    },
    text: [t(text)],
  });

// ------------------------------------------------------------ lead + doctrine
blocks["b-14-code-lead-2"].text = [
  t("The code component owns a single block type, "),
  c("code"),
  t(" — the language-tagged block for real, annotated source listings in the "),
  docref("Block vocabulary", "10-system-design/40-block-vocabulary"),
  t(". The source lives in the block's delta text; the language tag and structured line annotations live in "),
  c("props"),
  t(". The model contract lives in "),
  src("packages/docs-model/src/components/code/", "packages/docs-model/src/components/code"),
  t("; every doc surface lives in "),
  src("packages/docs-viewer/src/components/code/", "packages/docs-viewer/src/components/code"),
  t("."),
];

p("b-codefam-doctrine", [
  t("In the documentation doctrine the type is the source-evidence surface: "),
  docref("state-shape", "10-system-design/40-block-vocabulary/50-state-shape"),
  t(" blocks carry state examples, code blocks carry the evidence — annotated listings of the defining source."),
]);

// ------------------------------------------------------------ Example (kept)
// b-14-code-example-h / b-14-code-example-intro / b-14-code-example-block stay as-is.

// ------------------------------------------------------------ State Schema
blocks["b-14-code-state-h-3"].text = [t("State Schema")];

p("b-codefam-state-carrier", [
  t("The type declares "),
  c("carriesText: true"),
  t(" in "),
  src(
    "packages/docs-model/src/components/code/state.ts",
    "packages/docs-model/src/components/code/state.ts",
  ),
  t(": the delta text is the source payload itself, not prose. The editor schema sets "),
  c('marks: ""'),
  t(" on the node ("),
  src(
    "packages/docs-viewer/src/components/code/editor-nodes.ts",
    "packages/docs-viewer/src/components/code/editor-nodes.ts",
  ),
  t("), so the spans are plain inserts — no bold, link, or reference marks inside code. Everything else is props, defined by two closed TypeBox schemas:"),
]);

code(
  "b-codefam-state-src",
  "typescript",
  'export const CodeAnnotationSchema = Type.Object(\n  { lines: Type.String(), label: Type.Optional(Type.String()), note: Type.String() },\n  { additionalProperties: false },\n);\n\nexport const CodeState = Type.Object(\n  { language: Type.Optional(Type.String()), annotations: Type.Optional(Type.Array(CodeAnnotationSchema)) },\n  { additionalProperties: false },\n);\n\nexport const codeState: BlockStateDefinition = { schema: CodeState, carriesText: true };',
  [
    {
      lines: "1-4",
      label: "Annotation shape",
      note: "lines and note are required strings, label optional. Closed object: an unknown key is a validation refusal, not a pass-through.",
    },
    {
      lines: "6-9",
      label: "Block props",
      note: "Both props optional — a bare code block is valid. Every write revalidates the array items against the annotation shape.",
    },
    {
      lines: "11",
      label: "Text carrier",
      note: "carriesText: true — the one non-prose text carrier in the vocabulary.",
    },
  ],
);

blocks["b-14-code-state-4"].props.rows = [
  [
    "language",
    "string",
    "no",
    'Fence tag for highlighting and the header label, e.g. "json", "ts". Written by the editor\'s language picker.',
  ],
  [
    "annotations",
    "array",
    "no",
    "Array of { lines, label?, note }: lines is a 1-indexed range string and the entry's identity key, label an optional short heading on the note, note the annotation body.",
  ],
];

h("b-codefam-ranges-h", 3, "Line Ranges");
li("b-codefam-ranges-1", [
  c("lines"),
  t(' is a 1-indexed range string: "4" covers one line, "4-9" a span, "1,4-6" a comma list.'),
]);
li(
  "b-codefam-ranges-2",
  [t("The exact string is the annotation's identity key.")],
  [
    li("b-codefam-ranges-2a", [
      t("Both typed actions and the pairing engine key on it; two annotations can never share a key — "),
      c("setAnnotation"),
      t(" replaces in place."),
    ]),
  ],
);
li(
  "b-codefam-ranges-3",
  [
    c("expandLineRange"),
    t(" in "),
    src(
      "packages/docs-viewer/src/components/code/annotations.ts",
      "packages/docs-viewer/src/components/code/annotations.ts",
    ),
    t(" expands a key into the covered line set."),
  ],
  [
    li("b-codefam-ranges-3a", [
      t("Parts clamp to the text's line count; unparseable parts contribute nothing — bad input never crashes a render."),
    ]),
  ],
);

h("b-codefam-tolerant-h", 3, "Tolerant Reads");
li(
  "b-codefam-tolerant-1",
  [t("Two tolerant readers, one per package.")],
  [
    li("b-codefam-tolerant-1a", [
      c("readCodeAnnotations"),
      t(" ("),
      src(
        "packages/docs-model/src/components/code/state.ts",
        "packages/docs-model/src/components/code/state.ts",
      ),
      t(") feeds the typed actions."),
    ]),
    li("b-codefam-tolerant-1b", [
      c("parseCodeAnnotations"),
      t(" ("),
      src(
        "packages/docs-viewer/src/components/code/annotations.ts",
        "packages/docs-viewer/src/components/code/annotations.ts",
      ),
      t(") feeds every doc surface, so edit and read mode can never disagree about which entries are renderable."),
    ]),
  ],
);
li(
  "b-codefam-tolerant-2",
  [
    t("Both skip entries missing a non-empty "),
    c("lines"),
    t(" or "),
    c("note"),
    t(" string instead of failing."),
  ],
  [
    li("b-codefam-tolerant-2a", [
      c("parseCodeAnnotations"),
      t(" returns null when nothing renderable remains, so a surface branches on \"has annotations at all\" with one check."),
    ]),
  ],
);

// ------------------------------------------------------------ Typed Actions
blocks["b-14-code-actions-note-10"].text = [
  t("The component registers exactly two typed actions, both built with "),
  c("defineComponentAction"),
  t(" against block type "),
  c("code"),
  t(". Annotations edit only through them; the source text stays on generic text ops — no typed action touches the delta."),
];

li(
  "b-codefam-act-set",
  [c("code.setAnnotation")],
  [
    li("b-codefam-act-set-a", [
      t("Upserts keyed by the exact "),
      c("lines"),
      t(" string: replaces in place when the key exists, appends otherwise."),
    ]),
    li("b-codefam-act-set-b", [
      t("A "),
      c("label"),
      t(" omitted from params stays omitted in the stored entry."),
    ]),
    li("b-codefam-act-set-c", [
      t("Defined in "),
      src(
        "packages/docs-model/src/components/code/actions/set-annotation.ts",
        "packages/docs-model/src/components/code/actions/set-annotation.ts",
      ),
      t("."),
    ]),
  ],
);
li(
  "b-codefam-act-remove",
  [c("code.removeAnnotation")],
  [
    li("b-codefam-act-remove-a", [
      t("Refuses a key that does not exist — the failure reports issue path "),
      c("$.params.lines"),
      t(" instead of silently no-opping."),
    ]),
    li("b-codefam-act-remove-b", [
      t("Defined in "),
      src(
        "packages/docs-model/src/components/code/actions/remove-annotation.ts",
        "packages/docs-model/src/components/code/actions/remove-annotation.ts",
      ),
      t("."),
    ]),
  ],
);

// interaction-surface b-14-code-actions-11 stays as-is.

p("b-codefam-apply-intro", [t("The upsert body in full:")]);
code(
  "b-codefam-apply-src",
  "typescript",
  "apply(block, { lines, note, label }) {\n  const annotation: CodeAnnotation = { lines, note };\n  if (label !== undefined) annotation.label = label;\n  const annotations = readCodeAnnotations(block);\n  const index = annotations.findIndex((candidate) => candidate.lines === lines);\n  const next = [...annotations];\n  if (index === -1) next.push(annotation);\n  else next[index] = annotation;\n  return { ok: true, props: { annotations: next } };\n}",
  [
    {
      lines: "4",
      label: "Tolerant read",
      note: "Malformed stored entries drop before the upsert — one bad entry never wedges the block.",
    },
    {
      lines: "5-8",
      label: "Exact-key upsert",
      note: "The lines string is the identity: replace when it exists, append when it does not.",
    },
    {
      lines: "9",
      label: "Props patch",
      note: "A shallow-merge patch replacing the whole annotations array; executing it is the adapter's job.",
    },
  ],
);

// ------------------------------------------------------------ Doc Renderer
blocks["b-14-code-proj-h-6"].text = [t("Doc Renderer")];

p("b-codefam-render-lead", [
  t("Three surfaces, one shell: the plain read surface ("),
  src(
    "packages/docs-viewer/src/components/code/descriptor.tsx",
    "packages/docs-viewer/src/components/code/descriptor.tsx",
  ),
  t("), the annotated read surface ("),
  src(
    "packages/docs-viewer/src/components/code/CodeAnnotations.tsx",
    "packages/docs-viewer/src/components/code/CodeAnnotations.tsx",
  ),
  t("), and the edit surface ("),
  src(
    "packages/docs-viewer/src/components/code/editor-node-view.tsx",
    "packages/docs-viewer/src/components/code/editor-node-view.tsx",
  ),
  t("). Shared furniture — header row, sticky gutter, zebra striping, notes aside — comes from "),
  src(
    "packages/docs-viewer/src/components/code/CodeShell.tsx",
    "packages/docs-viewer/src/components/code/CodeShell.tsx",
  ),
  t(" and the class constants in "),
  src(
    "packages/docs-viewer/src/components/code/classes.ts",
    "packages/docs-viewer/src/components/code/classes.ts",
  ),
  t(", so the three surfaces look identical."),
]);

h("b-codefam-shell-h", 3, "Shared Shell");
li(
  "b-codefam-shell-header",
  [t("Header row.")],
  [
    li("b-codefam-shell-header-a", [
      t("Quiet uppercase language label left, ghost copy button right — no pill, no background."),
    ]),
    li("b-codefam-shell-header-b", [
      t("The copy button appears on block hover or focus and copies the surface's exact displayed source."),
    ]),
  ],
);
li(
  "b-codefam-shell-gutter",
  [t("Gutter.")],
  [
    li("b-codefam-shell-gutter-a", [
      t("A sticky 3rem column that stays put under horizontal scroll; numbers render at 55% strength at rest."),
    ]),
    li("b-codefam-shell-gutter-b", [
      t("Its background must be opaque (it is sticky) but defaults to a mix matching the block background, so no band is perceptible."),
    ]),
  ],
);
li(
  "b-codefam-shell-zebra",
  [t("Zebra.")],
  [
    li("b-codefam-shell-zebra-a", [
      t("One absolute layer behind the code column; the gradient period is two 20px lines, aligned to line 1 by construction."),
    ]),
  ],
);
li(
  "b-codefam-shell-notes",
  [t("Notes aside.")],
  [
    li("b-codefam-shell-notes-a", [
      t("A 320px right column at lg widths, stacked below the code when narrow."),
    ]),
    li("b-codefam-shell-notes-b", [
      t("Notes are plain prose rows with a hairline rule between items — never zebra; each note's "),
      c("lines"),
      t(" key rides in its title attribute."),
    ]),
  ],
);
li(
  "b-codefam-shell-principle",
  [t("Design principle: one surface, one accent, interaction reveals the rest.")],
  [
    li("b-codefam-shell-principle-a", [
      t("At rest an annotated range shows only the 2px accent bar plus accent line numbers; the tint appears when its pair is lit."),
    ]),
  ],
);

h("b-codefam-20px-h", 3, "The 20px Line");
li(
  "b-codefam-20px-1",
  [
    c("CODE_LINE_HEIGHT_PX = 20"),
    t(" in "),
    src(
      "packages/docs-viewer/src/components/code/classes.ts",
      "packages/docs-viewer/src/components/code/classes.ts",
    ),
    t(" is a layout constant, not a theme token."),
  ],
  [
    li("b-codefam-20px-1a", [
      t("The zebra gradient period, the gutter row height, and every annotation overlay's top and height are computed from it, so it must never drift per host."),
    ]),
  ],
);
li(
  "b-codefam-20px-2",
  [t("Soft wrap is off on every surface.")],
  [
    li("b-codefam-20px-2a", [
      t("The edit surface forces "),
      c("white-space: pre"),
      t(" on its content node; wrapping would break every line-geometry computation."),
    ]),
  ],
);

h("b-codefam-pairing-h", 3, "Annotation Pairing");
li(
  "b-codefam-pairing-1",
  [t("The annotated read surface keeps a per-line grid, so every annotated line is a click and focus target.")],
  [
    li("b-codefam-pairing-1a", [
      t("Pairing runs on the shared LinkGroup engine — one group per block, keyed by the annotation's "),
      c("lines"),
      t(" string."),
    ]),
  ],
);
li("b-codefam-pairing-2", [
  t("Hovering or focusing a note or an annotated line lights the pair's full extent: background wash, a 3px pin rail from first through last covered line, pin-color bold numbers."),
]);
li("b-codefam-pairing-3", [
  t("Clicking (or Enter/Space) pins the pair — it survives hover-out — and Escape clears it."),
]);
li(
  "b-codefam-pairing-4",
  [t("Overlapping annotations resolve each line to the earliest covering note.")],
  [
    li("b-codefam-pairing-4a", [
      c("annotationLineRuns"),
      t(" and the read surface share the rule, so overlay geometry and click-to-pair can never disagree."),
    ]),
  ],
);
li(
  "b-codefam-pairing-5",
  [t("The edit surface pairs from the notes side only.")],
  [
    li("b-codefam-pairing-5a", [
      t("Clicking a note sticky-toggles its pair and scrolls the range's first line into view; clicks in the code just place the cursor."),
    ]),
  ],
);

h("b-codefam-entry-h", 3, "Editor Entry");
li("b-codefam-entry-1", [
  t("Slash menu: "),
  { insert: "Code Block", attributes: { bold: true } },
  t(" (aliases "),
  c("codeblock"),
  t(", "),
  c("code"),
  t(", "),
  c("```"),
  t(")."),
]);
li(
  "b-codefam-entry-2",
  [
    t("Input rule ("),
    src(
      "packages/docs-viewer/src/components/code/input-rules.ts",
      "packages/docs-viewer/src/components/code/input-rules.ts",
    ),
    t("): the paragraph converts the moment the third backtick lands — no trailing space, no typed language tag."),
  ],
);
li(
  "b-codefam-entry-3",
  [t("The header label is the language picker.")],
  [
    li("b-codefam-entry-3a", [
      t("Choosing a language writes the block's "),
      c("language"),
      t(" attr, persisted to "),
      c("props.language"),
      t(" on save."),
    ]),
    li("b-codefam-entry-3b", [
      t('"auto" clears it and falls back to detection, showing the sniffed language when one resolves.'),
    ]),
  ],
);

h("b-codefam-hl-h", 3, "Highlighting and JSON Display");
li(
  "b-codefam-hl-1",
  [
    t("Highlighting ("),
    src(
      "packages/docs-viewer/src/components/code/highlight.ts",
      "packages/docs-viewer/src/components/code/highlight.ts",
    ),
    t(") uses highlight.js core with a curated set of 13 registered grammars — never the all-languages bundle."),
  ],
  [
    li("b-codefam-hl-1a", [
      t("bash, css, diff, go, javascript, json, markdown, python, rust, sql, typescript, xml, yaml — plus each grammar's aliases (ts, tsx, js, sh, yml, md, py…)."),
    ]),
  ],
);
li(
  "b-codefam-hl-2",
  [t("One resolution serves the header label and the tokens.")],
  [
    li("b-codefam-hl-2a", [
      t("The declared language when a grammar or alias matches, else a JSON sniff, else escaped plain text with no label — the label can never disagree with tokenization."),
    ]),
  ],
);
li("b-codefam-hl-3", [
  t("Token colors come from the host's "),
  c(".hljs-*"),
  t(" rules, mapped to the "),
  c("--syntax-*"),
  t(" theme vars for light and dark."),
]);
li(
  "b-codefam-hl-4",
  [t("JSON pretty-printing is display-only; the stored text is never mutated.")],
  [
    li("b-codefam-hl-4a", [
      c("prettyPrintIfJson"),
      t(" re-renders one-liner JSON as the nested 2-space form when the language is json/jsonc, or is undeclared and the text sniffs as JSON."),
    ]),
    li("b-codefam-hl-4b", [
      t("On the annotated surface it runs before line-splitting, so "),
      c("lines"),
      t(" ranges address the pretty-printed form — author JSON as pretty multi-line text so ranges are stable against the transform."),
    ]),
  ],
);

// ------------------------------------------------------------ Agent Renderer
blocks["b-14-code-agent-h-14"].text = [t("Agent Renderer")];

blocks["b-14-code-proj-7"].text = [
  t("On the agent surface ("),
  src(
    "packages/docs-model/src/components/code/agent-view.ts",
    "packages/docs-model/src/components/code/agent-view.ts",
  ),
  t(") the block renders as a fenced markdown block: the fence tag is "),
  c("props.language"),
  t(" (a bare fence when unset), the body is the delta text as plain text. Annotations follow the fence, one blockquote line per entry:"),
];
// b-14-code-proj-example-8 stays as-is.

li("b-codefam-agentr-1", [
  t("The L-prefixed range is the annotation's "),
  c("lines"),
  t(" key; the label rides in parentheses and drops cleanly when absent."),
]);
li("b-codefam-agentr-2", [
  t("Entries missing a "),
  c("lines"),
  t(" or "),
  c("note"),
  t(" string drop from the projection — the same tolerant read as the doc surfaces."),
]);
// Agent guidance (kept): b-14-code-agent-1-15, b-14-code-agent-2-16.

// ------------------------------------------------------------ Theme
blocks["b-14-code-theming-heading"].text = [t("Theme")];

blocks["b-14-code-theming-para"].text = [
  t("The theme file is "),
  src("themes/default/components/code.json", "themes/default/components/code.json"),
  t(" in a theme folder ("),
  c("themes/<id>/"),
  t("). Every value is one string for both modes or a "),
  c("{ light, dark }"),
  t(" pair, validated against "),
  c("THEME_TOKEN_REGISTRY"),
  t(" in "),
  src(
    "packages/docs-workbench/web/src/theme/theme-folders.ts",
    "packages/docs-workbench/web/src/theme/theme-folders.ts",
  ),
  t(". The contract element is "),
  docref("Theming", "10-system-design/30-data-model/20-block-design/50-theming"),
  t("."),
];

blocks["b-14-code-theming-table"].props.columns = ["Key", "CSS variable", "Kind", "Styles"];
blocks["b-14-code-theming-table"].props.rows = [
  ["bg", "--docs-code-block-bg", "color", "Block background"],
  ["border", "--docs-code-block-border", "color", "Block frame border"],
  ["string", "--syntax-string", "color", "Syntax: string literals"],
  ["number", "--syntax-number", "color", "Syntax: numbers"],
  ["boolean", "--syntax-boolean", "color", "Syntax: booleans"],
  ["null", "--syntax-null", "color", "Syntax: null/nil tokens"],
  ["key", "--syntax-key", "color", "Syntax: object keys / attributes"],
  ["languageFg", "--docs-code-lang-fg", "color", "Language-picker affordance on block hover (edit surface)"],
  ["annotationAccent", "--docs-code-annotation-accent", "color", "Annotation accent: gutter bar, accent numbers, lit tint"],
  ["gutterFg", "--docs-code-gutter-fg", "color", "Gutter numbers and the copy button"],
  ["gutterBg", "--docs-code-gutter-bg", "color", "Sticky gutter background (defaults to a mix matching the block bg)"],
  ["zebra", "--docs-code-zebra", "color", "Even-line stripe color"],
  ["rule", "--docs-code-rule", "color", "Internal hairlines: header rule, column divider, note dividers"],
  ["ruleWidth", "--docs-code-rule-width", "length 0–4px", "Hairline width (step 0.5, default 1px)"],
  ["ruleOpacity", "--docs-code-rule-opacity", "number 0–1", "Hairline opacity (step 0.05, default 0.5)"],
  ["zebraOpacity", "--docs-code-zebra-opacity", "number 0–1", "Zebra layer opacity (step 0.05, default 1)"],
];

li(
  "b-codefam-theme-1",
  [t("The three knobs are the registry's only non-color code tokens.")],
  [
    li("b-codefam-theme-1a", [
      t("Every internal hairline — header rule, code/notes column divider, note dividers — runs through the one rule token set."),
    ]),
  ],
);
li(
  "b-codefam-theme-2",
  [
    t("The default theme sets "),
    c("ruleOpacity"),
    t(" 0.9 and "),
    c("zebraOpacity"),
    t(" 1; every other key falls through to the fixed fallbacks in "),
    src(
      "packages/docs-viewer/src/components/code/classes.ts",
      "packages/docs-viewer/src/components/code/classes.ts",
    ),
    t("."),
  ],
);
li(
  "b-codefam-theme-3",
  [t("The annotated read surface additionally rides the shared linked-panels tokens.")],
  [
    li("b-codefam-theme-3a", [
      c("--docs-zebra"),
      t(", "),
      c("--docs-link-bg"),
      t(", and "),
      c("--docs-link-pin"),
      t(" are registered once under the registry's "),
      c("linking"),
      t(" entry, not per component."),
    ]),
  ],
);
li("b-codefam-theme-4", [
  t("The 20px line height is a layout constant, deliberately not a token."),
]);

// ------------------------------------------------------------ Agent Adapter
h("b-codefam-adapter-h", 2, "Agent Adapter");
p("b-codefam-adapter-p", [
  t("The family uses the default adapter: no agent of its own, and nothing forwards to an external authority — both typed actions carry a local "),
  c("apply"),
  t(". The contract element is "),
  docref("Agent adapter", "10-system-design/30-data-model/20-block-design/60-agent-adapter"),
  t("."),
]);
li(
  "b-codefam-adapter-1",
  [
    t("An agent edit arrives as a "),
    c("componentAction"),
    t(" op — the seventh op in the vocabulary, alongside "),
    c("insertBlock"),
    t(", "),
    c("updateBlock"),
    t(", "),
    c("deleteBlock"),
    t(", "),
    c("moveBlock"),
    t(", "),
    c("splitBlock"),
    t(", and "),
    c("mergeBlocks"),
    t("."),
  ],
);
li(
  "b-codefam-adapter-2",
  [
    t("The op kernel ("),
    src("packages/docs-model/src/doc-ops.ts", "packages/docs-model/src/doc-ops.ts"),
    t(") resolves the action from the registry, validates its params, runs "),
    c("apply"),
    t(" against the target block, and executes the returned "),
    c("{ annotations }"),
    t(" patch through the existing "),
    c("updateBlock"),
    t(" path."),
  ],
  [
    li("b-codefam-adapter-2a", [
      t("Merge semantics stay single-sourced, and the inverse comes back as the usual "),
      c("updateBlock"),
      t(" inverse."),
    ]),
  ],
);
li("b-codefam-adapter-3", [
  c("updateBlock"),
  t(" preserves the block id, so annotation and backlink targets survive every annotation edit."),
]);

// ------------------------------------------------------------ retire unused blocks
delete blocks["b-14-code-state-note-5"];
delete blocks["b-14-code-editor-13"];

// ------------------------------------------------------------ root order
root.children = [
  "b-14-code-lead-2",
  "b-codefam-doctrine",
  "b-14-code-example-h",
  "b-14-code-example-intro",
  "b-14-code-example-block",
  // State Schema
  "b-14-code-state-h-3",
  "b-codefam-state-carrier",
  "b-codefam-state-src",
  "b-14-code-state-4",
  "b-codefam-ranges-h",
  "b-codefam-ranges-1",
  "b-codefam-ranges-2",
  "b-codefam-ranges-3",
  "b-codefam-tolerant-h",
  "b-codefam-tolerant-1",
  "b-codefam-tolerant-2",
  // Typed Actions
  "b-14-code-actions-h-9",
  "b-14-code-actions-note-10",
  "b-codefam-act-set",
  "b-codefam-act-remove",
  "b-14-code-actions-11",
  "b-codefam-apply-intro",
  "b-codefam-apply-src",
  // Doc Renderer
  "b-14-code-proj-h-6",
  "b-codefam-render-lead",
  "b-codefam-shell-h",
  "b-codefam-shell-header",
  "b-codefam-shell-gutter",
  "b-codefam-shell-zebra",
  "b-codefam-shell-notes",
  "b-codefam-shell-principle",
  "b-codefam-20px-h",
  "b-codefam-20px-1",
  "b-codefam-20px-2",
  "b-codefam-pairing-h",
  "b-codefam-pairing-1",
  "b-codefam-pairing-2",
  "b-codefam-pairing-3",
  "b-codefam-pairing-4",
  "b-codefam-pairing-5",
  "b-codefam-entry-h",
  "b-codefam-entry-1",
  "b-codefam-entry-2",
  "b-codefam-entry-3",
  "b-codefam-hl-h",
  "b-codefam-hl-1",
  "b-codefam-hl-2",
  "b-codefam-hl-3",
  "b-codefam-hl-4",
  // Agent Renderer
  "b-14-code-agent-h-14",
  "b-14-code-proj-7",
  "b-14-code-proj-example-8",
  "b-codefam-agentr-1",
  "b-codefam-agentr-2",
  "b-14-code-agent-1-15",
  "b-14-code-agent-2-16",
  // Theme
  "b-14-code-theming-heading",
  "b-14-code-theming-para",
  "b-14-code-theming-table",
  "b-codefam-theme-1",
  "b-codefam-theme-2",
  "b-codefam-theme-3",
  "b-codefam-theme-4",
  // Agent Adapter
  "b-codefam-adapter-h",
  "b-codefam-adapter-p",
  "b-codefam-adapter-1",
  "b-codefam-adapter-2",
  "b-codefam-adapter-3",
];

// Nested list-item children must not ALSO sit in root.children — they are
// children of their parent list items only (li() already wired them).

// ------------------------------------------------------------ validate + write
const result = validateDocDocument(doc);
if (!result.ok) {
  console.error(JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
writeFileSync(PATH, serializeDocDocument(result.document));

const bytes = readFileSync(PATH, "utf8");
const revalidated = validateDocDocument(JSON.parse(bytes));
if (!revalidated.ok || serializeDocDocument(revalidated.document) !== bytes) {
  console.error("NOT CANONICAL after write");
  process.exit(1);
}
console.log("ok — code family page conformed, canonical");
