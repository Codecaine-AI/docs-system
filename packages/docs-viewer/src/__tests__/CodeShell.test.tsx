import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CodeShell } from "../components/code/CodeShell";
import { highlightCode, resolveDisplayLanguage } from "../components/code/highlight";
import { CODE_CELL_CLASSES } from "../components/code/classes";
import { CODE_BLOCK_CLASSES } from "../render/block-classes";

afterEach(() => {
  cleanup();
});

const CODE = ["const a = 1;", "const b = 2;", "const c = a + b;"].join("\n");

function renderShell(overrides?: { languageLabel?: string | null; copyText?: () => string }) {
  return render(
    <div className="group/code">
      <CodeShell
        languageLabel={overrides?.languageLabel === undefined ? "ts" : overrides.languageLabel}
        copyText={overrides?.copyText ?? (() => CODE)}
        lineCount={CODE.split("\n").length}
      >
        <pre className={CODE_CELL_CLASSES}>
          <code
            className="hljs"
            dangerouslySetInnerHTML={{ __html: highlightCode(CODE, "ts").join("\n") }}
          />
        </pre>
      </CodeShell>
    </div>,
  );
}

describe("resolveDisplayLanguage", () => {
  it("returns the declared language when a grammar (or alias) matches, normalized", () => {
    expect(resolveDisplayLanguage("const a = 1;", "ts")).toBe("ts");
    expect(resolveDisplayLanguage("x", " TypeScript ")).toBe("typescript");
    expect(resolveDisplayLanguage("echo hi", "shell")).toBe("shell");
  });

  it("sniffs undeclared JSON so the label can show json", () => {
    expect(resolveDisplayLanguage('{"a": 1}')).toBe("json");
    expect(resolveDisplayLanguage("[1, 2]")).toBe("json");
  });

  it("returns null for unknown languages and plain text", () => {
    expect(resolveDisplayLanguage("hello", "klingon")).toBeNull();
    expect(resolveDisplayLanguage("hello")).toBeNull();
    expect(resolveDisplayLanguage("42")).toBeNull();
  });
});

