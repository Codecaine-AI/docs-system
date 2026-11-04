/**
 * The fixed page title shown above every doc. It is doc.json's `title`
 * field (Ford, quality climb round 3). The bundle folder name is only the
 * URL slug and the sidebar name. A doc with an empty title falls back to
 * its folder name in Title Case, with the usual small-word exceptions and
 * the vocabulary's acronyms uppercased.
 *
 * Lives in the viewer (not the workbench) so every doc surface — the
 * workbench DocPage AND the side-peek panel — derives titles through the
 * same code. Pure string logic, no React. Reachable outside the package via
 * the frozen `./bundle-src` exports-map entry (re-exported there) and the
 * root barrel.
 */

/** Words that stay lowercase mid-title (first and last word always cap). */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
  "of", "on", "or", "per", "the", "to", "via", "vs",
]);

/** Domain acronyms rendered all-caps. */
const ACRONYMS = new Set(["ai", "api", "ci", "cli", "css", "html", "http", "json", "mcp", "md", "mdx", "npm", "pdf", "sdk", "sql", "ui", "url", "ux"]);

/**
 * Re-slugs a typed title while KEEPING the current segment's numeric
 * prefix ("00-", "10." …) so ordering survives. Null when the title
 * yields no usable slug (all punctuation/whitespace). The workbench no
 * longer renames a folder from its title. Hosts that vendor an older
 * workbench still import this helper.
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

/** The page title for the doc at `path`: its `title` field, or its folder name when the title is empty. */
export function docPageTitle(title: string | undefined, path: string): string {
  return title?.trim() || docTitleFromPath(path);
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
