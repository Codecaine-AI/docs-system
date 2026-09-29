import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { atomicWriteFile } from "./atomic-write";

/**
 * Repo theme folders (docs/20-implementation/40-theming): custom themes
 * live as `themes/<id>/` directories SIBLING to the docs root —
 * `theme.json` (manifest) plus optional `components/<file>.json` token
 * files. The server treats theme content as opaque JSON: shape validation
 * and token-registry filtering happen in the workbench loader
 * (theme-folders.ts readThemeDefinition), so a hand-edited file can never
 * break the API — only the manifest's `name` is read here for listings.
 *
 * Confinement: theme ids are strict slugs (no dots, no separators), so
 * every filesystem path is a join of trusted segments under themesRoot.
 */

export type ThemeListEntry = { id: string; name: string; global?: boolean };

export type ThemeFilePayload = {
  id: string;
  manifest: Record<string, unknown>;
  components: Record<string, Record<string, unknown>>;
};

const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidThemeId(id: string): boolean {
  return THEME_ID_RE.test(id);
}

export function themesRootFor(docsRoot: string): string {
  return resolve(docsRoot, "..", "themes");
}

/**
 * The shared GLOBAL theme: one theme folder, outside every repo, that all
 * projects served on this machine use by default. It lives at
 * `<globalThemesRoot>/global/` with the same folder shape as repo themes.
 * The id is reserved: a repo can never list, read, or write its own
 * `themes/global/` — every access to that id goes to the global root.
 */
export const GLOBAL_THEME_ID = "global";
export const GLOBAL_THEME_NAME = "Global";

/** The docs service state directory (mirrors docs-mcp lifecycle.stateDirectory). */
export function docsStateDirectory(): string {
  return process.env.CODECAINE_DOCS_STATE_DIR || join(homedir(), ".local", "state", "codecaine-docs");
}

/** `<stateDirectory>/themes` — the folder holding `global/`. */
export function globalThemesRootFor(stateDirectory: string): string {
  return join(stateDirectory, "themes");
}

/**
 * Resolves the machine's global themes root for hosts that were not handed
 * one explicitly: `CODECAINE_DOCS_GLOBAL_THEMES` wins; otherwise the state
 * directory's `themes/` folder, but only when the state directory exists
 * (a machine without the docs service has no global theme). Hosts call this
 * at their CLI entry point; the route factory never reads the environment.
 */
export function resolveGlobalThemesRoot(): string | undefined {
  const explicit = process.env.CODECAINE_DOCS_GLOBAL_THEMES;
  if (explicit) return resolve(explicit);
  const stateDirectory = docsStateDirectory();
  return existsSync(stateDirectory) ? globalThemesRootFor(stateDirectory) : undefined;
}

/**
 * The themes root that owns `id`: the global root for the reserved id (or
 * null when no global root is configured — the id is then unavailable),
 * the repo root for everything else.
 */
export function themesRootForId(
  id: string,
  themesRoot: string,
  globalThemesRoot: string | undefined,
): string | null {
  if (id === GLOBAL_THEME_ID) return globalThemesRoot ?? null;
  return themesRoot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Lists the repo's theme folders (those with a readable theme.json). */
export async function listRepoThemes(themesRoot: string): Promise<ThemeListEntry[]> {
  let entries;
  try {
    entries = await readdir(themesRoot, { withFileTypes: true });
  } catch {
    return []; // no themes/ directory yet — an empty catalogue, not an error
  }
  const themes: ThemeListEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidThemeId(entry.name)) continue;
    if (entry.name === GLOBAL_THEME_ID) continue; // reserved: never shadows the global theme
    const manifest = await readJsonFile(join(themesRoot, entry.name, "theme.json"));
    if (!manifest) continue;
    const name = typeof manifest.name === "string" && manifest.name.trim() ? manifest.name : entry.name;
    themes.push({ id: entry.name, name });
  }
  return themes.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The full catalogue a host serves: the global theme FIRST when a global
 * root is configured (listed even before its theme.json exists, so a client
 * can offer it), then the repo themes.
 */
export async function listThemes(
  themesRoot: string,
  globalThemesRoot: string | undefined,
): Promise<ThemeListEntry[]> {
  const repo = await listRepoThemes(themesRoot);
  if (!globalThemesRoot) return repo;
  return [{ id: GLOBAL_THEME_ID, name: GLOBAL_THEME_NAME, global: true }, ...repo];
}

/** Reads one theme folder into a single wire payload; null when absent/invalid. */
export async function readRepoTheme(
  themesRoot: string,
  id: string,
): Promise<ThemeFilePayload | null> {
  if (!isValidThemeId(id)) return null;
  const dir = join(themesRoot, id);
  const manifest = await readJsonFile(join(dir, "theme.json"));
  if (!manifest) return null;
  const components: ThemeFilePayload["components"] = {};
  let files: string[] = [];
  try {
    files = (await readdir(join(dir, "components"))).filter((file) => file.endsWith(".json"));
  } catch {
    // no components/ directory — a manifest-only theme is valid
  }
  for (const file of files.sort()) {
    const componentName = file.slice(0, -".json".length);
    if (!isValidThemeId(componentName)) continue;
    const tokens = await readJsonFile(join(dir, "components", file));
    if (tokens) components[componentName] = tokens as Record<string, unknown>;
  }
  return { id, manifest, components };
}

/**
 * Writes (creates or replaces) a theme folder: theme.json plus one file per
 * provided component. Existing component files NOT in the payload are left
 * in place — a save is additive, deletion is a filesystem operation.
 */
export async function writeRepoTheme(
  themesRoot: string,
  payload: ThemeFilePayload,
): Promise<void> {
  if (!isValidThemeId(payload.id)) throw new Error(`Invalid theme id: ${payload.id}`);
  const dir = join(themesRoot, payload.id);
  await mkdir(join(dir, "components"), { recursive: true });
  await atomicWriteFile(join(dir, "theme.json"), `${JSON.stringify(payload.manifest, null, 2)}\n`);
  for (const [component, tokens] of Object.entries(payload.components ?? {})) {
    if (!isValidThemeId(component)) continue;
    await atomicWriteFile(
      join(dir, "components", `${component}.json`),
      `${JSON.stringify(tokens, null, 2)}\n`,
    );
  }
}
