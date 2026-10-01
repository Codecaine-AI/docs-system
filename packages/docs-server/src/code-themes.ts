import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  BUILTIN_CODE_THEMES,
  DARK_PLUS_CODE_THEME,
  builtinCodeTheme,
  codeThemeListEntry,
  importVscodeTheme,
  isValidCodeThemeId,
  parseCodeTheme,
  slugifyCodeThemeId,
  type CodeTheme,
  type CodeThemeListEntry,
  type CodeThemeRole,
} from "@codecaine-ai/docs-model/code-theme";

import { atomicWriteFile } from "./atomic-write";
import { loadThemeFile, readActiveEditorTheme, type EditorEnvironment } from "./editor-themes";
import { docsStateDirectory } from "./themes";

/**
 * Code themes — the CENTRAL code style (docs-model code-theme.ts), stored
 * per machine, not per repo or page theme: one `<id>.json` file per
 * imported theme in `<codeThemesRoot>/`, by default
 * `<docs state dir>/code-themes/` — a SIBLING of the global page-theme
 * root (`<state dir>/themes/`), so code themes never list as page themes.
 * Built-ins (`dark-plus`, `light-plus`) are constants, never files; their
 * ids are reserved.
 *
 * The ACTIVE code theme — the one every workbench applies to code panes —
 * is `<codeThemesRoot>/active.json` `{ "id": "<code theme id>" }`; missing,
 * unreadable, or naming a theme that no longer exists, it is `dark-plus`.
 * The id `active` is therefore reserved too.
 *
 * Confinement: ids are strict slugs, so every path is `<root>/<slug>.json`.
 */

export const DEFAULT_ACTIVE_CODE_THEME_ID = DARK_PLUS_CODE_THEME.id;
const ACTIVE_FILE_ID = "active";

/** Ids an import or a stored file can never take: built-ins and the active pointer. */
export function isReservedCodeThemeId(id: string): boolean {
  return id === ACTIVE_FILE_ID || builtinCodeTheme(id) !== null;
}

/** `<stateDirectory>/code-themes`. */
export function codeThemesRootFor(stateDirectory: string): string {
  return join(stateDirectory, "code-themes");
}

/**
 * The machine's code-themes root for hosts and the CLI:
 * `CODECAINE_DOCS_CODE_THEMES` wins, else `<state dir>/code-themes`. Always
 * resolves (the folder is created on first import). The route factory
 * never reads the environment; hosts call this at their entry point.
 */
export function resolveCodeThemesRoot(): string {
  const explicit = process.env.CODECAINE_DOCS_CODE_THEMES;
  if (explicit) return resolve(explicit);
  return codeThemesRootFor(docsStateDirectory());
}

export function codeThemePath(root: string, id: string): string {
  if (!isValidCodeThemeId(id)) throw new Error(`Invalid code theme id: ${id}`);
  return join(root, `${id}.json`);
}

/** Reads one stored (non-built-in) code theme; null when absent or invalid. */
export async function readStoredCodeTheme(root: string, id: string): Promise<CodeTheme | null> {
  if (!isValidCodeThemeId(id) || isReservedCodeThemeId(id)) return null;
  try {
    return parseCodeTheme(JSON.parse(await readFile(codeThemePath(root, id), "utf8")), id);
  } catch {
    return null;
  }
}

/** A built-in by id, else the stored theme (when a root is configured). */
export async function readCodeTheme(root: string | undefined, id: string): Promise<CodeTheme | null> {
  const builtin = builtinCodeTheme(id);
  if (builtin) return builtin;
  return root ? readStoredCodeTheme(root, id) : null;
}

/** Built-ins first, then stored themes sorted by id. */
export async function listCodeThemes(root: string | undefined): Promise<CodeThemeListEntry[]> {
  const entries = BUILTIN_CODE_THEMES.map(codeThemeListEntry);
  if (!root) return entries;
  let files: string[] = [];
  try {
    files = await readdir(root);
  } catch {
    return entries; // no folder yet — built-ins only
  }
  const stored: CodeThemeListEntry[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -".json".length);
    if (isReservedCodeThemeId(id)) continue;
    const theme = await readStoredCodeTheme(root, id);
    if (theme) stored.push(codeThemeListEntry(theme));
  }
  return [...entries, ...stored];
}

/** Writes (creates or replaces) `<root>/<id>.json`. Built-in ids are refused. */
export async function writeCodeTheme(root: string, theme: CodeTheme): Promise<string> {
  if (isReservedCodeThemeId(theme.id)) throw new Error(`Code theme id "${theme.id}" is reserved.`);
  const path = codeThemePath(root, theme.id);
  await mkdir(root, { recursive: true });
  await atomicWriteFile(path, `${JSON.stringify(theme, null, 2)}\n`);
  return path;
}

