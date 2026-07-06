import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  backlinksDbPath,
  extractCanvasRefs,
  extractDocRefs,
  openBacklinksDb,
  queryInbound,
  queryInboundTolerant,
  removeForSource,
  rescanAll,
  upsertForSource,
  type BacklinkRef,
} from "../backlinks";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

describe("backlinks: CRUD against :memory:", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openBacklinksDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("upsertForSource then queryInbound finds the rows", () => {
    const refs: BacklinkRef[] = [
      { sourceBlockId: "block-1", targetKind: "doc", targetPath: "docs/foo/doc.json" },
      { sourceBlockId: "block-2", targetKind: "source", targetPath: "src/bar.ts", targetSymbol: "Bar" },
    ];
    upsertForSource(db, "docs/self/doc.json", refs);

    const inboundFoo = queryInbound(db, "docs/foo/doc.json");
    expect(inboundFoo).toHaveLength(1);
    expect(inboundFoo[0]).toMatchObject({
      sourcePath: "docs/self/doc.json",
      sourceBlockId: "block-1",
      targetKind: "doc",
      targetPath: "docs/foo/doc.json",
    });

    const inboundBar = queryInbound(db, "src/bar.ts");
    expect(inboundBar).toHaveLength(1);
    expect(inboundBar[0]).toMatchObject({
      sourceBlockId: "block-2",
      targetKind: "source",
      targetPath: "src/bar.ts",
      targetSymbol: "Bar",
    });
  });

  test("upsertForSource called again for same source replaces (not duplicates) rows", () => {
    upsertForSource(db, "docs/self/doc.json", [
      { sourceBlockId: "block-1", targetKind: "doc", targetPath: "docs/foo/doc.json" },
      { sourceBlockId: "block-2", targetKind: "doc", targetPath: "docs/baz/doc.json" },
    ]);
    upsertForSource(db, "docs/self/doc.json", [
      { sourceBlockId: "block-3", targetKind: "doc", targetPath: "docs/foo/doc.json" },
    ]);

    const inboundFoo = queryInbound(db, "docs/foo/doc.json");
    expect(inboundFoo).toHaveLength(1);
    expect(inboundFoo[0].sourceBlockId).toBe("block-3");

    const inboundBaz = queryInbound(db, "docs/baz/doc.json");
    expect(inboundBaz).toHaveLength(0);
  });

  test("removeForSource clears its rows", () => {
    upsertForSource(db, "docs/self/doc.json", [
      { sourceBlockId: "block-1", targetKind: "doc", targetPath: "docs/foo/doc.json" },
    ]);
    removeForSource(db, "docs/self/doc.json");
    expect(queryInbound(db, "docs/foo/doc.json")).toHaveLength(0);
  });

  test("queryInbound returns empty array (not throw) for target with no inbound refs", () => {
    expect(() => queryInbound(db, "docs/nowhere/doc.json")).not.toThrow();
    expect(queryInbound(db, "docs/nowhere/doc.json")).toEqual([]);
  });
});

describe("backlinks: pure extractors", () => {
  test("extractDocRefs walks blocks' text spans for reference attributes", () => {
    const doc: DocDocument = {
      schemaVersion: 1,
      id: "doc-1",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "page", props: {}, children: ["b1"] },
        b1: {
          id: "b1",
          flavour: "paragraph",
          props: {},
          children: [],
          text: [
            { insert: "See " },
            {
              insert: "other doc",
              attributes: {
                reference: { kind: "doc", path: "docs/other/doc.json", section: "intro" },
              },
            },
            { insert: " and " },
            {
              insert: "a symbol",
              attributes: {
                reference: { kind: "source", path: "src/thing.ts", symbol: "Thing", line: 42 },
              },
            },
          ],
        },
      },
    } as unknown as DocDocument;

    const refs = extractDocRefs(doc);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      sourceBlockId: "b1",
      targetKind: "doc",
      targetPath: "docs/other/doc.json",
      targetSymbol: undefined,
      targetLine: undefined,
      targetSection: "intro",
    });
    expect(refs[1]).toEqual({
      sourceBlockId: "b1",
      targetKind: "source",
      targetPath: "src/thing.ts",
      targetSymbol: "Thing",
      targetLine: 42,
      targetSection: undefined,
    });
  });

  test("extractCanvasRefs walks canvas.links keyed by owning objectId", () => {
    const canvas: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "canvas-1",
      mode: "diagram",
      objects: [],
      connections: [],
      links: [
        {
          id: "link-1",
          objectId: "obj-1",
          target: { kind: "doc", path: "docs/foo/doc.json", label: "Foo" },
          status: "resolved",
        },
      ],
    };

    const refs = extractCanvasRefs(canvas);
    expect(refs).toEqual([
      {
        sourceBlockId: "obj-1",
        targetKind: "doc",
        targetPath: "docs/foo/doc.json",
        targetSymbol: undefined,
        targetLine: undefined,
        targetSection: undefined,
      },
    ]);
  });
});

