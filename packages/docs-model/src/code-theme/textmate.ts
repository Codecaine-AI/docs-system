/**
 * TextMate theme-rule resolution, the subset a code-theme import needs:
 * "which foreground / fontStyle would this theme give a token with scope
 * X (inside parents P)?"
 *
 * Matching rules (VS Code semantics):
 *   - A selector segment matches a scope when it is equal or a DOT-BOUNDARY
 *     prefix (`keyword` matches `keyword.control`, `key` does not).
 *   - Descendant selectors (`source.css entity.other.attribute-name`) match
 *     when the last segment matches the target and every earlier segment
 *     matches one of the target's parents, in order. A target with no
 *     parents never matches a descendant selector.
 *   - Most specific wins: deeper last-segment match first, then more
 *     matched parents, then deeper parent matches. Ties go to the LATER
 *     rule (theme files and included chains list base rules first).
 *   - foreground and fontStyle resolve independently, as in the editor: a
 *     more specific rule that only sets fontStyle keeps the foreground of a
 *     broader rule.
 *   - Exclusions (`a - b`) are ignored (the `- b` clause is dropped);
 *     child combinators (`>`) are treated as descendant.
 */

export type TextMateRule = {
  name?: string;
  scope?: string | string[];
  settings?: { foreground?: string; background?: string; fontStyle?: string };
};

export type ScopeTarget = {
  scope: string;
  /** Enclosing scopes, outermost first (e.g. `["source.css"]`). */
  parents?: readonly string[];
};

export type ScopeSpecificity = {
  depth: number;
  parentCount: number;
  parentDepth: number;
};

export type ResolvedScopeStyle = {
  foreground?: string;
  fontStyle?: string;
  /** The selector that supplied the foreground (for diagnostics). */
  foregroundSelector?: string;
};

function segmentCount(scope: string): number {
  return scope.split(".").length;
}

/** `selector` equals `scope` or is a prefix ending at a dot boundary. */
export function scopePrefixMatches(selector: string, scope: string): boolean {
  if (selector === scope) return true;
  return scope.startsWith(selector) && scope.charAt(selector.length) === ".";
}

/** Splits a rule's `scope` field into individual selectors. */
export function ruleSelectors(scope: TextMateRule["scope"]): string[] {
  const raw = Array.isArray(scope) ? scope : typeof scope === "string" ? [scope] : [];
  const selectors: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    for (const piece of entry.split(",")) {
      const selector = piece.split(/\s+-\s*/)[0].replace(/>/g, " ").trim().replace(/\s+/g, " ");
      if (selector) selectors.push(selector);
    }
  }
  return selectors;
}

/** Specificity of `selector` against `target`, or null when it does not match. */
export function matchScopeSelector(selector: string, target: ScopeTarget): ScopeSpecificity | null {
  const parts = selector.trim().split(/\s+/).filter(Boolean);
  const last = parts.pop();
  if (!last || !scopePrefixMatches(last, target.scope)) return null;
  const parents = target.parents ?? [];
  let parentIndex = parents.length - 1;
  let parentDepth = 0;
  // Walk selector parents innermost-first, consuming target parents in order.
  for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
    const part = parts[partIndex];
    while (parentIndex >= 0 && !scopePrefixMatches(part, parents[parentIndex])) parentIndex -= 1;
    if (parentIndex < 0) return null;
    parentDepth += segmentCount(part);
    parentIndex -= 1;
  }
  return { depth: segmentCount(last), parentCount: parts.length, parentDepth };
}

/** Positive when `a` is more specific than `b`. */
export function compareSpecificity(a: ScopeSpecificity, b: ScopeSpecificity): number {
  return a.depth - b.depth || a.parentCount - b.parentCount || a.parentDepth - b.parentDepth;
}

/** Resolves the theme style a token with `target` scope would get. */
export function resolveScopeStyle(rules: readonly TextMateRule[], target: ScopeTarget): ResolvedScopeStyle {
  let bestForeground: { spec: ScopeSpecificity; value: string; selector: string } | null = null;
  let bestFontStyle: { spec: ScopeSpecificity; value: string } | null = null;
  for (const rule of rules) {
    const settings = rule?.settings;
    if (!settings) continue;
    const foreground = typeof settings.foreground === "string" ? settings.foreground : undefined;
    const fontStyle = typeof settings.fontStyle === "string" ? settings.fontStyle : undefined;
    if (foreground === undefined && fontStyle === undefined) continue;
    for (const selector of ruleSelectors(rule.scope)) {
      const spec = matchScopeSelector(selector, target);
      if (!spec) continue;
      // `>=`: on equal specificity the later rule wins.
      if (foreground !== undefined && (!bestForeground || compareSpecificity(spec, bestForeground.spec) >= 0)) {
        bestForeground = { spec, value: foreground, selector };
      }
      if (fontStyle !== undefined && (!bestFontStyle || compareSpecificity(spec, bestFontStyle.spec) >= 0)) {
        bestFontStyle = { spec, value: fontStyle };
      }
    }
  }
  const style: ResolvedScopeStyle = {};
  if (bestForeground) {
    style.foreground = bestForeground.value;
    style.foregroundSelector = bestForeground.selector;
  }
  if (bestFontStyle) style.fontStyle = bestFontStyle.value;
  return style;
}
