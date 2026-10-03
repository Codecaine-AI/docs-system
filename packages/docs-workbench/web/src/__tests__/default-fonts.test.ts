import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_DEFAULT_FONTS } from "@codecaine-ai/docs-model/layout";
import { BUNDLED_FACES } from "@codecaine-ai/text-measure";

/**
 * Layout lints measure docs text in DOCS_DEFAULT_FONTS, and those widths only
 * hold where the page paints the same faces. layout-metrics-drift.test.ts
 * pins the default theme's body and code stacks to DOCS_DEFAULT_FONTS; this
 * file covers what that pin cannot: the faces must be ones the workbench
 * ships (@codecaine-ai/text-measure's fonts.css, loaded by main.tsx), and
 * headings follow the measured sans face too.
 */
const theme = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../../themes/default/theme.json"), "utf8"),
) as { fonts?: Record<string, string> };

const firstFamily = (stack: string) => stack.split(",")[0]!.trim().replace(/^(["'])(.*)\1$/, "$2");

test("every font the default theme sets leads with a face the workbench ships", () => {
  const shipped = new Set<string>(BUNDLED_FACES.map((face) => face.family));
  const stacks = Object.values(theme.fonts ?? {});
  expect(stacks.length).toBeGreaterThan(0);
  for (const stack of stacks) expect(shipped).toContain(firstFamily(stack));
});

test("headings paint in the measured sans face, like body text", () => {
  expect(theme.fonts?.heading).toBe(DOCS_DEFAULT_FONTS.sans.stack);
});
