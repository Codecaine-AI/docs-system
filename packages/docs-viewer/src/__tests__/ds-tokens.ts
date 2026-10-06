import { flat } from "@codecaine-ai/design-system";

/**
 * The viewer's inline stylesheets and class strings take their design values
 * from @codecaine-ai/design-system: a stylesheet declares `--tr-indent:
 * var(--ds-space-5)` where it used to declare `20px`. The drift suites pin
 * those declarations to docs-model's layout metrics by the VALUE they paint,
 * so they read them through resolveDsVars, which swaps each var(--ds-*) for
 * the token's resolved value (the same helper as docs-workbench's
 * web/src/__tests__/ds-tokens.ts). A token edit then fails these suites
 * exactly where the layout lints' copy moved out of step.
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
