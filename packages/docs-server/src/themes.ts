import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

export type ThemeListEntry = { id: string; name: string };

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
    const manifest = await readJsonFile(join(themesRoot, entry.name, "theme.json"));
    if (!manifest) continue;
    const name = typeof manifest.name === "string" && manifest.name.trim() ? manifest.name : entry.name;
    themes.push({ id: entry.name, name });
  }
  return themes.sort((a, b) => a.id.localeCompare(b.id));
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
  await writeFile(join(dir, "theme.json"), `${JSON.stringify(payload.manifest, null, 2)}\n`);
  for (const [component, tokens] of Object.entries(payload.components ?? {})) {
    if (!isValidThemeId(component)) continue;
    await writeFile(
      join(dir, "components", `${component}.json`),
      `${JSON.stringify(tokens, null, 2)}\n`,
    );
  }
}
