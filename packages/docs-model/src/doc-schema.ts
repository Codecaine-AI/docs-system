"use client";

import type { SpectreRef } from "./spectre-ref";
import { validateSpectreRef } from "./spectre-ref";

/**
 * doc.json schema (design record §9.2, D24/D25/D28):
 * - Normalized tree: flat id-keyed `blocks` map + ordered `children` ids.
 * - Rich text as Delta JSON spans (D24), references as shared SpectreRef (D27).
 * - A block's kind field is `type`. The BlockSuite-heritage key `flavour` is
 *   accepted on READ as a legacy alias (normalized into `type`) so older
 *   bundles — e.g. the canvas sibling project's docs — keep validating;
 *   writes always emit canonical `type`.
 * - LEGACY TYPE COERCION: after the `flavour` aliasing above, any block whose
 *   type is a string but NOT one of the 14 canonical types coerces to a
 *   `callout` instead of failing validation. The retired/unknown type name is
 *   preserved as `props.kind` (unless the block already carries a non-empty
 *   string `props.kind` of its own); props, text, and children carry over
 *   verbatim. This is deliberate resilience: it migrates the canvas sibling's
 *   semantic-card blocks (requirement/decision/constraint/...) and its
 *   never-in-schema legacy blocks (overview/design/reference) with zero file
 *   rewrites — blocks canonicalize to the coerced form on next save.
 */

export const DOC_BLOCK_TYPES = [
  // core text & structure
  "paragraph",
  "heading",
  "list-item",
  "quote",
  "code",
  "callout",
  "divider",
  // structured / engineering
  "structured-table",
  "file-tree",
  "interaction-surface",
  // diagram & media
  "mermaid",
  "canvas",
  "sequence",
  "image",
  "video",
] as const;

export type DocBlockType = (typeof DOC_BLOCK_TYPES)[number];

/** @deprecated Use DOC_BLOCK_TYPES. */
export const DOC_BLOCK_FLAVOURS = DOC_BLOCK_TYPES;

/** @deprecated Use DocBlockType. */
export type DocBlockFlavour = DocBlockType;

export type DeltaSpanAttributes = {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** Outbound URL. */
  link?: string;
  /** Doc/code mention chip — shared reference identity (D27). */
  reference?: SpectreRef;
};

export type DeltaSpan = {
  insert: string;
  attributes?: DeltaSpanAttributes;
};

export type DocBlock = {
  /** Stable — comments, patches, and backlinks anchor here (§8.3). */
  id: string;
  type: DocBlockType;
  /** Typed per block type: {level}, {status}, {src, view}, ... */
  props: Record<string, unknown>;
  /** Rich text where the block type carries it (D24). */
  text?: DeltaSpan[];
  /** Ordered child ids (D25). */
  children: string[];
};

export type DocDocument = {
  schemaVersion: 1;
  id: string;
  title?: string;
  /** Root block id. */
  root: string;
  /** Flat, id-keyed (D25). */
  blocks: Record<string, DocBlock>;
};

export type DocValidationIssue = {
  path: string;
  message: string;
};

export type DocValidationResult =
  | { ok: true; document: DocDocument }
  | { ok: false; issues: DocValidationIssue[] };

const BLOCK_TYPE_SET: ReadonlySet<string> = new Set(DOC_BLOCK_TYPES);

export function isDocBlockType(value: unknown): value is DocBlockType {
  return typeof value === "string" && BLOCK_TYPE_SET.has(value);
}

/** @deprecated Use isDocBlockType. */
export const isDocBlockFlavour = isDocBlockType;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,96}$/.test(value);
}

function validateDeltaSpans(
  value: unknown,
  path: string,
  issues: DocValidationIssue[],
): DeltaSpan[] | null {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Block text must be an array of delta spans." });
    return null;
  }
  const spans: DeltaSpan[] = [];
  for (const [index, rawSpan] of value.entries()) {
    const spanPath = `${path}[${index}]`;
    if (!isRecord(rawSpan) || typeof rawSpan.insert !== "string") {
      issues.push({ path: spanPath, message: "Delta span requires a string insert." });
      return null;
    }
    let attributes: DeltaSpanAttributes | undefined;
    if (rawSpan.attributes !== undefined) {
      if (!isRecord(rawSpan.attributes)) {
        issues.push({
          path: `${spanPath}.attributes`,
          message: "Delta span attributes must be an object.",
        });
        return null;
      }
      const raw = rawSpan.attributes;
      attributes = {};
      for (const mark of ["bold", "italic", "strike", "code"] as const) {
        if (raw[mark] !== undefined) {
          if (raw[mark] !== true) {
            issues.push({
              path: `${spanPath}.attributes.${mark}`,
              message: `Delta mark "${mark}" must be true when present.`,
            });
            return null;
          }
          attributes[mark] = true;
        }
      }
      if (raw.link !== undefined) {
        if (typeof raw.link !== "string" || raw.link.length === 0) {
          issues.push({
            path: `${spanPath}.attributes.link`,
            message: "Delta link must be a non-empty string URL.",
          });
          return null;
        }
        attributes.link = raw.link;
      }
      if (raw.reference !== undefined) {
        const result = validateSpectreRef(raw.reference, `${spanPath}.attributes.reference`);
        if (!result.ok) {
          issues.push(...result.issues);
          return null;
        }
        attributes.reference = result.ref;
      }
      if (Object.keys(attributes).length === 0) attributes = undefined;
    }
    spans.push(attributes ? { insert: rawSpan.insert, attributes } : { insert: rawSpan.insert });
  }
  return spans;
}

