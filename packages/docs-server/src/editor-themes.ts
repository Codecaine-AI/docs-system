import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type { TextMateRule, VscodeThemeData } from "@codecaine-ai/docs-model/code-theme";

/**
 * Editor theme discovery for code-theme imports (code-themes.ts).
 *
 * VS Code and Cursor persist the ACTIVE color theme fully resolved (include
 * chains merged, extension theme loaded) in their global state DB:
 * `<userDir>/globalStorage/state.vscdb`, table ItemTable, key
 * `colorThemeData`. Reading that row is the only source that exactly
 * matches what the editor paints. `<userDir>/settings.json`
 * `workbench.colorTheme` names the theme the user picked — reported as a
 * cross-check (they disagree while the editor auto-switches light/dark).
 *
 * The fallback source is a theme JSON FILE (VS Code theme format: JSONC,
 * `include` chains, `tokenColors` inline or as a path to another JSON file).
 */

export type EditorId = "cursor" | "vscode";

export const EDITOR_LABELS: Record<EditorId, string> = { cursor: "Cursor", vscode: "VS Code" };

const EDITOR_APP_DIRS: Record<EditorId, string> = { cursor: "Cursor", vscode: "Code" };

export type EditorEnvironment = {
  platform?: NodeJS.Platform;
  home?: string;
  env?: Record<string, string | undefined>;
};

/** The editor's `User` directory for this platform. */
export function editorUserDir(editor: EditorId, environment: EditorEnvironment = {}): string {
  const platform = environment.platform ?? process.platform;
  const env = environment.env ?? process.env;
  const home = environment.home ?? env.HOME ?? homedir();
  const app = EDITOR_APP_DIRS[editor];
  if (platform === "darwin") return join(home, "Library", "Application Support", app, "User");
  if (platform === "win32") {
    return join(env.APPDATA ?? join(home, "AppData", "Roaming"), app, "User");
  }
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), app, "User");
}

export function editorStateDbPath(editor: EditorId, environment?: EditorEnvironment): string {
  return join(editorUserDir(editor, environment), "globalStorage", "state.vscdb");
}

export function editorSettingsPath(editor: EditorId, environment?: EditorEnvironment): string {
  return join(editorUserDir(editor, environment), "settings.json");
}

/** Editors with a state DB on this machine, Cursor first. */
export function installedEditors(environment?: EditorEnvironment): EditorId[] {
  return (["cursor", "vscode"] as const).filter((editor) => existsSync(editorStateDbPath(editor, environment)));
}

/**
 * Parses JSONC (VS Code settings / theme files): `//` and block comments
 * and trailing commas are allowed; string contents are left untouched.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let index = 0;
  const length = text.length;
  while (index < length) {
    const ch = text[index];
    if (ch === '"') {
      let end = index + 1;
      while (end < length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      out += text.slice(index, end + 1);
      index = end + 1;
    } else if (ch === "/" && text[index + 1] === "/") {
      while (index < length && text[index] !== "\n") index += 1;
    } else if (ch === "/" && text[index + 1] === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? length : end + 2;
    } else {
      out += ch;
      index += 1;
    }
  }
  // Trailing commas: a comma followed only by whitespace before } or ].
  // Strings were copied verbatim above, so rescan skipping them.
  let result = "";
  index = 0;
  while (index < out.length) {
    const ch = out[index];
    if (ch === '"') {
      let end = index + 1;
      while (end < out.length && out[end] !== '"') end += out[end] === "\\" ? 2 : 1;
      result += out.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (ch === ",") {
      let next = index + 1;
      while (next < out.length && /\s/.test(out[next])) next += 1;
      if (out[next] === "}" || out[next] === "]") {
        index += 1;
        continue;
      }
    }
    result += ch;
    index += 1;
  }
  return JSON.parse(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Reads `workbench.colorTheme` from the editor's settings.json (undefined when absent/unreadable). */
export async function readEditorColorThemeSetting(
  editor: EditorId,
  environment?: EditorEnvironment,
): Promise<string | undefined> {
  try {
    const settings = parseJsonc(await readFile(editorSettingsPath(editor, environment), "utf8"));
    const value = isRecord(settings) ? settings["workbench.colorTheme"] : undefined;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function queryColorThemeData(dbPath: string): VscodeThemeData | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.query("SELECT value FROM ItemTable WHERE key = ?").get("colorThemeData") as
      | { value: string | Uint8Array }
      | null;
    if (!row) return null;
    const text = typeof row.value === "string" ? row.value : new TextDecoder().decode(row.value);
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? (parsed as VscodeThemeData) : null;
  } finally {
    db.close();
  }
}

/**
 * Reads `colorThemeData` from a state DB, read-only. A running editor may
 * hold the DB locked; on any open/query failure the DB (plus its WAL) is
 * copied to a temp dir and read from there.
 */
