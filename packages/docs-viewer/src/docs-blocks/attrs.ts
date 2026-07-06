/**
 * Shared MDX-attribute helpers for the docs-block family — previously
 * copy-pasted into each family file (support/diagram/visual/engineering/
 * semantic). One canonical copy so slug/trim behavior can't drift.
 */

/** Returns the trimmed attribute value, or undefined when absent/blank. */
export function attr(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key]?.trim();
  return value || undefined;
}

/** Lowercase-kebab slug (max 56 chars) for stable block ids, with a fallback for empty results. */
export function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56) || fallback
  );
}
