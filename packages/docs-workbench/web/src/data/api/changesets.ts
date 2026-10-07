import type { DocChangeSetView } from "@codecaine-ai/docs-viewer/lab";
import { fetchJson, postJson, assertWritable, bundlePathOf } from "./http";
import { getSessionId } from "../session";


// ---------------------------------------------------------------------------
// Multi-document change-sets (serve only)
// ---------------------------------------------------------------------------

type DocChangeSetWire = {
  id: string;
  summary: string;
  status: DocChangeSetView["status"];
  session_id?: string;
  annotation_id?: string;
  annotation_doc_path?: string;
  alias?: string;
  entries: Array<{
    doc_path: string;
    proposal_id: string;
    status: DocChangeSetView["entries"][number]["status"];
    stale: boolean;
    summary: string;
    add_count: number;
    del_count: number;
  }>;
  tree_ops: Array<
    | { kind: "create-doc"; doc_path: string; title: string; position: number }
    | { kind: "delete-doc"; doc_path: string; position: number }
    | { kind: "move-doc"; from: string; to: string; position: number }
  >;
  created_at: string;
  resolved_at?: string;
  compound_patch_id?: string;
  progress: { accepted: number; total: number };
};

function changeSetFromWire(wire: DocChangeSetWire): DocChangeSetView {
  return {
    id: wire.id,
    summary: wire.summary,
    status: wire.status,
    sessionId: wire.session_id,
    annotationId: wire.annotation_id,
    annotationDocPath: wire.annotation_doc_path,
    alias: wire.alias,
    entries: wire.entries.map((entry) => ({
      docPath: entry.doc_path,
      proposalId: entry.proposal_id,
      status: entry.status,
      stale: entry.stale,
      summary: entry.summary,
      addCount: entry.add_count,
      delCount: entry.del_count,
    })),
    treeOps: wire.tree_ops.map((operation) => {
      if (operation.kind === "create-doc") {
        return {
          kind: operation.kind,
          docPath: operation.doc_path,
          title: operation.title,
          position: operation.position,
        };
      }
      if (operation.kind === "delete-doc") {
        return {
          kind: operation.kind,
          docPath: operation.doc_path,
          position: operation.position,
        };
      }
      return operation;
    }),
    createdAt: wire.created_at,
    resolvedAt: wire.resolved_at,
    compoundPatchId: wire.compound_patch_id,
    progress: wire.progress,
  };
}

export async function listChangesets(path?: string): Promise<DocChangeSetView[]> {
  const query = path === undefined ? "" : `?path=${encodeURIComponent(bundlePathOf(path))}`;
  const payload = await fetchJson<{ changesets: DocChangeSetWire[] }>(`api/changesets${query}`);
  return payload.changesets.map(changeSetFromWire);
}

async function mutateChangeset(
  id: string,
  action: "accept" | "reject" | "undo",
): Promise<DocChangeSetView> {
  assertWritable(`${action[0]!.toUpperCase()}${action.slice(1)}ing a change-set`);
  const payload = await postJson<{ changeset: DocChangeSetWire }>(
    `api/changesets/${encodeURIComponent(id)}/${action}`,
    { session_id: getSessionId() },
  );
  return changeSetFromWire(payload.changeset);
}

export function acceptChangeset(id: string): Promise<DocChangeSetView> {
  return mutateChangeset(id, "accept");
}

export function rejectChangeset(id: string): Promise<DocChangeSetView> {
  return mutateChangeset(id, "reject");
}

export function undoChangeset(id: string): Promise<DocChangeSetView> {
  return mutateChangeset(id, "undo");
}

