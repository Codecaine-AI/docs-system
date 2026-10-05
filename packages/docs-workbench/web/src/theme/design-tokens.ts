import { flat, type BaseTokenPath } from "@codecaine-ai/design-system";

/**
 * Design-token numbers for code that needs a value, not a CSS reference.
 *
 * The stylesheets read the @codecaine-ai/design-system tokens as var(--ds-*)
 * (semantic.css `--docs-code-pad-x: var(--ds-space-3)`). The style rail's
 * stock settings and the theme token registry defaults must equal what those
 * declarations paint, because a knob at its stock value writes nothing and
 * lets the stylesheet answer. So a stock number whose stylesheet default reads
 * a token comes from the same token here: change the token once and the
 * stylesheet, the rail and the registry move together.
 */
export function dsNumber(path: BaseTokenPath, unit: "px" | "ch" | "em" | "ms" | ""): number {
  const value = String(flat.base[path]);
  const match = /^(-?\d*\.?\d+)([a-z%]*)$/.exec(value);
  if (!match || match[2] !== unit) {
    throw new Error(`design token ${path} is "${value}", not a ${unit || "unitless"} number`);
  }
  return Number(match[1]);
}
