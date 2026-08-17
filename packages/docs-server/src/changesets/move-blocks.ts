import { randomUUID } from "node:crypto";

import {
  queryInboundToBlocks,
  rescanAll,
  type BacklinkRow,
} from "@codecaine-ai/docs-index/backlinks";
import { rewriteDocRefPath, sameDocRef } from "@codecaine-ai/docs-index/ref-match";
import type { DeltaSpan, DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp } from "@codecaine-ai/docs-model/doc-ops";

import { getBacklinksDb } from "../backlinks-cache";
import { loadDocBundle, normalizeBundlePath } from "../bundle";
import {
  stageBundleProposal,
  stageBundleProposalAgainstDocument,
} from "../proposal-ops";
import { createChangeSet, type ChangeSetFailure, type DocChangeSetView } from "./changeset-ops";
import type {
  DocChangeSetAnnotationMigration,
  DocChangeSetEntry,
  PositionedDocChangeSetTreeOp,
} from "./changesets-sidecar";
import { createEmptyDocDocument } from "./tree-ops";

type GeneratorMetadata = {
  summary?: string;
  sessionId?: string;
  annotationId?: string;
  annotationDocPath?: string;
  alias?: string;
};

export type MoveBlocksChangeSetInput = GeneratorMetadata & {
  sourceDocPath: string;
  blockIds: string[];
  destDocPath: string;
  destPosition: number;
};

export type MergeDocsChangeSetInput = GeneratorMetadata & {
  sourceDocPath: string;
  destDocPath: string;
};

export type SplitDocChangeSetInput = GeneratorMetadata & {
  sourceDocPath: string;
  blockIds: string[];
  newDocPath: string;
  title: string;
  destPosition?: number;
};

export type MoveBlocksChangeSetResult =
  | { ok: true; changeset: DocChangeSetView }
  | ChangeSetFailure;

type BuildOptions = {
  virtualDest?: DocDocument;
  includeDocLevelRefs?: boolean;
  allowEmpty?: boolean;
  treeOps?: (entryCount: number) => PositionedDocChangeSetTreeOp[];
};

type Loaded = { path: string; document: DocDocument };

async function loadDocument(docsRoot: string, path: string): Promise<Loaded | ChangeSetFailure> {
  const loaded = await loadDocBundle(docsRoot, path);
  if ("error" in loaded) return { ok: false, status: loaded.error.status, detail: loaded.error.detail };
  return { path: loaded.bundlePath, document: loaded.document };
}

function failure(status: number, detail: string): ChangeSetFailure {
  return { ok: false, status, detail };
}

function isFailure(value: Loaded | ChangeSetFailure): value is ChangeSetFailure {
  return "ok" in value && value.ok === false;
}

function subtreeIds(document: DocDocument, rootId: string): string[] {
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    for (const childId of document.blocks[id].children) walk(childId);
  };
  walk(rootId);
  return ids;
}

function expandSelection(
  document: DocDocument,
  selected: string[],
  allowEmpty: boolean,
): string[] | ChangeSetFailure {
  if (!allowEmpty && selected.length === 0) return failure(400, "blockIds must not be empty.");
  if (new Set(selected).size !== selected.length) return failure(400, "blockIds must be unique.");
  for (const id of selected) {
    if (id === document.root) return failure(400, "The document root cannot be moved.");
    if (!document.blocks[id]) return failure(404, `Block not found: ${id}`);
  }
  const selectedSet = new Set(selected);
  for (const rootId of selected) {
    const descendants = subtreeIds(document, rootId).slice(1);
    const overlap = descendants.find((id) => selectedSet.has(id));
    if (overlap) return failure(400, `Selection overlaps a moved subtree: ${overlap}`);
  }
  return selected.flatMap((id) => subtreeIds(document, id));
}

