import { readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Project policy shared by every host (MCP service, standalone serve, kernel
 * edit-session, CLI export): the `exclude` globs a project's
 * `codecaine.docs.json` declares. Read from disk, validated once here, so a
 * fresh process honors the policy without any discovery step.
 */

export const DOCS_PROJECT_CONFIG = "codecaine.docs.json";

/**
 * Validates codecaine.docs.json `"exclude"`: an array of relative glob
 * strings without `..` segments, returned without a leading `./`. Missing
 * means none. Anything else throws, so a malformed policy fails closed.
 */
export function validateExcludeGlobs(value: unknown, configPath: string): string[] {
  if (value === undefined) return [];
  const invalid = () =>
    new Error(`Invalid exclude in ${configPath}: use relative glob strings without '..'`);
  if (!Array.isArray(value)) throw invalid();
  return value.map((glob) => {
    if (typeof glob !== "string" || glob.includes("\0") || isAbsolute(glob) || glob.startsWith("\\")) {
      throw invalid();
    }
    const normalized = glob.replace(/^(\.\/)+/, "");
    if (!normalized || normalized.split("/").some((part) => part === "..")) throw invalid();
    return normalized;
  });
}

/** True when `path` is `ancestor` or lies below it (lexically). */
function isAtOrBelow(ancestor: string, path: string): boolean {
  if (path === ancestor) return true;
  const rel = relative(ancestor, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** A structurally valid codecaine.docs.json. */
export type DocsProjectConfig = {
  /** The config's own folder. */
  folder: string;
  /** `docsRoot` as declared (relative to `folder`); undefined when absent. */
  docsRoot?: string;
  /** The declared docs root resolved against `folder` (default `docs`); lexical. */
  docsRootPath: string;
  /** Validated `exclude` globs (empty when absent). */
  exclude: string[];
  /** Validated `products` (undefined when absent). */
  products?: string[];
  /** The parsed object, for fields this validator does not own (name, repository, ...). */
  record: Record<string, unknown>;
};

/**
 * Structural validation of a codecaine.docs.json, shared by central discovery
 * and every host's policy loader (MCP service, standalone serve, kernel
 * edit-session, CLI export), so all of them accept and refuse the same
 * configs. Fails closed: a value that is not a JSON object, invalid
 * `products`, a present non-string or empty `docsRoot`, a `docsRoot` outside
 * the config's folder, or an invalid `exclude` throws.
 */
export function validateDocsProjectConfig(value: unknown, configPath: string): DocsProjectConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${configPath}: expected a JSON object`);
  }
  const record = value as Record<string, unknown>;
  const folder = dirname(configPath);
  if (
    record.products !== undefined &&
    (!Array.isArray(record.products) || record.products.some((product) => typeof product !== "string"))
  ) {
    throw new Error(`Invalid products in ${configPath}`);
  }
  const declared = record.docsRoot;
  if (declared !== undefined && (typeof declared !== "string" || declared.trim() === "" || declared.includes("\0"))) {
    throw new Error(`Invalid docsRoot in ${configPath}`);
  }
  const docsRootPath = resolve(folder, declared ?? "docs");
  if (!isAtOrBelow(folder, docsRootPath)) throw new Error(`docsRoot must be inside project: ${folder}`);
  const exclude = validateExcludeGlobs(record.exclude, configPath);
  return {
    folder,
    ...(declared !== undefined ? { docsRoot: declared } : {}),
    docsRootPath,
    exclude,
    ...(record.products !== undefined ? { products: record.products as string[] } : {}),
    record,
  };
}

/** Parses and validates codecaine.docs.json text; unparsable JSON throws `Cannot read <path>`. */
export function parseDocsProjectConfig(raw: string, configPath: string): DocsProjectConfig {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cannot read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateDocsProjectConfig(value, configPath);
}

/**
 * Reads and validates the codecaine.docs.json at `configPath`: undefined when
 * there is none, the validated config otherwise. Any other read error, and
 * any structural error, throws. This is the one place configs are read.
 */
export function readDocsProjectConfigSync(configPath: string): DocsProjectConfig | undefined {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw new Error(`Cannot read ${configPath}: ${code ?? String(error)}`);
  }
  return parseDocsProjectConfig(raw, configPath);
}

/** Async form of `readDocsProjectConfigSync` (central discovery). */
export async function readDocsProjectConfig(configPath: string): Promise<DocsProjectConfig | undefined> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw new Error(`Cannot read ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseDocsProjectConfig(raw, configPath);
}

/** One project's exclude globs, as they apply under a given docs root. */
export type DocsProjectExcludeScope = {
  /** The codecaine.docs.json that declares the globs. */
  configPath: string;
  /** The project's canonical docs root (the globs are relative to it). */
  projectDocsRoot: string;
  /**
   * The served docs root relative to `projectDocsRoot` ("" when they are the
   * same). A path relative to the served root is matched as `prefix/path`.
   */
  prefix: string;
  exclude: readonly string[];
};

export type DocsProjectPolicy = {
  /** The canonical docs root the policy was loaded for. */
  docsRoot: string;
  /** Scopes whose project docs root is `docsRoot` itself or one of its ancestors, nearest first. */
  scopes: DocsProjectExcludeScope[];
};

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Loads the exclude policy that governs `docsRoot`: every codecaine.docs.json
 * found at `docsRoot` or one of its ancestors whose declared docs root
 * (`docsRoot`, default `docs`, resolved against the config's folder) is
 * `docsRoot` or contains it. A knowledge base with `"docsRoot": "."` thus
 * governs both a host that serves the knowledge base and one that serves a
 * folder inside it. Fails closed: an unreadable config file, or any config on
 * the way up that fails `validateDocsProjectConfig` (unparsable JSON, a
 * non-object, a present non-string `docsRoot`, invalid `products` or
 * `exclude`), throws before any corpus access.
 */
export function loadDocsProjectPolicy(docsRoot: string): DocsProjectPolicy {
  const served = canonical(docsRoot);
  const scopes: DocsProjectExcludeScope[] = [];
  for (let folder = served; ; folder = dirname(folder)) {
    const configPath = join(folder, DOCS_PROJECT_CONFIG);
    // Every config met is validated structurally (the same validator central
    // discovery uses): a malformed one fails closed instead of reading as "no policy".
    const config = readDocsProjectConfigSync(configPath);
    if (config) {
      const projectDocsRoot = canonical(config.docsRootPath);
      // A docs root that a symbolic link carries out of its project is refused, as discovery does.
      if (!isAtOrBelow(folder, projectDocsRoot)) throw new Error(`docsRoot symlink escapes project: ${folder}`);
      if (isAtOrBelow(projectDocsRoot, served) && config.exclude.length > 0) {
        scopes.push({
          configPath,
          projectDocsRoot,
          prefix: relative(projectDocsRoot, served).split(sep).join("/"),
          exclude: Object.freeze([...config.exclude]),
        });
      }
    }
    if (folder === dirname(folder)) break;
  }
  return { docsRoot: served, scopes };
}
