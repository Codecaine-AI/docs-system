import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CodeShell } from "../components/code/CodeShell";
import { highlightCode, resolveDisplayLanguage } from "../components/code/highlight";
import { CODE_CELL_CLASSES } from "../components/code/classes";

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
  it.each([
    ["returns the declared language when a grammar (or alias) matches, normalized", () => {
      expect(resolveDisplayLanguage("const a = 1;", "ts")).toBe("ts");
      expect(resolveDisplayLanguage("x", " TypeScript ")).toBe("typescript");
      // A TOML config block gets its label and colors, like the json and typescript listings beside it.
      expect(resolveDisplayLanguage('command = "bun"', "toml")).toBe("toml");
      expect(highlightCode('command = "bun"', "toml")[0]).toContain("hljs-string");
      expect(resolveDisplayLanguage("echo hi", "shell")).toBe("shell");
    }],
    ["sniffs undeclared JSON so the label can show json", () => {
      expect(resolveDisplayLanguage('{"a": 1}')).toBe("json");
      expect(resolveDisplayLanguage("[1, 2]")).toBe("json");
    }],
  ])("%s", (_title: string, run: () => void | Promise<void>) => run());

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
