import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CodeShell } from "../components/code/CodeShell";
import { highlightCode, resolveDisplayLanguage } from "../components/code/highlight";
import { CODE_CELL_CLASSES } from "../components/code/classes";

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
    expect(label?.className).toContain("text-muted-foreground");
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
    expect(header.className).toContain("h-7");
    expect(header.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
    expect(header.className).toContain("var(--docs-code-rule,var(--border))");
    expect(header.className).toContain("--docs-code-rule-opacity");
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
