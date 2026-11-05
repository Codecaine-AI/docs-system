import type { LintRule } from "../../lint/types";

/** TypeScript words that make a lowercase run inside a type, such as `keyof typeof x` or `value is string`. */
const TYPE_KEYWORDS = /\b(?:keyof|typeof|readonly|unique|infer|extends|is|asserts|new|in|as|const)\b/g;

/** The text of a type outside quoted strings and (), [], {}, <> groups, where a sentence cannot hide. */
function topLevelText(type: string): string {
  let depth = 0;
  let quote: string | null = null;
  let out = "";
  for (const char of type) {
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if ("([{<".includes(char)) { depth += 1; continue; }
    if (")]}>".includes(char)) { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) out += char;
  }
  return out;
}

/**
 * True when a returns string holds prose, not only a type: outside its brackets and strings it has
 * a sentence break (". " or a final period) or three lowercase words in a row. `{ ok, doc } for a doc
 * patch.` is prose. `OpsResponse`, `string | null`, `Promise<void>` and `text/event-stream of
 * DocsChangeEvent JSON` are not.
 */
export function returnsHoldsProse(returns: string): boolean {
  const text = topLevelText(returns).replace(TYPE_KEYWORDS, " ");
  return /[.;](?:\s|$)/.test(text.trimEnd()) || /\b[a-z]+\s+[a-z]+\s+[a-z]+\b/.test(text);
}

/**
 * An operation's returns renders as the monospace type after its signature and heads its Returns card,
 * so a condition written there reads as type text. Round 8 brief 3 wrote "{ ok: true, doc, hash } for a
 * doc patch. A canvas, sequence, or compound patch returns its own fields." as the returns of POST
 * /api/undo, and every judge sample flagged it.
 */
export const interactionSurfaceReturnsProseRule: LintRule = {
  id: "interaction-surface.returns-prose",
  docsPath: "10-system-design/40-block-vocabulary/40-structured-reference/20-interaction-surface",
  severity: "warning",
  enforcement: [],
  applicability: "The returns string of each operation in an Interaction Surface block.",
  exclusions: ["Words inside a bracketed type or a quoted literal, such as { status: \"not found\" }"],
  suggestion: "Keep returns to the return type, such as OpsResponse or { ok, doc }. Move the condition or the other cases into the operation's description, or list the returned fields in returnShape.",
  check({ blocks }) {
    return blocks.flatMap((block) => {
      if (block.type !== "interaction-surface" || !Array.isArray(block.props.operations)) return [];
      return block.props.operations.flatMap((operation: unknown, index: number) => {
        if (!operation || typeof operation !== "object") return [];
        const { name, returns } = operation as { name?: unknown; returns?: unknown };
        if (typeof returns !== "string" || !returnsHoldsProse(returns)) return [];
        const label = typeof name === "string" && name ? name : `operation ${index + 1}`;
        return [{
          blockId: block.id,
          field: `props.operations[${index}].returns`,
          evidence: returns,
          message: `The returns of ${label} holds prose, and the page renders it as type text. Keep returns to the type, and move the rest into the operation's description.`,
        }];
      });
    });
  },
};
