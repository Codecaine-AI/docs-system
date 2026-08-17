import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { auditCommand } from "@codecaine-ai/docs-cli/audit";
import { rescanAll } from "@codecaine-ai/docs-index/backlinks";
import {
  serializeDocDocument,
  type DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";

import { undo_patch } from "../../agent-tools";
import type { DocsChangeEvent } from "../../docs-events";
import { collectBundlePaths, walkDocsDir } from "../../docs-tree";
import { getStoredPatch } from "../../patch-ledger";
import { createDocsRoutes } from "../../routes";
import { createDocsStore } from "../../store";
import {
  createChangeSetRecord,
  listChangeSetRecords,
  readChangeSetRecord,
} from "../changesets-sidecar";

type Entry = { path: string; proposal_id: string };
type TreeOp =
  | { kind: "create-doc"; doc_path: string; title: string; position: number }
  | { kind: "delete-doc"; doc_path: string; position: number }
  | { kind: "move-doc"; from: string; to: string; position: number };

function document(path: string, level = 1): DocDocument {
  return {
    schemaVersion: 1,
    id: path.replaceAll("/", "-"),
    title: path,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["h1"] },
      h1: {
        id: "h1",
        type: "heading",
        props: { level },
        text: [{ insert: path }],
        children: [],
      },
    },
  };
}

function auditCleanDocument(path: string): DocDocument {
  return {
    schemaVersion: 1,
    id: path.replaceAll("/", "-"),
    title: path,
    root: "root",
    blocks: {
      root: { id: "root", type: "paragraph", props: {}, children: ["h1", "p1"] },
      h1: {
        id: "h1",
        type: "heading",
        props: { level: 1 },
        text: [{ insert: path }],
        children: [],
      },
      p1: {
        id: "p1",
        type: "paragraph",
        props: {},
        text: [{ insert: "Opening paragraph." }],
        children: [],
      },
    },
  };
}

