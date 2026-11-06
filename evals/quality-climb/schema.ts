// The judge reply schema and the fixed vocabularies of the quality climb.
// One TypeBox schema is both the validator and the JSON Schema that `codex exec --output-schema` enforces.
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const PAGE_CATEGORIES = ["accuracy", "coverage", "scope", "clarity", "structure", "block-choice", "hierarchy", "craft"] as const;
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

export const BLOCK_GROUPS = [
  "rich-text", "callout", "code", "structured-table", "file-tree",
  "interaction-surface", "state-shape", "process-outline", "stack", "call-stack", "component-tree", "pseudocode", "file-explorer",
] as const;
export type BlockGroup = (typeof BLOCK_GROUPS)[number];

export const SETS = ["climb", "held-out"] as const;
export type BriefSet = (typeof SETS)[number];

const RICH_TEXT = new Set(["paragraph", "heading", "list-item"]);
const GROUPS = new Set<string>(BLOCK_GROUPS);
/** The in-scope group a block type scores under, or null for out-of-scope types (canvas, sequence, embeds, divider). */
export function groupOf(blockType: string): BlockGroup | null {
  if (RICH_TEXT.has(blockType)) return "rich-text";
  return GROUPS.has(blockType) ? (blockType as BlockGroup) : null;
}

export interface Brief {
  id: number;
  set: BriefSet;
  slug: string;
  title: string;
  reader: string;
  prompt: string;
  sources: string[];
  blockTypes: BlockGroup[];
  /** The existing page this brief rewrites, for the people who read results. Never given to the writer or a judge. */
  rewrites: string;
}

/** Every score is 1.0 to 10.0 in steps of 0.1. The JSON Schema holds the range, and the parsers hold the step. */
const Score = Type.Number({ minimum: 1, maximum: 10, description: "1.0 to 10.0, with one decimal" });
const Categories = Type.Object(Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, Score])) as Record<PageCategory, typeof Score>, { additionalProperties: false });
const Findings = (target: string) => Type.Array(Type.Object({
  target: Type.String({ description: target }),
  severity: Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
  finding: Type.String(),
}, { additionalProperties: false }), { maxItems: 8 });

export const JudgeReplySchema = Type.Object({
  categories: Categories,
  blocks: Type.Array(Type.Object({ id: Type.String(), score: Score }, { additionalProperties: false })),
  findings: Findings("A category name or a block id"),
}, { additionalProperties: false });
export type JudgeReply = Static<typeof JudgeReplySchema>;
export type Finding = JudgeReply["findings"][number];

/** One component climbed on its own. Each lane scores the block types it names, and only those. */
export const LANES = [
  "rich-text", "code", "pseudocode", "file-tree", "file-explorer", "call-stack",
  "component-tree", "state-shape", "interaction-surface", "structured-table", "process-outline", "stack",
] as const satisfies readonly BlockGroup[];
export type Lane = (typeof LANES)[number];
const RICH_TEXT_LANE = ["paragraph", "heading", "list-item", "callout"] as const;
/** The block types a lane scores: the rich-text lane takes paragraphs, headings, list items and callouts, every other lane its own type. */
export const laneBlockTypes = (lane: Lane): readonly string[] => (lane === "rich-text" ? RICH_TEXT_LANE : [lane]);
export const isLane = (value: string): value is Lane => (LANES as readonly string[]).includes(value);

/** One question a lane judge scores over the lane's blocks on a page. */
export const CriterionSchema = Type.Object({
  id: Type.String({ pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" }),
  question: Type.String({ minLength: 1 }),
  group: Type.String({ minLength: 1 }),
}, { additionalProperties: false });
export type Criterion = Static<typeof CriterionSchema>;

/** The reply of a lane judge: one score per criterion, the 8 page categories as a guard, and findings. */
export function laneReplySchema(criteria: Criterion[]) {
  return Type.Object({
    criteria: Type.Object(Object.fromEntries(criteria.map((c) => [c.id, Score])), { additionalProperties: false }),
    categories: Categories,
    findings: Findings("A criterion id, a category name or a block id"),
  }, { additionalProperties: false });
}
export interface LaneReply { criteria: Record<string, number>; categories: Record<PageCategory, number>; findings: Finding[] }

type Parsed<T> = { ok: true; reply: T } | { ok: false; error: string };

/**
 * Strict JSON (a fenced block is accepted) that matches `schema`, with every score in `scores` on the 0.1 step.
 * Every number in a reply is a score, so the reply comes back with each number rounded to one decimal.
 */
function parseScored<T>(text: string, schema: TSchema, scores: (value: T) => [string, number][]): Parsed<T> {
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  let value: unknown;
  try { value = JSON.parse(body); } catch (error) { return { ok: false, error: `Not JSON: ${(error as Error).message}` }; }
  if (!Value.Check(schema, value)) {
    const first = Value.Errors(schema, value).First();
    return { ok: false, error: `Schema: ${first?.path || "/"} ${first?.message ?? "invalid"}` };
  }
  const offStep = scores(value as T).find(([, score]) => Math.abs(score * 10 - Math.round(score * 10)) > 1e-6);
  if (offStep) return { ok: false, error: `Score ${offStep[0]} is ${offStep[1]}: give each score with at most one decimal, such as 9.4.` };
  return { ok: true, reply: JSON.parse(body, (_key, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)) as T };
}

/** Parses a judge's raw text: strict JSON, the schema, one-decimal scores, and exactly one score per listed block. */
export function parseJudgeReply(text: string, blockIds: string[]): Parsed<JudgeReply> {
  const parsed = parseScored<JudgeReply>(text, JudgeReplySchema, (v) => [...Object.entries(v.categories), ...v.blocks.map((b): [string, number] => [b.id, b.score])]);
  if (!parsed.ok) return parsed;
  const scored = parsed.reply.blocks.map((b) => b.id);
  const missing = blockIds.filter((id) => !scored.includes(id));
  const extra = scored.filter((id) => !blockIds.includes(id));
  if (missing.length || extra.length || new Set(scored).size !== scored.length) {
    return { ok: false, error: `Blocks: score each listed block once. Missing [${missing.join(", ")}], unknown [${extra.join(", ")}].` };
  }
  return parsed;
}

/** Parses a lane judge's raw text: strict JSON, one one-decimal score for each criterion, and the 8 categories. */
export function parseLaneReply(text: string, criteria: Criterion[]): Parsed<LaneReply> {
  return parseScored<LaneReply>(text, laneReplySchema(criteria), (v) => [...Object.entries(v.criteria), ...Object.entries(v.categories)]);
}