/**
 * Pure structural validation (no throw, canvas-schema style):
 * - schemaVersion / id / root / blocks shape,
 * - block ids match their map key, block types known (legacy `flavour` key
 *   normalized into `type` on read; retired/unknown string types coerce to
 *   `callout` with the type name preserved as `props.kind` — see module
 *   header), children are id arrays,
 * - root exists in blocks,
 * - no orphan child references (every child id resolves),
 * - no shared children (a block reachable from two parents),
 * - no cycles,
 * - every non-root block reachable from root exactly once.
 */
export function validateDocDocument(value: unknown): DocValidationResult {
  const issues: DocValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Doc document must be an object." }] };
  }
  if (value.schemaVersion !== 1) {
    issues.push({ path: "$.schemaVersion", message: "Doc schemaVersion must be 1." });
  }
  if (!isId(value.id)) {
    issues.push({ path: "$.id", message: "Doc document requires a stable id." });
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    issues.push({ path: "$.title", message: "Doc title must be a string." });
  }
  if (!isId(value.root)) {
    issues.push({ path: "$.root", message: "Doc document requires a root block id." });
  }
  if (!isRecord(value.blocks)) {
    issues.push({ path: "$.blocks", message: "Doc blocks must be an id-keyed object." });
  }
  if (issues.length > 0) return { ok: false, issues };

  const rawBlocks = value.blocks as Record<string, unknown>;
  const blocks: Record<string, DocBlock> = {};

  for (const [key, rawBlock] of Object.entries(rawBlocks)) {
    const path = `$.blocks.${key}`;
    if (!isRecord(rawBlock)) {
      issues.push({ path, message: "Block must be a record." });
      continue;
    }
    if (!isId(rawBlock.id)) {
      issues.push({ path: `${path}.id`, message: "Block id must be stable ASCII." });
      continue;
    }
    if (rawBlock.id !== key) {
      issues.push({
        path: `${path}.id`,
        message: `Block id "${String(rawBlock.id)}" must match its map key "${key}".`,
      });
      continue;
    }
    // Canonical kind key is `type`; the BlockSuite-heritage `flavour` key is
    // accepted as a READ alias and normalized. Both present must agree.
    if (
      rawBlock.type !== undefined &&
      rawBlock.flavour !== undefined &&
      rawBlock.type !== rawBlock.flavour
    ) {
      issues.push({
        path: `${path}.type`,
        message: `Block "type" (${String(rawBlock.type)}) conflicts with legacy "flavour" (${String(rawBlock.flavour)}).`,
      });
      continue;
    }
    const rawType = rawBlock.type !== undefined ? rawBlock.type : rawBlock.flavour;
    if (typeof rawType !== "string" || rawType.length === 0) {
      issues.push({
        path: `${path}.type`,
        message: `Unknown block type: ${String(rawType)}`,
      });
      continue;
    }
    if (!isRecord(rawBlock.props)) {
      issues.push({ path: `${path}.props`, message: "Block props must be an object." });
      continue;
    }
    let blockType: DocBlockType;
    let props = rawBlock.props as Record<string, unknown>;
    if (isDocBlockType(rawType)) {
      blockType = rawType;
    } else {
      // Legacy type coercion (see module header): retired/unknown string types
      // become callouts; the original type name survives as props.kind unless
      // the block already carries its own non-empty kind.
      blockType = "callout";
      const existingKind = props.kind;
      props = {
        ...props,
        kind:
          typeof existingKind === "string" && existingKind.length > 0
            ? existingKind
            : rawType,
      };
    }
    if (!Array.isArray(rawBlock.children)) {
      issues.push({ path: `${path}.children`, message: "Block children must be an array of ids." });
      continue;
    }
    const children: string[] = [];
    let childrenValid = true;
    for (const [childIndex, childId] of rawBlock.children.entries()) {
      if (!isId(childId)) {
        issues.push({
          path: `${path}.children[${childIndex}]`,
          message: "Child id must be a stable ASCII id.",
        });
        childrenValid = false;
        break;
      }
      children.push(childId);
    }
    if (!childrenValid) continue;

    let text: DeltaSpan[] | undefined;
    if (rawBlock.text !== undefined) {
      const spans = validateDeltaSpans(rawBlock.text, `${path}.text`, issues);
      if (spans === null) continue;
      text = spans;
    }

    blocks[key] = {
      id: rawBlock.id,
      type: blockType,
      props,
      text,
      children,
    };
  }

  if (issues.length > 0) return { ok: false, issues };

  const root = value.root as string;
  if (!blocks[root]) {
    issues.push({ path: "$.root", message: `Root block "${root}" is not present in blocks.` });
    return { ok: false, issues };
  }

  // Structural invariants: orphan refs, shared children, cycles, reachability.
  const parentOf = new Map<string, string>();
  for (const block of Object.values(blocks)) {
    for (const [childIndex, childId] of block.children.entries()) {
      const path = `$.blocks.${block.id}.children[${childIndex}]`;
      if (!blocks[childId]) {
        issues.push({ path, message: `Orphan child reference: "${childId}" is not in blocks.` });
        continue;
      }
      if (childId === root) {
        issues.push({ path, message: `Root block "${root}" cannot be a child.` });
        continue;
      }
      const existingParent = parentOf.get(childId);
      if (existingParent !== undefined) {
        issues.push({
          path,
          message: `Shared child: block "${childId}" is referenced by both "${existingParent}" and "${block.id}".`,
        });
        continue;
      }
      parentOf.set(childId, block.id);
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  // Walk from root; single-parent + no-root-as-child already guaranteed above,
  // so a revisit here means a cycle.
  const visited = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (visited.has(id)) {
      issues.push({ path: `$.blocks.${id}`, message: `Cycle detected at block "${id}".` });
      return { ok: false, issues };
    }
    visited.add(id);
    const block = blocks[id];
    for (let index = block.children.length - 1; index >= 0; index -= 1) {
      stack.push(block.children[index]);
    }
  }

  for (const id of Object.keys(blocks)) {
    if (!visited.has(id)) {
      issues.push({
        path: `$.blocks.${id}`,
        message: `Unreachable block: "${id}" is not reachable from root "${root}". Cyclic or detached subtree.`,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    document: {
      schemaVersion: 1,
      id: value.id as string,
      title: typeof value.title === "string" ? value.title : undefined,
      root,
      blocks,
    },
  };
}

/** Depth-first document order (root first), following ordered children. */
export function docBlockOrder(document: DocDocument): string[] {
  const order: string[] = [];
  const walk = (id: string) => {
    const block = document.blocks[id];
    if (!block) return;
    order.push(id);
    for (const childId of block.children) walk(childId);
  };
  walk(document.root);
  return order;
}

const DOC_KEY_ORDER = ["schemaVersion", "id", "title", "root", "blocks"] as const;
const BLOCK_KEY_ORDER = ["id", "type", "props", "text", "children"] as const;
const SPAN_KEY_ORDER = ["insert", "attributes"] as const;
const ATTR_KEY_ORDER = ["bold", "italic", "strike", "code", "link", "reference"] as const;
const REF_KEY_ORDER = ["kind", "path", "symbol", "line", "section", "label"] as const;

function orderedRecord(
  source: Record<string, unknown>,
  keyOrder: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keyOrder) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  for (const key of Object.keys(source).sort()) {
    if (!(key in out) && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function serializableSpan(span: DeltaSpan): Record<string, unknown> {
  const out = orderedRecord(span as unknown as Record<string, unknown>, SPAN_KEY_ORDER);
  if (span.attributes) {
    const attributes = orderedRecord(
      span.attributes as unknown as Record<string, unknown>,
      ATTR_KEY_ORDER,
    );
    if (span.attributes.reference) {
      attributes.reference = orderedRecord(
        span.attributes.reference as unknown as Record<string, unknown>,
        REF_KEY_ORDER,
      );
    }
    out.attributes = attributes;
  }
  return out;
}

/**
 * Deterministic serializer for git-diff discipline (D23 / resolved question 7):
 * stable key order at every level; blocks emitted in depth-first document
 * order so sibling reorders read as line moves. Same document → identical
 * bytes, regardless of in-memory key insertion order.
 */
export function serializeDocDocument(document: DocDocument): string {
  const orderedIds = docBlockOrder(document);
  const seen = new Set(orderedIds);
  // Defensive: include unreachable blocks (invalid docs) deterministically too.
  for (const id of Object.keys(document.blocks).sort()) {
    if (!seen.has(id)) orderedIds.push(id);
  }

  const blocks: Record<string, unknown> = {};
  for (const id of orderedIds) {
    const block = document.blocks[id];
    const raw: Record<string, unknown> = {
      id: block.id,
      type: block.type,
      props: orderedRecord(block.props, Object.keys(block.props).sort()),
      text: block.text?.map(serializableSpan),
      children: block.children,
    };
    blocks[id] = orderedRecord(raw, BLOCK_KEY_ORDER);
  }

  const raw: Record<string, unknown> = {
    schemaVersion: document.schemaVersion,
    id: document.id,
    title: document.title,
    root: document.root,
    blocks,
  };
  return `${JSON.stringify(orderedRecord(raw, DOC_KEY_ORDER), null, 2)}\n`;
}
