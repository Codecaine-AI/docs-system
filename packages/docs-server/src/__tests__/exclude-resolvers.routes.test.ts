import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { canvas_get, sequence_get } from "../agent-tools";
import { createDocsRoutes } from "../routes";
import { createDocsStore, type DocsStore } from "../store";

/**
 * B7-02: every document, sidecar and asset resolver honors the project's
 * codecaine.docs.json `exclude` before any filesystem access, in the
 * root-relative and the doc-relative form. Each refused request carries an
 * otherwise valid payload; the same request against a twin bundle outside
 * the exclusion succeeds; the frozen files stay byte-identical. The policy
 * here comes only from codecaine.docs.json on disk (no registration call).
 */

const FROZEN = "sessions/s1/outputs/inputs/spec-pages/p1";
const TWIN = "notes/twin";
const ANCESTOR = "sessions/s1";
const INTO_FROZEN = "./outputs/inputs/spec-pages/p1";

const CANVAS = (id: string) => ({
  schemaVersion: 1,
  id,
  mode: "diagram",
  title: id,
  objects: [{ id: "obj-1", type: "process", text: "Step", parentId: null, geometry: { x: 0, y: 0, width: 120, height: 64 } }],
  connections: [],
  links: [{ id: "l1", objectId: "obj-1", target: { kind: "doc", path: TWIN }, status: "resolved" }],
});

const SEQUENCE = (id: string) => ({
  version: 1,
  id,
  title: id,
  participants: [
    { id: "a", name: "a", kind: "participant" },
    { id: "b", name: "b", kind: "participant" },
  ],
  items: [{ kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "hello" }],
  style: {},
});

function doc(id: string, srcPrefix = ".") {
  return {
    schemaVersion: 1,
    id,
    title: id,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["canvas-1", "sequence-1", "p1"] },
      "canvas-1": { id: "canvas-1", type: "canvas", props: { src: `${srcPrefix}/assets/canvases/c.canvas.json` }, children: [] },
      "sequence-1": { id: "sequence-1", type: "sequence", props: { src: `${srcPrefix}/assets/sequences/q.sequence.json` }, children: [] },
      p1: { id: "p1", type: "paragraph", props: {}, text: [{ insert: "Body" }], children: [] },
    },
  };
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082", "hex");

let docsRoot: string;
let store: DocsStore;
let app: ReturnType<typeof createDocsRoutes>;

async function write(rel: string, bytes: string | Buffer) {
  await mkdir(join(docsRoot, rel, ".."), { recursive: true });
  await writeFile(join(docsRoot, rel), bytes);
}

async function bundle(path: string, value: unknown) {
  await write(`${path}/doc.json`, `${JSON.stringify(value, null, 2)}\n`);
  await write(`${path}/assets/canvases/c.canvas.json`, `${JSON.stringify(CANVAS(`${path}-canvas`), null, 2)}\n`);
  await write(`${path}/assets/sequences/q.sequence.json`, `${JSON.stringify(SEQUENCE(`${path}-sequence`), null, 2)}\n`);
  await write(`${path}/assets/images/i.png`, PNG);
  await write(`${path}/annotations.json`, `${JSON.stringify({ schemaVersion: 1, annotations: [] }, null, 2)}\n`);
}

/** sha256 of every path below sessions/s1/outputs (folders end in "/"). */
async function frozenBytes(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(join(docsRoot, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(docsRoot, path))).digest("hex");
    }
  };
  await walk("sessions/s1/outputs");
  return out;
}

const get = (path: string) => app.handle(new Request(`http://localhost${path}`));
const send = (method: string, path: string, body: unknown) =>
  app.handle(new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
const q = (value: string) => encodeURIComponent(value);

beforeEach(async () => {
  docsRoot = await realpath(await mkdtemp(join(tmpdir(), "docs-exclude-resolvers-")));
  await write("codecaine.docs.json", JSON.stringify({ name: "kb", docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] }));
  await bundle(TWIN, doc("twin"));
  await bundle(FROZEN, doc("frozen"));
  // An allowed page whose components point INTO the frozen inputs (doc-relative form).
  await write(`${ANCESTOR}/doc.json`, `${JSON.stringify(doc("ancestor", INTO_FROZEN), null, 2)}\n`);
  store = createDocsStore(docsRoot);
  app = createDocsRoutes(store);
});

afterEach(async () => {
  await rm(docsRoot, { recursive: true, force: true });
});

function refused(response: Response) {
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
}

