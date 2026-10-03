/**
 * The meaning check for autofixes. A rewrite gets its meaning check inside the guardrails. An
 * autofix gets the same Verifier here: Sol compares the block before and after the fix, and any
 * difference rejects the fix.
 */
import type { DocDocument } from "@codecaine-ai/docs-model";
import { meaningMarkdown } from "../text";
import { nearestHeading } from "../text/context";
import type { BlockChange, MeaningDifference, MeaningVerdict, Verdict, Verifier } from "../types";
import { createLimiter } from "./limit";

/** A Verifier that runs at most `concurrency` compare calls at once, across every caller. */
export function limitVerifier(verifier: Verifier, concurrency: number): Verifier {
  const slot = createLimiter(concurrency);
  return { compare: (input) => slot(() => verifier.compare(input)) };
}

/**
 * Checks each accepted autofix on a page. Returns one change per checked block: the same change
 * with its meaning verdict when Sol finds the meaning unchanged, or a rejected change when it finds
 * a difference. A Verifier that throws leaves the change in error, so it never lands unchecked.
 */
export async function checkAutofixes(
  doc: DocDocument,
  changes: readonly BlockChange[],
  verifier: Verifier,
  onVerdict: (verdict: MeaningVerdict) => void,
): Promise<Map<string, BlockChange>> {
  const checked = await Promise.all(
    changes
      .filter((change) => change.kind === "autofix" && change.status === "accepted" && change.produced)
      .map(async (change): Promise<[string, BlockChange]> => {
        try {
          const result = await verifier.compare({
            before: meaningMarkdown([{ spans: change.beforeSpans ?? [], depth: 0 }]),
            after: meaningMarkdown(change.produced!),
            blockType: change.blockType,
            heading: nearestHeading(doc, change.blockId) || undefined,
          });
          onVerdict(result);
          const verdict = meaningVerdict(result);
          if (result.same) return [change.blockId, { ...change, verdict }];
          return [change.blockId, refused(change, "rejected", `meaning check: ${describeDifferences(result.differences)}`, verdict)];
        } catch (error) {
          return [change.blockId, refused(change, "error", `meaning check failed: ${messageOf(error)}`)];
        }
      }),
  );
  return new Map(checked);
}

function refused(change: BlockChange, status: "rejected" | "error", reason: string, verdict?: Verdict): BlockChange {
  return { ...change, status, reason, verdict, produced: undefined, ops: [] };
}

/** The meaning result as a one-check Verdict, so reports read it the way they read guardrails. */
function meaningVerdict(result: MeaningVerdict): Verdict {
  const detail = result.same ? `same meaning (${result.model})` : describeDifferences(result.differences);
  return { accepted: result.same, checks: [{ id: "meaning-equivalence", ok: result.same, detail }] };
}

/** The first difference in one line, and how many more there are. */
export function describeDifferences(differences: readonly MeaningDifference[]): string {
  const [first, ...rest] = differences;
  if (!first) return "the verifier found a difference but named none";
  const words = first.before && first.after ? `"${first.before}" became "${first.after}"` : first.before ? `dropped "${first.before}"` : `added "${first.after}"`;
  const more = rest.length ? ` (and ${rest.length} more)` : "";
  return `${first.kind}: ${words}${first.why ? `, ${first.why}` : ""}${more}`;
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim();
}
