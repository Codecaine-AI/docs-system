import { flat } from "@codecaine-ai/design-system";

/**
 * The workbench stylesheets take their palette and design values from
 * @codecaine-ai/design-system: semantic.css declares `--docs-code-pad-x:
 * var(--ds-space-3)` where it used to declare `12px`. The suites that pin
 * stylesheet declarations to registry defaults and stock values compare the
 * VALUE a declaration paints, so they read the stylesheets through
 * resolveDsVars, which swaps each var(--ds-*) for the token's resolved value.
 * A token edit then fails these suites exactly where the stock value moved.
 */

const name = (path: string) => path.split(".").join("-");

/** Every --ds-* custom property -> its resolved value: base tokens, and theme tokens pinned per theme. */
const DS_VALUES = new Map<string, string>([
  ...Object.entries(flat.base).map(([path, value]) => [`--ds-${name(path)}`, String(value)] as const),
  ...Object.entries(flat.light).map(([path, value]) => [`--ds-light-${name(path)}`, String(value)] as const),
  ...Object.entries(flat.dark).map(([path, value]) => [`--ds-dark-${name(path)}`, String(value)] as const),
]);

/** `text` with every var(--ds-*) replaced by that token's value. Unknown --ds-* names stay as written. */
export function resolveDsVars(text: string): string {
  return text.replace(/var\((--ds-[a-z0-9-]+)\)/g, (match, cssVar: string) => DS_VALUES.get(cssVar) ?? match);
}
