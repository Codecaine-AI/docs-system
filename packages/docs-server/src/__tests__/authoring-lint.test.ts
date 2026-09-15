import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { getBacklinksDb } from "../backlinks-cache";
import { applyDocOpsToBundle } from "../doc-ops";
import { acceptBundleProposal, stageBundleProposal, stageBundleProposalAgainstDocument } from "../proposal-ops";
import { acceptChangeSet } from "../changesets/changeset-ops";
import { createChangeSetRecord } from "../changesets/changesets-sidecar";
import { getBundleProposals } from "../proposal-ops";
import { createDocsRoutes } from "../routes";
import { createDocsStore } from "../store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
function document(): DocDocument {
  return { schemaVersion: 1, id: "guide", title: "Guide", root: "root", blocks: {
    root: { id: "root", type: "paragraph", props: {}, children: ["p", "other"] },
    p: { id: "p", type: "paragraph", props: {}, children: [], text: [{ insert: "The command saves the file." }] },
    other: { id: "other", type: "paragraph", props: {}, children: [], text: [{ insert: "Read the file." }] },
  } };
}
async function setup(doc = document()) {
  const root = await mkdtemp(join(tmpdir(), "authoring-lint-")); roots.push(root);
  await mkdir(join(root, "guide"));
  await writeFile(join(root, "guide/doc.json"), serializeDocDocument(doc));
  await getBacklinksDb(root);
  return root;
}
function edit(text: string, blockId = "p") { return { type: "updateBlock" as const, blockId, text: [{ insert: text }] }; }

test("staging reports required findings; failed accept leaves document and proposal bytes unchanged; correction accepts", async () => {
  const root = await setup();
  const staged = await stageBundleProposal(root, "guide", { ops: [edit("Save the file—then read it.")], summary: "Edit" });
  expect(staged.ok).toBe(true); if (!staged.ok) return;
  expect(staged.lint.findings.some(f => f.ruleId === "writing.no-em-dash" && f.introduced)).toBe(true);
  expect(staged.lint.blocking).toEqual([]);
  const docBefore = await readFile(join(root, "guide/doc.json"), "utf8");
  const sidecarBefore = await readFile(join(root, "guide/proposals.json"), "utf8");
  const accepted = await acceptBundleProposal(root, "guide", staged.proposal.id);
  expect(accepted.ok).toBe(false); if (accepted.ok) return;
  expect(accepted.lint?.blocking.some(f => f.ruleId === "writing.no-em-dash")).toBe(true);
  expect(accepted.detail).toContain("writing.no-em-dash");
  expect(await readFile(join(root, "guide/doc.json"), "utf8")).toBe(docBefore);
  expect(await readFile(join(root, "guide/proposals.json"), "utf8")).toBe(sidecarBefore);
  const fixed = await stageBundleProposal(root, "guide", { ops: [edit("Save the file. Read it.")], summary: "Fix" });
  if (!fixed.ok) throw new Error(fixed.detail);
  expect((await acceptBundleProposal(root, "guide", fixed.proposal.id)).ok).toBe(true);
});

test("old required finding permits unrelated edits; fresh required finding still blocks", async () => {
  const doc = document(); doc.blocks.p.text = [{ insert: "Save—read." }];
  const root = await setup(doc);
  const staged = await stageBundleProposal(root, "guide", { ops: [edit("Read the saved file.", "other")], summary: "Unrelated" });
  if (!staged.ok) throw new Error(staged.detail);
  expect((await acceptBundleProposal(root, "guide", staged.proposal.id)).ok).toBe(true);
  const fresh = await stageBundleProposal(root, "guide", { ops: [edit("Read—the saved file.", "other")], summary: "New error" });
  if (!fresh.ok) throw new Error(fresh.detail);
  expect((await acceptBundleProposal(root, "guide", fresh.proposal.id)).ok).toBe(false);
});

test("blank intermediate opening saves and stages; virtual staging returns the same diagnostics", async () => {
  const root = await setup();
  const saved = await applyDocOpsToBundle(root, "guide", [edit("")], undefined);
  expect(saved.ok).toBe(true); if (!saved.ok) return;
  expect(saved.lint.findings.some(f => f.ruleId === "structure.opening-paragraph")).toBe(true);
  const staged = await stageBundleProposalAgainstDocument(root, "new", { ops: [edit("")], summary: "Draft" }, document());
  expect(staged.ok).toBe(true); if (!staged.ok) return;
  expect(staged.lint.findings.some(f => f.ruleId === "structure.opening-paragraph")).toBe(true);
});

test("HTTP save and accept responses preserve lint findings", async () => {
  const root = await setup(); const app = createDocsRoutes(createDocsStore(root));
  const post = (path: string, body: unknown) => app.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const staged = await post("/api/proposals", { path: "guide", ops: [edit("Save—read.")], summary: "Edit" });
  const body = await staged.json() as any;
  expect(body.lint.findings.length).toBeGreaterThan(0);
  const rejected = await post(`/api/proposals/${body.proposal.id}/accept`, { path: "guide" });
  expect(rejected.status).toBe(422);
  expect((await rejected.json() as any).lint.blocking.length).toBeGreaterThan(0);
  const saved = await post("/api/ops", { path: "guide", ops: [edit("")] });
  expect(saved.status).toBe(200);
  expect((await saved.json() as any).lint.findings.some((f: any) => f.ruleId === "structure.opening-paragraph")).toBe(true);
});


