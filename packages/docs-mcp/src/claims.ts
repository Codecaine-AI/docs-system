import { isDeepStrictEqual } from "node:util";
import type { DocDocument } from "@codecaine-ai/docs-model";

type Block = DocDocument["blocks"][string];

/**
 * Words that claim a whole set or a bound. Match the Source asks the writer to check each one against the source.
 * Round 6c judges found overclaims behind "each" (brief 1 "Each type's state schema checks it", brief 5 "Each
 * dependency ... points to a lower layer") and "at most" (brief 1 "Each block has at most one parent").
 */
const ABSOLUTE_WORD = /\b(?:every|each|all|any|only|never|always|nothing|none|at (?:most|least))\b/i;
/**
 * Words that state what code does on a path: a result, a refusal, or a branch. The round 3b and 4
 * judges found most wrong facts here, where a writer read a function's main path and missed an
 * early return, another mode, or the exact check.
 */
const BEHAVIOR_WORD = /\b(?:returns?|throws?|rejects?|refuses?|fails?|answers?|skips?|falls? back|instead of|unless)\b/i;
/**
 * Code that decides something: a condition, a filter, a fallback, or a guard. A code row that the
 * writer condensed from a source line is where the round 5 judges found a dropped check (brief 3
 * cs-save left two checks out of a filter) and a dropped guard (brief 4 read layout.* with no guard).
 */
const CONDITION_CODE = /=>|&&|\|\||[!=]==?|\?\?|\?\.|\b(?:if|else|filter|find|some|switch|case|catch)\b/;

/**
 * Claims one write result lists. Round 6 brief 2 cut a wrong sentence at the old cap of 12. With table, tree, and
 * stack rows, a page-making write on the round 6 climb pages holds 17 to 36 claims.
 */
export const CLAIMS_LIMIT = 24;
export const CLAIMS_NEXT = "Before docs_check, check each sentence and block row in claims_to_check: find the function that does it, and read its whole body for each early return, thrown error, guard for a missing value, check for a repeated value, and branch for another mode, client, or input. A code row keeps every condition and guard of the line it condenses. Where a branch differs or no line proves the whole set, name the function, name the condition, or narrow the claim in your next write, as Match the Source says. docs_check never lists or fails on them.";

const blockText = (block: Block | undefined) => (block?.text ?? []).map((span) => span.insert).join("");
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const isProseClaim = (sentence: string) => ABSOLUTE_WORD.test(sentence) || BEHAVIOR_WORD.test(sentence);
/** A "for each" loop header claims no set, so it alone never makes a code row a claim. */
const isCodeClaim = (line: string) => CONDITION_CODE.test(line) || isProseClaim(line.replace(/\bfor each\b/gi, ""));
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
/** A table cell as plain text: a string, or a span list as the rich-text blocks keep it. */
const cellText = (cell: unknown) => Array.isArray(cell) ? list(cell).map((span) => typeof span.insert === "string" ? span.insert : "").join("").trim() : str(cell);

/** Each row of an outline tree (call-stack frames, process-outline steps), depth first. */
function outlineRows(rows: unknown, childKey: string): Record<string, unknown>[] {
  return list(rows).flatMap((row) => [row, ...outlineRows(row[childKey], childKey)]);
}
/** Each described field of a field list (state-shape fields, interaction-surface params and return fields), depth first. */
function fieldClaims(fields: unknown): string[] {
  return list(fields).flatMap((field) => [
    ...sentences(str(field.description)).filter(isProseClaim).map((s) => `${str(field.name)}: ${s}`),
    ...fieldClaims(field.fields),
  ]);
}

/**
 * Where each block type keeps its text, as the claim lines a writer checks. A prose row counts when
 * it has an absolute or a behavior word. A code row counts when it holds a condition, a filter, a
 * fallback, or a guard, since a condensed line can drop one of its checks.
 */