function collisionRemap(movedIds: string[], dest: DocDocument): Record<string, string> {
  const reserved = new Set(Object.keys(dest.blocks));
  const remap: Record<string, string> = {};
  for (const id of movedIds) {
    if (!reserved.has(id)) {
      reserved.add(id);
      continue;
    }
    let fresh = randomUUID();
    while (reserved.has(fresh)) fresh = randomUUID();
    remap[id] = fresh;
    reserved.add(fresh);
  }
  return remap;
}

function referenceTargetsMoved(
  reference: { section?: string; symbol?: string },
  movedIds: ReadonlySet<string>,
): boolean {
  return (reference.section !== undefined && movedIds.has(reference.section)) ||
    (reference.symbol !== undefined && movedIds.has(reference.symbol));
}

function rewriteText(
  text: DeltaSpan[] | undefined,
  sourcePath: string,
  destPath: string,
  movedIds: ReadonlySet<string>,
  remap: Record<string, string>,
  includeDocLevel: boolean,
): { text: DeltaSpan[] | undefined; changed: boolean } {
  if (!text) return { text, changed: false };
  let changed = false;
  const next = text.map((span) => {
    const reference = span.attributes?.reference;
    if (!reference || reference.kind !== "doc" || !sameDocRef(reference.path, sourcePath)) return span;
    const anchored = referenceTargetsMoved(reference, movedIds);
    const docLevel = reference.section === undefined && reference.symbol === undefined;
    if (!anchored && !(includeDocLevel && docLevel)) return span;
    changed = true;
    return {
      ...span,
      attributes: {
        ...span.attributes,
        reference: {
          ...reference,
          path: rewriteDocRefPath(reference.path, sourcePath, destPath),
          ...(reference.section === undefined
            ? {}
            : { section: remap[reference.section] ?? reference.section }),
          ...(reference.symbol === undefined
            ? {}
            : { symbol: remap[reference.symbol] ?? reference.symbol }),
        },
      },
    };
  });
  return { text: changed ? next : text, changed };
}

function insertOps(
  source: DocDocument,
  selected: string[],
  dest: DocDocument,
  destPosition: number,
  sourcePath: string,
  destPath: string,
  movedIds: ReadonlySet<string>,
  remap: Record<string, string>,
  includeDocLevel: boolean,
): DocOp[] {
  const ops: DocOp[] = [];
  const requested = Number.isFinite(destPosition) ? Math.trunc(destPosition) : 0;
  const clamped = Math.max(0, Math.min(requested, dest.blocks[dest.root].children.length));
  const emit = (id: string, parentId: string, index: number) => {
    const block = source.blocks[id];
    const rewritten = rewriteText(
      block.text,
      sourcePath,
      destPath,
      movedIds,
      remap,
      includeDocLevel,
    );
    ops.push({
      type: "insertBlock",
      blockId: remap[id] ?? id,
      parentId,
      index,
      blockType: block.type,
      props: { ...block.props },
      ...(rewritten.text === undefined ? {} : { text: rewritten.text }),
    });
    block.children.forEach((childId, childIndex) =>
      emit(childId, remap[id] ?? id, childIndex));
  };
  selected.forEach((id, index) => emit(id, dest.root, clamped + index));
  return ops;
}

function docPathFromSource(sourcePath: string): string | null {
  if (!sourcePath.toLowerCase().endsWith("/doc.json")) return null;
  return sourcePath.slice(0, -"/doc.json".length);
}

function rewriteOpsForDocument(
  document: DocDocument,
  candidateBlockIds: ReadonlySet<string>,
  sourcePath: string,
  destPath: string,
  movedIds: ReadonlySet<string>,
  remap: Record<string, string>,
  includeDocLevel: boolean,
  skipBlockIds: ReadonlySet<string> = new Set(),
): DocOp[] {
  const ops: DocOp[] = [];
  for (const blockId of candidateBlockIds) {
    if (skipBlockIds.has(blockId)) continue;
    const block = document.blocks[blockId];
    if (!block) continue;
    const rewritten = rewriteText(
      block.text,
      sourcePath,
      destPath,
      movedIds,
      remap,
      includeDocLevel,
    );
    if (rewritten.changed) ops.push({ type: "updateBlock", blockId, text: rewritten.text ?? null });
  }
  return ops;
}

