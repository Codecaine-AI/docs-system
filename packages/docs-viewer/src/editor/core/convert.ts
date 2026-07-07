"use client";

import type {
  DeltaSpan,
  DeltaSpanAttributes,
  DocBlock,
  DocBlockType,
  DocDocument,
} from "@codecaine-ai/docs-model/doc-schema";
import type { DocOp, DocIdFactory } from "@codecaine-ai/docs-model/doc-ops";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { BLOCK_TYPE_TO_NODE_TYPE, NODE_TYPE_TO_BLOCK_TYPE, TEXT_BLOCK_TYPES } from "./schema";

/**
 * doc.json <-> ProseMirror JSON bridge (Checkpoint 8, TG8.1.2).
 *
 * This module is the id-stability boundary (§8.3): `docToPM` stamps every PM
 * node with the SAME `blockId` its source DocBlock had, and `diffToOps`
 * recognizes a PM node as "the same block" purely by that id surviving in
 * the edited tree — never by structural equality. That's what guarantees an
 * edit to one paragraph's text produces exactly one `updateBlock` for that
 * block's id and nothing else, no matter how TipTap/ProseMirror internally
 * represents the edit.
 *
 * Design:
 * - `docToPM`: walks the DocDocument from `root` in the same depth-first
 *   order `docBlockOrder` uses, building a PM `doc` JSON tree whose node
 *   attrs carry `blockId` + `blockProps` (the untyped rest of the block's
 *   `props`, since a few props — heading `level`, list-item `ordered` — get
 *   PROMOTED to dedicated PM attrs for editing ergonomics but must still
 *   round-trip byte-for-byte with the rest of `props`).
 * - `pmToDoc`: the inverse — walks the PM JSON tree, reconstructing each
 *   DocBlock's `props`/`text`/`children` from its node attrs and content.
 *   Brand-new PM nodes (no `blockId`, e.g. freshly inserted via the slash
 *   menu) get a fresh id from `idFactory`.
 * - `diffToOps`: compares the ORIGINAL doc (`baseDoc`, i.e. what docToPM was
 *   given) against the edited doc (`pmToDoc`'s output) and emits a SMALL,
 *   CORRECT DocOp[] batch (not guaranteed minimal — reorders may emit extra
 *   moveBlocks): unchanged blocks emit nothing; a block whose props/text
 *   changed (same id, same parent, same index) emits exactly one
 *   `updateBlock`; a block with no matching id in baseDoc is a fresh
 *   `insertBlock`; a baseDoc block missing from the edited doc is a
 *   `deleteBlock`; a block whose id exists in both but under a different
 *   parent/index is a `moveBlock`; a block whose id survived but whose
 *   FLAVOUR changed is delete+insert with a fresh id (see
 *   `reidentifyDoomedSurvivors` — updateBlock has no flavour field by
 *   design, §8.3). Per-parent children are matched by id (not by a general
 *   LCS) —
 *   simple and correct, per the checkpoint's guidance to prefer
 *   simple-and-correct over clever here.
 */

// ---------------------------------------------------------------------------
// PM JSON types (structural subset — avoids a hard dependency on @tiptap/pm's
// exact Node type so this module stays easy to unit test with plain objects).
// ---------------------------------------------------------------------------

export type PMMark = { type: string; attrs?: Record<string, unknown> };

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
};

const MARK_ATTR_ORDER = ["bold", "italic", "strike", "code", "link"] as const;

// ---------------------------------------------------------------------------
// docToPM
// ---------------------------------------------------------------------------

/** Marks that carry no attrs of their own (bold/italic/strike/code) vs. `link` which carries `href`. */
function marksForSpan(attrs: DeltaSpanAttributes | undefined): PMMark[] {
  if (!attrs) return [];
  const marks: PMMark[] = [];
  if (attrs.bold) marks.push({ type: "bold" });
  if (attrs.italic) marks.push({ type: "italic" });
  if (attrs.strike) marks.push({ type: "strike" });
  if (attrs.code) marks.push({ type: "code" });
  if (attrs.link) marks.push({ type: "link", attrs: { href: attrs.link } });
  return marks;
}

