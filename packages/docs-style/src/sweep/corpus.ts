/** Reads every page of a docs corpus into memory. A sweep never writes, so this is its only I/O. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateDocDocument } from "@codecaine-ai/docs-model";
import type { SweepPage } from "../types";

/** Dot folders (.changesets, .index, .drafts), installs, and page assets hold no pages. */
function skipFolder(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || name === "assets";
}

/**
 * Every doc.json under docsRoot, sorted by path. The path is the bundle folder relative to the
 * root, with "/" separators. An unreadable or invalid page fails the load: a style pass over a
 * broken page would report on the wrong content.
 */
export async function loadCorpus(docsRoot: string): Promise<SweepPage[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !skipFolder(entry.name)) await walk(path.join(dir, entry.name));
      else if (entry.isFile() && entry.name === "doc.json") files.push(path.join(dir, entry.name));
    }
  }
  await walk(docsRoot);
  const pages = await Promise.all(files.map((file) => readPage(docsRoot, file)));
  return pages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function readPage(docsRoot: string, file: string): Promise<SweepPage> {
  const pagePath = path.relative(docsRoot, path.dirname(file)).split(path.sep).join("/");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = validateDocDocument(parsed);
  if (!result.ok) {
    const issues = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
    throw new Error(`Invalid doc.json at ${file}: ${issues}`);
  }
  return { path: pagePath, doc: result.document };
}