export type ActiveCodeTheme = { id: string; codeTheme: CodeTheme };

/**
 * The active code theme. Falls back to Dark+ when no root is configured,
 * `active.json` is missing or malformed, or it names a deleted theme.
 */
export async function readActiveCodeTheme(root: string | undefined): Promise<ActiveCodeTheme> {
  if (root) {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(root, `${ACTIVE_FILE_ID}.json`), "utf8"));
      const id = parsed && typeof parsed === "object" ? (parsed as { id?: unknown }).id : undefined;
      if (typeof id === "string") {
        const codeTheme = await readCodeTheme(root, id);
        if (codeTheme) return { id, codeTheme };
      }
    } catch {
      // missing or unreadable pointer — the default applies
    }
  }
  return { id: DEFAULT_ACTIVE_CODE_THEME_ID, codeTheme: DARK_PLUS_CODE_THEME };
}

/** Points `active.json` at `id`; throws when no such code theme exists. */
export async function writeActiveCodeTheme(root: string, id: string): Promise<ActiveCodeTheme> {
  const codeTheme = await readCodeTheme(root, id);
  if (!codeTheme) throw new Error(`No code theme named ${JSON.stringify(id)}.`);
  await mkdir(root, { recursive: true });
  await atomicWriteFile(join(root, `${ACTIVE_FILE_ID}.json`), `${JSON.stringify({ id }, null, 2)}\n`);
  return { id, codeTheme };
}

export type CodeThemeImportSource = "cursor" | "vscode" | "auto" | { path: string };

/** Parses a CLI/API `--from` value: editor keywords, else a file path. */
export function parseCodeThemeImportSource(from: string | undefined): CodeThemeImportSource {
  if (!from || from === "auto") return "auto";
  if (from === "cursor" || from === "vscode") return from;
  if (from === "code") return "vscode";
  return { path: resolve(from) };
}

export type ImportCodeThemeOptions = {
  root: string;
  from: CodeThemeImportSource;
  id?: string;
  name?: string;
  /** Test seam for platform paths (editor discovery). */
  environment?: EditorEnvironment;
  now?: () => Date;
};

export type ImportCodeThemeResult = {
  theme: CodeTheme;
  path: string;
  provenance: Record<CodeThemeRole, string>;
  /** Editor DB or theme file read. */
  sourcePath: string;
  /** settings.json `workbench.colorTheme`, for editor imports. */
  settingsTheme?: string;
  warnings: string[];
};

/**
 * Imports the active editor theme (or a theme file) into the central store.
 * Default id: `<editor>-<slug(label)>` (e.g. `cursor-dark-plus`), or
 * `slug(name)` for files (`-imported` appended when that is a built-in id).
 * Re-importing the same theme replaces the file.
 */
export async function importCodeTheme(options: ImportCodeThemeOptions): Promise<ImportCodeThemeResult> {
  const importedAt = (options.now?.() ?? new Date()).toISOString();
  let result: ReturnType<typeof importVscodeTheme>;
  let sourcePath: string;
  let settingsTheme: string | undefined;
  let warnings: string[] = [];

  if (typeof options.from === "object") {
    const data = await loadThemeFile(options.from.path);
    const label = data.label ?? data.name ?? options.from.path.split(/[\\/]/).pop()?.replace(/\.jsonc?$/i, "") ?? "theme";
    const slug = slugifyCodeThemeId(label);
    const id = options.id ?? (isReservedCodeThemeId(slug) ? `${slug.slice(0, 55)}-imported` : slug);
    validateTargetId(id);
    result = importVscodeTheme(data, {
      id,
      name: options.name,
      source: { editor: "file", path: options.from.path, importedAt },
    });
    sourcePath = options.from.path;
  } else {
    const snapshot = await readActiveEditorTheme(options.from, options.environment);
    const label = snapshot.data.label ?? snapshot.data.settingsId ?? "theme";
    const id = options.id ?? `${snapshot.editor}-${slugifyCodeThemeId(label)}`.slice(0, 64);
    validateTargetId(id);
    result = importVscodeTheme(snapshot.data, {
      id,
      name: options.name,
      source: { editor: snapshot.editor, importedAt },
    });
    sourcePath = snapshot.dbPath;
    settingsTheme = snapshot.settingsTheme;
    warnings = snapshot.warnings;
  }

  const path = await writeCodeTheme(options.root, result.theme);
  return { theme: result.theme, path, provenance: result.provenance, sourcePath, settingsTheme, warnings };
}

function validateTargetId(id: string): void {
  if (!isValidCodeThemeId(id)) throw new Error("Code theme id must be a lowercase slug ([a-z0-9-], max 64 chars).");
  if (isReservedCodeThemeId(id)) throw new Error(`Code theme id "${id}" is reserved; pass a different --id.`);
}