function groupInbound(rows: BacklinkRow[]): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const path = docPathFromSource(row.sourcePath);
    if (path === null) continue;
    const ids = grouped.get(path) ?? new Set<string>();
    ids.add(row.sourceBlockId);
    grouped.set(path, ids);
  }
  return grouped;
}

async function buildMove(
  docsRoot: string,
  input: MoveBlocksChangeSetInput,
  options: BuildOptions = {},
): Promise<MoveBlocksChangeSetResult> {
  const sourceLoaded = await loadDocument(docsRoot, input.sourceDocPath);
  if (isFailure(sourceLoaded)) return sourceLoaded;
  const destLoaded = options.virtualDest
    ? { path: normalizeBundlePath(input.destDocPath), document: options.virtualDest }
    : await loadDocument(docsRoot, input.destDocPath);
  if (isFailure(destLoaded)) return destLoaded;
  if (sourceLoaded.path === destLoaded.path) return failure(400, "Source and destination must differ.");

  const expanded = expandSelection(sourceLoaded.document, input.blockIds, options.allowEmpty === true);
  if (!Array.isArray(expanded)) return expanded;
  const movedIds = new Set(expanded);
  const remap = collisionRemap(expanded, destLoaded.document);
  const destOps = insertOps(
    sourceLoaded.document,
    input.blockIds,
    destLoaded.document,
    input.destPosition,
    sourceLoaded.path,
    destLoaded.path,
    movedIds,
    remap,
    options.includeDocLevelRefs === true,
  );
  const sourceOps: DocOp[] = input.blockIds.map((blockId) => ({
    type: "deleteBlock",
    blockId,
    mode: "subtree",
  }));

  const db = await getBacklinksDb(docsRoot);
  await rescanAll(docsRoot, db);
  const inbound = queryInboundToBlocks(db, sourceLoaded.path, expanded);
  if (options.includeDocLevelRefs) {
    inbound.push(...queryInboundToBlocks(db, sourceLoaded.path, []));
  }
  const grouped = groupInbound(inbound);
  const sourceCandidates = grouped.get(sourceLoaded.path) ?? new Set<string>();
  sourceOps.push(...rewriteOpsForDocument(
    sourceLoaded.document,
    sourceCandidates,
    sourceLoaded.path,
    destLoaded.path,
    movedIds,
    remap,
    options.includeDocLevelRefs === true,
    movedIds,
  ));
  const destCandidates = grouped.get(destLoaded.path) ?? new Set<string>();
  destOps.push(...rewriteOpsForDocument(
    destLoaded.document,
    destCandidates,
    sourceLoaded.path,
    destLoaded.path,
    movedIds,
    remap,
    options.includeDocLevelRefs === true,
  ));

  const proposalInput = (ops: DocOp[], summary: string) => ({
    ops,
    summary,
    alias: input.alias,
    sessionId: input.sessionId,
  });
  const destStaged = options.virtualDest
    ? await stageBundleProposalAgainstDocument(
        docsRoot,
        destLoaded.path,
        proposalInput(destOps, `Insert moved blocks into ${destLoaded.path}`),
        destLoaded.document,
        input.sessionId,
      )
    : await stageBundleProposal(
        docsRoot,
        destLoaded.path,
        proposalInput(destOps, `Insert moved blocks into ${destLoaded.path}`),
        input.sessionId,
      );
  if (!destStaged.ok) return failure(destStaged.status, destStaged.detail);
  const sourceStaged = await stageBundleProposal(
    docsRoot,
    sourceLoaded.path,
    proposalInput(sourceOps, `Delete moved blocks from ${sourceLoaded.path}`),
    input.sessionId,
  );
  if (!sourceStaged.ok) return failure(sourceStaged.status, sourceStaged.detail);

  const entries: DocChangeSetEntry[] = [
    { docPath: destLoaded.path, proposalId: destStaged.proposal.id },
    { docPath: sourceLoaded.path, proposalId: sourceStaged.proposal.id },
  ];
  const externalPaths = [...grouped.keys()]
    .filter((path) => path !== sourceLoaded.path && path !== destLoaded.path)
    .sort((a, b) => a.localeCompare(b));
  for (const path of externalPaths) {
    const loaded = await loadDocument(docsRoot, path);
    if (isFailure(loaded)) return loaded;
    const ops = rewriteOpsForDocument(
      loaded.document,
      grouped.get(path) as Set<string>,
      sourceLoaded.path,
      destLoaded.path,
      movedIds,
      remap,
      options.includeDocLevelRefs === true,
    );
    if (ops.length === 0) continue;
    const staged = await stageBundleProposal(
      docsRoot,
      loaded.path,
      proposalInput(ops, `Retarget moved-block links to ${destLoaded.path}`),
      input.sessionId,
    );
    if (!staged.ok) return failure(staged.status, staged.detail);
    entries.push({ docPath: loaded.path, proposalId: staged.proposal.id });
  }

  const migration: DocChangeSetAnnotationMigration = {
    fromDocPath: sourceLoaded.path,
    toDocPath: destLoaded.path,
    blockIds: expanded,
    ...(Object.keys(remap).length === 0 ? {} : { remap }),
  };
  return createChangeSet(docsRoot, {
    summary: input.summary ?? `Move blocks from ${sourceLoaded.path} to ${destLoaded.path}`,
    sessionId: input.sessionId,
    annotationId: input.annotationId,
    annotationDocPath: input.annotationDocPath,
    alias: input.alias,
    entries,
    treeOps: options.treeOps?.(entries.length) ?? [],
    annotationMigrations: [migration],
  });
}