describe("backlinks: rescanAll against a fixture docsRoot", () => {
  let docsRoot: string;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "spectre-backlinks-"));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  async function writeFixtures(): Promise<void> {
    // Bundle A: has a reference span pointing at bundle B.
    await mkdir(join(docsRoot, "a"), { recursive: true });
    const docA: DocDocument = {
      schemaVersion: 1,
      id: "doc-a",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "page", props: {}, children: ["b1"] },
        b1: {
          id: "b1",
          flavour: "paragraph",
          props: {},
          children: [],
          text: [
            {
              insert: "link to b",
              attributes: { reference: { kind: "doc", path: "b/doc.json" } },
            },
          ],
        },
      },
    } as unknown as DocDocument;
    await writeFile(join(docsRoot, "a", "doc.json"), JSON.stringify(docA));

    // Bundle B: no outbound references.
    await mkdir(join(docsRoot, "b"), { recursive: true });
    const docB: DocDocument = {
      schemaVersion: 1,
      id: "doc-b",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "page", props: {}, children: [] },
      },
    } as unknown as DocDocument;
    await writeFile(join(docsRoot, "b", "doc.json"), JSON.stringify(docB));

    // Bundle C with a canvas sidecar linking to bundle A.
    await mkdir(join(docsRoot, "c", "assets", "canvases"), { recursive: true });
    const docC: DocDocument = {
      schemaVersion: 1,
      id: "doc-c",
      root: "root",
      blocks: {
        root: { id: "root", flavour: "page", props: {}, children: [] },
      },
    } as unknown as DocDocument;
    await writeFile(join(docsRoot, "c", "doc.json"), JSON.stringify(docC));

    const canvas: InteractiveCanvasDocument = {
      schemaVersion: 1,
      id: "canvas-c",
      mode: "diagram",
      objects: [],
      connections: [],
      links: [
        {
          id: "link-1",
          objectId: "obj-1",
          target: { kind: "doc", path: "a/doc.json" },
          status: "resolved",
        },
      ],
    };
    await writeFile(
      join(docsRoot, "c", "assets", "canvases", "diagram.canvas.json"),
      JSON.stringify(canvas),
    );

    // A dot-directory that must be skipped even if it contains json files.
    await mkdir(join(docsRoot, ".index"), { recursive: true });
    await writeFile(join(docsRoot, ".index", "doc.json"), JSON.stringify(docA));
    await mkdir(join(docsRoot, ".drafts"), { recursive: true });
    await writeFile(join(docsRoot, ".drafts", "doc.json"), JSON.stringify(docA));
  }

  test("rebuilds the table correctly and matches incremental upserts", async () => {
    await writeFixtures();

    const summary = await rescanAll(docsRoot);
    expect(summary.dbPath).toBe(backlinksDbPath(docsRoot));
    // a/doc.json, b/doc.json, c/doc.json, c/assets/canvases/diagram.canvas.json
    // (dot-directories .index/.drafts are skipped entirely).
    expect(summary.sourcesScanned).toBe(4);

    const db = new Database(summary.dbPath, { readonly: true });
    try {
      const inboundB = queryInbound(db, "b/doc.json");
      expect(inboundB).toHaveLength(1);
      expect(inboundB[0].sourcePath).toBe("a/doc.json");

      const inboundA = queryInbound(db, "a/doc.json");
      expect(inboundA).toHaveLength(1);
      expect(inboundA[0].sourcePath).toBe("c/assets/canvases/diagram.canvas.json");
      expect(inboundA[0].sourceBlockId).toBe("obj-1");

      // Parity check: build an equivalent index manually via upsertForSource
      // and confirm it produces the same total row count.
      const memDb = new Database(":memory:");
      memDb.exec(
        `CREATE TABLE backlinks (
          source_path TEXT NOT NULL, source_block_id TEXT NOT NULL,
          target_kind TEXT NOT NULL, target_path TEXT NOT NULL,
          target_symbol TEXT, target_line INTEGER, target_section TEXT,
          updated_at TEXT NOT NULL
        )`,
      );
      upsertForSource(memDb, "a/doc.json", extractDocRefs(docAFixture()));
      upsertForSource(memDb, "c/assets/canvases/diagram.canvas.json", extractCanvasRefs(canvasFixture()));

      const rescanCount = (
        db.query("SELECT COUNT(*) as n FROM backlinks").get() as { n: number }
      ).n;
      const incrementalCount = (
        memDb.query("SELECT COUNT(*) as n FROM backlinks").get() as { n: number }
      ).n;
      expect(rescanCount).toBe(incrementalCount);
      memDb.close();
    } finally {
      db.close();
    }
  });

  test("self-heal: rescanAll works when .index/backlinks.db does not exist yet", async () => {
    await writeFixtures();
    expect(existsSync(join(docsRoot, ".index", "backlinks.db"))).toBe(false);

    const summary = await rescanAll(docsRoot);

    expect(existsSync(summary.dbPath)).toBe(true);
    expect(summary.refsIndexed).toBeGreaterThan(0);

    const db = new Database(summary.dbPath, { readonly: true });
    try {
      const rows = db.query("SELECT COUNT(*) as n FROM backlinks").get() as { n: number };
      expect(rows.n).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });
});

