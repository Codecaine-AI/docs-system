/**
 * The fixed page title shown above every doc (Ford, dogfood round 2):
 * derived from the SAME name the sidebar shows — the bundle folder's last
 * segment — so the page and the tree read as one thing. Title Case with the
 * usual small-word exceptions, and the vocabulary's acronyms uppercased.
 * Pure derivation: doc.json's own `title` field and any opening heading
 * block are content, not page furniture.
 */

/** Words that stay lowercase mid-title (first and last word always cap). */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
  "of", "on", "or", "per", "the", "to", "via", "vs",
]);

/** Domain acronyms rendered all-caps. */
const ACRONYMS = new Set(["ai", "api", "cli", "css", "html", "json", "md", "mdx", "ui", "ux"]);

/**
 * The inverse direction, for renaming a doc by editing its page title:
 * re-slugs the typed title while KEEPING the current segment's numeric
 * prefix ("00-", "10." …) so ordering survives. Null when the title
 * yields no usable slug (all punctuation/whitespace).
 */
export function docSegmentFromTitle(title: string, currentSegment: string): string | null {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const prefix = currentSegment.match(/^\d+[-.]?/)?.[0] ?? "";
  return `${prefix}${slug}`;
}

/** "docs/10-system-design/00-interaction-surfaces" -> "Interaction Surfaces". */
export function docTitleFromPath(path: string): string {
  const segment = path.replace(/\/+$/, "").split("/").pop() ?? "";
  const words = segment
    .replace(/^\d+[-.]?/, "")
    .split("-")
    .filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && index < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
