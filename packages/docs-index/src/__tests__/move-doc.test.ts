import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { serializeDocDocument, validateDocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { applyOps } from "@codecaine-ai/docs-model/doc-ops";
import { openBacklinksDb, rescanAll, queryInbound } from "../backlinks";
import { moveDocBundle, type ApplyDocOpsFn, type LoadCanvasFn, type SaveCanvasFn } from "../move-doc";
import { resolveDocBundleJsonPath } from "../paths";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

let docsRoot: string;
let db: Database;

/**
 * Minimal fs-backed `ApplyDocOpsFn` for exercising move-doc's save boundary.
 *
 * In Spectre this test used the data-backend's real `applyDocOpsToBundle`
 * (apps/data-backend/src/index.ts) — that function stayed behind in the app
 * because it is entangled with the backend's draft-lock store, patch-undo
 * registry, and path-lock machinery. This helper reproduces the contract the
 * tests (and `moveDocBundle`) rely on: load + validate the bundle, check the
 * hash precondition against the CURRENT serialized doc, apply ops through
 * docs-model's `applyOps`, write back, and return the fresh hash.
 */
const applyDocOpsToBundle: ApplyDocOpsFn = async (root, path, ops, expectedHash) => {
  const jsonAbs = resolveDocBundleJsonPath(root, path);
  if (!jsonAbs) return { ok: false, status: 400, detail: `Invalid docs path: ${path}` };
  let raw: string;
  try {
    raw = await readFile(jsonAbs, "utf8");
  } catch {
    return { ok: false, status: 404, detail: `Doc bundle not found: ${path}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 422, detail: `Doc bundle is not valid JSON: ${path}` };
  }
  const validated = validateDocDocument(parsed);
  if (!validated.ok) {
    return { ok: false, status: 422, detail: `Doc bundle failed validation: ${path}` };
  }
  const hashOf = (value: string) => createHash("sha256").update(value).digest("hex");
  const currentHash = hashOf(serializeDocDocument(validated.document));
  if (expectedHash && expectedHash !== currentHash) {
    return {
      ok: false,
      status: 409,
      detail: "Doc bundle is stale; reload before applying ops.",
      current_hash: currentHash,
      expected_hash: expectedHash,
    };
  }
  const result = applyOps(validated.document, ops, () => randomUUID());
  if (!result.ok) {
    return { ok: false, status: 400, detail: "Doc ops failed to apply", issues: result.issues };
  }
  const serialized = serializeDocDocument(result.doc);
  await writeFile(jsonAbs, serialized, "utf8");
  return {
    ok: true,
    doc: result.doc,
    hash: hashOf(serialized),
    patchId: randomUUID(),
    inverse: result.inverse,
  };
};

beforeEach(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "spectre-move-doc-"));
});

afterEach(async () => {
  db?.close();
  await rm(docsRoot, { recursive: true, force: true });
});

async function writeBundle(bundlePath: string, doc: unknown): Promise<void> {
  const abs = join(docsRoot, bundlePath, "doc.json");
  await mkdir(join(docsRoot, bundlePath), { recursive: true });
  await writeFile(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

async function writeCanvas(relPath: string, canvas: InteractiveCanvasDocument): Promise<void> {
  const abs = join(docsRoot, relPath);
  await mkdir(join(docsRoot, relPath, ".."), { recursive: true });
  await writeFile(abs, `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
}

const loadCanvas: LoadCanvasFn = async (root, relPath) => {
  try {
    const raw = await readFile(join(root, relPath), "utf8");
    return { ok: true, canvas: JSON.parse(raw) as InteractiveCanvasDocument };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
};

const saveCanvas: SaveCanvasFn = async (root, relPath, canvas) => {
  try {
    await writeFile(join(root, relPath), `${JSON.stringify(canvas, null, 2)}\n`, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
};

function targetDoc(bundleId: string): unknown {
  return {
    schemaVersion: 1,
    id: bundleId,
    root: "root",
    blocks: {
      root: { id: "root", flavour: "paragraph", props: {}, children: ["h1"] },
      h1: { id: "h1", flavour: "heading", props: { level: 1 }, children: [] },
    },
  };
}

function sourceDocWithRef(bundleId: string, refPath: string): unknown {
  return {
    schemaVersion: 1,
    id: bundleId,
    root: "root",
    blocks: {
      root: { id: "root", flavour: "paragraph", props: {}, children: ["p1"] },
      p1: {
        id: "p1",
        flavour: "paragraph",
        props: {},
        children: [],
        text: [
          { insert: "See " },
          {
            insert: "purpose",
            attributes: { reference: { kind: "doc", path: refPath, label: "purpose" } },
          },
          { insert: " for context." },
        ],
      },
    },
  };
}

function canvasWithLink(canvasId: string, refPath: string): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: canvasId,
    mode: "diagram",
    objects: [
      {
        id: "obj-1",
        type: "process",
        label: "Box",
        geometry: { x: 0, y: 0, width: 10, height: 10 },
      },
    ],
    connections: [],
    links: [
      {
        id: "link-1",
        objectId: "obj-1",
        target: { kind: "doc", path: refPath, label: "purpose" },
        status: "resolved",
      },
    ],
  };
}

describe("moveDocBundle", () => {
  test("moves the bundle folder and rewrites an inbound doc reference and canvas link", async () => {
    await writeBundle("00-foundation/10-purpose", targetDoc("purpose"));
    await writeBundle(
      "10-system-design/00-overview",
      sourceDocWithRef("overview", "docs/00-foundation/10-purpose.md"),
    );
    await writeCanvas(
      "10-system-design/assets/canvases/arch.canvas.json",
      canvasWithLink("arch", "docs/00-foundation/10-purpose.md"),
    );

    db = await openBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);

    const result = await moveDocBundle(
      docsRoot,
      "00-foundation/10-purpose",
      "00-foundation/15-purpose-renamed",
      {
        applyDocOps: applyDocOpsToBundle,
        loadCanvas,
        saveCanvas,
        backlinksDb: db,
        projectId: "test-project",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.moved).toEqual({
      fromPath: "00-foundation/10-purpose",
      toPath: "00-foundation/15-purpose-renamed",
    });
    expect(result.failures).toEqual([]);
    expect(result.rewrittenSources.sort()).toEqual(
      [
        "10-system-design/00-overview/doc.json",
        "10-system-design/assets/canvases/arch.canvas.json",
      ].sort(),
    );

    // Folder actually moved.
    const movedRaw = await readFile(
      join(docsRoot, "00-foundation/15-purpose-renamed/doc.json"),
      "utf8",
    );
    expect(JSON.parse(movedRaw).id).toBe("purpose");
    await expect(
      readFile(join(docsRoot, "00-foundation/10-purpose/doc.json"), "utf8"),
    ).rejects.toThrow();

    // Doc reference rewritten to canonical form.
    const overviewRaw = await readFile(
      join(docsRoot, "10-system-design/00-overview/doc.json"),
      "utf8",
    );
    const overview = JSON.parse(overviewRaw);
    const rewrittenRef = overview.blocks.p1.text[1].attributes.reference;
    expect(rewrittenRef.path).toBe("00-foundation/15-purpose-renamed");

    // Canvas link rewritten.
    const canvasRaw = await readFile(
      join(docsRoot, "10-system-design/assets/canvases/arch.canvas.json"),
      "utf8",
    );
    const canvas = JSON.parse(canvasRaw) as InteractiveCanvasDocument;
    expect(canvas.links?.[0]?.target.path).toBe("00-foundation/15-purpose-renamed");

    // Re-indexed: querying the OLD path returns nothing, the NEW path returns
    // the rewritten sources.
    expect(queryInbound(db, "docs/00-foundation/10-purpose.md")).toEqual([]);
    const inboundNew = queryInbound(db, "00-foundation/15-purpose-renamed");
    expect(inboundNew.length).toBeGreaterThanOrEqual(1);
  });

  test("flags an unresolvable inbound source as a failure without aborting the whole move", async () => {
    await writeBundle("00-foundation/10-purpose", targetDoc("purpose"));
    // Index references a doc source that will vanish before move-doc rewrites it.
    await writeBundle(
      "10-system-design/00-overview",
      sourceDocWithRef("overview", "docs/00-foundation/10-purpose.md"),
    );

    db = await openBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);

    // Simulate an out-of-band deletion of the inbound source's bundle file.
    await rm(join(docsRoot, "10-system-design/00-overview/doc.json"));

    const result = await moveDocBundle(
      docsRoot,
      "00-foundation/10-purpose",
      "00-foundation/15-purpose-renamed",
      {
        applyDocOps: applyDocOpsToBundle,
        loadCanvas,
        saveCanvas,
        backlinksDb: db,
        projectId: "test-project",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The move itself still succeeds; the missing source is reported, not thrown.
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].sourcePath).toBe("10-system-design/00-overview/doc.json");
    expect(result.rewrittenSources).toEqual([]);

    const movedRaw = await readFile(
      join(docsRoot, "00-foundation/15-purpose-renamed/doc.json"),
      "utf8",
    );
    expect(JSON.parse(movedRaw).id).toBe("purpose");
  });


  test("moving a bundle whose doc references its OWN bundle path rewrites the self-reference at the new location with no failures", async () => {
    await writeBundle(
      "00-foundation/10-purpose",
      sourceDocWithRef("purpose", "docs/00-foundation/10-purpose.md"),
    );

    db = await openBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);

    const result = await moveDocBundle(
      docsRoot,
      "00-foundation/10-purpose",
      "00-foundation/15-purpose-renamed",
      {
        applyDocOps: applyDocOpsToBundle,
        loadCanvas,
        saveCanvas,
        backlinksDb: db,
        projectId: "test-project",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The self-referencing source moved with the bundle — it must be
    // rewritten at its NEW path, never reported as a failure at the old one.
    expect(result.failures).toEqual([]);
    expect(result.rewrittenSources).toEqual(["00-foundation/15-purpose-renamed/doc.json"]);

    const movedRaw = await readFile(
      join(docsRoot, "00-foundation/15-purpose-renamed/doc.json"),
      "utf8",
    );
    const moved = JSON.parse(movedRaw);
    expect(moved.blocks.p1.text[1].attributes.reference.path).toBe(
      "00-foundation/15-purpose-renamed",
    );

    // Index re-homed: rows live under the NEW source path, none linger under
    // the old source path or the old target aliases.
    const inboundNew = queryInbound(db, "00-foundation/15-purpose-renamed");
    expect(inboundNew.map((row) => row.sourcePath)).toEqual([
      "00-foundation/15-purpose-renamed/doc.json",
    ]);
    expect(queryInbound(db, "docs/00-foundation/10-purpose.md")).toEqual([]);
  });

  test("a canvas sidecar INSIDE the moved bundle that links to its own bundle is rewritten at the new location", async () => {
    await writeBundle("00-foundation/10-purpose", targetDoc("purpose"));
    await writeCanvas(
      "00-foundation/10-purpose/assets/canvases/self.canvas.json",
      canvasWithLink("self", "docs/00-foundation/10-purpose.md"),
    );

    db = await openBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);

    const result = await moveDocBundle(
      docsRoot,
      "00-foundation/10-purpose",
      "00-foundation/15-purpose-renamed",
      {
        applyDocOps: applyDocOpsToBundle,
        loadCanvas,
        saveCanvas,
        backlinksDb: db,
        projectId: "test-project",
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.failures).toEqual([]);
    expect(result.rewrittenSources).toEqual([
      "00-foundation/15-purpose-renamed/assets/canvases/self.canvas.json",
    ]);

    const canvasRaw = await readFile(
      join(docsRoot, "00-foundation/15-purpose-renamed/assets/canvases/self.canvas.json"),
      "utf8",
    );
    const canvas = JSON.parse(canvasRaw) as InteractiveCanvasDocument;
    expect(canvas.links?.[0]?.target.path).toBe("00-foundation/15-purpose-renamed");
  });

  test("rejects a move onto an existing path", async () => {
    await writeBundle("00-foundation/10-purpose", targetDoc("purpose"));
    await writeBundle("00-foundation/20-principles", targetDoc("principles"));
    db = await openBacklinksDb(docsRoot);
    await rescanAll(docsRoot, db);

    const result = await moveDocBundle(
      docsRoot,
      "00-foundation/10-purpose",
      "00-foundation/20-principles",
      {
        applyDocOps: applyDocOpsToBundle,
        loadCanvas,
        saveCanvas,
        backlinksDb: db,
        projectId: "test-project",
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
  });

  test("rejects a move when fromPath is not a bundle", async () => {
    db = await openBacklinksDb(docsRoot);
    const result = await moveDocBundle(docsRoot, "00-foundation/does-not-exist", "00-foundation/new", {
      applyDocOps: applyDocOpsToBundle,
      loadCanvas,
      saveCanvas,
      backlinksDb: db,
      projectId: "test-project",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});