function docAFixture(): DocDocument {
  return {
    schemaVersion: 1,
    id: "doc-a",
    root: "root",
    blocks: {
      root: { id: "root", flavour: "page", props: {}, children: ["b1"] },
      b1: {
        id: "b1",
        flavour: "paragraph",
        props: {},
        children: [],
        text: [
          {
            insert: "link to b",
            attributes: { reference: { kind: "doc", path: "b/doc.json" } },
          },
        ],
      },
    },
  } as unknown as DocDocument;
}

function canvasFixture(): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "canvas-c",
    mode: "diagram",
    objects: [],
    connections: [],
    links: [
      {
        id: "link-1",
        objectId: "obj-1",
        target: { kind: "doc", path: "a/doc.json" },
        status: "resolved",
      },
    ],
  };
}

describe("backlinks: queryInboundTolerant (heterogeneous stored forms)", () => {
  let db: Database;

  beforeEach(async () => {
    db = await openBacklinksDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("finds rows stored under a pre-migration docs/-prefixed .md form when queried by canonical bundle path", () => {
    upsertForSource(db, "10-system-design/00-overview/doc.json", [
      { sourceBlockId: "p1", targetKind: "doc", targetPath: "docs/foo/bar.md" },
    ]);

    expect(queryInbound(db, "foo/bar")).toEqual([]);

    const rows = queryInboundTolerant(db, "foo/bar");
    expect(rows).toHaveLength(1);
    expect(rows[0].sourcePath).toBe("10-system-design/00-overview/doc.json");
    expect(rows[0].targetPath).toBe("docs/foo/bar.md");
  });

  test("unions every stored alias and dedupes rows found under multiple query forms", () => {
    upsertForSource(db, "a/doc.json", [
      { sourceBlockId: "p1", targetKind: "doc", targetPath: "docs/foo/bar.md" },
      { sourceBlockId: "p2", targetKind: "doc", targetPath: "foo/bar" },
      { sourceBlockId: "p3", targetKind: "doc", targetPath: "docs/foo/bar/doc.json" },
    ]);

    const rows = queryInboundTolerant(db, "docs/foo/bar.md");
    expect(rows).toHaveLength(3);
  });

  test("still matches exact source-kind targets verbatim", () => {
    upsertForSource(db, "a/doc.json", [
      { sourceBlockId: "p1", targetKind: "source", targetPath: "apps/frontend/src/lib/types.ts" },
    ]);

    const rows = queryInboundTolerant(db, "apps/frontend/src/lib/types.ts");
    expect(rows).toHaveLength(1);
  });
});