describe("multi-document change-set operations", () => {
  let docsRoot: string;
  let store: ReturnType<typeof createDocsStore>;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-changesets-"));
    store = createDocsStore(docsRoot);
    app = createDocsRoutes(store);
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

  async function writeDoc(path: string, doc = document(path)): Promise<string> {
    await mkdir(join(docsRoot, path), { recursive: true });
    const bytes = serializeDocDocument(doc);
    await writeFile(join(docsRoot, path, "doc.json"), bytes, "utf8");
    return bytes;
  }

  function postJson(path: string, body: unknown): Promise<Response> {
    return app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  function get(path: string): Promise<Response> {
    return app.handle(new Request(`http://localhost${path}`));
  }

  async function stage(path: string, level: number, summary = `Update ${path}`): Promise<any> {
    const response = await postJson("/api/proposals", {
      path,
      ops: [{ type: "updateBlock", blockId: "h1", props: { level } }],
      summary,
      session_id: "changeset-test",
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function createChangeSet(
    summary: string,
    entries: Entry[],
    treeOps: TreeOp[] = [],
    extra: Record<string, unknown> = {},
  ): Promise<any> {
    const response = await postJson("/api/changesets", {
      summary,
      session_id: "changeset-test",
      entries,
      tree_ops: treeOps,
      ...extra,
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  test("sidecar create, list, and get round-trip; empty roots and unsafe ids are handled", async () => {
    expect(await listChangeSetRecords(docsRoot)).toEqual({ ok: true, changesets: [] });
    await mkdir(join(docsRoot, ".changesets"));
    expect(await listChangeSetRecords(docsRoot)).toEqual({ ok: true, changesets: [] });

    const created = await createChangeSetRecord(docsRoot, {
      summary: "Round trip",
      sessionId: "session-1",
      entries: [{ docPath: "10-guide", proposalId: "proposal-1" }],
      treeOps: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const listed = await listChangeSetRecords(docsRoot);
    expect(listed).toEqual({ ok: true, changesets: [created.changeset] });
    expect(await readChangeSetRecord(docsRoot, created.changeset.id)).toEqual(created);

    const invalid = await readChangeSetRecord(docsRoot, "../outside");
    expect(invalid).toMatchObject({ ok: false, status: 400 });

    await writeFile(join(docsRoot, ".changesets", "broken.json"), "{not-json\n", "utf8");
    expect(await readChangeSetRecord(docsRoot, "broken")).toMatchObject({ ok: false, status: 422 });
  });

  test("accept applies two docs, records one compound patch, and resolves the originating annotation", async () => {
    await writeDoc("10-a");
    await writeDoc("20-b");

    const annotationResponse = await postJson("/api/annotations", {
      path: "10-a",
      target: { kind: "block", blockId: "h1" },
      body: "Update both documents",
      intent: "agent-request",
      author: "tester",
    });
    expect(annotationResponse.status).toBe(201);
    const annotation = await annotationResponse.json() as any;

    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const staged = await createChangeSet(
      "Apply both documents",
      [
        { path: "10-a", proposal_id: a.proposal.id },
        { path: "20-b", proposal_id: b.proposal.id },
      ],
      [],
      {
        annotation_id: annotation.annotation.id,
        annotation_doc_path: "10-a",
      },
    );

    const response = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(response.status).toBe(200);
    const accepted = await response.json() as any;
    expect(accepted.changeset.status).toBe("applied");
    expect(accepted.changeset.compound_patch_id).toBe(accepted.patch_id);

    const compound = getStoredPatch(accepted.patch_id);
    expect(compound).toMatchObject({ kind: "compound" });
    if (compound?.kind === "compound") {
      expect(compound.patchIds).toHaveLength(2);
      expect(compound.patchIds.every((id) => getStoredPatch(id)?.kind === "doc")).toBe(true);
      expect(compound.patchIds.map((id) => {
        const patch = getStoredPatch(id);
        return patch?.kind === "doc" ? patch.path : undefined;
      })).toEqual(["10-a", "20-b"]);
    }

    expect(JSON.parse(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8"))
      .blocks.h1.props.level).toBe(2);
    expect(JSON.parse(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8"))
      .blocks.h1.props.level).toBe(3);

    const annotations = JSON.parse(
      await readFile(join(docsRoot, "10-a", "annotations.json"), "utf8"),
    );
    expect(annotations.annotations[0]).toMatchObject({
      id: annotation.annotation.id,
      status: "resolved",
      agentRun: {
        sessionId: "changeset-test",
        patchId: accepted.patch_id,
        summary: "Apply both documents",
      },
    });
  });

  test("record changes publish corpus events and accept publishes one event per mutated doc", async () => {
    await writeDoc("10-a");
    const proposal = await stage("10-a", 2);
    const events: DocsChangeEvent[] = [];
    const unsubscribe = store.subscribeChanges((event) => events.push(event));
    try {
      const staged = await createChangeSet("Publish changes", [
        { path: "10-a", proposal_id: proposal.proposal.id },
      ]);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        path: "",
        changedIds: [],
        actor: "changeset-test",
      });

      events.length = 0;
      const response = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
        session_id: "changeset-test",
      });
      expect(response.status).toBe(200);
      const accepted = await response.json() as any;
      expect(events).toEqual([
        {
          path: "10-a",
          changedIds: ["h1"],
          patchId: accepted.patch_id,
          actor: "changeset-test",
        },
        {
          path: "",
          changedIds: [],
          patchId: accepted.patch_id,
          actor: "changeset-test",
        },
      ]);
    } finally {
      unsubscribe();
    }
  });

  test("reject preserves every doc byte and rejects every staged proposal", async () => {
    const aBefore = await writeDoc("10-a");
    const bBefore = await writeDoc("20-b");
    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const staged = await createChangeSet("Decline both", [
      { path: "10-a", proposal_id: a.proposal.id },
      { path: "20-b", proposal_id: b.proposal.id },
    ]);

    const response = await postJson(`/api/changesets/${staged.changeset.id}/reject`, {
      session_id: "changeset-test",
    });
    expect(response.status).toBe(200);
    expect((await response.json() as any).changeset.status).toBe("declined");
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);

    for (const [path, id] of [["10-a", a.proposal.id], ["20-b", b.proposal.id]]) {
      const proposalsResponse = await get(`/api/proposals?path=${path}`);
      expect(proposalsResponse.status).toBe(200);
      const proposals = await proposalsResponse.json() as any;
      expect(proposals.proposals.find((proposal: any) => proposal.id === id)?.status).toBe("rejected");
    }
  });

  test("a stale third entry rolls back the accepted prefix byte-for-byte without a compound patch", async () => {
    const aBefore = await writeDoc("10-a");
    const bBefore = await writeDoc("20-b");
    await writeDoc("30-c");
    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const c = await stage("30-c", 4);
    const staged = await createChangeSet("Rollback prefix", [
      { path: "10-a", proposal_id: a.proposal.id },
      { path: "20-b", proposal_id: b.proposal.id },
      { path: "30-c", proposal_id: c.proposal.id },
    ]);

    const poisoned = document("30-c");
    poisoned.title = "Changed after staging";
    await writeFile(join(docsRoot, "30-c", "doc.json"), serializeDocDocument(poisoned), "utf8");

    const response = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(response.status).toBe(409);
    const failed = await response.json() as any;
    expect(failed).toMatchObject({
      detail: "stale-proposal",
      failed_entry: { path: "30-c", proposal_id: c.proposal.id },
      rolled_back: true,
    });
    expect(failed.results.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(failed.results)).toContain(a.proposal.id);
    expect(JSON.stringify(failed.results)).toContain(b.proposal.id);
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);

    const record = await readChangeSetRecord(docsRoot, staged.changeset.id);
    expect(record.ok && record.changeset).toMatchObject({ status: "open" });
    if (record.ok) expect(record.changeset.compoundPatchId).toBeUndefined();
  });

  test("create, delete, and move tree operations run at their declared positions", async () => {
    await writeDoc("10-entry");
    await writeDoc("20-delete");
    await writeFile(join(docsRoot, "20-delete", "notes.txt"), "sidecar bytes\n", "utf8");
    const movedBytes = await writeDoc("30-move");
    const proposal = await stage("10-entry", 2);
    const staged = await createChangeSet(
      "Tree operations",
      [{ path: "10-entry", proposal_id: proposal.proposal.id }],
      [
        { kind: "create-doc", doc_path: "05-created", title: "Created", position: 0 },
        { kind: "delete-doc", doc_path: "20-delete", position: 1 },
        { kind: "move-doc", from: "30-move", to: "40-moved", position: 1 },
      ],
    );

    const response = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(response.status).toBe(200);
    expect((await response.json() as any).changeset.status).toBe("applied");
    expect(JSON.parse(await readFile(join(docsRoot, "05-created", "doc.json"), "utf8")))
      .toMatchObject({ title: "Created", root: "root" });
    expect(await exists(join(docsRoot, "20-delete"))).toBe(false);
    expect(await exists(join(docsRoot, "30-move"))).toBe(false);
    expect(await readFile(join(docsRoot, "40-moved", "doc.json"), "utf8")).toBe(movedBytes);
  });

  test("a move that precedes a stale entry is moved back during rollback", async () => {
    const aBefore = await writeDoc("10-a");
    await writeDoc("20-c");
    const moverBefore = await writeDoc("30-mover");
    const a = await stage("10-a", 2);
    const c = await stage("20-c", 3);
    const staged = await createChangeSet(
      "Move then fail",
      [
        { path: "10-a", proposal_id: a.proposal.id },
        { path: "20-c", proposal_id: c.proposal.id },
      ],
      [{ kind: "move-doc", from: "30-mover", to: "40-relocated", position: 1 }],
    );

    const poisoned = document("20-c");
    poisoned.title = "Stale";
    await writeFile(join(docsRoot, "20-c", "doc.json"), serializeDocDocument(poisoned), "utf8");

    const response = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(response.status).toBe(409);
    expect((await response.json() as any).rolled_back).toBe(true);
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "30-mover", "doc.json"), "utf8")).toBe(moverBefore);
    expect(await exists(join(docsRoot, "40-relocated"))).toBe(false);
  });

  test("overlapping accepts serialize without deadlock and the second returns a clean stale 409", async () => {
    await writeDoc("10-shared");
    const firstProposal = await stage("10-shared", 2, "First proposal");
    const secondProposal = await stage("10-shared", 3, "Second proposal");
    const firstSet = await createChangeSet("First set", [
      { path: "10-shared", proposal_id: firstProposal.proposal.id },
    ]);
    const secondSet = await createChangeSet("Second set", [
      { path: "10-shared", proposal_id: secondProposal.proposal.id },
    ]);

    const responses = await Promise.all([
      postJson(`/api/changesets/${firstSet.changeset.id}/accept`, {
        session_id: "changeset-test",
      }),
      postJson(`/api/changesets/${secondSet.changeset.id}/accept`, {
        session_id: "changeset-test",
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const bodies = await Promise.all(responses.map((response) => response.json())) as any[];
    expect(bodies.find((_, index) => responses[index]?.status === 409)?.detail)
      .toBe("stale-proposal");
  }, 5_000);

  test("change-set undo restores both docs exactly and reopens the record", async () => {
    const aBefore = await writeDoc("10-a");
    const bBefore = await writeDoc("20-b");
    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const staged = await createChangeSet("Undo both", [
      { path: "10-a", proposal_id: a.proposal.id },
      { path: "20-b", proposal_id: b.proposal.id },
    ]);
    const acceptedResponse = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(acceptedResponse.status).toBe(200);
    const accepted = await acceptedResponse.json() as any;

    const undoResponse = await postJson(`/api/changesets/${staged.changeset.id}/undo`, {
      session_id: "changeset-test",
    });
    expect(undoResponse.status).toBe(200);
    const undone = await undoResponse.json() as any;
    expect(undone.changeset.status).toBe("open");
    expect(undone.changeset.resolved_at).toBeUndefined();
    expect(undone.changeset.compound_patch_id).toBeUndefined();
    expect(getStoredPatch(accepted.patch_id)).toBeUndefined();
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);

    const listedResponse = await get("/api/changesets");
    expect(listedResponse.status).toBe(200);
    const listed = await listedResponse.json() as any;
    const view = listed.changesets.find((item: any) => item.id === staged.changeset.id);
    expect(view.progress).toEqual({ accepted: 0, total: 2 });
    expect(view.entries.map((entry: any) => entry.status)).toEqual(["staged", "staged"]);
    expect(view.entries.map((entry: any) => entry.stale)).toEqual([false, false]);
  });

  test("the existing undo_patch tool batches a compound id newest-first", async () => {
    const aBefore = await writeDoc("10-a");
    const bBefore = await writeDoc("20-b");
    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const staged = await createChangeSet("Tool undo", [
      { path: "10-a", proposal_id: a.proposal.id },
      { path: "20-b", proposal_id: b.proposal.id },
    ]);
    const acceptedResponse = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(acceptedResponse.status).toBe(200);
    const accepted = await acceptedResponse.json() as any;
    const compound = getStoredPatch(accepted.patch_id);
    expect(compound?.kind).toBe("compound");

    const result = await undo_patch(docsRoot, accepted.patch_id);
    expect(result).toMatchObject({ ok: true, kind: "compound" });
    if (result.ok && result.kind === "compound" && compound?.kind === "compound") {
      expect(result.undonePatchIds).toEqual([...compound.patchIds].reverse());
    }
    expect(getStoredPatch(accepted.patch_id)).toBeUndefined();
    expect(await readFile(join(docsRoot, "10-a", "doc.json"), "utf8")).toBe(aBefore);
    expect(await readFile(join(docsRoot, "20-b", "doc.json"), "utf8")).toBe(bBefore);
  });

  test("an individually accepted entry counts as progress and is excluded from the compound patch", async () => {
    await writeDoc("10-a");
    await writeDoc("20-b");
    const a = await stage("10-a", 2);
    const b = await stage("20-b", 3);
    const staged = await createChangeSet("Partial review", [
      { path: "10-a", proposal_id: a.proposal.id },
      { path: "20-b", proposal_id: b.proposal.id },
    ]);

    const individualResponse = await postJson(`/api/proposals/${a.proposal.id}/accept`, {
      path: "10-a",
      session_id: "changeset-test",
    });
    expect(individualResponse.status).toBe(200);
    const individual = await individualResponse.json() as any;

    const partialResponse = await get(`/api/changesets?path=${encodeURIComponent("10-a")}`);
    expect(partialResponse.status).toBe(200);
    const partial = await partialResponse.json() as any;
    expect(partial.changesets).toHaveLength(1);
    expect(partial.changesets[0].progress).toEqual({ accepted: 1, total: 2 });

    const acceptResponse = await postJson(`/api/changesets/${staged.changeset.id}/accept`, {
      session_id: "changeset-test",
    });
    expect(acceptResponse.status).toBe(200);
    const accepted = await acceptResponse.json() as any;
    const compound = getStoredPatch(accepted.patch_id);
    expect(compound).toMatchObject({ kind: "compound" });
    if (compound?.kind === "compound") {
      expect(compound.patchIds).toHaveLength(1);
      expect(compound.patchIds).not.toContain(individual.patch_id);
    }
    expect(accepted.changeset.progress).toEqual({ accepted: 2, total: 2 });

    const undoResponse = await postJson(`/api/changesets/${staged.changeset.id}/undo`, {
      session_id: "changeset-test",
    });
    expect(undoResponse.status).toBe(200);
    const undone = await undoResponse.json() as any;
    expect(undone.changeset.progress).toEqual({ accepted: 1, total: 2 });
    expect(undone.changeset.entries.map((entry: any) => entry.status)).toEqual([
      "accepted",
      "staged",
    ]);
  });

  test(".changesets is invisible to the docs tree, CLI audit, and backlinks walk", async () => {
    await writeDoc("10-guide", auditCleanDocument("10-guide"));
    await mkdir(join(docsRoot, ".changesets", "ghost"), { recursive: true });
    await writeFile(join(docsRoot, ".changesets", "record.json"), "{not-json\n", "utf8");
    await writeFile(join(docsRoot, ".changesets", "ghost", "doc.json"), "{not-json\n", "utf8");

    const tree = await walkDocsDir(docsRoot);
    expect(collectBundlePaths(tree)).toEqual(["10-guide"]);

    const audit = await auditCommand(docsRoot);
    expect(audit.findings).toEqual([]);
    expect(audit.errorCount).toBe(0);

    const backlinks = await rescanAll(docsRoot);
    expect(backlinks.sourcesScanned).toBe(1);
    expect(backlinks.refsIndexed).toBe(0);
  });
});