test("multi-proposal lint rejection rolls back prior documents and accepted states", async () => {
  const root = await setup();
  await mkdir(join(root, "other"));
  await writeFile(join(root, "other/doc.json"), serializeDocDocument(document()));
  const first = await stageBundleProposal(root, "guide", { ops: [edit("Save the output file.")], summary: "Valid edit" });
  const second = await stageBundleProposal(root, "other", { ops: [edit("Save—read.")], summary: "Invalid edit" });
  if (!first.ok || !second.ok) throw new Error("Staging failed");
  const before = await Promise.all(["guide", "other"].map(path => readFile(join(root, path, "doc.json"), "utf8")));
  const created = await createChangeSetRecord(root, { summary: "Both edits", entries: [{ docPath: "guide", proposalId: first.proposal.id }, { docPath: "other", proposalId: second.proposal.id }] });
  if (!created.ok) throw new Error(created.detail);
  const accepted = await acceptChangeSet(root, created.changeset.id);
  expect(accepted.ok).toBe(false);
  expect(accepted.results.some(step => step.kind === "entry" && step.lint?.blocking.length)).toBe(true);
  expect(await Promise.all(["guide", "other"].map(path => readFile(join(root, path, "doc.json"), "utf8")))).toEqual(before);
  for (const path of ["guide", "other"]) {
    const listed = await getBundleProposals(root, path);
    if (!listed.ok) throw new Error(listed.detail);
    expect(listed.proposals[0].status).toBe("staged");
  }
});

test("review-only prose warnings remain visible and do not reject acceptance", async () => {
  const root = await setup();
  const staged = await stageBundleProposal(root, "guide", { ops: [edit("In order to save, press Save.")], summary: "Review wording" });
  if (!staged.ok) throw new Error(staged.detail);
  expect(staged.lint.findings.some(f => f.ruleId === "writing.filler")).toBe(true);
  const accepted = await acceptBundleProposal(root, "guide", staged.proposal.id);
  expect(accepted.ok).toBe(true); if (!accepted.ok) return;
  expect(accepted.lint.findings.some(f => f.ruleId === "writing.filler")).toBe(true);
  expect(accepted.lint.blocking).toEqual([]);
});


test("HTTP edits normalize titles in one save, return the final revision, and undo restores the exact original", async () => {
  const legacy = document();
  legacy.blocks.root.children.unshift("title", "section");
  legacy.blocks.title = { id: "title", type: "heading", props: { level: 1 }, text: [{ insert: "Guide" }], children: ["child"] };
  legacy.blocks.child = { id: "child", type: "paragraph", props: {}, text: [{ insert: "Preserve nested content." }], children: [] };
  legacy.blocks.section = { id: "section", type: "heading", props: { level: 1 }, text: [{ insert: "Details" }], children: [] };
  const root = await setup(legacy);
  const store = createDocsStore(root);
  const before = await store.docGet("guide"); if (!before.ok) throw new Error(before.detail);
  const app = createDocsRoutes(store);
  const response = await app.handle(new Request("http://localhost/api/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "guide", expected_hash: before.hash, ops: [edit("Changed text.")] }) }));
  expect(response.status).toBe(200);
  const saved = await response.json() as any;
  expect(saved.normalization.ops).toHaveLength(1);
  expect(saved.doc.blocks.title).toBeUndefined();
  expect(saved.doc.blocks.root.children[0]).toBe("child");
  expect(saved.doc.blocks.section.props.level).toBe(1);
  expect(saved.doc.blocks.p.text[0].insert).toBe("Changed text.");
  expect(saved.lint.findings.some((f: any) => f.ruleId === "structure.title-heading")).toBe(false);
  const reloaded = await store.docGet("guide");
  expect(reloaded.ok && reloaded.hash).toBe(saved.hash);
  expect(reloaded.ok && reloaded.doc).toEqual(saved.doc);
  const stale = await applyDocOpsToBundle(root, "guide", [edit("Stale")], before.hash);
  expect(!stale.ok && stale.status).toBe(409);
  const undone = await store.undoPatch(saved.patch_id);
  expect(undone.ok).toBe(true);
  expect(await readFile(join(root, "guide/doc.json"), "utf8")).toBe(serializeDocDocument(legacy));
});

test("proposal acceptance corrects a newly introduced title instead of requiring another agent call", async () => {
  const root = await setup();
  const staged = await stageBundleProposal(root, "guide", { summary: "Add title", ops: [{ type: "insertBlock", blockId: "title", parentId: "root", index: 0, blockType: "heading", props: { level: 1 }, text: [{ insert: "Guide" }] }, edit("Updated introduction.")] });
  if (!staged.ok) throw new Error(staged.detail);
  const accepted = await acceptBundleProposal(root, "guide", staged.proposal.id);
  expect(accepted.ok).toBe(true); if (!accepted.ok) return;
  expect(accepted.doc.blocks.title).toBeUndefined();
  expect(accepted.normalization?.ops).toHaveLength(1);
  expect(accepted.lint.blocking).toEqual([]);
});
