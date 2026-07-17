/**
 * Authors the theming SECTION — docs/20-implementation/40-theming/ as a
 * folder of five bundles (overview, global themes, component themes, fonts,
 * system UI) replacing the earlier single doc. Canonical serializer
 * bytes per bundle.
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

type BlockInput = Omit<DocBlock, "id" | "children"> & { children?: string[] };

function buildDoc(
  folderSlug: string,
  idSlug: string,
  title: string,
  defs: Array<[string, BlockInput]>,
): void {
  const blocks: Record<string, DocBlock> = {};
  const rootChildren: string[] = [];
  let n = 0;
  for (const [slug, block] of defs) {
    n += 1;
    const id = `b-${idSlug}-${slug}-${n}`;
    blocks[id] = { id, children: [], ...block } as DocBlock;
    rootChildren.push(id);
  }
  const rootId = `b-${idSlug}-root`;
  const doc: DocDocument = {
    schemaVersion: 1,
    id: `20-implementation-40-theming-${folderSlug}`,
    title,
    root: rootId,
    blocks: {
      [rootId]: { id: rootId, type: "paragraph", props: {}, children: rootChildren },
      ...blocks,
    },
  };
  const result = validateDocDocument(doc);
  if (!result.ok) {
    console.error(`${folderSlug} validation failed:`, JSON.stringify(result.issues, null, 2));
    process.exit(1);
  }
  const dir = `docs/20-implementation/40-theming/${folderSlug}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/doc.json`, serializeDocDocument(doc));
  console.log(`wrote ${dir}/doc.json (${rootChildren.length + 1} blocks)`);
}

// ---------------------------------------------------------------------------
// 00-overview
// ---------------------------------------------------------------------------
buildDoc("00-overview", "theming-overview", "Theming: overview", [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Theming: overview")] }],
  [
    "intent",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Theming is a first-class feature of the workbench: every visual decision resolves through one canonical token contract, so the whole system — colors, fonts, editor controls — restyles without touching component code. This section lays out the structure: who decides what, where each file lives, and exactly what can and cannot be changed.",
        ),
      ],
    },
  ],
  ["layers-heading", { type: "heading", props: { level: 2 }, text: [t("Who decides what")] }],
  [
    "layers-table",
    {
      type: "structured-table",
      props: {
        columns: ["Layer", "Who sets it", "Examples", "Where"],
        rows: [
          [
            "System UI",
            "The system — deliberately NOT themable",
            "Sidebar width, rail width, header heights",
            "Component code (see System UI)",
          ],
          [
            "Theme",
            "A selected theme folder (global built-in or repo custom)",
            "Palette, component tokens, font stacks, rail defaults",
            "themes/<id>/ (see Global themes)",
          ],
          [
            "User overlay",
            "The style rail's knobs, per user, on top of the theme",
            "Accent, fonts, layout metrics, highlight/grip tuning",
            "localStorage blob (see System UI for the knob map)",
          ],
        ],
      },
    },
  ],
  [
    "layers-order",
    {
      type: "callout",
      props: { tone: "info", title: "Precedence" },
      text: [
        t(
          "Theme files define; the user overlay overrides; the system UI is out of reach of both. A rail knob at its default removes its override, so the theme (and below it, the default token files) stays authoritative.",
        ),
      ],
    },
  ],
  ["tiers-heading", { type: "heading", props: { level: 2 }, text: [t("The three token tiers")] }],
  [
    "tier-palette",
    {
      type: "list-item",
      props: {},
      text: [
        t("Palette — "),
        c("theme/notion-palette.css"),
        t(". Raw color values as "),
        c("--color-*"),
        t(
          " variables, defined twice: a light block and a dark block. The only place raw hex/rgba theme colors are allowed.",
        ),
      ],
    },
  ],
  [
    "tier-semantic",
    {
      type: "list-item",
      props: {},
      text: [
        t("Semantic tokens — "),
        c("theme/semantic.css"),
        t(". Per-surface meaning mapped from palette variables, in both theme blocks. Component tokens follow "),
        c("--docs-<component>-<part>"),
        t(" (for example "),
        c("--docs-inline-code-fg"),
        t("). Every new themable property gets a token here — never a literal at a use site."),
      ],
    },
  ],
  [
    "tier-consumption",
    {
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
          " (the package renders in hosts without this stylesheet); the workbench always defines the token, so fallbacks never win here.",
        ),
      ],
    },
  ],
  [
    "tiers-rule",
    {
      type: "callout",
      props: { tone: "info", title: "The one rule" },
      text: [
        t(
          "Consumers never branch on light versus dark. A mode flip only swaps the tier 1 and tier 2 definitions; everything downstream re-resolves automatically.",
        ),
      ],
    },
  ],
  ["files-heading", { type: "heading", props: { level: 2 }, text: [t("Where the files live")] }],
  [
    "files-tree",
    {
      type: "file-tree",
      props: {
        title: "packages/docs-workbench/web/src",
        entries: [
          { path: "theme/notion-palette.css", note: "tier 1 — raw colors, light + dark" },
          { path: "theme/semantic.css", note: "tier 2 — the canonical contract (see its header)" },
          { path: "theme/theme-folders.ts", note: "theme-folder loader: token registry, base chains, CSS compile" },
          { path: "index.css", note: "tier 3 — app CSS consuming tokens; :root font defaults" },
          { path: "shell/StyleRail.tsx", note: "the user overlay: knobs, theme picker, export/import" },
          { path: "../../../../themes/", note: "repo custom theme folders (see Global themes)" },
        ],
      },
    },
  ],
  ["section-heading", { type: "heading", props: { level: 2 }, text: [t("In this section")] }],
  [
    "section-global",
    {
      type: "list-item",
      props: {},
      text: [t("Global themes — the theme-folder format, built-ins, selection semantics, save-as.")],
    },
  ],
  [
    "section-component",
    {
      type: "list-item",
      props: {},
      text: [t("Component themes — the per-surface token files and the closed registry that validates them.")],
    },
  ],
  ["section-fonts", { type: "list-item", props: {}, text: [t("Fonts — per-surface font tokens and custom font loading.")] }],
  [
    "section-system",
    {
      type: "list-item",
      props: {},
      text: [t("System UI — what is deliberately fixed, and the full map of every style-rail knob.")],
    },
  ],
]);

// ---------------------------------------------------------------------------
// 10-global-themes
// ---------------------------------------------------------------------------
buildDoc("10-global-themes", "global-themes", "Global themes", [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Global themes")] }],
  [
    "intro",
    {
      type: "paragraph",
      props: {},
      text: [
        t("A theme is a folder. While the default theme's identity is being figured out, the picker shows ONLY Default: the rail auto-saves every change (debounced) into the repo's "),
    c("themes/default/"),
    t(" folder, which overrides the compiled-in fallback — Default IS the living core theme, and selecting it restores the last saved look. Custom themes still live as folders in the repo's "),
        c("themes/<id>/"),
        t(" directory (sibling of "),
        c("docs/"),
        t("), served by docs-server ("),
        c("GET/POST /api/themes"),
        t(") and listed in the style rail's Themes section."),
      ],
    },
  ],
  ["folder-heading", { type: "heading", props: { level: 2 }, text: [t("The folder format")] }],
  [
    "folder-para",
    {
      type: "paragraph",
      props: {},
      text: [
        t("Each folder holds a "),
        c("theme.json"),
        t(" manifest and one "),
        c("components/<surface>.json"),
        t(" token file per visual surface (see Component themes). A manifest's "),
        c("base"),
        t(" names the theme it layers over, so a custom theme overrides only what differs."),
      ],
    },
  ],
  [
    "manifest-table",
    {
      type: "structured-table",
      props: {
        title: "theme.json fields",
        columns: ["Field", "Type", "Meaning"],
        rows: [
          ["name", "string", "Display name in the Themes picker."],
          ["base", "string (theme id)", "Theme to layer over; v1 resolves bases against BUILT-INS only."],
          ["dark", "boolean", "Mode applied when the theme is selected."],
          ["fonts", "{ body?, heading?, code?, number? }", "Font stacks (any string) written to the per-surface font tokens."],
          ["railDefaults", "partial rail settings", "Knob values applied ONCE on selection (a preset ride-along, not a live link)."],
        ],
      },
    },
  ],
  [
    "example",
    {
      type: "code",
      props: { language: "json" },
      text: [
        t(`// themes/example/theme.json
{
  "name": "Example (blue code)",
  "base": "default",
  "dark": false,
  "fonts": { "code": "'Berkeley Mono', ui-monospace, monospace" }
}`),
      ],
    },
  ],
  ["selection-heading", { type: "heading", props: { level: 2 }, text: [t("Selection semantics")] }],
  [
    "selection-para",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Selecting a theme injects its compiled CSS layer (a light block and a dark block of tier-2 variables) and applies its railDefaults and dark flag once. The style rail stays a personal overlay ON TOP: knob changes afterwards are yours alone and always win over theme values. The selection persists per user (",
        ),
        c("docs-theme-folder-id"),
        t(") and re-injects on boot without re-applying railDefaults."),
      ],
    },
  ],
  ["saveas-heading", { type: "heading", props: { level: 2 }, text: [t("Creating themes")] }],
  [
    "saveas-rail",
    {
      type: "list-item",
      props: {},
      text: [
        t("From the rail: every knob change auto-saves (1.5s debounce) into "),
        c("themes/default/"),
        t(" via "),
        c("POST /api/themes"),
        t(" — component overrides become real components/*.json files, the rest rides as railDefaults. Named save-as returns when the catalogue reopens."),
      ],
    },
  ],
  [
    "saveas-hand",
    {
      type: "list-item",
      props: {},
      text: [
        t(
          "By hand or by agent: create the folder directly — ids are lowercase slugs, content is validated tolerantly on load (unknown fields and keys are ignored, never fatal).",
        ),
      ],
    },
  ],
  [
    "saveas-export",
    {
      type: "list-item",
      props: {},
      text: [
        t(
          "Export/Import theme buttons move just the knob blob (settings JSON + dark flag) between machines — the quick path when a full theme folder is overkill.",
        ),
      ],
    },
  ],
]);

// ---------------------------------------------------------------------------
// 20-component-themes
// ---------------------------------------------------------------------------
buildDoc("20-component-themes", "component-themes", "Component themes", [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Component themes")] }],
  [
    "intro",
    {
      type: "paragraph",
      props: {},
      text: [
        t("Each visual surface has its own token file inside a theme folder: "),
        c("components/<surface>.json"),
        t(". Every color value is one string (both modes) or a "),
        c("{ light, dark }"),
        t(" pair. There is ONE FILE PER BLOCK-VOCABULARY TYPE (each type's own doc under 10-block-vocabulary states its keys) plus four non-block files. The vocabulary is CLOSED: files and keys must appear in "),
        c("THEME_TOKEN_REGISTRY"),
        t(" ("),
        c("theme/theme-folders.ts"),
        t("), which maps each key to the tier-2 CSS variables it writes. Unknown files or keys are ignored, so a hand-edited theme can never break the app."),
      ],
    },
  ],
  [
    "registry-table",
    {
      type: "structured-table",
      props: {
        title: "The surface vocabulary",
        columns: ["File", "Keys", "What it styles"],
        rows: [
          ["shell.json", "background, sidebar, text, accent, link", "Page background, sidebar surface, body text, accent + link colors"],
          ["surfaces.json", "border, muted, icon", "Borders/inputs, muted fills, muted icon color"],
          ["inline-code.json", "fg, bg", "The inline code chip (text + fill)"],
          ["editor-controls.json", "highlight, dropLine, grip", "Block highlight fill, drag drop-line, drag grip color"],
          ["paragraph.json", "fg", "Paragraph text"],
          ["heading.json", "fg", "Heading text (all levels)"],
          ["list-item.json", "marker", "Bullet dot / ordered counter"],
          ["quote.json", "fg, border", "Quote text + left border"],
          ["code.json", "bg, border, string, number, boolean, null, key", "Code block surface + syntax colors"],
          ["callout.json", "border, fill, fg", "Callout card border, fill, body text"],
          ["divider.json", "color", "Rule color"],
          ["image.json", "border, caption", "Image border + caption text"],
          ["video.json", "border, caption", "Video frame border + caption text"],
          ["file-tree.json", "border, note", "Container border + entry notes"],
          ["structured-table.json", "border, headerBg, headerFg", "Table borders + header row"],
          ["interaction-surface.json", "border, bg", "Container border + background"],
          ["mermaid.json", "border, bg", "Container border + background"],
          ["canvas.json", "border", "Embed container border"],
        ],
      },
    },
  ],
  [
    "example",
    {
      type: "code",
      props: { language: "json" },
      text: [
        t(`// themes/example/components/inline-code.json
{
  "fg": { "light": "#0b6e99", "dark": "#529cca" },
  "bg": { "light": "rgba(0, 120, 223, 0.12)", "dark": "rgba(82, 156, 202, 0.18)" }
}`),
      ],
    },
  ],
  ["extend-heading", { type: "heading", props: { level: 2 }, text: [t("Extending the vocabulary")] }],
  [
    "extend-steps",
    {
      type: "paragraph",
      props: {},
      text: [
        t("Adding a themable property is a three-step change: define the token in both blocks of "),
        c("semantic.css"),
        t(", consume it via "),
        c("var(--docs-...)"),
        t(" at the use site, and add the file/key mapping to "),
        c("THEME_TOKEN_REGISTRY"),
        t(". Keep this page's table in sync when the registry grows."),
      ],
    },
  ],
]);

// ---------------------------------------------------------------------------
// 30-fonts
// ---------------------------------------------------------------------------
buildDoc("30-fonts", "theming-fonts", "Fonts", [
  ["title", { type: "heading", props: { level: 1 }, text: [t("Fonts")] }],
  [
    "tokens",
    {
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
        t(" (list markers and ordered-list counters; inherits the body font by default). Defaults live in "),
        c("index.css"),
        t("'s "),
        c(":root"),
        t("."),
      ],
    },
  ],
  [
    "sources",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Two ways to set them: the style rail's Font tab (Body / Heading / Code / Number selects over the three built-in system stacks), or a theme manifest's ",
        ),
        c("fonts"),
        t(
          " field, which accepts ARBITRARY stack strings — a theme can name any family the browser can resolve.",
        ),
      ],
    },
  ],
  [
    "custom-files",
    {
      type: "callout",
      props: { tone: "warning", title: "Custom font FILES — designed, not built" },
      text: [
        t(
          "Loading font binaries is the one unbuilt piece: the planned path is files in the workbench's ",
        ),
        c("web/public/fonts/"),
        t(", registered via "),
        c("@font-face"),
        t(
          " in a fonts.css, after which a theme just names the family in its stacks. The tokens are already the only seam.",
        ),
      ],
    },
  ],
]);

// ---------------------------------------------------------------------------
// 40-system-chrome
// ---------------------------------------------------------------------------
buildDoc("40-system-ui", "system-ui", "System UI and the knob map", [
  ["title", { type: "heading", props: { level: 1 }, text: [t("System UI and the knob map")] }],
  [
    "intro",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "Not everything is themable, on purpose. The system UI — the workbench's own furniture — stays fixed so every theme still FEELS like the same tool. This page draws that line explicitly, then maps every style-rail knob to what it actually writes.",
        ),
      ],
    },
  ],
  ["fixed-heading", { type: "heading", props: { level: 2 }, text: [t("Deliberately fixed")] }],
  [
    "fixed-table",
    {
      type: "structured-table",
      props: {
        columns: ["Fixed UI", "Value", "Where it lives"],
        rows: [
          ["Docs sidebar width", "18rem (w-72)", "shell/App.tsx"],
          ["Style rail width", "30rem expanded, 3.25rem collapsed", "shell/StyleRail.tsx"],
          ["Header row heights", "2.75rem (h-11)", "shell components"],
          ["Tree metrics", "indent, row padding, chevron sizes", "shell/Sidebar.tsx"],
          ["Rail visibility breakpoint", "hidden below lg", "shell/StyleRail.tsx"],
        ],
      },
    },
  ],
  [
    "fixed-note",
    {
      type: "callout",
      props: { tone: "decision", title: "Moving the line" },
      text: [
        t(
          "Promoting any of these to themable is a deliberate decision: add a tier-2 token + registry entry (see Component themes), never a one-off knob. The default answer is no — a consistent workbench frame is a feature.",
        ),
      ],
    },
  ],
  ["knobs-heading", { type: "heading", props: { level: 2 }, text: [t("The style-rail knob map")] }],
  [
    "knobs-para",
    {
      type: "paragraph",
      props: {},
      text: [
        t(
          "The rail has two tabs — Theme (identity: themes, colors, typography, components, background effect) and Layout (geometry: column, surfaces, editor controls) — each a stack of collapsible sections whose open state persists per user. Every knob writes CSS variables onto the root element (a knob at its default removes the override). The full inventory:",
        ),
      ],
    },
  ],
  [
    "knobs-theme",
    {
      type: "structured-table",
      props: {
        title: "Theme tab — Themes / Colors",
        columns: ["Knob", "Writes", "Notes"],
        rows: [
          ["Dark mode", "data-theme attr + .dark class", "Swaps the tier 1/2 definitions"],
          ["Accent", "--accent, --ring, --docs-viewer-link", "Palette family swap"],
          ["Background / Sidebar / Text", "--background, --sidebar, --foreground families", "Explicit color overrides; null follows the theme"],
          ["Themes picker", "injects the theme CSS layer", "See Global themes"],
        ],
      },
    },
  ],
  [
    "knobs-font",
    {
      type: "structured-table",
      props: {
        title: "Theme tab — Typography",
        columns: ["Knob", "Writes", "Notes"],
        rows: [
          ["Body / Heading font", "--font-tx02 / --font-display + --style-heading-font", ""],
          ["Code font", "--docs-font-code", "Code blocks, inline chips, kbd"],
          ["Number font", "--docs-font-numeric", "List markers + ordered counters; Body = inherit"],
          ["Font size / Line height / Letter spacing", "--style-font-size / --style-line-height / --style-letter-spacing", "Content column only"],
        ],
      },
    },
  ],
  [
    "knobs-layout",
    {
      type: "structured-table",
      props: {
        title: "Layout tab — Column / Surfaces",
        columns: ["Knob", "Writes", "Notes"],
        rows: [
          ["Max width / Margin / Top padding", "--style-content-width / --style-content-margin / --style-content-top", "The doc content column"],
          ["Radius", "--radius", "Corner rounding across the UI"],
          ["Border strength", "--border, --input, --sidebar-border, --docs-border-default", "Alpha/contrast multiplier"],
          ["Background / Sidebar tint", "color-mix into --background / --sidebar", "Accent-family tinting"],
          ["Scrollbar width / color / opacity", "--docs-scrollbar-width / -color / -opacity", "WebKit scrollbar styling (Electron); thumb hover goes full-opacity"],
        ],
      },
    },
  ],
  [
    "knobs-effects",
    {
      type: "structured-table",
      props: {
        title: "Layout tab — Editor · Theme tab — Background effect",
        columns: ["Knob", "Writes", "Notes"],
        rows: [
          ["Grain (intensity/density/contrast/blend/softening)", "--docs-grain-*", "Film-grain overlay"],
          ["Highlight color / Rounding / Padding", "--docs-highlight-color / -radius / -padding", "Block selection + changed-flash; padding = same-color shadow spread"],
          ["Drag opacity", "--docs-drag-opacity", "Ghost level of the held block while dragging"],
          ["Drop line color / thickness / opacity / rounding", "--docs-dropcursor-color / -width / -opacity / -radius", "The line shown while dragging"],
          ["Grip gap / vertical offset / size / fade / color", "--docs-grip-gap / -offset-y / -size / -fade / -color", "WHERE and HOW the drag grip renders (fade = show/hide + block-to-block timing)"],
        ],
      },
    },
  ],
  [
    "knobs-components",
    {
      type: "structured-table",
      props: {
        title: "Theme tab — Components",
        columns: ["Knob", "Writes", "Notes"],
        rows: [
          [
            "One collapsible group per theme surface (inline-code, the 14 block types, shared surfaces)",
            "every CSS variable THEME_TOKEN_REGISTRY maps for the picked key",
            "Same vocabulary as a theme folder's components/*.json; overrides layer over the active theme and flow into Save-as-theme as real component files",
          ],
        ],
      },
    },
  ],
]);

console.log("theming section authored");