describe("excluded paths are refused at every resolver; twins outside the exclusion work", () => {
  test("Canvas: GET by src, GET by doc, PUT src-rooted and doc-relative, POST create, DELETE, forwarded action", async () => {
    const before = await frozenBytes();
    const frozenCanvas = `${FROZEN}/assets/canvases/c.canvas.json`;
    const twinCanvas = `${TWIN}/assets/canvases/c.canvas.json`;
    const valid = CANVAS("replacement");

    refused(await get(`/api/canvas?src=${q(frozenCanvas)}`));
    refused(await get(`/api/canvas-by-doc?path=${q(`${FROZEN}/doc.json`)}&src=${q("./assets/canvases/c.canvas.json")}`));
    refused(await get(`/api/canvas-by-doc?path=${q(`${ANCESTOR}/doc.json`)}&src=${q(`${INTO_FROZEN}/assets/canvases/c.canvas.json`)}`));
    refused(await send("PUT", "/api/canvas", { src: frozenCanvas, canvas: valid }));
    refused(await send("PUT", "/api/canvas", { path: `${FROZEN}/doc.json`, src: "./assets/canvases/c.canvas.json", canvas: valid }));
    refused(await send("PUT", "/api/canvas", { path: `${ANCESTOR}/doc.json`, src: `${INTO_FROZEN}/assets/canvases/c.canvas.json`, canvas: valid }));
    refused(await send("POST", "/api/canvas", { path: `${ANCESTOR}/doc.json`, src: `${INTO_FROZEN}/assets/canvases/new.canvas.json`, canvas: valid }));
    refused(await send("POST", "/api/canvas", { path: `${FROZEN}/doc.json`, src: "./assets/canvases/new.canvas.json", canvas: valid }));
    refused(await send("DELETE", `/api/canvas?path=${q(`${ANCESTOR}/doc.json`)}&src=${q(`${INTO_FROZEN}/assets/canvases/c.canvas.json`)}`, undefined));
    refused(await send("DELETE", `/api/canvas?path=${q(`${FROZEN}/doc.json`)}&src=${q("./assets/canvases/c.canvas.json")}`, undefined));
    const addObject = { type: "componentAction", blockId: "canvas-1", action: "canvas.updateObject", params: { objectId: "obj-1", patch: { text: "Changed" } } };
    refused(await send("POST", "/api/ops", { path: ANCESTOR, ops: [addObject] }));
    refused(await send("POST", "/api/ops", { path: FROZEN, ops: [addObject] }));
    expect((await canvas_get(docsRoot, frozenCanvas)).ok).toBe(false);
    const listed = (await (await get("/api/canvases")).json() as any).canvases.map((entry: any) => entry.src);
    expect(listed).toEqual([twinCanvas]);
    expect(await frozenBytes()).toEqual(before);

    // Positive controls outside the exclusion.
    expect((await get(`/api/canvas?src=${q(twinCanvas)}`)).status).toBe(200);
    expect((await get(`/api/canvas-by-doc?path=${q(`${TWIN}/doc.json`)}&src=${q("./assets/canvases/c.canvas.json")}`)).status).toBe(200);
    expect((await send("PUT", "/api/canvas", { src: twinCanvas, canvas: valid })).status).toBe(200);
    expect((await send("PUT", "/api/canvas", { path: `${TWIN}/doc.json`, src: "./assets/canvases/c.canvas.json", canvas: valid })).status).toBe(200);
    expect((await send("POST", "/api/ops", { path: TWIN, ops: [addObject] })).status).toBe(200);
    expect((await send("POST", "/api/canvas", { path: `${TWIN}/doc.json`, src: "./assets/canvases/new.canvas.json", canvas: valid })).status).toBe(201);
    expect((await send("DELETE", `/api/canvas?path=${q(`${TWIN}/doc.json`)}&src=${q("./assets/canvases/new.canvas.json")}`, undefined)).status).toBe(200);
    expect(await frozenBytes()).toEqual(before);
    // The twin Canvas save is indexed; the excluded Canvas never entered the backlinks index.
    const sources = (await store.backlinks(TWIN)).map((row) => row.sourcePath);
    expect(sources).toContain(twinCanvas);
    expect(sources.filter((path) => path.includes("outputs/inputs"))).toEqual([]);
  });

  test("Sequence: GET by src, GET by doc, PUT, POST create, DELETE, forwarded action", async () => {
    const before = await frozenBytes();
    const frozenSequence = `${FROZEN}/assets/sequences/q.sequence.json`;
    const twinSequence = `${TWIN}/assets/sequences/q.sequence.json`;
    const valid = SEQUENCE("replacement");

    refused(await get(`/api/sequence?src=${q(frozenSequence)}`));
    refused(await get(`/api/sequence-by-doc?path=${q(`${ANCESTOR}/doc.json`)}&src=${q(`${INTO_FROZEN}/assets/sequences/q.sequence.json`)}`));
    refused(await send("PUT", "/api/sequence", { path: `${ANCESTOR}/doc.json`, src: `${INTO_FROZEN}/assets/sequences/q.sequence.json`, sequence: valid }));
    refused(await send("PUT", "/api/sequence", { path: `${FROZEN}/doc.json`, src: "./assets/sequences/q.sequence.json", sequence: valid }));
    refused(await send("POST", "/api/sequence", { path: `${ANCESTOR}/doc.json`, src: `${INTO_FROZEN}/assets/sequences/new.sequence.json`, sequence: valid }));
    refused(await send("DELETE", `/api/sequence?path=${q(`${ANCESTOR}/doc.json`)}&src=${q(`${INTO_FROZEN}/assets/sequences/q.sequence.json`)}`, undefined));
    const setTitle = { type: "componentAction", blockId: "sequence-1", action: "sequence.setTitle", params: { title: "Renamed" } };
    refused(await send("POST", "/api/ops", { path: ANCESTOR, ops: [setTitle] }));
    expect((await sequence_get(docsRoot, frozenSequence)).ok).toBe(false);
    expect(await frozenBytes()).toEqual(before);

    expect((await get(`/api/sequence?src=${q(twinSequence)}`)).status).toBe(200);
    expect((await get(`/api/sequence-by-doc?path=${q(`${TWIN}/doc.json`)}&src=${q("./assets/sequences/q.sequence.json")}`)).status).toBe(200);
    expect((await send("PUT", "/api/sequence", { path: `${TWIN}/doc.json`, src: "./assets/sequences/q.sequence.json", sequence: valid })).status).toBe(200);
    expect((await send("POST", "/api/ops", { path: TWIN, ops: [setTitle] })).status).toBe(200);
    expect((await send("POST", "/api/sequence", { path: `${TWIN}/doc.json`, src: "./assets/sequences/new.sequence.json", sequence: valid })).status).toBe(201);
    expect((await send("DELETE", `/api/sequence?path=${q(`${TWIN}/doc.json`)}&src=${q("./assets/sequences/new.sequence.json")}`, undefined)).status).toBe(200);
    expect(await frozenBytes()).toEqual(before);
  });

  test("Documents, annotations and assets: read, ops, annotate, serve and upload", async () => {
    const before = await frozenBytes();
    const insert = { type: "insertBlock", blockId: "p2", parentId: "root", index: 0, blockType: "paragraph", props: {}, text: [{ insert: "New" }] };
    const annotation = { target: { blockId: "p1" }, body: "Note", intent: "note", author: "tester" };
    const upload = (bundlePath: string) => {
      const form = new FormData();
      form.set("file", new File([PNG], "pic.png", { type: "image/png" }));
      form.set("bundlePath", bundlePath);
      return app.handle(new Request("http://localhost/api/assets", { method: "POST", body: form }));
    };

    refused(await get(`/api/bundle?path=${q(FROZEN)}`));
    refused(await get(`/api/markdown?path=${q(FROZEN)}`));
    refused(await get(`/api/annotations?path=${q(FROZEN)}`));
    refused(await send("POST", "/api/ops", { path: FROZEN, ops: [insert] }));
    refused(await send("POST", "/api/annotations", { path: FROZEN, ...annotation }));
    refused(await get(`/api/asset?path=${q(`${FROZEN}/assets/images/i.png`)}`));
    refused(await upload(FROZEN));
    expect(await frozenBytes()).toEqual(before);

    expect((await get(`/api/bundle?path=${q(TWIN)}`)).status).toBe(200);
    expect((await get(`/api/markdown?path=${q(TWIN)}`)).status).toBe(200);
    expect((await get(`/api/annotations?path=${q(TWIN)}`)).status).toBe(200);
    expect((await send("POST", "/api/ops", { path: TWIN, ops: [insert] })).status).toBe(200);
    expect((await get(`/api/asset?path=${q(`${TWIN}/assets/images/i.png`)}`)).status).toBe(200);
    expect((await upload(TWIN)).status).toBe(201);
    expect(await frozenBytes()).toEqual(before);
  });

  test("a symbolic link inside the corpus does not lead a read or a write into the frozen inputs", async () => {
    const before = await frozenBytes();
    await symlink(join(docsRoot, "sessions/s1/outputs/inputs/spec-pages"), join(docsRoot, "notes/link"));
    const viaLink = "notes/link/p1";
    const valid = CANVAS("replacement");
    refused(await get(`/api/bundle?path=${q(viaLink)}`));
    refused(await get(`/api/canvas?src=${q(`${viaLink}/assets/canvases/c.canvas.json`)}`));
    refused(await send("PUT", "/api/canvas", { src: `${viaLink}/assets/canvases/c.canvas.json`, canvas: valid }));
    refused(await send("PUT", "/api/canvas", { path: `${viaLink}/doc.json`, src: "./assets/canvases/c.canvas.json", canvas: valid }));
    refused(await get(`/api/asset?path=${q(`${viaLink}/assets/images/i.png`)}`));
    refused(await send("POST", "/api/ops", { path: viaLink, ops: [{ type: "updateBlock", blockId: "p1", text: [{ insert: "x" }] }] }));
    expect(await frozenBytes()).toEqual(before);
  });
});
