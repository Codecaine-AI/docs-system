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
/**
 * Round 6 writers saw a wrong claim listed and kept it twice (brief 2 service.log, brief 2 two legacy paths).
 * Both fixed their style findings, which the old text put first, and went to docs_check with no new Read: the
 * old text ended "docs_check never lists or fails on them", and no claim said where to look. Each claim now
 * names what to find in the source, and this text makes the check a step before docs_check.
 * Round 7 writers then fixed claims in one write per block (brief 3: 3 writes of about 210K tokens each), so
 * the text asks for one batch.
 */
export const CLAIMS_NEXT = "Before docs_check, test each claim in claims_to_check against the source. For each name after find:, search the source for it and read the whole function that holds it again. Look for each early return, thrown error, guard for a missing or repeated value, and branch for another mode, client, or input. For a claim with no find: list, find the function that does it first. Count each set the claim counts. A code row keeps every condition and guard of the line it condenses. Fix each claim that a branch, a count, or a missing case breaks: name the condition or narrow the claim, as Match the Source says. Make every claim and style fix in one docs_apply_ops batch, since each extra write rereads the whole task. docs_check does not test these claims, so this is their last check.";
/** Names a claim's find list holds at most. */
const FIND_LIMIT = 3;

const blockText = (block: Block | undefined) => (block?.text ?? []).map((span) => span.insert).join("");
/** Rich text with each code span in backticks, so a claim keeps the names it marks as code. */
const markedSpans = (spans: unknown) => list(spans).map((span) => typeof span.insert !== "string" ? "" : record(span.attributes).code ? `\`${span.insert}\`` : span.insert).join("");
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const isProseClaim = (sentence: string) => ABSOLUTE_WORD.test(sentence) || BEHAVIOR_WORD.test(sentence);
/** A "for each" loop header claims no set, so it alone never makes a code row a claim. */
const isCodeClaim = (line: string) => CONDITION_CODE.test(line) || isProseClaim(line.replace(/\bfor each\b/gi, ""));
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
/** A table cell as plain text: a string, or a span list as the rich-text blocks keep it. */
const cellText = (cell: unknown) => Array.isArray(cell) ? markedSpans(cell).trim() : str(cell);
/** A code row with the source file and line its node cites, as its find list. */
const withSource = (row: string, source: unknown) => str(source) ? `${row} [find: ${str(source)}]` : row;

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
  paragraph: (block) => sentences(markedSpans(block.text)).filter(isProseClaim),
  "list-item": (block) => sentences(markedSpans(block.text)).filter(isProseClaim),
  callout: (block) => sentences(markedSpans(block.text)).filter(isProseClaim),
  pseudocode: (block) => blockText(block).split("\n").map((line) => line.trim()).filter((line) => line && isCodeClaim(line)),
  "call-stack": (block) => outlineRows(block.props.frames, "frames").flatMap((frame) => {
    const text = str(frame.text);
    const comment = str(frame.comment);
    return frame.kind === "branch" || isCodeClaim(text) || isProseClaim(comment) ? [withSource(comment ? `${text} (${comment})` : text, frame.source)] : [];
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
    return node.kind === "branch" || isCodeClaim(text) || isProseClaim(comment) ? [withSource(comment ? `${text} (${comment})` : text, node.source)] : [];
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
/** Rows that are code: a backtick in them is code, not a name to find. */
const CODE_TYPES = new Set(["pseudocode", "call-stack", "component-tree"]);

/** A claim with its code-marked names moved to a find list: "start fails [find: start, service.log]". */
function named(row: string): string {
  const names = [...new Set([...row.matchAll(/`([^`]+)`/g)].map((match) => match[1]!.trim()).filter(Boolean))].slice(0, FIND_LIMIT);
  const text = row.replace(/`([^`]*)`/g, "$1");
  return names.length ? `${text} [find: ${names.join(", ")}]` : text;
}

const changed = (block: Block, prior: Block | undefined) =>
  !prior || prior.type !== block.type || !isDeepStrictEqual(prior.props, block.props) || blockText(prior) !== blockText(block);

/**
 * The claims in the blocks a write changed (every block when the write made the page): prose
 * sentences with an absolute or a behavior word, and the rows of structured blocks that state
 * behavior. A structured row carries its block id, as in "cs-save: ops.filter(...)". A claim ends with
 * the names to find in the source: its code-marked names, or the source line a tree node cites. The write result
 * lists them, so the writer checks each claim while the page is still open for edits, and the
 * final docs_check stays one call.
 */
export function claimsToCheck(doc: DocDocument, baseline: DocDocument | null): string[] {
  const claims: string[] = [];
  for (const block of Object.values(doc.blocks)) {
    const rows = CLAIM_ROWS[block.type];
    if (!rows || (baseline && !changed(block, baseline.blocks[block.id]))) continue;
    for (const row of rows(block)) {
      const claim = CODE_TYPES.has(block.type) ? row : named(row);
      claims.push(PROSE_TYPES.has(block.type) ? claim : `${block.id}: ${claim}`);
    }
  }
  return claims;
}
