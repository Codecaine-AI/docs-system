"use client";

import { ACTION_REGISTRY } from "./components";
import { checkParams } from "./components/define";
import type { DeltaSpan, DocBlock, DocBlockType, DocDocument, DocValidationIssue } from "./doc-schema";
import { isDocBlockType } from "./doc-schema";

/**
 * Typed block op vocabulary (M2 tracer, design record §4.5 + §8.3).
 *
 * Seven ops: the six generic structural/text ops plus `blockAction`, the
 * typed-action bridge. A blockAction resolves a named action from the
 * components action registry, validates its params, runs `apply()`
 * against the target block, and executes the resulting shallow-merge props
 * patch through the EXISTING updateBlock code path — so merge semantics are
 * single-sourced and the inverse op is the usual updateBlock inverse.
 *
 * Id-stability contract (§8.3 — system invariant, locked by
 * __tests__/doc-ops.contract.test.ts):
 * - updateBlock PRESERVES the block id — comment/patch/backlink targets stay valid.
 * - splitBlock / mergeBlocks MINT fresh ids via the injected id factory and
 *   never reuse an existing id (applyOp re-mints on collision).
 * - deleteBlock leaves dangling comment targets DETECTABLE (see
 *   comments-schema detectDanglingTargets) — never re-anchored, never a crash.
 *
 * Every applyOp returns exact inverse op(s): applying `inverse` in order to
 * the resulting doc restores the original doc structurally. M3 stores these
 * as undo units keyed by patch id.
 */
export type DocOp =
  | {
      type: "insertBlock";
      /** New block id — must not collide with any existing block. */
      blockId: string;
      parentId: string;
      /** Position within parent's children, in [0, children.length]. */
      index: number;
      /** The new block's kind (`type` is taken by the op discriminant). */
      blockType: DocBlockType;
      props: Record<string, unknown>;
      text?: DeltaSpan[];
    }
  | {
      type: "updateBlock";
      blockId: string;
      /**
       * Shallow-merge patch. A key explicitly set to `undefined` removes that
       * prop. The block id is never touched.
       */
      props?: Record<string, unknown>;
      /** Replaces block text when provided; `null` clears it. */
      text?: DeltaSpan[] | null;
    }
  | {
      type: "deleteBlock";
      blockId: string;
      /**
       * "subtree" (default) removes the block and all descendants;
       * "reparent" splices the block's children into its parent at the
       * block's former position.
       */
      mode?: "subtree" | "reparent";
    }
  | {
      type: "moveBlock";
      blockId: string;
      toParentId: string;
      /** Index within the destination children AFTER the block is detached. */
      toIndex: number;
    }
  | {
      type: "splitBlock";
      blockId: string;
      /** Character offset into the block's delta text, in [0, textLength]. */
      offset: number;
    }
  | {
      type: "mergeBlocks";
      /** Two or more contiguous siblings, in document order. */
      blockIds: string[];
    }
  | {
      type: "blockAction";
      blockId: string;
      /** Registry key, "<blockType>.<verb>" — see the components registry. */
      action: string;
      params: Record<string, unknown>;
    };

export type DocOpResult =
  | { ok: true; doc: DocDocument; inverse: DocOp[] }
  | { ok: false; issues: DocValidationIssue[] };

export type DocIdFactory = () => string;

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value);
}

function fail(path: string, message: string): DocOpResult {
  return { ok: false, issues: [{ path, message }] };
}

function cloneBlockShallow(block: DocBlock): DocBlock {
  return {
    id: block.id,
    type: block.type,
    props: { ...block.props },
    text: block.text ? block.text.map((span) => ({ ...span })) : undefined,
    children: [...block.children],
  };
}

function withBlocks(doc: DocDocument, blocks: Record<string, DocBlock>): DocDocument {
  return { ...doc, blocks };
}

/** True when `id` is `ancestorId` or lives anywhere under it. */
export function isSameOrDescendant(doc: DocDocument, ancestorId: string, id: string): boolean {
  if (ancestorId === id) return true;
  const stack = [...(doc.blocks[ancestorId]?.children ?? [])];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === id) return true;
    const block = doc.blocks[current];
    if (block) stack.push(...block.children);
  }
  return false;
}

