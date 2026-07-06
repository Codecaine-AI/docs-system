import { resolve } from "node:path";
import type { Database } from "bun:sqlite";

import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import {
  extractCanvasRefs,
  extractDocRefs,
  openBacklinksDb,
  upsertForSource,
} from "@codecaine-ai/docs-index/backlinks";

/**
 * Backlinks index cache: one bun:sqlite connection per docs root
 * (`<docsRoot>/.index/backlinks.db`). Indexing is best-effort from every
 * save path — a failure here must NEVER fail the underlying doc/canvas save
 * (the indexers below swallow + log only).
 *
 * Hosts that build/rescan the index themselves (e.g. the standalone serve
 * app's boot-time `rescanAll`, with its read-only-tree in-memory fallback)
 * can `primeBacklinksDb` so every consumer — the backlinks read route AND
 * the best-effort save-path indexers — shares that same connection.
 */

const backlinksDbByDocsRoot = new Map<string, Promise<Database>>();

export function getBacklinksDb(docsRoot: string): Promise<Database> {
  const key = resolve(docsRoot);
  let pending = backlinksDbByDocsRoot.get(key);
  if (!pending) {
    pending = openBacklinksDb(docsRoot);
    backlinksDbByDocsRoot.set(key, pending);
  }
  return pending;
}

/** Registers an externally-opened backlinks db for `docsRoot` (see module doc). */
export function primeBacklinksDb(docsRoot: string, db: Promise<Database>): void {
  backlinksDbByDocsRoot.set(resolve(docsRoot), db);
}

/**
 * Best-effort backlinks upsert for a doc bundle save. `sourcePath` is the
 * bundle's doc.json file path relative to docsRoot (e.g.
 * "00-foundation/10-purpose/doc.json"), matching rescanAll's convention.
 * Never throws — index failures are logged and swallowed so a broken/locked
 * index can never fail a document save.
 */
export async function indexDocSourceBestEffort(
  docsRoot: string,
  sourcePath: string,
  doc: DocDocument,
): Promise<void> {
  try {
    const database = await getBacklinksDb(docsRoot);
    upsertForSource(database, sourcePath, extractDocRefs(doc));
  } catch (error) {
    console.error(`[backlinks] failed to index doc source ${sourcePath}:`, error);
  }
}

/** Best-effort backlinks upsert for a canvas sidecar save. */
export async function indexCanvasSourceBestEffort(
  docsRoot: string,
  sourcePath: string,
  canvas: unknown,
): Promise<void> {
  try {
    const database = await getBacklinksDb(docsRoot);
    upsertForSource(database, sourcePath, extractCanvasRefs(canvas as InteractiveCanvasDocument));
  } catch (error) {
    console.error(`[backlinks] failed to index canvas source ${sourcePath}:`, error);
  }
}
