import { Database } from "bun:sqlite";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DeltaSpan, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import { candidateStoredForms, normalizeDocRefPath } from "./ref-match";

/**
 * Backlinks index (TG7.1): a standalone `bun:sqlite` module that tracks,
 * for every doc.json / *.canvas.json "source" file under a docs tree, which
 * SpectreRef targets it points at (doc mentions and canvas links). This
 * module owns only the sqlite storage + extraction; callers (index.ts route
 * handlers, docs-cli) are responsible for deciding WHEN to call these
 * functions (e.g. after a successful bundle write).
 *
 * Zero coupling to the host app's database (Postgres/drizzle) — this is a fully
 * standalone sqlite file that lives at `<docsRoot>/.index/backlinks.db`.
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS backlinks (
  source_path TEXT NOT NULL,
  source_block_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_path TEXT NOT NULL,
  target_symbol TEXT,
  target_line INTEGER,
  target_section TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backlinks_target_path ON backlinks(target_path);
CREATE INDEX IF NOT EXISTS idx_backlinks_source_path ON backlinks(source_path);
`;

export type BacklinkRef = {
  sourceBlockId: string;
  targetKind: "doc" | "source";
  targetPath: string;
  targetSymbol?: string;
  targetLine?: number;
  targetSection?: string;
};

export type BacklinkRow = {
  sourcePath: string;
  sourceBlockId: string;
  targetKind: "doc" | "source";
  targetPath: string;
  targetSymbol: string | null;
  targetLine: number | null;
  targetSection: string | null;
  updatedAt: string;
};

/**
 * Opens the backlinks sqlite database.
 *
 * `dbPathOrDocsRoot` is either:
 *  - the literal string `:memory:` — opened as-is (for tests), or
 *  - a docsRoot directory path — the db is derived as
 *    `<docsRoot>/.index/backlinks.db`, creating the `.index` directory if
 *    it does not yet exist (self-heal: works against a brand-new docsRoot
 *    with no prior index file).
 *
 * Always ensures the `backlinks` table + indexes exist before returning.
 */
