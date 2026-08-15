import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getStoredPatch } from "../patch-ledger";
import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

const SAMPLE_DOC = {
  schemaVersion: 1,
  id: "sample",
  title: "Sample",
  root: "root",
  blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["h1"] },
    h1: {
      id: "h1",
      type: "heading",
      props: { level: 1 },
      text: [{ insert: "Title" }],
      children: [],
    },
  },
};

describe("proposal staging routes", () => {
  let docsRoot: string;
  let app: ReturnType<typeof createDocsRoutes>;

  beforeEach(async () => {
    docsRoot = await mkdtemp(join(tmpdir(), "docs-server-proposals-"));
    await mkdir(join(docsRoot, "guide"), { recursive: true });
    await writeFile(join(docsRoot, "guide", "doc.json"), JSON.stringify(SAMPLE_DOC), "utf8");
    app = createDocsRoutes(createDocsStore(docsRoot));
  });

  afterEach(async () => {
    await rm(docsRoot, { recursive: true, force: true });
  });

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

  async function stage(
    summary: string,
    level: number,
    extra: Record<string, unknown> = {},
  ): Promise<{ response: Response; body: any }> {
    const response = await postJson("/api/proposals", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level } }],
      summary,
      session_id: "agent-session",
      ...extra,
    });
    return { response, body: await response.json() };
  }

  test("stage then accept mutates the doc, records inverse, and resolves its annotation with agentRun", async () => {
    const annotationRes = await postJson("/api/annotations", {
      path: "guide",
      target: { kind: "block", blockId: "h1" },
      body: "Raise this heading",
      intent: "agent-request",
      author: "tester",
    });
    expect(annotationRes.status).toBe(201);
    const annotation = (await annotationRes.json()) as { annotation: { id: string } };

    const staged = await stage("Raise heading level", 2, {
      annotation_id: annotation.annotation.id,
      alias: "heading-review",
    });
    expect(staged.response.status).toBe(201);
    expect(staged.body.proposal).toMatchObject({
      status: "staged",
      summary: "Raise heading level",
      changedBlockIds: ["h1"],
      annotationId: annotation.annotation.id,
      alias: "heading-review",
      sessionId: "agent-session",
    });

    const beforeAccept = JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8"));
    expect(beforeAccept.blocks.h1.props.level).toBe(1);

    const acceptRes = await postJson(`/api/proposals/${staged.body.proposal.id}/accept`, {
      path: "guide",
      session_id: "agent-session",
    });
    expect(acceptRes.status).toBe(200);
    const accepted = (await acceptRes.json()) as any;
    expect(accepted.proposal.status).toBe("accepted");
    expect(accepted.patch_id).toBeTruthy();
    expect(accepted.doc.blocks.h1.props.level).toBe(2);

    const persisted = JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8"));
    expect(persisted.blocks.h1.props.level).toBe(2);
    const patch = getStoredPatch(accepted.patch_id);
    expect(patch?.kind).toBe("doc");
    if (patch?.kind === "doc") {
      expect(patch.inverse).toEqual([
        { type: "updateBlock", blockId: "h1", props: { level: 1 } },
      ]);
    }

    const annotations = JSON.parse(
      await readFile(join(docsRoot, "guide", "annotations.json"), "utf8"),
    );
    expect(annotations.annotations[0]).toMatchObject({
      id: annotation.annotation.id,
      status: "resolved",
      agentRun: {
        sessionId: "agent-session",
        patchId: accepted.patch_id,
        summary: "Raise heading level",
        changedIds: ["h1"],
      },
    });
  });

  test("accept refuses a proposal after the document hash changes", async () => {
    const staged = await stage("Raise heading", 2);
    expect(staged.response.status).toBe(201);

    const competing = await postJson("/api/ops", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "h1", props: { level: 3 } }],
      session_id: "other-session",
    });
    expect(competing.status).toBe(200);

    const acceptRes = await postJson(`/api/proposals/${staged.body.proposal.id}/accept`, {
      path: "guide",
      session_id: "agent-session",
    });
    expect(acceptRes.status).toBe(409);
    expect(await acceptRes.json()).toMatchObject({ detail: "stale-proposal" });
    const persisted = JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8"));
    expect(persisted.blocks.h1.props.level).toBe(3);
  });

  test("reject marks the proposal rejected without touching the document", async () => {
    const staged = await stage("Raise heading", 2);
    const rejectRes = await postJson(`/api/proposals/${staged.body.proposal.id}/reject`, {
      path: "guide",
      session_id: "agent-session",
    });
    expect(rejectRes.status).toBe(200);
    expect(await rejectRes.json()).toMatchObject({ proposal: { status: "rejected" } });

    const persisted = JSON.parse(await readFile(join(docsRoot, "guide", "doc.json"), "utf8"));
    expect(persisted.blocks.h1.props.level).toBe(1);
  });

  test("stage refuses ops that fail the in-memory dry run and writes no sidecar entry", async () => {
    const response = await postJson("/api/proposals", {
      path: "guide",
      ops: [{ type: "updateBlock", blockId: "missing", props: { level: 2 } }],
      summary: "Invalid proposal",
      session_id: "agent-session",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { detail: string; issues?: unknown[] };
    expect(body.detail).toContain("failed to apply");
    expect(body.issues?.length).toBeGreaterThan(0);

    const listRes = await get("/api/proposals?path=guide");
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toMatchObject({ proposals: [] });
  });

  test("accepting one competing proposal computes stale:true for the other without changing its stored status", async () => {
    const first = await stage("Use level two", 2);
    const second = await stage("Use level three", 3);
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);

    const acceptRes = await postJson(`/api/proposals/${first.body.proposal.id}/accept`, {
      path: "guide",
      session_id: "agent-session",
    });
    expect(acceptRes.status).toBe(200);

    const listRes = await get("/api/proposals?path=guide");
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { proposals: Array<any> };
    expect(listed.proposals.find((p) => p.id === first.body.proposal.id)).toMatchObject({
      status: "accepted",
      stale: false,
    });
    expect(listed.proposals.find((p) => p.id === second.body.proposal.id)).toMatchObject({
      status: "staged",
      stale: true,
    });

    const sidecar = JSON.parse(
      await readFile(join(docsRoot, "guide", "proposals.json"), "utf8"),
    );
    const storedSecond = sidecar.proposals.find((p: any) => p.id === second.body.proposal.id);
    expect(storedSecond.status).toBe("staged");
    expect(storedSecond.stale).toBeUndefined();
  });
});
