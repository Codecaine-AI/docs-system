import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_FONT_SIZE_PX,
  BODY_LINE_HEIGHT,
  CODE_METRICS,
  DOCS_DEFAULT_FONTS,
  LANE_CODE_CH,
  LANE_TEXT_CH,
  LANE_WIDE_PX,
  NESTED_INSET_PX,
  PDF_PAGE,
  PX_PER_MM,
  STACK_METRICS,
  TABLE_METRICS,
  TREE_METRICS,
} from "@codecaine-ai/docs-model/layout";
import { DEFAULT_STYLE_RAIL_SETTINGS } from "../shell/StyleRail";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";

/**
 * docs-model's layout metrics (src/layout/metrics.ts) copy the workbench's
 * stock: the style-rail defaults, the default theme's fonts, the theme token
 * defaults and the stylesheet declarations that actually render, the tab
 * size code inherits, and the PDF export page. Layout lints read the copy, so
 * each value here must equal its source. When one of these fails, change
 * both sides together.
 */

const webSrc = join(import.meta.dir, "..");
const viewerSrc = join(webSrc, "../../../docs-viewer/src");
const read = (path: string) => readFileSync(path, "utf8");

function files(path: string, pattern: RegExp): string[] {
  if (!statSync(path).isDirectory()) return pattern.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => files(join(path, entry), pattern));
}

/** The workbench stylesheets: index.css and every theme/ stylesheet. */
const stylesheets = () => [join(webSrc, "index.css"), ...files(join(webSrc, "theme"), /\.css$/)].map(read).join("\n");

