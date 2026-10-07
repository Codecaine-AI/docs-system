import type { CodeTheme, CodeThemeListEntry } from "@codecaine-ai/docs-model/code-theme";
import { ApiError, IS_STATIC, fetchJson, postJson, assertWritable } from "./http";

// ---------------------------------------------------------------------------
// Theme folders (docs/20-implementation/40-theming)
// ---------------------------------------------------------------------------

/** The reserved id of the shared theme every project renders when the host supports it. */
export const GLOBAL_THEME_ID = "global";

export type ThemeListEntry = { id: string; name: string; global?: boolean };

export type ThemeWirePayload = {
  id: string;
  manifest: Record<string, unknown>;
  components: Record<string, Record<string, unknown>>;
};

/** Repo themes/ catalogue; a static export has one snapshot but no selectable catalogue. */
export async function getThemes(): Promise<{ themes: ThemeListEntry[] }> {
  if (IS_STATIC) return { themes: [] };
  return fetchJson(`api/themes`);
}

/**
 * The repo theme behind the style rail's baseline. A static export has no
 * server, so `docs-cli export` pregenerates this exact response shape into
 * `data/theme.json` (see docs-workbench/src/export.ts) — without it an
 * exported site would boot at STOCK defaults and silently drop every tuned
 * `--style-*` value. Only the exported theme exists there, so the id is not
 * part of the static path.
 */
export async function getTheme(id: string): Promise<{ theme: ThemeWirePayload }> {
  if (IS_STATIC) return fetchJson(`data/theme.json`);
  return fetchJson(`api/themes/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Code themes — the central code style (docs-server code-themes.ts)
// ---------------------------------------------------------------------------

/** Built-in + imported code themes. A static export has no catalogue. */
export async function getCodeThemes(): Promise<{ codeThemes: CodeThemeListEntry[] }> {
  if (IS_STATIC) return { codeThemes: [] };
  return fetchJson(`api/code-themes`);
}

/**
 * The machine's active code theme. Throws in a static export (and on a host
 * without the route) — callers fail soft and keep the stylesheet's built-in
 * code tokens.
 */
export async function getActiveCodeTheme(): Promise<{ id: string; codeTheme: CodeTheme }> {
  if (IS_STATIC) throw new ApiError("No code themes in a static docs export.", 404);
  return fetchJson(`api/code-themes/active`);
}

export async function setActiveCodeTheme(id: string): Promise<{ id: string; codeTheme: CodeTheme }> {
  assertWritable("Choosing a code theme");
  return fetchJson(`api/code-themes/active`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/** Imports the active VS Code / Cursor theme (`auto` prefers Cursor) into the central store. */
export async function importCodeThemeFromEditor(
  from: "auto" | "cursor" | "vscode" = "auto",
): Promise<{ codeTheme: CodeTheme; warnings: string[] }> {
  assertWritable("Importing a code theme");
  return postJson(`api/code-themes/import`, { from });
}

export async function saveTheme(
  payload: ThemeWirePayload,
): Promise<{ theme: ThemeWirePayload }> {
  assertWritable("Saving a theme");
  return postJson(`api/themes`, payload);
}
