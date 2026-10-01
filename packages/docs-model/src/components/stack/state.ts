"use client";

import { Type } from "@sinclair/typebox";
import type { DocBlock, DocValidationIssue } from "../../doc-schema";
import type { BlockStateDefinition } from "../types";

/** Accent colors a node may name; containers tint with it, leaves color their badge. */
export const STACK_COLORS = ["gray", "blue", "green", "orange", "yellow", "red", "purple", "pink"] as const;
export type StackColor = (typeof STACK_COLORS)[number];

export type StackNode = {
  name: string;
  detail?: string;
  badge?: string;
  color?: StackColor;
  /** Draw a uses arrow to the next sibling; a string labels the arrow. */
  uses?: true | string;
  /** Lay this node's children side by side in two columns. */
  columns?: 2;
  children?: StackNode[];
};

export type StackBoundary = {
  /** Name of the node the boundary line sits directly beneath. */
  after: string;
  rule: string;
};

export const StackNodeSchema = Type.Recursive(
  (This) =>
    Type.Object(
      {
        name: Type.String({ minLength: 1, description: "Layer or box name; unique in the stack." }),
        detail: Type.Optional(Type.String({ description: "One line under the name." })),
        badge: Type.Optional(Type.String({ description: "Short tag beside the name." })),
        color: Type.Optional(
          Type.Union(STACK_COLORS.map((color) => Type.Literal(color)), {
            description: "Container tint, or the badge color on a leaf.",
          }),
        ),
        uses: Type.Optional(
          Type.Union([Type.Literal(true), Type.String({ minLength: 1 })], {
            description: "Draw a uses arrow to the next sibling; a string labels it.",
          }),
        ),
        columns: Type.Optional(
          Type.Literal(2, { description: "Lay the children side by side in two columns." }),
        ),
        children: Type.Optional(Type.Array(This)),
      },
      { additionalProperties: false },
    ),
  { $id: "StackNode" },
);

export const StackBoundarySchema = Type.Object(
  {
    after: Type.String({ minLength: 1, description: "Name of the node the line sits beneath." }),
    rule: Type.String({ minLength: 1, description: "The rule enforced at this line." }),
  },
  { additionalProperties: false },
);

export const StackState = Type.Object(
  {
    nodes: Type.Array(StackNodeSchema),
    boundaries: Type.Optional(Type.Array(StackBoundarySchema)),
  },
  { additionalProperties: false },
);

/**
 * Invariants beyond the schema: names are unique across the tree (a boundary
 * addresses its node by name), every boundary names an existing node at most
 * once, and a `uses` arrow needs a next sibling to point at.
 */
function checkStack(props: Record<string, unknown>, basePath: string): DocValidationIssue[] {
  const issues: DocValidationIssue[] = [];
  const names = new Set<string>();
  const walk = (nodes: readonly StackNode[], path: string) => {
    nodes.forEach((node, index) => {
      const at = `${path}[${index}]`;
      if (names.has(node.name)) {
        issues.push({ path: `${at}.name`, message: `Duplicate node name "${node.name}".` });
      }
      names.add(node.name);
      if (node.uses !== undefined && index === nodes.length - 1) {
        issues.push({ path: `${at}.uses`, message: "uses needs a next sibling to point at." });
      }
      if (node.children) walk(node.children, `${at}.children`);
    });
  };
  walk((props.nodes ?? []) as StackNode[], `${basePath}.nodes`);
  const seen = new Set<string>();
  ((props.boundaries ?? []) as StackBoundary[]).forEach((boundary, index) => {
    const at = `${basePath}.boundaries[${index}].after`;
    if (!names.has(boundary.after)) {
      issues.push({ path: at, message: `No node named "${boundary.after}".` });
    } else if (seen.has(boundary.after)) {
      issues.push({ path: at, message: `A boundary already follows "${boundary.after}".` });
    }
    seen.add(boundary.after);
  });
  return issues;
}

export const stackState: BlockStateDefinition = {
  schema: StackState,
  carriesText: false,
  check: checkStack,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStackColor(value: unknown): value is StackColor {
  return typeof value === "string" && (STACK_COLORS as readonly string[]).includes(value);
}

function readNodes(raw: unknown): StackNode[] {
  if (!Array.isArray(raw)) return [];
  const nodes: StackNode[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.length === 0) continue;
    const node: StackNode = { name: item.name };
    if (typeof item.detail === "string" && item.detail.length > 0) node.detail = item.detail;
    if (typeof item.badge === "string" && item.badge.length > 0) node.badge = item.badge;
    if (isStackColor(item.color)) node.color = item.color;
    if (item.uses === true || (typeof item.uses === "string" && item.uses.length > 0)) node.uses = item.uses;
    if (item.columns === 2) node.columns = 2;
    if (Array.isArray(item.children)) node.children = readNodes(item.children);
    nodes.push(node);
  }
  return nodes;
}

/** Tolerant read: skips malformed nodes and boundaries, always returns fresh objects. */
export function readStack(block: DocBlock): { nodes: StackNode[]; boundaries: StackBoundary[] } {
  const raw = block.props.boundaries;
  const boundaries: StackBoundary[] = Array.isArray(raw)
    ? raw.flatMap((item) =>
        isRecord(item) && typeof item.after === "string" && typeof item.rule === "string" && item.rule.length > 0
          ? [{ after: item.after, rule: item.rule }]
          : [],
      )
    : [];
  return { nodes: readNodes(block.props.nodes), boundaries };
}