const CLAIM_ROWS: Readonly<Record<string, (block: Block) => string[]>> = {
  paragraph: (block) => sentences(blockText(block)).filter(isProseClaim),
  "list-item": (block) => sentences(blockText(block)).filter(isProseClaim),
  callout: (block) => sentences(blockText(block)).filter(isProseClaim),
  pseudocode: (block) => blockText(block).split("\n").map((line) => line.trim()).filter((line) => line && isCodeClaim(line)),
  "call-stack": (block) => outlineRows(block.props.frames, "frames").flatMap((frame) => {
    const text = str(frame.text);
    const comment = str(frame.comment);
    return frame.kind === "branch" || isCodeClaim(text) || isProseClaim(comment) ? [comment ? `${text} (${comment})` : text] : [];
  }),
  "process-outline": (block) => outlineRows(block.props.steps, "steps").flatMap((step) => sentences(str(step.text)).filter(isProseClaim)),
  "state-shape": (block) => [...sentences(str(block.props.description)).filter(isProseClaim), ...fieldClaims(block.props.fields)],
  // A row is one fact. Round 6 judges found a dropped condition in table cells whose prose twin was right
  // (brief 2 refuse-table, brief 5 tests-table, brief 6 rules-table).
  "structured-table": (block) => (Array.isArray(block.props.rows) ? block.props.rows : []).flatMap((row) => {
    const text = (Array.isArray(row) ? row : []).map(cellText).filter(Boolean).join(" | ");
    return isProseClaim(text) ? [text] : [];
  }),
  // A component-tree node is checked like a call-stack row: a branch, a node that renders on a condition, or a comment that claims.
  "component-tree": (block) => outlineRows(block.props.nodes, "nodes").flatMap((node) => {
    const text = str(node.text);
    const comment = str(node.comment);
    return node.kind === "branch" || isCodeClaim(text) || isProseClaim(comment) ? [comment ? `${text} (${comment})` : text] : [];
  }),
  "file-tree": (block) => list(block.props.entries).flatMap((entry) => isProseClaim(str(entry.note)) ? [`${str(entry.path)} (${str(entry.note)})`] : []),
  // A layer's note holds for each package in it, so it is a claim with or without a trigger word. So is each boundary rule.
  stack: (block) => [
    ...outlineRows(block.props.nodes, "children").flatMap((node) => {
      const detail = str(node.detail);
      return detail && (list(node.children).length > 0 || isProseClaim(detail)) ? [`${str(node.name)}: ${detail}`] : [];
    }),
    ...list(block.props.boundaries).flatMap((boundary) => str(boundary.rule) ? [`rule after ${str(boundary.after)}: ${str(boundary.rule)}`] : []),
  ],
  "interaction-surface": (block) => list(block.props.operations).flatMap((operation) => [
    ...sentences(str(operation.description)).filter(isProseClaim).map((s) => `${str(operation.name)}: ${s}`),
    ...fieldClaims(operation.params).map((s) => `${str(operation.name)} ${s}`),
    ...fieldClaims(record(operation.returnShape).fields).map((s) => `${str(operation.name)} returns ${s}`),
  ]),
};
const PROSE_TYPES = new Set(["paragraph", "list-item", "callout"]);

const changed = (block: Block, prior: Block | undefined) =>
  !prior || prior.type !== block.type || !isDeepStrictEqual(prior.props, block.props) || blockText(prior) !== blockText(block);

/**
 * The claims in the blocks a write changed (every block when the write made the page): prose
 * sentences with an absolute or a behavior word, and the rows of structured blocks that state
 * behavior. A structured row carries its block id, as in "cs-save: ops.filter(...)". The write result
 * lists them, so the writer checks each claim while the page is still open for edits, and the
 * final docs_check stays one call.
 */
export function claimsToCheck(doc: DocDocument, baseline: DocDocument | null): string[] {
  const claims: string[] = [];
  for (const block of Object.values(doc.blocks)) {
    const rows = CLAIM_ROWS[block.type];
    if (!rows || (baseline && !changed(block, baseline.blocks[block.id]))) continue;
    for (const row of rows(block)) claims.push(PROSE_TYPES.has(block.type) ? row : `${block.id}: ${row}`);
  }
  return claims;
}
