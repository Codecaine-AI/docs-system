/**
 * Authors docs/20-implementation/40-theming/doc.json (canonical serializer
 * bytes) — the theming-system doc Ford asked for in the dogfood review.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  serializeDocDocument,
  validateDocDocument,
  type DocDocument,
  type DocBlock,
  type DeltaSpan,
} from "../packages/docs-model/src/index.ts";

const t = (text: string): DeltaSpan => ({ insert: text });
const c = (text: string): DeltaSpan => ({ insert: text, attributes: { code: true } });

let n = 0;
const blocks: Record<string, DocBlock> = {};
const rootChildren: string[] = [];

function add(slug: string, block: Omit<DocBlock, "id" | "children"> & { children?: string[] }) {
  n += 1;
  const id = `b-40-theming-${slug}-${n}`;
  blocks[id] = { id, children: [], ...block } as DocBlock;
  rootChildren.push(id);
  return id;
}

add("title", { type: "heading", props: { level: 1 }, text: [t("Theming")] });

add("intent", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "Theming is a first-class feature of the workbench: every visual decision resolves through one canonical token contract, so a reader can restyle the whole system — colors, fonts, editor chrome — without touching component code. This page explains the structure and exactly where to adjust each thing.",
    ),
  ],
});

add("tiers-heading", { type: "heading", props: { level: 2 }, text: [t("The three tiers")] });

add("tier-palette", {
  type: "list-item",
  props: {},
  text: [
    t("Palette — "),
    c("theme/notion-palette.css"),
    t(". Raw color values as "),
    c("--color-*"),
    t(
      " variables, defined twice: a light block and a dark block. This is the only place raw hex/rgba theme colors are allowed.",
    ),
  ],
});

add("tier-semantic", {
  type: "list-item",
  props: {},
  text: [
    t("Semantic tokens — "),
    c("theme/semantic.css"),
    t(". Per-surface meaning mapped from palette variables, defined in both theme blocks. Component tokens follow "),
    c("--docs-<component>-<part>"),
    t(" (for example "),
    c("--docs-inline-code-fg"),
    t(" and "),
    c("--docs-inline-code-bg"),
    t(
      "). Every new themable property gets a token here, in both blocks — never a literal at the use site.",
    ),
  ],
});

add("tier-consumption", {
  type: "list-item",
  props: {},
  text: [
    t("Consumption — "),
    c("index.css"),
    t(
      " and docs-viewer components reference tier-2 tokens only. docs-viewer's Tailwind classes may carry a neutral literal fallback inside ",
    ),
    c("var()"),
    t(
      " because the package renders in hosts without this stylesheet; the workbench always defines the token, so those fallbacks never win here.",
    ),
  ],
});

add("tiers-rule", {
  type: "callout",
  props: { tone: "info", title: "The one rule" },
  text: [
    t(
      "Consumers never branch on light versus dark. A theme flip only swaps the tier 1 and tier 2 definitions; everything downstream re-resolves automatically.",
    ),
  ],
});

add("files-heading", { type: "heading", props: { level: 2 }, text: [t("Where the files live")] });

add("files-tree", {
  type: "file-tree",
  props: {
    title: "packages/docs-workbench/web/src",
    entries: [
      { path: "theme/notion-palette.css", note: "tier 1 — raw colors, light + dark" },
      { path: "theme/semantic.css", note: "tier 2 — the canonical contract (see its header)" },
      { path: "theme/style-rail.css", note: "style rail's own chrome" },
      { path: "index.css", note: "tier 3 — app CSS consuming tokens; :root font defaults" },
      { path: "shell/StyleRail.tsx", note: "runtime override layer + theme picker + export/import" },
      { path: "theme/theme-folders.ts", note: "theme-folder loader: token registry, base chains, CSS compile" },
      { path: "../../../../themes/", note: "repo custom themes (folder per theme; see Theme folders below)" },
    ],
  },
});

add("fonts-heading", { type: "heading", props: { level: 2 }, text: [t("Fonts")] });

add("fonts-tokens", {
  type: "paragraph",
  props: {},
  text: [
    t("Each text surface has its own font token: "),
    c("--font-tx02"),
    t(" (body), "),
    c("--font-display"),
    t(" (headings), "),
    c("--docs-font-code"),
    t(" (code blocks, inline code chips, kbd), and "),
    c("--docs-font-numeric"),
    t(
      " (list markers and ordered-list counters; inherits the body font by default). Defaults live in ",
    ),
    c("index.css"),
    t("'s "),
    c(":root"),
    t("; the style rail's Font tab overrides them per user (Body / Heading / Code / Number font)."),
  ],
});

add("fonts-custom", {
  type: "callout",
  props: { tone: "warning", title: "Custom font FILES — designed, not built" },
  text: [
    t(
      "A theme folder's manifest can already set arbitrary font stacks (any string) per surface. What is not built yet is loading font FILES: the planned path is font binaries in the workbench's ",
    ),
    c("web/public/fonts/"),
    t(", registered via "),
    c("@font-face"),
    t(
      " in a fonts.css, after which a theme just names the family in its stacks. The tokens are already the only seam.",
    ),
  ],
});

add("adjust-heading", { type: "heading", props: { level: 2 }, text: [t("How to adjust things")] });

add("adjust-color", {
  type: "list-item",
  props: {},
  text: [
    t("Change a color everywhere: edit the palette variable in "),
    c("notion-palette.css"),
    t(" (both theme blocks)."),
  ],
});

add("adjust-component", {
  type: "list-item",
  props: {},
  text: [
    t("Restyle one component: find (or add) its "),
    c("--docs-<component>-<part>"),
    t(" tokens in "),
    c("semantic.css"),
    t(" and change the mapping — the component code itself stays untouched."),
  ],
});

add("adjust-runtime", {
  type: "list-item",
  props: {},
  text: [
    t(
      "Adjust at runtime: the style rail (Theme / Font / Layout / Effects tabs) covers accent, custom colors, all four fonts, sizing, layout metrics, grain, block highlights, the drag drop-line, and the drag grip. A knob at its default removes its override, so the theme files stay authoritative.",
    ),
  ],
});

add("adjust-new-token", {
  type: "list-item",
  props: {},
  text: [
    t(
      "Add a new themable property: define the token in both blocks of ",
    ),
    c("semantic.css"),
    t(", consume it via "),
    c("var(--docs-...)"),
    t(", and (optionally) expose a rail knob that writes it."),
  ],
});

add("theme-files-heading", { type: "heading", props: { level: 2 }, text: [t("Theme folders")] });

add("theme-folder-para", {
  type: "paragraph",
  props: {},
  text: [
    t("A theme is a folder. Global built-ins (Default, Paper, Terminal, Midnight, Compact) are compiled into the workbench; custom themes live in the repo's "),
    c("themes/<id>/"),
    t(" directory (sibling of "),
    c("docs/"),
    t("), served by docs-server ("),
    c("GET/POST /api/themes"),
    t(") and listed in the style rail's Themes section. Each folder holds a "),
    c("theme.json"),
    t(" manifest and one "),
    c("components/<surface>.json"),
    t(" token file per visual surface — every color value is one string (both modes) or a "),
    c("{ light, dark }"),
    t(" pair. A manifest's "),
    c("base"),
    t(" names the theme it layers over, so a custom theme overrides only what differs."),
  ],
});

add("theme-folder-example", {
  type: "code",
  props: { language: "json" },
  text: [
    t(`// themes/example/theme.json
{
  "name": "Example (blue code)",
  "base": "default",
  "dark": false,
  "fonts": { "code": "'Berkeley Mono', ui-monospace, monospace" },
  "railDefaults": { "accent": "blue" }
}

// themes/example/components/inline-code.json
{
  "fg": { "light": "#0b6e99", "dark": "#529cca" },
  "bg": { "light": "rgba(0, 120, 223, 0.12)", "dark": "rgba(82, 156, 202, 0.18)" }
}`),
  ],
});

add("theme-surfaces", {
  type: "paragraph",
  props: {},
  text: [
    t("The token vocabulary is closed — component files and keys must appear in "),
    c("THEME_TOKEN_REGISTRY"),
    t(" ("),
    c("theme/theme-folders.ts"),
    t("), which maps each key to the tier-2 CSS variables it writes. Surfaces today: "),
    c("shell"),
    t(", "),
    c("surfaces"),
    t(", "),
    c("inline-code"),
    t(", "),
    c("code-block"),
    t(" (syntax colors), "),
    c("callout"),
    t(", and "),
    c("editor-chrome"),
    t(" (highlight, drop line, grip). Unknown files or keys are ignored, so a hand-edited theme can never break the app."),
  ],
});

add("theme-rail-flow", {
  type: "paragraph",
  props: {},
  text: [
    t(
      "The style rail stays a personal overlay ON TOP of the selected theme: selecting a theme injects its compiled CSS layer and applies its ",
    ),
    c("railDefaults"),
    t(
      " and dark flag once; knob changes afterwards are yours alone and always win over theme values. Save current look as theme snapshots your knobs (base = the active theme) into a new ",
    ),
    c("themes/<id>/"),
    t(
      " folder. The Export/Import buttons remain the quick path for moving just the knob blob between machines.",
    ),
  ],
});

add("agent-notes-heading", { type: "heading", props: { level: 2 }, text: [t("Agent notes")] });

add("agent-notes", {
  type: "list-item",
  props: {},
  text: [
    t("Never write a raw color or "),
    c("font-family"),
    t(
      " at a use site. If the value should be themable, it is a tier-2 token; if it is truly fixed (like the grain generator's white noise source), leave a comment saying why.",
    ),
  ],
});

add("agent-notes-2", {
  type: "list-item",
  props: {},
  text: [
    t("The contract's full text lives as the header comment of "),
    c("theme/semantic.css"),
    t(" — keep this page and that header in sync when either changes."),
  ],
});

const doc: DocDocument = {
  schemaVersion: 1,
  id: "20-implementation-40-theming",
  title: "Theming",
  root: "b-40-theming-root",
  blocks: {
    "b-40-theming-root": {
      id: "b-40-theming-root",
      type: "paragraph",
      props: {},
      children: rootChildren,
    },
    ...blocks,
  },
};

const result = validateDocDocument(doc);
if (!result.ok) {
  console.error("validation failed:", JSON.stringify(result.issues, null, 2));
  process.exit(1);
}
mkdirSync("docs/20-implementation/40-theming", { recursive: true });
writeFileSync("docs/20-implementation/40-theming/doc.json", serializeDocDocument(doc));
console.log(`wrote docs/20-implementation/40-theming/doc.json (${rootChildren.length + 1} blocks)`);
