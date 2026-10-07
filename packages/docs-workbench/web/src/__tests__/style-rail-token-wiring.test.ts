import { readdirSync, readFileSync as readFileSyncRaw, statSync } from "node:fs";
import { resolveDsVars } from "./ds-tokens";

/** Sources read with var(--ds-*) resolved to the design-system token values (see ds-tokens.ts). */
const readFileSync = (path: string, encoding: "utf8") => resolveDsVars(readFileSyncRaw(path, encoding));
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";

import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";

/**
 * The dead-knob guard. A style-rail knob is a registry entry; it only does
 * anything when some stylesheet or component reads the CSS var it writes.
 * A knob nobody reads still renders a slider, which is how State shape's
 * Row padding sat in the rail doing nothing. This walks the whole registry
 * rather than one component so a new token cannot skip the check.
 *
 * It proves a reader EXISTS, not that the reader wins the cascade: an
 * unlayered rule in index.css can still beat a Tailwind utility (see the
 * exemption comment there). That half needs a browser.
 */
const WEB_SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER_SRC = join(WEB_SRC, "..", "..", "..", "docs-viewer", "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "design" || name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

// The token registry (theme/theme-folders/, one file before pass 3) is not a reader.
const REGISTRY_DIR = join(WEB_SRC, "theme", "theme-folders");
const sources = [...sourceFiles(WEB_SRC), ...sourceFiles(VIEWER_SRC)]
  .filter((path) => !path.startsWith(`${REGISTRY_DIR}/`))
  .map((path) => readFileSync(path, "utf8"));
// The Style rail panes (one file, style-rail-panes.tsx, before pass 3).
const labelSource = sourceFiles(join(WEB_SRC, "_components", "StyleRailPanel", "_components", "StyleRailPane"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

/** Sections drawn by the generic component pane, which labels keys from TOKEN_KEY_LABELS. */
const DEDICATED_PANE_SECTIONS = new Set(["shell", "editor-controls", "annotate"]);

/**
 * Registry vars with no reader today. Each entry is a known dead knob, kept
 * here so the list can only shrink: wire the var, then delete its line.
 */
const KNOWN_UNREAD = new Set(["--docs-annotation-wash"]);

describe("style rail token wiring", () => {
  it("has a reader for every CSS var the registry writes", () => {
    const unread: string[] = [];
    for (const [section, tokens] of Object.entries(THEME_TOKEN_REGISTRY)) {
      for (const [key, token] of Object.entries(tokens)) {
        for (const cssVar of token.vars) {
          const read = sources.some((source) => source.includes(`var(${cssVar}`));
          if (!read && !KNOWN_UNREAD.has(cssVar)) unread.push(`${section}.${key} -> ${cssVar}`);
        }
      }
    }
    expect(unread).toEqual([]);
  });

  it("keeps the known-unread list honest", () => {
    const nowRead = [...KNOWN_UNREAD].filter((cssVar) =>
      sources.some((source) => source.includes(`var(${cssVar}`)),
    );
    expect(nowRead).toEqual([]);
  });

  it("keeps the unlayered heading color rule off card headers", () => {
    // A state-shape or interaction-surface header is an <h3>/<h4>. The
    // heading color rule in index.css is unlayered, so without this
    // exemption it beats the card's utility class and Header text is dead.
    const indexCss = ["index.css", "theme/read-surface.css"].map((file) => readFileSync(join(WEB_SRC, file), "utf8")).join("\n");
    expect(indexCss).toContain(
      '.docs-markdown :where(h1, h2, h3, h4, h5, h6):not(:where([data-docs-block-type="state-shape"] *, [data-docs-block-type="interaction-surface"] *)) {\n  color: var(--docs-heading-fg);',
    );
  });

  it("labels every key the generic component pane renders", () => {
    const unlabelled: string[] = [];
    for (const [section, tokens] of Object.entries(THEME_TOKEN_REGISTRY)) {
      if (DEDICATED_PANE_SECTIONS.has(section)) continue;
      for (const key of Object.keys(tokens)) {
        if (!new RegExp(`\\n  ${key}: "`).test(labelSource)) unlabelled.push(`${section}.${key}`);
      }
    }
    expect(unlabelled).toEqual([]);
  });
});