/**
 * Newlines inside prose text spans (hard-wrapped markdown sources carry them)
 * render as collapsed whitespace in every read surface, but ProseMirror's
 * `white-space: pre-wrap` would show them as literal line breaks — so the
 * editor flows them as spaces. Code blocks are exempt: their newlines are
 * real content.
 */
function flowSpanText(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, " ");
}

/** Converts a block's DeltaSpan[] into PM inline content — plain `text` nodes with marks, or `docReference` atom nodes for reference spans. */
function deltaToPMInline(spans: DeltaSpan[] | undefined, flowNewlines: boolean): PMNode[] {
  if (!spans || spans.length === 0) return [];
  const out: PMNode[] = [];
  for (const span of spans) {
    if (span.attributes?.reference) {
      out.push({
        type: "docReference",
        attrs: { ref: span.attributes.reference, label: span.insert },
      });
      continue;
    }
    if (span.insert.length === 0) continue;
    const text = flowNewlines ? flowSpanText(span.insert) : span.insert;
    const marks = marksForSpan(span.attributes);
    out.push(marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
  }
  return out;
}

/**
 * Splits a flavour's raw `props` into the PM node's own promoted attrs
 * (level/ordered/language) + the rest (`blockProps`). Promotion is only
 * applied when the source `props` actually HAD that key — the promoted PM
 * attrs default to `null` (never a "real" value like `2` or `false`)
 * precisely so `joinPropsFromNode` can tell "absent in source" apart from
 * "present with a falsy/default value" and stay byte-for-byte lossless.
 */
function splitPropsForNode(flavour: DocBlockType, props: Record<string, unknown>) {
  const rest = { ...props };
  const promoted: Record<string, unknown> = {};
  if (flavour === "heading") {
    promoted.level = typeof rest.level === "number" ? rest.level : null;
    delete rest.level;
  } else if (flavour === "list-item") {
    promoted.ordered = typeof rest.ordered === "boolean" ? rest.ordered : null;
    delete rest.ordered;
  } else if (flavour === "code") {
    promoted.language = typeof rest.language === "string" ? rest.language : null;
    delete rest.language;
  }
  return { promoted, blockProps: rest };
}

function blockToPMNode(doc: DocDocument, blockId: string): PMNode {
  const block = doc.blocks[blockId];
  const nodeType = BLOCK_TYPE_TO_NODE_TYPE[block.flavour];
  const isTextBlock = (TEXT_BLOCK_TYPES as readonly string[]).includes(block.flavour);
  const { promoted, blockProps } = splitPropsForNode(block.flavour, block.props);

  if (!isTextBlock) {
    // Atom leaf: no PM inline content slot at all (children of a structured
    // DocBlock are not expected/supported by any v1 atom flavour, but if
    // present are dropped from the PM tree deliberately rather than silently
    // nested inside an atom node PM would reject — see convert.test.ts). A
    // few atom flavours (agent-contract) still carry a `text` DeltaSpan[] in
    // doc-schema (e.g. a description) even though they have no editable PM
    // content — that rides losslessly as the `blockText` attr instead.
    return {
      type: nodeType,
      attrs: {
        blockId: block.id,
        blockProps,
        blockText: block.text && block.text.length > 0 ? block.text : null,
        ...promoted,
      },
    };
  }

  // Text-bearing nodes are `"docBlockText block*"` (see schema.ts's module
  // doc comment for why a plain "inline* block*" content expression is
  // rejected by ProseMirror): a mandatory `docBlockText` wrapper carrying the
  // block's OWN inline text is always content[0], followed by any nested
  // DocBlock children as sibling block nodes.
  const wrapper: PMNode = { type: "docBlockText", content: deltaToPMInline(block.text, block.flavour !== "code") };
  const content: PMNode[] = [wrapper, ...block.children.map((childId) => blockToPMNode(doc, childId))];
  return {
    type: nodeType,
    attrs: { blockId: block.id, blockProps, ...promoted },
    content,
  };
}

/**
 * Converts a DocDocument into PM `doc` JSON. The PM doc's own top-level
 * `content` is the ROOT block's children (the root block itself is a
 * container with no visual chrome — DocBlockRenderer skips it too — so its
 * `id`/`props` ride along on the PM `doc` node's own attrs so they aren't
 * lost on the round trip back through `pmToDoc`).
 */
export function docToPM(doc: DocDocument): PMNode {
  const root = doc.blocks[doc.root];
  const { promoted, blockProps } = splitPropsForNode(root.flavour, root.props);
  return {
    type: "doc",
    attrs: {
      blockId: root.id,
      blockProps,
      rootType: root.flavour,
      ...promoted,
    },
    content: root.children.map((childId) => blockToPMNode(doc, childId)),
  };
}

// ---------------------------------------------------------------------------
// pmToDoc
// ---------------------------------------------------------------------------

/** Reconstructs a DeltaSpanAttributes from a PM text node's marks. */
function marksToAttributes(marks: PMMark[] | undefined): DeltaSpanAttributes | undefined {
  if (!marks || marks.length === 0) return undefined;
  const attrs: DeltaSpanAttributes = {};
  for (const mark of marks) {
    if (mark.type === "bold") attrs.bold = true;
    else if (mark.type === "italic") attrs.italic = true;
    else if (mark.type === "strike") attrs.strike = true;
    else if (mark.type === "code") attrs.code = true;
    else if (mark.type === "link") attrs.link = String(mark.attrs?.href ?? "");
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

/** Converts a text block's PM inline content (text nodes + docReference atoms) back into DeltaSpan[], merging adjacent same-attribute spans. */
function pmInlineToDelta(nodes: PMNode[]): DeltaSpan[] {
  const spans: DeltaSpan[] = [];
  for (const node of nodes) {
    if (node.type === "docReference") {
      const ref = node.attrs?.ref as SpectreRef | undefined;
      const label = (node.attrs?.label as string) ?? ref?.label ?? ref?.path ?? "";
      if (ref) spans.push({ insert: label, attributes: { reference: ref } });
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    const attrs = marksToAttributes(node.marks);
    const prev = spans[spans.length - 1];
    if (prev && sameSpanAttrs(prev.attributes, attrs) && !prev.attributes?.reference) {
      spans[spans.length - 1] = { ...prev, insert: prev.insert + node.text };
    } else {
      spans.push(attrs ? { insert: node.text, attributes: attrs } : { insert: node.text });
    }
  }
  return spans;
}

function sameSpanAttrs(a: DeltaSpanAttributes | undefined, b: DeltaSpanAttributes | undefined): boolean {
  const an = a ?? {};
  const bn = b ?? {};
  for (const key of MARK_ATTR_ORDER) {
    if (an[key] !== bn[key]) return false;
  }
  return true;
}

/**
 * Rejoins a node's promoted PM attrs (level/ordered/language) back into a
 * flat `props` object alongside `blockProps`. `null` is the "not present in
 * source props" sentinel (see `splitPropsForNode`) — only a non-null
 * promoted attr is written back, so a block that never had e.g. `level` in
 * its original `props` doesn't grow one just because the PM node type
 * defines the attr.
 */
function joinPropsFromNode(flavour: DocBlockType, attrs: Record<string, unknown>): Record<string, unknown> {
  const blockProps = (attrs.blockProps as Record<string, unknown>) ?? {};
  const props: Record<string, unknown> = { ...blockProps };
  if (flavour === "heading" && typeof attrs.level === "number") props.level = attrs.level;
  if (flavour === "list-item" && typeof attrs.ordered === "boolean") props.ordered = attrs.ordered;
  if (flavour === "code" && typeof attrs.language === "string" && attrs.language) {
    props.language = attrs.language;
  }
  return props;
}

let fallbackIdCounter = 0;

/** Mints an id via the caller's factory, falling back to a locally-unique id if the factory returns something already used in this conversion pass (defensive — mirrors doc-ops.ts's mintFreshId re-mint guarantee). */
function mintId(idFactory: DocIdFactory, used: Set<string>): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = idFactory();
    if (candidate && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  fallbackIdCounter += 1;
  const candidate = `pm-fresh-${fallbackIdCounter}`;
  used.add(candidate);
  return candidate;
}

function pmNodeToBlock(
  node: PMNode,
  idFactory: DocIdFactory,
  used: Set<string>,
  blocks: Record<string, DocBlock>,
): string {
  const flavour = NODE_TYPE_TO_BLOCK_TYPE[node.type];
  if (!flavour) {
    throw new Error(`pmToDoc: unknown PM node type "${node.type}" (no doc-schema flavour mapping).`);
  }
  const attrs = node.attrs ?? {};
  const existingId = typeof attrs.blockId === "string" && attrs.blockId ? attrs.blockId : null;
  const id = existingId && !used.has(existingId) ? existingId : mintId(idFactory, used);
  used.add(id);

  const props = joinPropsFromNode(flavour, attrs);
  const isTextBlock = (TEXT_BLOCK_TYPES as readonly string[]).includes(flavour);

  if (!isTextBlock) {
    const blockText = attrs.blockText as DeltaSpan[] | null | undefined;
    blocks[id] = {
      id,
      flavour,
      props,
      children: [],
      ...(blockText && blockText.length > 0 ? { text: blockText } : {}),
    };
    return id;
  }

  // content[0] is always the mandatory `docBlockText` wrapper carrying this
  // block's own inline text (see schema.ts / blockToPMNode above); everything
  // after it is a nested DocBlock child. Tolerate a missing/non-wrapper
  // content[0] defensively (e.g. a hand-built PM JSON in a test) by treating
  // it as empty inline content rather than throwing.
  const content = node.content ?? [];
  const hasWrapper = content.length > 0 && content[0].type === "docBlockText";
  const wrapperInline = hasWrapper ? content[0].content ?? [] : [];
  const childBlockNodes = hasWrapper ? content.slice(1) : content;

  const text = pmInlineToDelta(wrapperInline);
  const children = childBlockNodes.map((child) => pmNodeToBlock(child, idFactory, used, blocks));

  blocks[id] = {
    id,
    flavour,
    props,
    text,
    children,
  };
  return id;
}

/**
 * Converts PM `doc` JSON back into a DocDocument. `baseDoc` supplies the
 * document's own `id`/`title`/`schemaVersion` (PM has no notion of those) —
 * only the block TREE is rebuilt from the PM JSON. `idFactory` mints ids for
 * any PM node with no `blockId` (or a `blockId` colliding with one already
 * used elsewhere in this same tree — defensive only, TipTap never disturbs
 * an existing attr on its own).
 */
export function pmToDoc(pmDoc: PMNode, baseDoc: DocDocument, idFactory: DocIdFactory): DocDocument {
  const rootAttrs = pmDoc.attrs ?? {};
  const rootType = (rootAttrs.rootType as DocBlockType) ?? baseDoc.blocks[baseDoc.root].flavour;
  const rootId =
    typeof rootAttrs.blockId === "string" && rootAttrs.blockId ? rootAttrs.blockId : baseDoc.root;

  const used = new Set<string>([rootId]);
  const blocks: Record<string, DocBlock> = {};
  const rootProps = joinPropsFromNode(rootType, rootAttrs);
  const children = (pmDoc.content ?? []).map((child) => pmNodeToBlock(child, idFactory, used, blocks));

  blocks[rootId] = {
    id: rootId,
    flavour: rootType,
    props: rootProps,
    children,
  };

  return {
    schemaVersion: baseDoc.schemaVersion,
    id: baseDoc.id,
    title: baseDoc.title,
    root: rootId,
    blocks,
  };
}

// ---------------------------------------------------------------------------
// diffToOps
// ---------------------------------------------------------------------------

function shallowEqualProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    return shallowEqualProps(a as Record<string, unknown>, b as Record<string, unknown>);
  }
  return false;
}

function sameText(a: DeltaSpan[] | undefined, b: DeltaSpan[] | undefined, flowNewlines: boolean): boolean {
  const an = a ?? [];
  const bn = b ?? [];
  if (an.length !== bn.length) return false;
  return an.every((span, index) => {
    const other = bn[index];
    // The editor flows prose newlines as spaces (see flowSpanText), so a
    // base span differing from its edited twin only by flowed whitespace is
    // NOT a user edit — without this, opening a hard-wrapped doc and typing
    // anywhere would rewrite every prose block in the batch.
    const aInsert = flowNewlines ? flowSpanText(span.insert) : span.insert;
    const bInsert = flowNewlines ? flowSpanText(other.insert) : other.insert;
    return aInsert === bInsert && sameSpanAttrsFull(span.attributes, other.attributes);
  });
}

function sameSpanAttrsFull(a: DeltaSpanAttributes | undefined, b: DeltaSpanAttributes | undefined): boolean {
  const an = a ?? {};
  const bn = b ?? {};
  for (const key of MARK_ATTR_ORDER) {
    if (an[key] !== bn[key]) return false;
  }
  return deepEqual(an.reference, bn.reference);
}

type ParentedBlock = { block: DocBlock; parentId: string; index: number };

function indexByParent(doc: DocDocument): Map<string, ParentedBlock> {
  const map = new Map<string, ParentedBlock>();
  for (const block of Object.values(doc.blocks)) {
    block.children.forEach((childId, index) => {
      const child = doc.blocks[childId];
      if (child) map.set(childId, { block: child, parentId: block.id, index });
    });
  }
  return map;
}

/**
 * Builds a "survivors-only" index-by-parent: like `indexByParent`, but the
 * index assigned to each child ignores any sibling not present in `keepIds`
 * (i.e. inserted/deleted blocks are invisible for ordering purposes). This
 * is what move-detection diffs against — inserting or deleting a sibling
 * necessarily shifts every later sibling's raw array index, but that's not a
 * REORDER of the surviving blocks, so it must not emit spurious moveBlocks.
 */
function indexByParentAmong(doc: DocDocument, keepIds: Set<string>): Map<string, ParentedBlock> {
  const map = new Map<string, ParentedBlock>();
  for (const block of Object.values(doc.blocks)) {
    let index = 0;
    for (const childId of block.children) {
      if (!keepIds.has(childId)) continue;
      const child = doc.blocks[childId];
      if (child) {
        map.set(childId, { block: child, parentId: block.id, index });
        index += 1;
      }
    }
  }
  return map;
}

/**
 * Re-identifies (mints a fresh id for) every edited-doc block whose BASE-doc
 * copy is doomed to destruction by a subtree delete, so the normal diff
 * machinery emits deleteBlock(old subtree) + insertBlock(fresh) instead of
 * ops that either silently drop data or fail mid-batch. A base block is
 * doomed when it — or any base ancestor of it — is:
 *
 * 1. FLAVOUR-CHANGED: its id survived the edit but its flavour differs.
 *    `updateBlock` deliberately has NO flavour field (§8.3 — a block's
 *    flavour is part of its identity), so a props-only update would
 *    SILENTLY DROP the flavour change. Unreachable from today's editor
 *    (input rules reset `blockId`, so a retyped block already arrives as
 *    delete+insert), but a future flavour-preserving "turn into" command
 *    would hit this. Fresh id per §8.3: comment/backlink targets anchored
 *    to the old id become detectably dangling rather than silently
 *    re-anchoring to a different-flavoured block.
 * 2. DELETED with surviving escapees: the block is gone from the edited doc
 *    (subtree deleteBlock), but a descendant escaped the doomed subtree
 *    (e.g. cut a nested block, paste it elsewhere, delete the old parent).
 *    A moveBlock for the escapee would run AFTER the ancestor's subtree
 *    delete already destroyed its backend copy and fail the whole batch —
 *    re-inserting it fresh preserves the content and keeps the batch
 *    applying cleanly.
 *
 * Blocks re-identified here keep their props/text/children content — only
 * the id changes (children of a re-identified block that are themselves
 * doomed are re-identified recursively by the same rule).
 */
function reidentifyDoomedSurvivors(
  baseDoc: DocDocument,
  editedDoc: DocDocument,
  idFactory: DocIdFactory | undefined,
): DocDocument {
  // A doomed base id: itself deleted/flavour-changed, or living under one.
  const doomed = new Set<string>();
  const walk = (id: string, underDoomed: boolean) => {
    const block = baseDoc.blocks[id];
    if (!block) return;
    const edited = editedDoc.blocks[id];
    const isRoot = id === baseDoc.root;
    const isDoomed = underDoomed || (!isRoot && (!edited || edited.flavour !== block.flavour));
    if (isDoomed && !isRoot) doomed.add(id);
    for (const childId of block.children) walk(childId, isDoomed);
  };
  walk(baseDoc.root, false);

  // Only doomed ids that SURVIVE in the edited doc need a fresh identity —
  // plainly-deleted ids are simply covered by their ancestor's subtree delete.
  const rewriteIds = [...doomed].filter((id) => id in editedDoc.blocks);
  if (rewriteIds.length === 0) return editedDoc;

  const used = new Set([...Object.keys(baseDoc.blocks), ...Object.keys(editedDoc.blocks)]);
  const factory =
    idFactory ??
    (() => {
      fallbackIdCounter += 1;
      return `pm-fresh-${fallbackIdCounter}`;
    });
  const rename = new Map<string, string>();
  for (const id of rewriteIds) rename.set(id, mintId(factory, used));

  const blocks: Record<string, DocBlock> = {};
  for (const [id, block] of Object.entries(editedDoc.blocks)) {
    const newId = rename.get(id) ?? id;
    blocks[newId] = {
      ...block,
      id: newId,
      children: block.children.map((childId) => rename.get(childId) ?? childId),
    };
  }
  return { ...editedDoc, blocks };
}

/**
 * Diffs `baseDoc` (what the editor started from) against `editedDoc` (what
 * `pmToDoc` reconstructed from the editor's current PM state) and returns a
 * small, CORRECT `DocOp[]` batch to bring the backend's copy of `baseDoc` in
 * line with `editedDoc` (not guaranteed minimal — a single-element reorder
 * may emit extra moveBlocks). Matching is BY ID (a block surviving the edit
 * keeps its id per §8.3 — see schema.ts/pmToDoc), not by structural
 * similarity:
 *
 *   - id in editedDoc but not baseDoc            -> insertBlock
 *   - id in baseDoc but not editedDoc             -> deleteBlock
 *   - id in both, same parent+index, props/text
 *     differ                                      -> updateBlock
 *   - id in both, parent or index differs          -> moveBlock (+ updateBlock
 *     if props/text ALSO differ)
 *   - id in both but FLAVOUR differs (or the block
 *     escaped a deleted subtree)                    -> deleteBlock + insertBlock
 *     with a fresh id (see `reidentifyDoomedSurvivors`)
 *
 * `idFactory` mints the fresh ids for that last case (falls back to a
 * locally-unique `pm-fresh-N` id when omitted).
 *
 * Ops are emitted in an order safe to apply sequentially against baseDoc:
 * deletes first (subtree roots only — a deleted block's descendants are
 * covered by the ancestor's subtree delete), then inserts
 * (parent-before-child, shallowest first so parents exist before children
 * reference them), then updates/moves. This mirrors doc-ops.ts's own op
 * semantics — each op is applied via `applyOps` server-side in this exact
 * array order.
 */
export function diffToOps(
  baseDoc: DocDocument,
  rawEditedDoc: DocDocument,
  idFactory?: DocIdFactory,
): DocOp[] {
  const editedDoc = reidentifyDoomedSurvivors(baseDoc, rawEditedDoc, idFactory);
  const editedIndex = indexByParent(editedDoc);
  const baseIds = new Set(Object.keys(baseDoc.blocks));
  const editedIds = new Set(Object.keys(editedDoc.blocks));

  const deletedIds = [...baseIds].filter((id) => id !== baseDoc.root && !editedIds.has(id));
  const insertedIds = [...editedIds].filter((id) => id !== editedDoc.root && !baseIds.has(id));

  // Move-detection compares only among blocks present in BOTH trees — an
  // insertBlock/deleteBlock necessarily shifts later siblings' raw array
  // index, but that's not a reorder (see indexByParentAmong).
  const survivingIds = new Set([...baseIds].filter((id) => editedIds.has(id)));
  const baseIndex = indexByParentAmong(baseDoc, survivingIds);
  const editedSurvivorIndex = indexByParentAmong(editedDoc, survivingIds);

  const ops: DocOp[] = [];

  // 1. Deletes — root-of-subtree only (a descendant of an already-deleted
  // id doesn't need its own op; deleteBlock removes the whole subtree).
  // Coverage MUST be checked against the FULL base index: `baseIndex` above
  // is survivors-only and never contains a deleted id at all, so using it
  // here would emit a deleteBlock for every descendant too — and those ops
  // FAIL when applied after the ancestor's subtree delete already removed
  // the descendant (pinned by convert.test.ts's nested-delete test).
  const baseFullIndex = indexByParent(baseDoc);
  const deletedSet = new Set(deletedIds);
  for (const id of deletedIds) {
    const parented = baseFullIndex.get(id);
    if (parented && deletedSet.has(parented.parentId)) continue; // covered by ancestor's delete
    ops.push({ type: "deleteBlock", blockId: id, mode: "subtree" });
  }

  // 2. Inserts — shallowest first (parent before child) so insertBlock's
  // parentId always already exists by the time it runs. Root-of-insertion
  // only; a node's descendants that are ALSO fresh get their own insertBlock
  // entries (every level needs one — insertBlock is single-node, not subtree).
  const depthOf = (id: string, index: Map<string, ParentedBlock>): number => {
    let depth = 0;
    let current = index.get(id);
    while (current) {
      depth += 1;
      current = index.get(current.parentId);
    }
    return depth;
  };
  const insertOrder = [...insertedIds].sort(
    (a, b) => depthOf(a, editedIndex) - depthOf(b, editedIndex),
  );
  for (const id of insertOrder) {
    const parented = editedIndex.get(id);
    if (!parented) continue; // shouldn't happen (every non-root id has a parent)
    const block = editedDoc.blocks[id];
    ops.push({
      type: "insertBlock",
      blockId: id,
      parentId: parented.parentId,
      index: parented.index,
      flavour: block.flavour,
      props: { ...block.props },
      text: block.text ? block.text.map((span) => ({ ...span })) : undefined,
    });
  }

  // 3. Updates + moves for ids present in both trees. Move detection uses
  // the SURVIVORS-ONLY index (baseIndex/editedSurvivorIndex) so inserting or
  // deleting a sibling doesn't look like every later sibling moved; the
  // emitted toIndex, however, is the real position among ALL of the edited
  // doc's current children (editedIndex) — that's what the backend needs to
  // place the block correctly.
  for (const id of baseIds) {
    if (id === baseDoc.root || deletedSet.has(id)) continue;
    if (!editedIds.has(id)) continue;
    const baseBlock = baseDoc.blocks[id];
    const editedBlock = editedDoc.blocks[id];
    const baseParent = baseIndex.get(id);
    const editedParent = editedSurvivorIndex.get(id);
    const editedRealParent = editedIndex.get(id);

    const moved =
      baseParent &&
      editedParent &&
      (baseParent.parentId !== editedParent.parentId || baseParent.index !== editedParent.index);

    if (moved && editedRealParent) {
      ops.push({
        type: "moveBlock",
        blockId: id,
        toParentId: editedRealParent.parentId,
        toIndex: editedRealParent.index,
      });
    }

    const propsChanged = !shallowEqualProps(baseBlock.props, editedBlock.props);
    const textChanged = !sameText(baseBlock.text, editedBlock.text, editedBlock.flavour !== "code");
    if (propsChanged || textChanged) {
      ops.push({
        type: "updateBlock",
        blockId: id,
        ...(propsChanged ? { props: mergePatch(baseBlock.props, editedBlock.props) } : {}),
        ...(textChanged ? { text: editedBlock.text ?? null } : {}),
      });
    }
  }

  // Root itself: props can change (e.g. title-carrying root props in some
  // bundles) even though it's never inserted/deleted/moved.
  const baseRoot = baseDoc.blocks[baseDoc.root];
  const editedRoot = editedDoc.blocks[editedDoc.root];
  if (baseRoot && editedRoot && !shallowEqualProps(baseRoot.props, editedRoot.props)) {
    ops.push({
      type: "updateBlock",
      blockId: baseDoc.root,
      props: mergePatch(baseRoot.props, editedRoot.props),
    });
  }

  return ops;
}

/** Builds an `updateBlock`-style shallow-merge props patch: keys removed in `next` become `undefined` (doc-ops.ts's delete-key convention). */
function mergePatch(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (!deepEqual(prev[key], next[key])) patch[key] = next[key];
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) patch[key] = undefined;
  }
  return patch;
}