function findParent(doc: DocDocument, blockId: string): { parentId: string; index: number } | null {
  for (const block of Object.values(doc.blocks)) {
    const index = block.children.indexOf(blockId);
    if (index !== -1) return { parentId: block.id, index };
  }
  return null;
}

function deltaLength(text: DeltaSpan[] | undefined): number {
  return (text ?? []).reduce((sum, span) => sum + span.insert.length, 0);
}

function splitDelta(text: DeltaSpan[], offset: number): [DeltaSpan[], DeltaSpan[]] {
  const head: DeltaSpan[] = [];
  const tail: DeltaSpan[] = [];
  let consumed = 0;
  for (const span of text) {
    const spanEnd = consumed + span.insert.length;
    if (spanEnd <= offset) {
      head.push({ ...span });
    } else if (consumed >= offset) {
      tail.push({ ...span });
    } else {
      const cut = offset - consumed;
      const headText = span.insert.slice(0, cut);
      const tailText = span.insert.slice(cut);
      if (headText) head.push(span.attributes ? { insert: headText, attributes: span.attributes } : { insert: headText });
      if (tailText) tail.push(span.attributes ? { insert: tailText, attributes: span.attributes } : { insert: tailText });
    }
    consumed = spanEnd;
  }
  return [head, tail];
}

/**
 * Mints a fresh id via the injected factory, re-minting on collision with any
 * block currently in the document so split/merge can NEVER reuse an existing
 * id (§8.3) even if the factory is careless. Falls back to suffixing after
 * repeated collisions so the guarantee holds unconditionally.
 */
function mintFreshId(doc: DocDocument, idFactory: DocIdFactory): string {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = idFactory();
    if (isId(candidate) && !(candidate in doc.blocks)) return candidate;
  }
  let index = 2;
  const base = "b";
  while (`${base}-fresh-${index}` in doc.blocks) index += 1;
  return `${base}-fresh-${index}`;
}

/** Pre-order subtree listing (block first, then descendants in order). */
function subtreeIds(doc: DocDocument, rootId: string): string[] {
  const order: string[] = [];
  const walk = (id: string) => {
    const block = doc.blocks[id];
    if (!block) return;
    order.push(id);
    for (const childId of block.children) walk(childId);
  };
  walk(rootId);
  return order;
}

function insertBlockOpsForSubtree(
  doc: DocDocument,
  blockId: string,
  parentId: string,
  index: number,
): DocOp[] {
  const ops: DocOp[] = [];
  const emit = (id: string, intoParent: string, at: number) => {
    const block = doc.blocks[id];
    ops.push({
      type: "insertBlock",
      blockId: id,
      parentId: intoParent,
      index: at,
      blockType: block.type,
      props: { ...block.props },
      text: block.text ? block.text.map((span) => ({ ...span })) : undefined,
    });
    block.children.forEach((childId, childIndex) => emit(childId, id, childIndex));
  };
  emit(blockId, parentId, index);
  return ops;
}

/**
 * Pure typed-op application. Never mutates the input document; never throws.
 * Rejects (with canvas-schema-style issues) any op that would orphan a block,
 * create a cycle, dangle a child reference, touch the root illegally, or
 * reuse an id. On success returns the new document plus exact inverse op(s).
 */
