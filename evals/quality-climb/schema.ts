// The judge reply schema and the fixed vocabularies of the quality climb.
// One TypeBox schema is both the validator and the JSON Schema that `codex exec --output-schema` enforces.
import { Type, type Static } from "@sinclair/typebox";
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

const Score = Type.Integer({ minimum: 1, maximum: 10 });
export const JudgeReplySchema = Type.Object({
  categories: Type.Object(Object.fromEntries(PAGE_CATEGORIES.map((c) => [c, Score])) as Record<PageCategory, typeof Score>, { additionalProperties: false }),
  blocks: Type.Array(Type.Object({ id: Type.String(), score: Score }, { additionalProperties: false })),
  findings: Type.Array(Type.Object({
    target: Type.String({ description: "A category name or a block id" }),
    severity: Type.Union([Type.Literal("high"), Type.Literal("medium"), Type.Literal("low")]),
    finding: Type.String(),
  }, { additionalProperties: false }), { maxItems: 8 }),
}, { additionalProperties: false });
export type JudgeReply = Static<typeof JudgeReplySchema>;

/** Parses a judge's raw text: strict JSON (a fenced block is accepted), the schema, and exactly one score per listed block. */
export function parseJudgeReply(text: string, blockIds: string[]): { ok: true; reply: JudgeReply } | { ok: false; error: string } {
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  let value: unknown;
  try { value = JSON.parse(body); } catch (error) { return { ok: false, error: `Not JSON: ${(error as Error).message}` }; }
  if (!Value.Check(JudgeReplySchema, value)) {
    const first = Value.Errors(JudgeReplySchema, value).First();
    return { ok: false, error: `Schema: ${first?.path || "/"} ${first?.message ?? "invalid"}` };
  }
  const scored = value.blocks.map((b) => b.id);
  const missing = blockIds.filter((id) => !scored.includes(id));
  const extra = scored.filter((id) => !blockIds.includes(id));
  if (missing.length || extra.length || new Set(scored).size !== scored.length) {
    return { ok: false, error: `Blocks: score each listed block once. Missing [${missing.join(", ")}], unknown [${extra.join(", ")}].` };
  }
  return { ok: true, reply: value };
}
