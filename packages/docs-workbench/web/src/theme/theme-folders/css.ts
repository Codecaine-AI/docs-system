import type { ThemeDefinition } from "./types";
import { THEME_TOKEN_REGISTRY } from "./token-registry";
import { FONT_VARS, readModeValue } from "./definition";
import { styleRailColorControls } from "../../shared/style-rail-settings/color-controls";

/** Selector for a compiled theme's dark values: the dark page plus dark code panels. */
const THEME_DARK_SELECTOR = '[data-theme="dark"], [data-code-panels="dark"] [data-code-surface]';

/**
 * Compiles a RESOLVED theme into the CSS injected as the theme layer. While
 * the rail's color controls are hidden (shell/style-rail-color-controls.ts) a
 * theme's color tokens are left out, so the design-system tokens answer; its
 * lengths, numbers and font stacks still apply.
 */
export function compileThemeCss(theme: ThemeDefinition): string {
  const light: string[] = [];
  const dark: string[] = [];
  const colors = styleRailColorControls();
  for (const [file, tokens] of Object.entries(theme.components)) {
    for (const [key, value] of Object.entries(tokens)) {
      const token = THEME_TOKEN_REGISTRY[file]?.[key];
      if (!token) continue;
      if (token.kind === "color" && !colors) continue;
      const mode = readModeValue(value);
      if (!mode) continue;
      for (const cssVar of token.vars) {
        light.push(`  ${cssVar}: ${mode.light};`);
        dark.push(`  ${cssVar}: ${mode.dark};`);
      }
    }
  }
  for (const [surface, stack] of Object.entries(theme.manifest.fonts ?? {})) {
    for (const cssVar of FONT_VARS[surface] ?? []) {
      light.push(`  ${cssVar}: ${stack};`);
      dark.push(`  ${cssVar}: ${stack};`);
    }
  }
  const blocks: string[] = [];
  if (light.length > 0) blocks.push(`:root, [data-theme="light"] {\n${light.join("\n")}\n}`);
  // The dark block also targets the dark code panel island (see the dark
  // block in theme/semantic.css), so a theme's dark values reach code
  // surfaces on a light page.
  if (dark.length > 0) blocks.push(`${THEME_DARK_SELECTOR} {\n${dark.join("\n")}\n}`);
  return blocks.join("\n\n");
}

const THEME_STYLE_TAG_ID = "docs-theme-folder-css";

/** Injects (or clears, for null) the resolved theme's CSS layer. */
export function applyThemeCss(theme: ThemeDefinition | null): void {
  let tag = document.getElementById(THEME_STYLE_TAG_ID);
  if (!theme) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = THEME_STYLE_TAG_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = compileThemeCss(theme);
}
