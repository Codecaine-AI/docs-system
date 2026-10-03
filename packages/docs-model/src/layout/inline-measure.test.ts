import { describe, expect, test } from "bun:test";
import { activeBackend, measureWidth } from "@codecaine-ai/text-measure";
import type { DeltaSpan } from "../doc-schema";
import { measureInline, type InlineContext } from "./inline-measure";
import { breakBetween } from "./line-breaks";
import { codeFont, sansFont } from "./metrics";

/**
 * Expectations below were measured in Chromium 153 with the bundled Inter
 * and IBM Plex Mono: the min-content width of each text in a
 * `width: min-content` box at 13.5px, and the real chip markup the viewer
 * renders (render/delta-spans.tsx) under the workbench stylesheet.
 */

const chip = { sizePx: 13.5 * 0.85, padXPx: 13.5 * 0.85 * 0.35 };
const sans = (wrap: InlineContext["wrap"], extra: Partial<InlineContext> = {}): InlineContext => ({ font: sansFont(13.5), chip, wrap, ...extra });
const code = (insert: string): DeltaSpan => ({ insert, attributes: { code: true } });
const widest = (content: string | DeltaSpan[], context = sans("normal")) => measureInline(content, context).widest;

test("the test preload measures with the exact HarfBuzz backend", () => {
  expect(activeBackend()).toEqual({ name: "harfbuzz", exact: true });
});

describe("where ordinary text breaks (Chromium's min-content runs)", () => {
  test.each([
    ["read-only", "read-"],
    ["2026-10-03", "2026-"],
    ["--docs-table-bg", "table-"],
    ["what?no", "what?"],
    ["a–b", "a–"],
    ["a…b", "a…"],
    ["foo /bar", "/bar"],
    ["aaaaaaa }", "aaaaaaa"],
  ])("%p breaks, and its widest run is %p", (text, run) => {
    expect(widest(text).text).toBe(run);
  });

  test.each(["and/or", "@scope/pkg", "~/path/x", "foo!bar", "a|b", "foo)bar", "foo}bar", "e.g.", "a,b", "1/2", "50%", "$5", "\"quoted\""])(
    "%p never breaks",
    (text) => {
      expect(widest(text).text).toBe(text);
    },
  );

  test("a hyphen breaks only before a letter or digit, and never before another hyphen", () => {
    expect(breakBetween("-", "o")).toBe(true);
    expect(breakBetween("-", "1")).toBe(true);
    expect(breakBetween("-", ">")).toBe(false);
    expect(breakBetween("-", "-")).toBe(false);
    expect(breakBetween("a", "-")).toBe(false);
  });

  test("CJK breaks between characters, and its width is an estimate the result flags", () => {
    const run = widest("日本語");
    expect(Array.from(run.text)).toHaveLength(1);
    expect(run.uncovered.length).toBeGreaterThan(0);
    expect(run.reliable).toBe(false);
    expect(run.coveredWidth).toBe(0);
  });

  test("measured widths match Chromium's to the layout unit", () => {
    expect(widest("read-only").width).toBe(34.875);
    expect(widest("and/or").width).toBe(41.796875);
  });
});

describe("inline code chips", () => {
  test("a chip's pieces break at their <wbr>, each piece carrying the chip's padding on both sides", () => {
    // Chromium: "aaa." <wbr> "verification" is 90.625px at min-content, the last piece and two paddings.
    const measured = widest([code("aaa.verification")]);
    expect(measured.text).toBe("verification");
    expect(measured.width).toBeCloseTo(measureWidth("verification", codeFont(chip.sizePx)) + 2 * chip.padXPx, 6);
  });

  test("the first piece of a chip that breaks at a <wbr> carries a third padding, as Chromium's min-content does", () => {
    // Chromium: "verification." <wbr> "json" is 101.515625px, three paddings.
    const measured = widest([code("verification.json")]);
    expect(measured.text).toBe("verification.");
    expect(measured.width).toBeCloseTo(measureWidth("verification.", codeFont(chip.sizePx)) + 3 * chip.padXPx, 6);
  });

  test("a chip without pieces breaks at its spaces with two paddings per line", () => {
    // Chromium: "verification next" is 90.625px.
    const measured = widest([code("verification next")]);
    expect(measured.text).toBe("verification");
    expect(measured.width).toBeCloseTo(measureWidth("verification", codeFont(chip.sizePx)) + 2 * chip.padXPx, 6);
  });

  test("punctuation right after a chip stays on its line", () => {
    // Chromium: chip + "," is 87.516px.
    const measured = widest([code("brand-huggingface"), { insert: "," }]);
    expect(measured.text).toBe("huggingface,");
  });

  test("a <wbr> breaks even where text never wraps (Chromium honors it under white-space: nowrap)", () => {
    const layout = measureInline([code("packages/docs-viewer/src")], { font: codeFont(13), chip: { sizePx: 13, padXPx: 0 }, wrap: "nowrap" });
    expect(layout.widest.text).toBe("packages/");
    expect(layout.natural.text).toBe("packages/docs-viewer/src");
  });

  test("in print, chip text without pieces wraps anywhere, and pieces stay whole", () => {
    const print = (insert: string) => measureInline([code(insert)], { font: sansFont(13.5), chip: { sizePx: 12, padXPx: 4.2 }, wrap: "anywhere", chipWrapsAnywhere: true }).widest;
    expect(Array.from(print("tableColumnFits").text)).toHaveLength(1);
    expect(print("costEstimate?").text).toBe("costEstimate?");
  });
});

describe("one-line width", () => {
  test.each(["\u00A0", "\u202F"])("no-break spaces keep their advance: %p", (space) => {
    const text = space.repeat(400);
    expect(measureInline(text, sans("nowrap")).natural.width).toBe(measureWidth(text, sansFont(13.5)));
    expect(measureInline(`a${text}b`, sans("normal")).widest.text).toBe(`a${text}b`);
  });

  test("a line that breaks at a soft hyphen paints a hyphen, and an unbroken soft hyphen paints nothing", () => {
    const prefix = "W".repeat(27);
    const layout = measureInline(`${prefix}\u00ADx`, sans("normal"));
    expect(layout.widest.text).toBe(`${prefix}-`);
    expect(layout.widest.width).toBe(measureWidth(`${prefix}-`, sansFont(13.5)));
    expect(layout.natural.width).toBe(measureWidth(`${prefix}x`, sansFont(13.5)));
  });

  test("spaces collapse across marks, and bold paints at 700", () => {
    const layout = measureInline([{ insert: "Use  " }, { insert: "bold", attributes: { bold: true } }, { insert: " text" }], sans("nowrap"));
    expect(layout.natural.text).toBe("Use bold text");
    const space = measureWidth(" ", sansFont(13.5));
    const expected = measureWidth("Use", sansFont(13.5)) + space + measureWidth("bold", sansFont(13.5, 700)) + space + measureWidth("text", sansFont(13.5));
    expect(layout.natural.width).toBeCloseTo(expected, 6);
    expect(layout.widest).toEqual(layout.natural);
  });

  test("in print, inline elements in a fit column keep white-space: nowrap", () => {
    const content: DeltaSpan[] = [{ insert: "Shared Engine", attributes: { bold: true } }, { insert: " rules" }];
    expect(measureInline(content, sans("anywhere", { nowrapElements: true })).widest.text).toBe("Shared Engine");
    expect(Array.from(measureInline(content, sans("anywhere")).widest.text)).toHaveLength(1);
  });
});
