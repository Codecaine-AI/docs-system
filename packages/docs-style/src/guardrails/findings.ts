/**
 * Re-lint checks: the rewrite must fix what it was sent to fix, and must not trade one problem
 * for another. Both compare findings on the original block with findings on the blocks the
 * rewrite produced.
 */
import type { GuardrailResult, StyleFinding, VerifyInput } from "../types";

const tierOf = (finding: StyleFinding) => (finding.tier === 2 ? 2 : 1);

/**
 * Rules whose finding is a forbidden character, word, or phrase. A rewrite that leaves one, or
 * moves it into the next sentence, keeps the very problem it was sent to remove, so every finding
 * of the rule must be gone. Vocabulary-layer findings (deny-list words, filler, modal verbs) mark a
 * forbidden word, so their rules count as presence rules too.
 */
const PRESENCE_RULES: ReadonlySet<string> = new Set(["writing.semicolon", "writing.no-em-dash", "ste.dash-gloss"]);

/**
 * "fixes-target": the rewrite fixed what it was sent to fix. The model's own claim that it fixed
 * something does not count. A target rule is Tier 1 when the original block has a Tier 1 finding
 * of it, and each Tier 1 target rule is checked on its own:
 * - A presence rule must have no finding left on the produced blocks. The wave 1 audit found a
 *   rewrite that moved a semicolon into the next sentence: 1 -> 1, which the old combined count
 *   passed because another target improved.
 * - Any other rule, such as sentence length, may stay as it was but never fire more often. A
 *   rewrite that removes a semicolon and leaves a long sentence alone is still worth keeping.
 * Tier 2 targets, such as one topic per sentence, must improve together: the sweep asks Jev again
 * about the produced blocks and puts the answers in findingsAfter. And at least one target must
 * improve, so a rewrite that fixes nothing fails. Skipped only when there is no data: no target
 * rule, or no finding of one before the rewrite.
 */
export function checkFixesTarget(input: Pick<VerifyInput, "targetRuleIds" | "findingsBefore" | "findingsAfter">): GuardrailResult {
  if (!input.targetRuleIds.length) return { id: "fixes-target", ok: true, skipped: true, detail: "skipped: no target rules" };
  const tiers = { 1: { before: 0, after: 0 }, 2: { before: 0, after: 0 } };
  const unfixed: string[] = [];
  let improved = false;
  for (const rule of new Set(input.targetRuleIds)) {
    const ofRule = (findings: readonly StyleFinding[]) => findings.filter((finding) => finding.ruleId === rule);
    const tier = ofRule(input.findingsBefore).some((finding) => tierOf(finding) === 1) ? 1 : 2;
    const count = (findings: readonly StyleFinding[]) => ofRule(findings).filter((finding) => tierOf(finding) === tier).length;
    const [before, after] = [count(input.findingsBefore), count(input.findingsAfter)];
    tiers[tier].before += before;
    tiers[tier].after += after;
    if (tier === 2 || !before) continue;
    if (after < before) improved = true;
    const presence = PRESENCE_RULES.has(rule) || ofRule(input.findingsBefore).some((finding) => finding.layer === "vocabulary");
    if (presence ? after > 0 : after > before) unfixed.push(`${rule} ${before} -> ${after} (must ${presence ? "be 0" : "not grow"})`);
  }
  if (!tiers[1].before && !tiers[2].before) return { id: "fixes-target", ok: true, skipped: true, detail: "skipped: no finding of a target rule to compare" };
  const counts = ([1, 2] as const)
    .filter((tier) => tiers[tier].before)
    .map((tier) => `Tier ${tier} targets ${tiers[tier].before} -> ${tiers[tier].after}`)
    .join(", ");
  if (unfixed.length) return { id: "fixes-target", ok: false, detail: `Tier 1 targets not fixed: ${unfixed.join(", ")}` };
  if (tiers[2].before && tiers[2].after >= tiers[2].before) return { id: "fixes-target", ok: false, detail: `Tier 2 targets did not improve: ${counts}` };
  if (!improved && !tiers[2].before) return { id: "fixes-target", ok: false, detail: `no target improved: ${counts}` };
  return { id: "fixes-target", ok: true, detail: counts };
}

function tierOneByRule(findings: readonly StyleFinding[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finding of findings) if (tierOf(finding) === 1) counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  return counts;
}

/**
 * "no-new-findings": no Tier 1 rule fires more often on the rewrite than on the original. Tier 2
 * findings are left out, because the sweep asks Jev again only about the target rules.
 */
export function checkNoNewFindings(input: Pick<VerifyInput, "findingsBefore" | "findingsAfter">): GuardrailResult {
  const before = tierOneByRule(input.findingsBefore);
  const added = [...tierOneByRule(input.findingsAfter)].filter(([rule, count]) => count > (before.get(rule) ?? 0));
  if (added.length)
    return { id: "no-new-findings", ok: false, detail: added.map(([rule, count]) => `${rule} ${before.get(rule) ?? 0} -> ${count}`).join(", ") };
  return { id: "no-new-findings", ok: true, detail: "no rule fires more often" };
}
