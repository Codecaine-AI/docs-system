import { activeBackend } from "@codecaine-ai/text-measure";

/**
 * Fit verdicts and the wording layout findings share. The guarantee behind a
 * width has three conditions (@codecaine-ai/text-measure README): the page
 * paints with a bundled face, an answer within the tolerance of the edge is
 * borderline, and every character is covered. A finding says "may" when it
 * is borderline and "approximate" when a condition does not hold.
 */

/** Half-width in px of the band around the available width where an answer is borderline (text-measure fitText's default). */
export const FIT_TOLERANCE_PX = 1;

/**
 * `fits`, `overflows` and `borderline` as text-measure's fitText answers
 * them. `uncovered`: it overflows only because of characters the bundled
 * faces lack, whose width depends on the reader's fallback font, so it is
 * reported but not judged.
 */
export type LayoutVerdict = "fits" | "overflows" | "borderline" | "uncovered";

/** The verdict for content `needed` px wide in a box `available` px wide. `coveredNeeded` leaves uncovered characters out. */
export function widthVerdict(needed: number, coveredNeeded: number, available: number, hasUncovered: boolean): LayoutVerdict {
  if (needed <= available - FIT_TOLERANCE_PX) return "fits";
  if (hasUncovered && coveredNeeded <= available + FIT_TOLERANCE_PX) return "uncovered";
  return needed > available + FIT_TOLERANCE_PX ? "overflows" : "borderline";
}

/** A width for a message: whole px, thousands grouped. */
export function px(width: number): string {
  return `${Math.round(width).toLocaleString("en-US")}px`;
}

/** Text for a message, cut to `max` characters. */
export function excerpt(text: string, max = 60): string {
  const chars = Array.from(text.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/**
 * The sentence a finding ends with when its width is not exact, or "". The
 * reasons: text-measure is still on its approximate table backend (the host
 * did not load HarfBuzz or the browser fonts), characters the bundled faces
 * lack, or a weight the bundled faces do not have.
 */
export function approximateNote(input: { reliable: boolean; uncovered: readonly string[] }): string {
  if (input.reliable) return "";
  const reasons: string[] = [];
  const backend = activeBackend();
  if (!backend.exact) reasons.push(`text-measure is on its ${backend.name} backend`);
  if (input.uncovered.length > 0) {
    const shown = input.uncovered.slice(0, 6).join(" ");
    reasons.push(`the bundled fonts lack ${shown}${input.uncovered.length > 6 ? " …" : ""}, so the browser's fallback font sets their width`);
  }
  if (reasons.length === 0) reasons.push("the text uses a weight the bundled fonts do not have");
  return ` These widths are approximate: ${reasons.join(", and ")}.`;
}
