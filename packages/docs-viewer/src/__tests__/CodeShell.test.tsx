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

function renderShell(overrides?: {
  languageLabel?: string | null;
  copyText?: () => string;
  frameAttributes?: Record<string, string | undefined>;
}) {
  return render(
    <CodeShell
      languageLabel={overrides?.languageLabel === undefined ? "ts" : overrides.languageLabel}
      copyText={overrides?.copyText ?? (() => CODE)}
      lineCount={CODE.split("\n").length}
      frameAttributes={overrides?.frameAttributes}
    >
      <pre className={CODE_CELL_CLASSES}>
        <code
          className="hljs"
          dangerouslySetInnerHTML={{ __html: highlightCode(CODE, "ts").join("\n") }}
        />
      </pre>
    </CodeShell>,
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
  it("renders the header strip — family tile, lowercase mono label, copy — one gutter line per code line, and the zebra layer", () => {
    const { container } = renderShell();

    const header = container.querySelector("[data-code-header]")!;
    expect(header).toBeTruthy();
    // Strip order: code family tile, language label, copy button.
    const tile = header.querySelector("[data-code-tile]");
    expect(tile?.getAttribute("data-code-tile")).toBe("code");
    expect(header.firstElementChild).toBe(tile);
    expect(header.lastElementChild?.hasAttribute("data-code-copy")).toBe(true);

    const label = container.querySelector("[data-code-lang]");
    expect(label?.textContent).toBe("ts");
    // Quiet label: lowercase mono as authored (never the old caps), no pill.
    expect(label?.className).toContain("font-mono");
    expect(label?.className).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");
    expect(label?.className).not.toContain("uppercase");
    expect(label?.className).not.toContain("font-display");
    expect(label?.className).not.toContain("bg-");
    expect(label?.className).not.toContain("border");

    const gutterLines = container.querySelectorAll("[data-code-gutter-line]");
    expect(gutterLines.length).toBe(3);
    expect(gutterLines[0]?.textContent).toBe("1");
    expect(gutterLines[2]?.textContent).toBe("3");

    const zebra = container.querySelector("[data-code-zebra]");
    expect(zebra).toBeTruthy();
    expect(zebra?.className).toContain("repeating-linear-gradient");
    // Code never stripes by default (transparent fallback); the knob and its
    // opacity dial stay wired.
    expect(zebra?.className).toContain("var(--docs-code-zebra,var(--docs-zebra,transparent))");
    expect(zebra?.className).toContain("opacity-[var(--docs-code-zebra-opacity,1)]");

    // The code cell keeps the pre>code hljs shape.
    expect(container.querySelector("pre code.hljs")).toBeTruthy();
    // No notes aside on the plain surface.
    expect(container.querySelector("[data-code-notes]")).toBeNull();
  });

  it("keeps the copy button always visible with a keyboard focus ring", () => {
    const { container } = renderShell();
    const copy = container.querySelector<HTMLButtonElement>("[data-code-copy]")!;
    expect(copy.tagName).toBe("BUTTON");
    expect(copy.getAttribute("aria-label")).toBe("Copy code");
    // No hover-only reveal.
    expect(copy.className).not.toContain("opacity-0");
    expect(copy.className).toContain("focus-visible:outline-[color:var(--docs-focus-ring,");
  });

  it("renders the panel frame itself: a bare [data-code-surface] with no notes layout", () => {
    const { container } = renderShell({ frameAttributes: { "data-language": "ts" } });

    // The frame is the shell's root: the code-panel marker, the group/code
    // hover hook, the caller's frame attributes, and the block frame classes.
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.getAttribute("data-code-surface")).toBe("true");
    expect(frame.getAttribute("data-language")).toBe("ts");
    expect(frame.classList.contains("group/code")).toBe(true);
    expect(frame.className).toContain("border-[length:var(--docs-code-border-width,1px)]");
    expect(frame.querySelector("[data-code-header]")).toBeTruthy();
    // No notes: no layout container, no notes column, no notes header.
    expect(container.querySelector("[data-code-layout]")).toBeNull();
    expect(container.querySelector("[data-code-notes]")).toBeNull();
    expect(container.querySelector("[data-code-notes-header]")).toBeNull();
    // The header keeps the standardized subtle bottom rule over its own lift.
    const header = container.querySelector("[data-code-header]")!;
    expect(header.className).toContain("h-[var(--docs-code-header-height,32px)]");
    expect(header.className).toContain("bg-[color:var(--docs-code-header-bg,");
    expect(header.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
    expect(header.className).toContain("var(--docs-code-rule,var(--border))");
    expect(header.className).toContain("--docs-code-rule-opacity");
  });

  it("reads every tunable metric from its token, with the stock value as the fallback", () => {
    const { container } = renderShell();
    const cls = (selector: string) => container.querySelector(selector)!.className;

    // Code typography + gutter column on the content wrapper.
    const content = cls("[data-code-content]");
    expect(content).toContain("text-[length:var(--docs-code-text-size,13px)]");
    expect(content).toContain("leading-[var(--docs-code-line-height,21px)]");
    expect(content).toContain("grid-cols-[var(--docs-code-gutter-width,40px)_1fr]");

    // Gutter rows: line height, number size, right padding.
    const gutterLine = cls('[data-code-gutter-line="1"]');
    expect(gutterLine).toContain("h-[var(--docs-code-line-height,21px)]");
    expect(gutterLine).toContain("leading-[var(--docs-code-line-height,21px)]");
    expect(gutterLine).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(gutterLine).toContain("pr-[var(--docs-code-gutter-pad-x,12px)]");
    // ...and the number color survives next to the size (cn() must not
    // treat the two text-[...] utilities as one group). Line numbers paint
    // the token as-is; the fallback is the light default.
    expect(gutterLine).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");

    // Zebra: starts at the gutter edge, period = 2 x the line-height token.
    const zebra = cls("[data-code-zebra]");
    expect(zebra).toContain("left-[var(--docs-code-gutter-width,40px)]");
    expect(zebra).toContain("transparent_0_var(--docs-code-line-height,21px)");
    expect(zebra).toContain("calc(var(--docs-code-line-height,21px)*2)");

    // Body padding: top/bottom on the scroll body, horizontal on the cell.
    const scroll = cls("[data-code-scroll]");
    expect(scroll).toContain("pt-[var(--docs-code-pad-top,12px)]");
    expect(scroll).toContain("pb-[var(--docs-code-pad-bottom,12px)]");
    expect(CODE_CELL_CLASSES).toContain("px-[var(--docs-code-pad-x,12px)]");

    // Header strip: height on the strip; size, weight and color on the label.
    expect(cls("[data-code-header]")).toContain("h-[var(--docs-code-header-height,32px)]");
    const label = cls("[data-code-lang]");
    expect(label).toContain("text-[length:var(--docs-code-header-text-size,12px)]");
    expect(label).toContain("[font-weight:var(--docs-code-header-weight,400)]");
    expect(label).toContain("text-[color:var(--docs-code-header-fg,var(--muted-foreground))]");

    // None of the literals the tokens replaced survive beside them.
    for (const literal of ["h-5", "h-7", "3rem", "text-xs", "leading-[20px]", "pb-2", "pr-2"]) {
      expect(container.innerHTML).not.toContain(literal);
    }
    expect(CODE_CELL_CLASSES).not.toContain("px-3");
  });

  it("the frame reads border width, radius and code typography from their tokens", () => {
    expect(CODE_BLOCK_CLASSES).toContain("border-[length:var(--docs-code-border-width,1px)]");
    expect(CODE_BLOCK_CLASSES).toContain("rounded-[var(--docs-code-radius,var(--radius,2px))]");
    expect(CODE_BLOCK_CLASSES).toContain("text-[length:var(--docs-code-text-size,13px)]");
    expect(CODE_BLOCK_CLASSES).toContain("leading-[var(--docs-code-line-height,21px)]");
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
