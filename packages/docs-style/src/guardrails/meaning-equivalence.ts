/**
 * Meaning equivalence: a strong model reads the block before and after the change and says whether
 * AFTER says exactly what BEFORE says, in both directions. It is the last check, because it is the
 * slowest and the costliest. It catches what no other check can see: a lost "because" link, a
 * list that became partial, an example that became a rule, a fact moved under the wrong bullet.
 */
import { meaningInline, meaningMarkdown } from "../text";
import type { GuardrailResult, MeaningDifference, MeaningVerdict, Verifier, VerifyInput } from "../types";
import { afterMeaningBlocks, excerpt } from "./prose";

/** What the meaning check reads from VerifyInput. */
export type MeaningInput = Pick<VerifyInput, "beforeSpans" | "afterBlocks" | "afterDepths" | "blockType" | "heading">;

const fail = (detail: string): GuardrailResult => ({ id: "meaning-equivalence", ok: false, detail });

/** One difference, short: its kind, the words on each side, and why it matters. */
function describe({ kind, before, after, why }: MeaningDifference): string {
  const words = before && after ? `"${excerpt(before, 30)}" -> "${excerpt(after, 30)}"` : before ? `drops "${excerpt(before, 30)}"` : `adds "${excerpt(after, 30)}"`;
  // "added" says nothing that "adds" does not.
  const label = kind && kind !== "added" ? `${kind} ` : "";
  return `${label}${words}${why ? `: ${excerpt(why, 50)}` : ""}`;
}

/**
 * "meaning-equivalence": the Verifier says AFTER says exactly what BEFORE says. The check gates:
 * no Verifier, an error, or a malformed answer fails it, so the original block stays as it was. A
 * verdict of "same" that still lists a difference fails too, because near zero meaning change
 * leaves no room for a difference the model chose to excuse.
 */
export async function checkMeaningEquivalence(input: MeaningInput, verifier?: Verifier): Promise<GuardrailResult> {
  if (!verifier) return fail("meaning check unavailable: no verifier");
  let verdict: MeaningVerdict;
  try {
    verdict = await verifier.compare({
      before: meaningInline(input.beforeSpans),
      after: meaningMarkdown(afterMeaningBlocks(input)),
      blockType: input.blockType ?? "paragraph",
      ...(input.heading ? { heading: input.heading } : {}),
    });
  } catch (error) {
    return fail(`meaning check unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof verdict?.same !== "boolean" || !Array.isArray(verdict.differences)) return fail("meaning check unavailable: the verifier gave no verdict");
  const differences = verdict.differences;
  if (verdict.same && !differences.length) return { id: "meaning-equivalence", ok: true, detail: `same meaning (${verdict.model})` };
  if (!differences.length) return fail("differs: the verifier named no difference");
  const more = differences.length > 2 ? `, and ${differences.length - 2} more` : "";
  return fail(`differs: ${differences.slice(0, 2).map(describe).join("; ")}${more}`);
}