/** Every value `css` declares for one custom property. */
function declaredIn(css: string, name: string): string[] {
  return [...css.matchAll(new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;]+);`, "g"))].map((match) => match[1]!.trim());
}

/** Every value the workbench stylesheets declare for one custom property. */
function declared(name: string): string[] {
  return declaredIn(stylesheets(), name);
}

/**
 * The literal values one declaration resolves to. `var(--name, fallback)`
 * follows every declaration of --name in `css`, or the fallback when --name
 * is declared nowhere. A reference that resolves to nothing throws.
 */
function resolvedValues(value: string, css: string, seen: ReadonlySet<string> = new Set()): string[] {
  const reference = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(value.trim());
  if (!reference) return [value.trim()];
  const [, name, fallback] = reference as unknown as [string, string, string | undefined];
  if (seen.has(name)) throw new Error(`var(${name}) refers to itself`);
  const values = declaredIn(css, name);
  if (values.length > 0) return values.flatMap((declaration) => resolvedValues(declaration, css, new Set([...seen, name])));
  if (fallback !== undefined) return resolvedValues(fallback, css, seen);
  throw new Error(`${value} resolves to nothing: ${name} is declared nowhere and has no fallback`);
}

/** Each declaration of a token's vars in `css` that does not resolve to `literal`. */
function tokenDrift(vars: readonly string[], literal: string, css: string): string[] {
  return vars.flatMap((name) =>
    declaredIn(css, name).flatMap((declaration) =>
      resolvedValues(declaration, css).filter((value) => value !== literal).map((value) => `${name}: ${declaration} -> ${value}`),
    ),
  );
}

describe("style-rail stock", () => {
  test("body type, lane widths and list indent equal the layout metrics", () => {
    const { typography, layout, list } = DEFAULT_STYLE_RAIL_SETTINGS;
    expect([typography.fontSize, typography.lineHeight]).toEqual([BODY_FONT_SIZE_PX, BODY_LINE_HEIGHT]);
    expect([layout.contentWidth, layout.codeWidth, layout.wideWidth]).toEqual([LANE_TEXT_CH, LANE_CODE_CH, LANE_WIDE_PX]);
    expect(list.indent).toBe(NESTED_INSET_PX["list-item"]!);
  });

  test("the default theme paints body and code text in the faces the metrics measure", () => {
    // The theme manifest applies its fonts over the stylesheets' :root stock (theme-folders.ts compileThemeCss).
    const theme = JSON.parse(read(join(webSrc, "../../../../themes/default/theme.json"))) as { fonts?: Record<string, string> };
    expect(theme.fonts?.body).toBe(DOCS_DEFAULT_FONTS.sans.stack);
    expect(theme.fonts?.code).toBe(DOCS_DEFAULT_FONTS.code.stack);
  });

  test("the stylesheets declare the lane widths the metrics assume", () => {
    for (const value of declared("--style-content-width")) expect(value).toBe(`${LANE_TEXT_CH}ch`);
    expect(new Set(declared("--style-code-width"))).toEqual(new Set([`${LANE_CODE_CH}ch`]));
    expect(new Set(declared("--style-wide-width"))).toEqual(new Set([`${LANE_WIDE_PX}px`]));
  });
});

describe("theme token defaults", () => {
  /** [registry file, key, value]: the registry default and every stylesheet declaration of its var. */
  const tokens: Array<[string, string, number]> = [
    ["code", "textSize", CODE_METRICS.fontSizePx],
    ["code", "lineHeight", CODE_METRICS.lineHeightPx],
    ["code", "padX", CODE_METRICS.padXPx],
    ["code", "gutterWidth", CODE_METRICS.gutterPx],
    ["code", "notesWidth", CODE_METRICS.notesColumnPx],
    ["code", "borderWidth", CODE_METRICS.borderPx],
    ["structured-table", "fontSize", TABLE_METRICS.fontSizePx],
    ["structured-table", "headerTextSize", TABLE_METRICS.headerFontSizePx],
    ["structured-table", "headerWeight", TABLE_METRICS.headerWeight],
    ["structured-table", "bodyWeight", TABLE_METRICS.bodyWeight],
    ["structured-table", "lineHeight", TABLE_METRICS.lineHeight],
    ["structured-table", "cellPaddingX", TABLE_METRICS.cellPadXPx],
    ["structured-table", "cellPaddingY", TABLE_METRICS.cellPadYPx],
    ["structured-table", "borderWidth", TABLE_METRICS.borderPx],
    ["structured-table", "columnRuleWidth", TABLE_METRICS.columnRulePx],
    ["structured-table", "rowMinHeight", TABLE_METRICS.rowMinHeightPx],
    ["file-tree", "noteTextSize", TREE_METRICS.noteFontSizePx],
    ["file-tree", "textSize", TREE_METRICS.textSizePx],
    ["file-tree", "lineHeight", TREE_METRICS.rowHeightPx],
    ["file-tree", "padX", TREE_METRICS.padXPx],
    ["file-tree", "padY", TREE_METRICS.padYPx],
    ["file-tree", "borderWidth", TREE_METRICS.borderPx],
    ["outline-rows", "commentTextSize", TREE_METRICS.noteFontSizePx],
    ["outline-rows", "textSize", TREE_METRICS.textSizePx],
    ["outline-rows", "lineHeight", TREE_METRICS.rowHeightPx],
    ["outline-rows", "padX", TREE_METRICS.padXPx],
    ["outline-rows", "padY", TREE_METRICS.padYPx],
    ["outline-rows", "borderWidth", TREE_METRICS.borderPx],
    ["stack", "gap", STACK_METRICS.gapPx],
  ];

  test.each(tokens)("%s.%s defaults to %p", (file, key, value) => {
    const token = THEME_TOKEN_REGISTRY[file]?.[key];
    if (!token || token.kind === "color") throw new Error(`${file}.${key} is not a length or number token`);
    expect(token.defaultValue).toBe(value);
    // A stylesheet may derive the default from another token (the table header size follows the body size),
    // so every declaration is checked at the value its var() chain resolves to.
    const css = stylesheets();
    expect(token.vars.some((name) => declaredIn(css, name).length > 0)).toBe(true);
    expect(tokenDrift(token.vars, `${value}${token.unit ?? ""}`, css)).toEqual([]);
  });

  test("a declaration derived through var() is checked at the value it resolves to", () => {
    // A stock size that reads an undeclared variable renders its fallback, so it must equal the metric too.
    const mutated = stylesheets().replaceAll("--docs-table-font-size: 13.5px;", "--docs-table-font-size: var(--unknown-font-size,99px);");
    expect(mutated).not.toBe(stylesheets());
    expect(tokenDrift(["--docs-table-font-size"], "13.5px", mutated)).toContain("--docs-table-font-size: var(--unknown-font-size,99px) -> 99px");
    // The header size follows the body size, so the same mutation moves it too.
    expect(tokenDrift(["--docs-table-header-text-size"], "13.5px", mutated)).toContain("--docs-table-header-text-size: var(--docs-table-font-size) -> 99px");
    expect(() => resolvedValues("var(--undeclared)", mutated)).toThrow("declared nowhere and has no fallback");
  });
});

describe("code tab size", () => {
  test("code inherits Tailwind preflight's tab size, and no code surface sets another", () => {
    expect(read(join(webSrc, "index.css"))).toMatch(/^@import "tailwindcss";/m);
    const tailwind = read(Bun.resolveSync("tailwindcss/index.css", webSrc));
    expect(/html,\s*:host\s*\{[^}]*?tab-size:\s*(\d+)/.exec(tailwind)?.[1]).toBe(String(CODE_METRICS.tabSize));
    const codeSurfaces = [
      join(viewerSrc, "components/code"),
      join(viewerSrc, "render"),
      join(viewerSrc, "styles"),
      join(webSrc, "index.css"),
      join(webSrc, "theme"),
    ].flatMap((path) => files(path, /\.(css|tsx?)$/));
    // Declarations, arbitrary-property classes ([tab-size:4]) and inline styles (tabSize: 4).
    const sizes = codeSurfaces.flatMap((path) => [...read(path).matchAll(/tab-?size["']?\s*:\s*["']?(\d+)/gi)].map((match) => `${path}: ${match[1]}`));
    expect(sizes.filter((entry) => !entry.endsWith(`: ${CODE_METRICS.tabSize}`))).toEqual([]);
  });
});

describe("PDF export", () => {
  test("Chromium prints through the A4 page minus its margins, with code wrapped", () => {
    const exporter = read(join(webSrc, "../../src/pdf-export.ts"));
    const viewport = /viewport:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/.exec(exporter);
    expect([Number(viewport?.[1]), Number(viewport?.[2])]).toEqual([PDF_PAGE.printableWidthPx, PDF_PAGE.printableHeightPx]);
    expect(exporter).toContain(`format: "${PDF_PAGE.format}"`);
    const { top, right, bottom, left } = PDF_PAGE.marginMm;
    expect(exporter).toContain(`margin: { top: "${top}mm", bottom: "${bottom}mm", left: "${left}mm", right: "${right}mm" }`);
    // The viewport is the printable area of an A4 sheet.
    expect(Math.round((PDF_PAGE.pageWidthMm - left - right) * PX_PER_MM)).toBe(PDF_PAGE.printableWidthPx);
    expect(Math.round((PDF_PAGE.pageHeightMm - top - bottom) * PX_PER_MM)).toBe(PDF_PAGE.printableHeightPx);

    const printCss = read(join(webSrc, "lib/pdf-document.tsx"));
    expect(printCss).toContain(`body{font:${PDF_PAGE.bodyFontSizePt}pt/${PDF_PAGE.bodyLineHeight} `);
    const code = /pre,code\{([^}]*)\}/.exec(printCss)?.[1] ?? "";
    expect(code).toContain(`font-size:${PDF_PAGE.codeFontSizePt}pt!important`);
    expect(code).toContain(`white-space:${PDF_PAGE.codeWhiteSpace}!important`);
    // Code wraps anywhere outside any cascade layer, which beats a chip's own overflow-wrap utility.
    expect(code).toContain("overflow-wrap:anywhere");
  });

  test("tables print at full width with fixed layout, cells wrapping anywhere", () => {
    const printCss = read(join(webSrc, "lib/pdf-document.tsx"));
    const table = /(?:^|\s|\})table\{([^}]*)\}/.exec(printCss)?.[1] ?? "";
    expect(table).toContain("width:100%!important");
    expect(table).toContain(`table-layout:${PDF_PAGE.tableLayout}`);
    const cells = /th,td\{([^}]*)\}/.exec(printCss)?.[1] ?? "";
    expect(cells).toContain("overflow-wrap:anywhere");
    expect(cells).toContain("white-space:normal!important");
    expect(cells).toContain(`padding:${PDF_PAGE.tableCellPadPt}pt`);
  });
});
