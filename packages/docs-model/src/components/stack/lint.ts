import type { LintRule } from "../../lint/types";
import { readStack, type StackNode } from "./state";

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** True when every word of the badge is already a word of the node name, such as `host` on "Host app". */
export function badgeRepeatsName(node: StackNode): boolean {
  if (!node.badge) return false;
  const name = new Set(words(node.name));
  const badge = words(node.badge);
  return badge.length > 0 && badge.every((word) => name.has(word));
}

/**
 * A badge draws as the card's role word beside its name, so a badge that only repeats the name adds
 * nothing. Round 0 of the stack lane wrote `host` on "Host app", `client` on "Agent client" and `store`
 * on "Docs store on disk", and every judge flagged each one.
 */
export const stackBadgeRepeatsNameRule: LintRule = {
  id: "stack.badge-repeats-name",
  docsPath: "10-system-design/40-block-vocabulary/50-flow-and-diagrams/30-stack",
  severity: "warning",
  enforcement: [],
  applicability: "The badge of each node in a Stack block.",
  exclusions: ["A badge with a word that the name does not hold, such as `pure` on docs-model"],
  suggestion: "Give the badge a role word that the name does not state, such as `pure`, or remove the badge.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "stack") return [];
      const found: { node: StackNode; field: string }[] = [];
      const walk = (nodes: readonly StackNode[], field: string) => nodes.forEach((node, index) => {
        const here = `${field}[${index}]`;
        if (badgeRepeatsName(node)) found.push({ node, field: `${here}.badge` });
        if (node.children) walk(node.children, `${here}.children`);
      });
      walk(readStack(block).nodes, "props.nodes");
      return found.map(({ node, field }) => ({
        blockId: block.id,
        field,
        evidence: node.badge!,
        message: `The badge "${node.badge}" on "${node.name}" repeats the node name, so it adds no role.`,
      }));
    });
  },
};