describe("CodeShell (plain read surface)", () => {
  it("renders the quiet header label, one gutter line per code line, and the zebra layer", () => {
    const { container } = renderShell();

    const label = container.querySelector("[data-code-lang]");
    expect(label?.textContent).toBe("ts");
    // Quiet label — muted uppercase text, no pill (no background, no border).
    expect(label?.className).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");
    expect(label?.className).toContain("uppercase");
    expect(label?.className).not.toContain("bg-");
    expect(label?.className).not.toContain("border");
    expect(container.querySelector("[data-code-header]")).toBeTruthy();

    const gutterLines = container.querySelectorAll("[data-code-gutter-line]");
    expect(gutterLines.length).toBe(3);
    expect(gutterLines[0]?.textContent).toBe("1");
    expect(gutterLines[2]?.textContent).toBe("3");

    const zebra = container.querySelector("[data-code-zebra]");
    expect(zebra).toBeTruthy();
    expect(zebra?.className).toContain("repeating-linear-gradient");
    // Zebra fallback is the 20% mix, dimmable via the opacity knob.
    expect(zebra?.className).toContain("_20%");
    expect(zebra?.className).toContain("opacity-[var(--docs-code-zebra-opacity,1)]");

    // The code cell keeps the pre>code hljs shape.
    expect(container.querySelector("pre code.hljs")).toBeTruthy();
    // No notes aside on the plain surface.
    expect(container.querySelector("[data-code-notes]")).toBeNull();
  });

  it("renders a bare single-column block when there are no annotations, header rule intact", () => {
    const { container } = renderShell();

    // No notes column, no notes header (and thus no vertical column divider).
    expect(container.querySelector("[data-code-notes]")).toBeNull();
    expect(container.querySelector("[data-code-notes-header]")).toBeNull();
    // The header keeps the standardized subtle bottom rule.
    const header = container.querySelector("[data-code-header]")!;
    expect(header.className).toContain("h-[var(--docs-code-header-height,28px)]");
    expect(header.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
    expect(header.className).toContain("var(--docs-code-rule,var(--border))");
    expect(header.className).toContain("--docs-code-rule-opacity");
  });

  it("reads every tunable metric from its token, with the stock value as the fallback", () => {
    const { container } = renderShell();
    const cls = (selector: string) => container.querySelector(selector)!.className;

    // Code typography + gutter column on the content wrapper.
    const content = cls("[data-code-content]");
    expect(content).toContain("text-[length:var(--docs-code-text-size,12px)]");
    expect(content).toContain("leading-[var(--docs-code-line-height,20px)]");
    expect(content).toContain("grid-cols-[var(--docs-code-gutter-width,48px)_1fr]");

    // Gutter rows: line height, number size, right padding.
    const gutterLine = cls('[data-code-gutter-line="1"]');
    expect(gutterLine).toContain("h-[var(--docs-code-line-height,20px)]");
    expect(gutterLine).toContain("leading-[var(--docs-code-line-height,20px)]");
    expect(gutterLine).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(gutterLine).toContain("pr-[var(--docs-code-gutter-pad-x,8px)]");
    // ...and the number color survives next to the size (cn() must not
    // treat the two text-[...] utilities as one group).
    expect(gutterLine).toContain("var(--docs-code-gutter-fg,var(--muted-foreground))");

    // Zebra: starts at the gutter edge, period = 2 x the line-height token.
    const zebra = cls("[data-code-zebra]");
    expect(zebra).toContain("left-[var(--docs-code-gutter-width,48px)]");
    expect(zebra).toContain("transparent_0_var(--docs-code-line-height,20px)");
    expect(zebra).toContain("calc(var(--docs-code-line-height,20px)*2)");
    // The code block's own zebra token leads; the shared stripe is its fallback.
    expect(zebra).toContain("var(--docs-code-zebra,var(--docs-zebra,");

    // Body padding: top/bottom on the scroll body, horizontal on the cell.
    const scroll = cls("[data-code-scroll]");
    expect(scroll).toContain("pt-[var(--docs-code-pad-top,0px)]");
    expect(scroll).toContain("pb-[var(--docs-code-pad-bottom,8px)]");
    expect(CODE_CELL_CLASSES).toContain("px-[var(--docs-code-pad-x,12px)]");

    // Header band: height on the cell; size, weight and color on the label.
    expect(cls("[data-code-header]")).toContain("h-[var(--docs-code-header-height,28px)]");
    const label = cls("[data-code-lang]");
    expect(label).toContain("text-[length:var(--docs-code-header-text-size,10px)]");
    expect(label).toContain("[font-weight:var(--docs-code-header-weight,500)]");
    expect(label).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");

    // None of the literals the tokens replaced survive beside them.
    for (const literal of ["h-5", "h-7", "3rem", "text-xs", "leading-[20px]", "pb-2", "pr-2"]) {
      expect(container.innerHTML).not.toContain(literal);
    }
    expect(CODE_CELL_CLASSES).not.toContain("px-3");
  });

  it("the frame reads border width, radius and code typography from their tokens", () => {
    expect(CODE_BLOCK_CLASSES).toContain("border-[length:var(--docs-code-border-width,1px)]");
    expect(CODE_BLOCK_CLASSES).toContain("rounded-[var(--docs-code-radius,6px)]");
    expect(CODE_BLOCK_CLASSES).toContain("text-[length:var(--docs-code-text-size,12px)]");
    expect(CODE_BLOCK_CLASSES).toContain("leading-[var(--docs-code-line-height,20px)]");
    expect(CODE_BLOCK_CLASSES).toContain("border-[color:var(--docs-code-block-border,var(--border))]");
    expect(CODE_BLOCK_CLASSES).not.toContain("rounded-md");
    expect(CODE_BLOCK_CLASSES).not.toContain("text-xs");
    expect(CODE_BLOCK_CLASSES.split(" ")).not.toContain("border");
  });

  it("hides the language label when no language resolves", () => {
    const { container } = renderShell({ languageLabel: null });
    expect(container.querySelector("[data-code-lang]")).toBeNull();
    // The copy button still renders.
    expect(container.querySelector("[data-code-copy]")).toBeTruthy();
  });

  it("copies the displayed text and shows a transient Copied confirmation", async () => {
    const written: string[] = [];
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
    try {
      const { container, findByText } = renderShell();
      fireEvent.click(container.querySelector("[data-code-copy]")!);
      expect(written).toEqual([CODE]);
      expect(await findByText("Copied")).toBeTruthy();
      expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  it("is a no-op when the Clipboard API is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    try {
      const { container } = renderShell();
      fireEvent.click(container.querySelector("[data-code-copy]")!);
      expect(container.querySelector("[data-code-copy]")?.textContent).toBe("");
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });
});
