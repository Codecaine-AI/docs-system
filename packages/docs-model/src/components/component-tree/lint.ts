import type { LintRule } from "../../lint/types";
import type { OutlineRow } from "../shared/outline-rows";
import { readComponentTree } from "./state";

/**
 * True when a row holds an ellipsis outside braces and quotes, such as `<Pane a={a} …>`, where it stands
 * for dropped props. Inside braces it is a value (`{…}`) or a spread (`{...props}`), which is valid JSX.
 */
export function hasBareEllipsis(text: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quote) { if (char === "\\") i++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth++;
    else if (char === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === "…" || text.startsWith("...", i))) return true;
  }
  return false;
}

const walk = (rows: readonly OutlineRow[], path: number[], out: { row: OutlineRow; path: number[] }[]) => {
  rows.forEach((row, index) => { out.push({ row, path: [...path, index] }); walk(row.children, [...path, index], out); });
  return out;
};

/**
 * A component row is copied JSX, so a bare `…` for dropped props reads as broken code. Round 2 of the
 * component-tree climb wrote `<StyleRailPanel settings={settings} …>`, and every Sol sample called it
 * invalid JSX. The ellipsis also wrapped onto a line of its own.
 */
export const componentTreeBareEllipsisRule: LintRule = {
  id: "component-tree.bare-ellipsis",
  docsPath: "10-system-design/40-block-vocabulary/30-trees-and-paths/40-component-tree",
  severity: "warning",
  enforcement: [],
  applicability: "The text of each component and hook row in a Component Tree block.",
  exclusions: ["An omitted value written as {…}", "A spread such as {...props}", "An ellipsis inside a string", "A branch row"],
  suggestion: "Drop the props that do not explain composition with no marker, such as <Pane settings={settings}>. Write an omitted value as {…}.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "component-tree") return [];
      return walk(readComponentTree(block), [], []).flatMap(({ row, path }) => {
        if (row.kind === "branch" || !hasBareEllipsis(row.text)) return [];
        return [{
          blockId: block.id,
          field: `props.nodes${path.map((i, depth) => (depth ? `.nodes[${i}]` : `[${i}]`)).join("")}.text`,
          evidence: row.text,
          message: `The row ${row.text} uses a bare … for dropped props, which is not valid JSX. Drop those props with no marker, and write an omitted value as {…}.`,
        }];
      });
    });
  },
};
