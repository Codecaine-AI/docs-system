"use client";

import type { DocBlock } from "../../doc-schema";
import type { ComponentBundle } from "../types";
import { readStack, type StackNode } from "./state";

/**
 * Deterministic markdown projection: one fenced, indented outline.
 * - A node is `<name>`, then ` [<badge>]` and ` — <detail>` when present;
 *   two spaces of indent per nesting depth.
 * - A `uses` arrow is `↓` (or `↓ <label>`) on its own line after the node and
 *   its children, at the node's indent.
 * - A boundary is `── <rule> ──` on its own line after the node it follows
 *   (after any arrow), at the node's indent.
 */
function projectStack(block: DocBlock): string {
  const { nodes, boundaries } = readStack(block);
  const ruleAfter = new Map(boundaries.map((boundary) => [boundary.after, boundary.rule]));
  const lines: string[] = [];
  const walk = (list: readonly StackNode[], indent: string) => {
    for (const node of list) {
      const badge = node.badge ? ` [${node.badge}]` : "";
      const detail = node.detail ? ` — ${node.detail}` : "";
      lines.push(`${indent}${node.name}${badge}${detail}`);
      if (node.children) walk(node.children, `${indent}  `);
      if (node.uses !== undefined) lines.push(node.uses === true ? `${indent}↓` : `${indent}↓ ${node.uses}`);
      const rule = ruleAfter.get(node.name);
      if (rule !== undefined) lines.push(`${indent}── ${rule} ──`);
    }
  };
  walk(nodes, "");
  return lines.length > 0 ? "```\n" + lines.join("\n") + "\n```" : "";
}

export const stackAgentView: ComponentBundle["agentView"] = (block) => {
  switch (block.type) {
    case "stack":
      return projectStack(block);
    default:
      return null;
  }
};
