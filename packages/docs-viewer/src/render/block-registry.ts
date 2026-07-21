"use client";

import type { ReactNode } from "react";
import type { DeltaSpan, DocBlock, DocBlockType } from "@codecaine-ai/docs-model/doc-schema";
import { DOC_BLOCK_TYPES } from "@codecaine-ai/docs-model/doc-schema";
import { descriptors as canvasDescriptors } from "../components/canvas/descriptor";
import { descriptors as codeDescriptors } from "../components/code/descriptor";
import { descriptors as fileTreeDescriptors } from "../components/file-tree/descriptor";
import { descriptors as interactionSurfaceDescriptors } from "../components/interaction-surface/descriptor";
import { descriptors as mermaidDescriptors } from "../components/mermaid/descriptor";
import { descriptors as richTextDescriptors } from "../components/rich-text/descriptors";
import { descriptors as sequenceDescriptors } from "../components/sequence/descriptor";
import { descriptors as structuredTableDescriptors } from "../components/structured-table/descriptor";

export type DocBlockRenderContext = {
  /** Renders delta spans to inline React (bold/italic/strike/code/link/reference marks). */
  renderText: (text: DeltaSpan[] | undefined) => ReactNode;
  /** Renders the block's ordered children recursively. */
  renderChildren: (block: DocBlock) => ReactNode;
  /** Markdown string -> React; used by adapted MDX block implementations. */
  renderMarkdown: (markdown: string) => ReactNode;
  /** Canvas embed by id or legacy src (+ optional container view crop, D4/§4.4). */
  renderCanvas?: (input: {
    id: string;
    canvasId?: string;
    src?: string;
    view?: string;
    title?: string;
  }) => ReactNode;
  /** Sequence embed by id or sidecar src (mirrors `renderCanvas`). */
  renderSequence?: (input: {
    id: string;
    sequenceId?: string;
    src?: string;
    title?: string;
  }) => ReactNode;
  /** Resolves a bundle-relative image/video src to a fetchable URL. */
  resolveAssetSrc?: (src: string) => string;
};

/** @deprecated Use DocBlockRenderContext. */
export type DocFlavourRenderContext = DocBlockRenderContext;

export type DocBlockDescriptor = {
  type: DocBlockType;
  targetKind: string;
  label: string;
  agentDescription: string;
  /** Typed doc ops applicable to this block type (see doc-ops.ts DocOp union). */
  patchOps: readonly string[];
  render: (block: DocBlock, ctx: DocBlockRenderContext) => ReactNode;
};

/** @deprecated Use DocBlockDescriptor. */
export type DocFlavourDescriptor = DocBlockDescriptor;

export { deltaToMarkdown, deltaToPlainText } from "./descriptor-helpers";

const COMPONENT_DESCRIPTORS: readonly DocBlockDescriptor[][] = [
  richTextDescriptors,
  codeDescriptors,
  mermaidDescriptors,
  fileTreeDescriptors,
  structuredTableDescriptors,
  interactionSurfaceDescriptors,
  canvasDescriptors,
  sequenceDescriptors,
];

function buildRegistry(): Map<DocBlockType, DocBlockDescriptor> {
  const { registry, duplicates } = COMPONENT_DESCRIPTORS.flat().reduce(
    (state, descriptor) => {
      const { registry, duplicates } = state;
      if (registry.has(descriptor.type)) duplicates.add(descriptor.type);
      registry.set(descriptor.type, descriptor);
      return state;
    },
    {
      registry: new Map<DocBlockType, DocBlockDescriptor>(),
      duplicates: new Set<string>(),
    },
  );

  const expected = new Set<string>(DOC_BLOCK_TYPES);
  const missing = DOC_BLOCK_TYPES.filter((type) => !registry.has(type));
  const extra = [...registry.keys()].filter((type) => !expected.has(type));
  const issues = [
    missing.length ? `missing: ${missing.join(", ")}` : null,
    extra.length ? `extra: ${extra.join(", ")}` : null,
    duplicates.size ? `duplicate: ${[...duplicates].join(", ")}` : null,
  ].filter((issue): issue is string => issue !== null);

  if (issues.length > 0) {
    throw new Error(`Doc block registry drift — ${issues.join("; ")}`);
  }

  return registry;
}

const BLOCK_REGISTRY = buildRegistry();

export function getDocBlockDescriptor(type: string): DocBlockDescriptor | null {
  return BLOCK_REGISTRY.get(type as DocBlockType) ?? null;
}

/** @deprecated Use getDocBlockDescriptor. */
export const getDocFlavourDescriptor = getDocBlockDescriptor;