export async function readStateDbColorTheme(dbPath: string): Promise<VscodeThemeData | null> {
  try {
    return queryColorThemeData(dbPath);
  } catch {
    const tempDir = await mkdtemp(join(tmpdir(), "docs-code-theme-"));
    try {
      const copyPath = join(tempDir, "state.vscdb");
      await copyFile(dbPath, copyPath);
      for (const suffix of ["-wal", "-shm"]) {
        if (existsSync(`${dbPath}${suffix}`)) await copyFile(`${dbPath}${suffix}`, `${copyPath}${suffix}`);
      }
      return queryColorThemeData(copyPath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

export type EditorThemeSnapshot = {
  editor: EditorId;
  dbPath: string;
  data: VscodeThemeData;
  /** settings.json `workbench.colorTheme`, when set. */
  settingsTheme?: string;
  warnings: string[];
};

/**
 * The active theme of `editor` (or, for `auto`, Cursor when installed,
 * else VS Code). Throws a user-facing error when nothing is found.
 */
export async function readActiveEditorTheme(
  from: EditorId | "auto",
  environment?: EditorEnvironment,
): Promise<EditorThemeSnapshot> {
  const candidates: EditorId[] = from === "auto" ? installedEditors(environment) : [from];
  if (candidates.length === 0) {
    throw new Error(
      `No VS Code or Cursor state found (looked for ${editorStateDbPath("cursor", environment)} and ${editorStateDbPath("vscode", environment)}).`,
    );
  }
  const editor = candidates[0];
  const dbPath = editorStateDbPath(editor, environment);
  if (!existsSync(dbPath)) {
    throw new Error(`${EDITOR_LABELS[editor]} state DB not found at ${dbPath}.`);
  }
  const data = await readStateDbColorTheme(dbPath);
  if (!data) {
    throw new Error(
      `${EDITOR_LABELS[editor]} has no stored color theme yet (${dbPath} has no colorThemeData). Open the editor once, then retry.`,
    );
  }
  const warnings: string[] = [];
  const settingsTheme = await readEditorColorThemeSetting(editor, environment);
  if (settingsTheme && data.settingsId && settingsTheme !== data.settingsId) {
    warnings.push(
      `${EDITOR_LABELS[editor]} settings.json names "${settingsTheme}" but the active theme is "${data.settingsId}" (auto light/dark switching?). Imported the active theme.`,
    );
  }
  return { editor, dbPath, data, settingsTheme, warnings };
}

const MAX_INCLUDE_DEPTH = 16;

/**
 * Loads a theme file, resolving `include` chains (included rules first,
 * the including file's colors override) and `tokenColors` given as a path
 * to a JSON file. An exported `colorThemeData` JSON (themeTokenColors) is
 * returned as-is. `.tmTheme` (plist) token files are not supported.
 */
export async function loadThemeFile(path: string, depth = 0): Promise<VscodeThemeData> {
  if (depth > MAX_INCLUDE_DEPTH) throw new Error(`Theme include chain too deep at ${path}.`);
  const absolute = resolve(path);
  let parsed: unknown;
  try {
    parsed = parseJsonc(await readFile(absolute, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read theme file ${absolute}: ${reason}`);
  }
  if (!isRecord(parsed)) throw new Error(`Theme file ${absolute} is not a JSON object.`);
  const theme = parsed as VscodeThemeData & { include?: unknown; tokenColors?: unknown };
  if (Array.isArray(theme.themeTokenColors)) return theme;

  let base: VscodeThemeData = {};
  if (typeof theme.include === "string") {
    base = await loadThemeFile(join(dirname(absolute), theme.include), depth + 1);
  }

  let ownRules: TextMateRule[] = [];
  if (Array.isArray(theme.tokenColors)) {
    ownRules = theme.tokenColors as TextMateRule[];
  } else if (typeof theme.tokenColors === "string") {
    const tokenPath = join(dirname(absolute), theme.tokenColors);
    if (!tokenPath.endsWith(".json")) {
      throw new Error(`Theme ${absolute} uses a .tmTheme token file (${theme.tokenColors}); only JSON themes are supported.`);
    }
    const tokens = parseJsonc(await readFile(tokenPath, "utf8"));
    ownRules = Array.isArray(tokens)
      ? (tokens as TextMateRule[])
      : isRecord(tokens) && Array.isArray(tokens.tokenColors)
        ? (tokens.tokenColors as TextMateRule[])
        : [];
  }

  return {
    name: typeof theme.name === "string" ? theme.name : base.name,
    type: typeof theme.type === "string" ? theme.type : base.type,
    tokenColors: [...(base.tokenColors ?? []), ...ownRules],
    colors: { ...(base.colors ?? {}), ...(isRecord(theme.colors) ? (theme.colors as Record<string, string>) : {}) },
    semanticHighlighting:
      typeof theme.semanticHighlighting === "boolean" ? theme.semanticHighlighting : base.semanticHighlighting,
    semanticTokenColors: {
      ...(base.semanticTokenColors ?? {}),
      ...(isRecord(theme.semanticTokenColors) ? theme.semanticTokenColors : {}),
    },
  };
}