export async function openBacklinksDb(dbPathOrDocsRoot: string): Promise<Database> {
  if (dbPathOrDocsRoot === ":memory:") {
    const db = new Database(":memory:");
    db.exec(SCHEMA_SQL);
    return db;
  }
  const dbPath = backlinksDbPath(dbPathOrDocsRoot);
  await mkdir(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec(SCHEMA_SQL);
  return db;
}

/** Derives the on-disk backlinks db path for a given docsRoot. */
export function backlinksDbPath(docsRoot: string): string {
  return join(docsRoot, ".index", "backlinks.db");
}

/**
 * Transactionally replaces all backlink rows for `sourcePath` with `refs`
 * (delete-then-insert, atomic).
 */
export function upsertForSource(db: Database, sourcePath: string, refs: BacklinkRef[]): void {
  const deleteStmt = db.prepare(`DELETE FROM backlinks WHERE source_path = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO backlinks (
      source_path, source_block_id, target_kind, target_path,
      target_symbol, target_line, target_section, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction((rows: BacklinkRef[]) => {
    deleteStmt.run(sourcePath);
    const updatedAt = new Date().toISOString();
    for (const ref of rows) {
      insertStmt.run(
        sourcePath,
        ref.sourceBlockId,
        ref.targetKind,
        ref.targetPath,
        ref.targetSymbol ?? null,
        ref.targetLine ?? null,
        ref.targetSection ?? null,
        updatedAt,
      );
    }
  });
  run(refs);
}

/** Deletes all backlink rows for `sourcePath`. */
export function removeForSource(db: Database, sourcePath: string): void {
  db.prepare(`DELETE FROM backlinks WHERE source_path = ?`).run(sourcePath);
}

/**
 * Returns all backlink rows whose `target_path` exactly matches
 * `targetPath`. No normalization/tolerant matching — exact string match
 * only (that's a separate concern owned elsewhere).
 */
export function queryInbound(db: Database, targetPath: string): BacklinkRow[] {
  const rows = db
    .query(
      `SELECT source_path, source_block_id, target_kind, target_path,
              target_symbol, target_line, target_section, updated_at
       FROM backlinks WHERE target_path = ?`,
    )
    .all(targetPath) as Array<{
    source_path: string;
    source_block_id: string;
    target_kind: string;
    target_path: string;
    target_symbol: string | null;
    target_line: number | null;
    target_section: string | null;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    sourcePath: row.source_path,
    sourceBlockId: row.source_block_id,
    targetKind: row.target_kind === "doc" ? "doc" : "source",
    targetPath: row.target_path,
    targetSymbol: row.target_symbol,
    targetLine: row.target_line,
    targetSection: row.target_section,
    updatedAt: row.updated_at,
  }));
}

/**
 * Tolerant inbound lookup: the index stores `target_path` verbatim (whatever
 * raw string was in the reference at index time — heterogeneous
 * pre-migration forms like `docs/foo/bar.md` coexist with canonical bundle
 * paths), so an exact-match `queryInbound` misses rows stored under an
 * equivalent alias. This helper normalizes `targetPath` to its canonical
 * bundle form (ref-match.ts), queries every accepted stored alias
 * (`candidateStoredForms`) PLUS the verbatim input (so exact `source`-kind
 * targets like repo file paths still hit), and unions the results, deduped
 * on (sourcePath, sourceBlockId, targetPath).
 */
export function queryInboundTolerant(db: Database, targetPath: string): BacklinkRow[] {
  const forms = new Set<string>([
    targetPath,
    ...candidateStoredForms(normalizeDocRefPath(targetPath)),
  ]);
  const seen = new Set<string>();
  const out: BacklinkRow[] = [];
  for (const form of forms) {
    for (const row of queryInbound(db, form)) {
      const key = `${row.sourcePath}::${row.sourceBlockId}::${row.targetPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

/**
 * Extracts backlink refs from a validated DocDocument: walks every block's
 * `text` delta spans and emits one ref per span with `attributes.reference`.
 */
export function extractDocRefs(document: DocDocument): BacklinkRef[] {
  const refs: BacklinkRef[] = [];
  for (const block of Object.values(document.blocks)) {
    const spans: DeltaSpan[] | undefined = block.text;
    if (!spans) continue;
    for (const span of spans) {
      const reference = span.attributes?.reference;
      if (!reference) continue;
      refs.push({
        sourceBlockId: block.id,
        targetKind: reference.kind,
        targetPath: reference.path,
        targetSymbol: reference.symbol,
        targetLine: reference.line,
        targetSection: reference.section,
      });
    }
  }
  return refs;
}

/**
 * Extracts backlink refs from a validated InteractiveCanvasDocument: walks
 * `canvas.links` (each link carries its own owning `objectId` — see
 * `InteractiveCanvasLink` in interactive-canvas/schema.ts) and emits one ref
 * per link, keyed by that owning object's id.
 */
export function extractCanvasRefs(canvas: InteractiveCanvasDocument): BacklinkRef[] {
  const refs: BacklinkRef[] = [];
  for (const link of canvas.links ?? []) {
    const target = link.target;
    refs.push({
      sourceBlockId: link.objectId,
      targetKind: target.kind,
      targetPath: target.path,
      targetSymbol: target.symbol,
      targetLine: target.line,
      targetSection: target.section,
    });
  }
  return refs;
}

type WalkFile = { absPath: string; relPath: string };

async function walkDocsRoot(docsRoot: string): Promise<WalkFile[]> {
  const results: WalkFile[] = [];

  async function walk(dirAbs: string, dirRel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules") continue;
      const entryAbs = join(dirAbs, entry.name);
      const entryRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        await walk(entryAbs, entryRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "doc.json" || entry.name.endsWith(".canvas.json")) {
        results.push({ absPath: entryAbs, relPath: entryRel });
      }
    }
  }

  await walk(docsRoot, "");
  return results;
}

/**
 * Rebuilds the ENTIRE backlinks table from scratch by walking `docsRoot` for
 * every `doc.json` and `*.canvas.json` file (skipping dot-directories such
 * as `.index`/`.drafts`, and `node_modules`), extracting refs from each, and
 * replacing the table's full contents. Self-healing: works even when the db
 * file/`.index` directory does not exist yet.
 *
 * Pass an already-open `db` to reuse a connection (e.g. in tests); otherwise
 * this opens (and creates, if needed) `<docsRoot>/.index/backlinks.db`.
 */
export async function rescanAll(
  docsRoot: string,
  db?: Database,
): Promise<{ dbPath: string; sourcesScanned: number; refsIndexed: number }> {
  const dbPath = backlinksDbPath(docsRoot);
  const database = db ?? (await openBacklinksDb(docsRoot));

  const files = await walkDocsRoot(docsRoot);

  let sourcesScanned = 0;
  let refsIndexed = 0;

  database.exec("DELETE FROM backlinks");

  for (const file of files) {
    let raw: string;
    try {
      raw = await Bun.file(file.absPath).text();
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    let refs: BacklinkRef[];
    if (file.absPath.endsWith(".canvas.json")) {
      refs = extractCanvasRefs(parsed as InteractiveCanvasDocument);
    } else {
      refs = extractDocRefs(parsed as DocDocument);
    }

    sourcesScanned += 1;
    if (refs.length === 0) continue;
    upsertForSource(database, file.relPath, refs);
    refsIndexed += refs.length;
  }

  return { dbPath, sourcesScanned, refsIndexed };
}