export function moveBlocksChangeSet(
  docsRoot: string,
  input: MoveBlocksChangeSetInput,
): Promise<MoveBlocksChangeSetResult> {
  return buildMove(docsRoot, input);
}

export async function mergeDocsChangeSet(
  docsRoot: string,
  input: MergeDocsChangeSetInput,
): Promise<MoveBlocksChangeSetResult> {
  const source = await loadDocument(docsRoot, input.sourceDocPath);
  if (isFailure(source)) return source;
  const dest = await loadDocument(docsRoot, input.destDocPath);
  if (isFailure(dest)) return dest;
  return buildMove(docsRoot, {
    ...input,
    blockIds: [...source.document.blocks[source.document.root].children],
    destPosition: dest.document.blocks[dest.document.root].children.length,
    summary: input.summary ?? `Merge ${source.path} into ${dest.path}`,
  }, {
    allowEmpty: true,
    includeDocLevelRefs: true,
    treeOps: (entryCount) => [{
      kind: "delete-doc",
      docPath: source.path,
      position: entryCount,
    }],
  });
}

export function splitDocChangeSet(
  docsRoot: string,
  input: SplitDocChangeSetInput,
): Promise<MoveBlocksChangeSetResult> {
  const newDocPath = normalizeBundlePath(input.newDocPath);
  const virtualDest = createEmptyDocDocument(newDocPath, input.title);
  return buildMove(docsRoot, {
    ...input,
    destDocPath: newDocPath,
    destPosition: input.destPosition ?? 0,
    summary: input.summary ?? `Split blocks from ${input.sourceDocPath} into ${newDocPath}`,
  }, {
    virtualDest,
    treeOps: () => [{
      kind: "create-doc",
      docPath: newDocPath,
      title: input.title,
      position: 0,
    }],
  });
}