export function applyOp(doc: DocDocument, op: DocOp, idFactory?: DocIdFactory): DocOpResult {
  switch (op.type) {
    case "insertBlock": {
      if (!isId(op.blockId)) {
        return fail("$.op.blockId", "insertBlock requires a stable ASCII block id.");
      }
      if (op.blockId in doc.blocks) {
        return fail("$.op.blockId", `insertBlock cannot reuse existing id "${op.blockId}".`);
      }
      const parent = doc.blocks[op.parentId];
      if (!parent) {
        return fail("$.op.parentId", `insertBlock parent "${op.parentId}" does not exist.`);
      }
      if (!isDocBlockType(op.blockType)) {
        return fail("$.op.blockType", `Unknown block type: ${String(op.blockType)}`);
      }
      if (!Number.isInteger(op.index) || op.index < 0 || op.index > parent.children.length) {
        return fail(
          "$.op.index",
          `insertBlock index ${op.index} is out of range [0, ${parent.children.length}].`,
        );
      }
      const blocks = { ...doc.blocks };
      const newParent = cloneBlockShallow(parent);
      newParent.children.splice(op.index, 0, op.blockId);
      blocks[op.parentId] = newParent;
      blocks[op.blockId] = {
        id: op.blockId,
        type: op.blockType,
        props: { ...op.props },
        text: op.text ? op.text.map((span) => ({ ...span })) : undefined,
        children: [],
      };
      return {
        ok: true,
        doc: withBlocks(doc, blocks),
        inverse: [{ type: "deleteBlock", blockId: op.blockId, mode: "subtree" }],
      };
    }

    case "updateBlock": {
      const block = doc.blocks[op.blockId];
      if (!block) {
        return fail("$.op.blockId", `updateBlock target "${op.blockId}" does not exist.`);
      }
      const next = cloneBlockShallow(block);
      const inversePatch: Record<string, unknown> = {};
      let touchedProps = false;
      if (op.props) {
        for (const [key, patchValue] of Object.entries(op.props)) {
          touchedProps = true;
          inversePatch[key] = key in block.props ? block.props[key] : undefined;
          if (patchValue === undefined) {
            delete next.props[key];
          } else {
            next.props[key] = patchValue;
          }
        }
      }
      let inverseText: DeltaSpan[] | null | undefined;
      if (op.text !== undefined) {
        inverseText = block.text ? block.text.map((span) => ({ ...span })) : null;
        next.text = op.text === null ? undefined : op.text.map((span) => ({ ...span }));
      }
      const blocks = { ...doc.blocks, [op.blockId]: next };
      const inverse: DocOp = {
        type: "updateBlock",
        blockId: op.blockId,
        ...(touchedProps ? { props: inversePatch } : {}),
        ...(op.text !== undefined ? { text: inverseText } : {}),
      };
      return { ok: true, doc: withBlocks(doc, blocks), inverse: [inverse] };
    }

    case "deleteBlock": {
      const block = doc.blocks[op.blockId];
      if (!block) {
        return fail("$.op.blockId", `deleteBlock target "${op.blockId}" does not exist.`);
      }
      if (op.blockId === doc.root) {
        return fail("$.op.blockId", "deleteBlock cannot delete the root block.");
      }
      const location = findParent(doc, op.blockId);
      if (!location) {
        return fail("$.op.blockId", `deleteBlock target "${op.blockId}" is detached from the tree.`);
      }
      const mode = op.mode ?? "subtree";
      const blocks = { ...doc.blocks };
      const newParent = cloneBlockShallow(blocks[location.parentId]);
      newParent.children.splice(location.index, 1);

      if (mode === "reparent") {
        // Splice the deleted block's children into the parent at its slot.
        newParent.children.splice(location.index, 0, ...block.children);
        blocks[location.parentId] = newParent;
        delete blocks[op.blockId];
        const inverse: DocOp[] = [
          {
            type: "insertBlock",
            blockId: op.blockId,
            parentId: location.parentId,
            index: location.index,
            blockType: block.type,
            props: { ...block.props },
            text: block.text ? block.text.map((span) => ({ ...span })) : undefined,
          },
          ...block.children.map<DocOp>((childId, childIndex) => ({
            type: "moveBlock",
            blockId: childId,
            toParentId: op.blockId,
            toIndex: childIndex,
          })),
        ];
        return { ok: true, doc: withBlocks(doc, blocks), inverse };
      }

      // subtree: exact inverse re-inserts the whole subtree, parent-first.
      const inverse = insertBlockOpsForSubtree(doc, op.blockId, location.parentId, location.index);
      blocks[location.parentId] = newParent;
      for (const id of subtreeIds(doc, op.blockId)) delete blocks[id];
      return { ok: true, doc: withBlocks(doc, blocks), inverse };
    }

    case "moveBlock": {
      const block = doc.blocks[op.blockId];
      if (!block) {
        return fail("$.op.blockId", `moveBlock target "${op.blockId}" does not exist.`);
      }
      if (op.blockId === doc.root) {
        return fail("$.op.blockId", "moveBlock cannot move the root block.");
      }
      const destination = doc.blocks[op.toParentId];
      if (!destination) {
        return fail("$.op.toParentId", `moveBlock destination "${op.toParentId}" does not exist.`);
      }
      if (isSameOrDescendant(doc, op.blockId, op.toParentId)) {
        return fail(
          "$.op.toParentId",
          `moveBlock would create a cycle: "${op.toParentId}" is inside "${op.blockId}".`,
        );
      }
      const location = findParent(doc, op.blockId);
      if (!location) {
        return fail("$.op.blockId", `moveBlock target "${op.blockId}" is detached from the tree.`);
      }
      const sameParent = location.parentId === op.toParentId;
      const maxIndex = destination.children.length - (sameParent ? 1 : 0);
      if (!Number.isInteger(op.toIndex) || op.toIndex < 0 || op.toIndex > maxIndex) {
        return fail("$.op.toIndex", `moveBlock index ${op.toIndex} is out of range [0, ${maxIndex}].`);
      }
      const blocks = { ...doc.blocks };
      const source = cloneBlockShallow(blocks[location.parentId]);
      source.children.splice(location.index, 1);
      blocks[location.parentId] = source;
      const target = sameParent ? source : cloneBlockShallow(blocks[op.toParentId]);
      target.children.splice(op.toIndex, 0, op.blockId);
      blocks[target.id] = target;
      return {
        ok: true,
        doc: withBlocks(doc, blocks),
        inverse: [
          {
            type: "moveBlock",
            blockId: op.blockId,
            toParentId: location.parentId,
            toIndex: location.index,
          },
        ],
      };
    }

    case "splitBlock": {
      const block = doc.blocks[op.blockId];
      if (!block) {
        return fail("$.op.blockId", `splitBlock target "${op.blockId}" does not exist.`);
      }
      if (op.blockId === doc.root) {
        return fail("$.op.blockId", "splitBlock cannot split the root block.");
      }
      const location = findParent(doc, op.blockId);
      if (!location) {
        return fail("$.op.blockId", `splitBlock target "${op.blockId}" is detached from the tree.`);
      }
      const length = deltaLength(block.text);
      if (!Number.isInteger(op.offset) || op.offset < 0 || op.offset > length) {
        return fail("$.op.offset", `splitBlock offset ${op.offset} is out of range [0, ${length}].`);
      }
      if (!idFactory) {
        return fail("$.op", "splitBlock requires an id factory to mint the new block id.");
      }
      const newId = mintFreshId(doc, idFactory);
      const [head, tail] = splitDelta(block.text ?? [], op.offset);

      const blocks = { ...doc.blocks };
      const original = cloneBlockShallow(block);
      original.text = block.text ? head : undefined;
      blocks[op.blockId] = original;
      // New block: same block type + props copy, tail text, no children —
      // children stay with the original block (semantic choice; the tail
      // block is a continuation line, not a new section owner).
      blocks[newId] = {
        id: newId,
        type: block.type,
        props: { ...block.props },
        text: block.text ? tail : undefined,
        children: [],
      };
      const parent = cloneBlockShallow(blocks[location.parentId]);
      parent.children.splice(location.index + 1, 0, newId);
      blocks[location.parentId] = parent;

      const inverse: DocOp[] = [
        { type: "deleteBlock", blockId: newId, mode: "subtree" },
        {
          type: "updateBlock",
          blockId: op.blockId,
          text: block.text ? block.text.map((span) => ({ ...span })) : null,
        },
      ];
      return { ok: true, doc: withBlocks(doc, blocks), inverse };
    }

    case "mergeBlocks": {
      if (!Array.isArray(op.blockIds) || op.blockIds.length < 2) {
        return fail("$.op.blockIds", "mergeBlocks requires at least two block ids.");
      }
      const sources: DocBlock[] = [];
      for (const [index, id] of op.blockIds.entries()) {
        const block = doc.blocks[id];
        if (!block) {
          return fail(`$.op.blockIds[${index}]`, `mergeBlocks target "${id}" does not exist.`);
        }
        if (id === doc.root) {
          return fail(`$.op.blockIds[${index}]`, "mergeBlocks cannot merge the root block.");
        }
        sources.push(block);
      }
      if (new Set(op.blockIds).size !== op.blockIds.length) {
        return fail("$.op.blockIds", "mergeBlocks ids must be distinct.");
      }
      const firstLocation = findParent(doc, op.blockIds[0]);
      if (!firstLocation) {
        return fail("$.op.blockIds[0]", `mergeBlocks target "${op.blockIds[0]}" is detached from the tree.`);
      }
      const parent = doc.blocks[firstLocation.parentId];
      for (const [index, id] of op.blockIds.entries()) {
        if (parent.children[firstLocation.index + index] !== id) {
          return fail(
            "$.op.blockIds",
            "mergeBlocks ids must be contiguous siblings in document order.",
          );
        }
      }
      if (!idFactory) {
        return fail("$.op", "mergeBlocks requires an id factory to mint the merged block id.");
      }
      const mergedId = mintFreshId(doc, idFactory);

      // Merged block: block type + props from the first source; texts and
      // children concatenated in order (semantic choice — merge joins text
      // without a separator and keeps every descendant).
      const mergedText: DeltaSpan[] = [];
      let hasText = false;
      const mergedChildren: string[] = [];
      for (const source of sources) {
        if (source.text) {
          hasText = true;
          mergedText.push(...source.text.map((span) => ({ ...span })));
        }
        mergedChildren.push(...source.children);
      }

      const blocks = { ...doc.blocks };
      blocks[mergedId] = {
        id: mergedId,
        type: sources[0].type,
        props: { ...sources[0].props },
        text: hasText ? mergedText : undefined,
        children: mergedChildren,
      };
      const newParent = cloneBlockShallow(parent);
      newParent.children.splice(firstLocation.index, op.blockIds.length, mergedId);
      blocks[firstLocation.parentId] = newParent;
      for (const id of op.blockIds) delete blocks[id];

      // Exact inverse: re-insert each original block (fresh empty children)
      // before the merged block, move its children back from the merged
      // block, then delete the (now childless) merged block.
      const inverse: DocOp[] = [];
      sources.forEach((source, sourceIndex) => {
        inverse.push({
          type: "insertBlock",
          blockId: source.id,
          parentId: firstLocation.parentId,
          index: firstLocation.index + sourceIndex,
          blockType: source.type,
          props: { ...source.props },
          text: source.text ? source.text.map((span) => ({ ...span })) : undefined,
        });
        source.children.forEach((childId, childIndex) => {
          inverse.push({
            type: "moveBlock",
            blockId: childId,
            toParentId: source.id,
            toIndex: childIndex,
          });
        });
      });
      inverse.push({ type: "deleteBlock", blockId: mergedId, mode: "subtree" });
      return { ok: true, doc: withBlocks(doc, blocks), inverse };
    }

    case "blockAction": {
      const action = ACTION_REGISTRY.get(op.action);
      if (!action) {
        return fail("$.op.action", `Unknown block action: "${String(op.action)}".`);
      }
      const block = doc.blocks[op.blockId];
      if (!block) {
        return fail("$.op.blockId", `blockAction target "${op.blockId}" does not exist.`);
      }
      if (block.type !== action.blockType) {
        return fail(
          "$.op.blockId",
          `blockAction "${op.action}" targets "${action.blockType}" blocks, but "${op.blockId}" is a "${block.type}".`,
        );
      }
      const params = op.params ?? {};
      const issues = checkParams(action, params);
      if (issues.length > 0) return { ok: false, issues };
      if (!("apply" in action)) {
        return fail(
          "$.op.action",
          `Action "${op.action}" is handled by the ${action.forward.authority} authority and cannot be applied as a doc op.`,
        );
      }
      const result = action.apply(block, params);
      if (!result.ok) return { ok: false, issues: result.issues };
      // Execute the action's shallow-merge patch through the existing
      // updateBlock path (never duplicated here) — the inverse comes back as
      // the usual updateBlock inverse.
      return applyOp(doc, { type: "updateBlock", blockId: op.blockId, props: result.props }, idFactory);
    }

    default: {
      return fail("$.op.type", `Unknown doc op type: ${String((op as { type?: unknown }).type)}`);
    }
  }
}

/** Applies ops in order; stops at the first failure. Inverse comes back in REVERSE apply order, ready to run front-to-back as an undo unit. */
export function applyOps(doc: DocDocument, ops: DocOp[], idFactory?: DocIdFactory): DocOpResult {
  let current = doc;
  const inverse: DocOp[] = [];
  for (const op of ops) {
    const result = applyOp(current, op, idFactory);
    if (!result.ok) return result;
    current = result.doc;
    inverse.unshift(...result.inverse);
  }
  return { ok: true, doc: current, inverse };
}
