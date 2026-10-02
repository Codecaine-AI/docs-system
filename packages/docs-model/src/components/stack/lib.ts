"use client";

import { Value } from "@sinclair/typebox/value";
import type { DocValidationIssue } from "../../doc-schema";
import { schemaIssues } from "../define";
import type { ComponentActionResult } from "../types";
import { stackState, type StackBoundary, type StackNode } from "./state";

/** Where a named node sits: its sibling list, its index there, and its parent (undefined at top level). */
export type StackNodeLocation = {
  siblings: StackNode[];
  index: number;
  node: StackNode;
  parent: StackNode | undefined;
};

/** Depth-first search for the node with `name`; names are unique, so the first hit is the only one. */
export function findStackNode(
  nodes: StackNode[],
  name: string,
  parent?: StackNode,
): StackNodeLocation | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.name === name) return { siblings: nodes, index, node, parent };
    if (node.children) {
      const found = findStackNode(node.children, name, node);
      if (found) return found;
    }
  }
  return undefined;
}

/** Every name in a subtree, the root included. */
export function subtreeNames(node: StackNode): string[] {
  return [node.name, ...(node.children ?? []).flatMap(subtreeNames)];
}

export function cloneStackNode(node: StackNode): StackNode {
  const copy: StackNode = { ...node };
  if (node.children) copy.children = node.children.map(cloneStackNode);
  return copy;
}

export function issue(path: string, message: string): ComponentActionResult {
  return { ok: false, issues: [{ path, message }] };
}

/**
 * Validate the whole next state (schema plus stackState.check invariants) and
 * return it as a shallow props patch, or the issues it violates.
 */
export function stackResult(
  nodes: StackNode[],
  boundaries: StackBoundary[],
  patch: { nodes?: true; boundaries?: true },
): ComponentActionResult {
  const next: Record<string, unknown> = { nodes, boundaries };
  const issues: DocValidationIssue[] = Value.Check(stackState.schema, next)
    ? (stackState.check?.(next, "$.props") ?? [])
    : schemaIssues(Value.Errors(stackState.schema, next), "$.props");
  if (issues.length > 0) return { ok: false, issues };
  const props: Record<string, unknown> = {};
  if (patch.nodes) props.nodes = nodes;
  if (patch.boundaries) props.boundaries = boundaries;
  return { ok: true, props };
}
