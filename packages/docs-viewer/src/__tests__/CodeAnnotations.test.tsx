import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotatedCodeBlock } from "../components/code/CodeAnnotations";

afterEach(() => {
  cleanup();
});

const CODE = ["const a = 1;", "const b = 2;", "const c = a + b;", "console.log(c);"].join("\n");

function renderBlock(
  annotations: Array<{ lines: string; label?: string; note: string }>,
  code: string = CODE,
) {
  return render(
    <AnnotatedCodeBlock id="code-1" language="ts" code={code} annotations={annotations} />,
  );
}

/**
 * Highlighted code lines are hljs token `<span>`s inside the `<code>`
 * element, so whole-line text lookups match on the element's textContent
 * instead of testing-library's direct-text-node default.
 */
function codeLineWithText(expected: string) {
  return screen.getByText(
    (_content, element) => element?.tagName === "CODE" && element.textContent === expected,
  );
}

describe("AnnotatedCodeBlock", () => {
  it("renders code with line numbers and chipless note rows keyed by their lines title", () => {
    const { container } = renderBlock([
      { lines: "1-2", label: "Setup", note: "Declares the inputs." },
      { lines: "4", note: "Prints the result." },
    ]);

    expect(codeLineWithText("const a = 1;")).toBeTruthy();
    expect(codeLineWithText("console.log(c);")).toBeTruthy();
    expect(container.querySelector('[data-code-annotations="code-1"]')).toBeTruthy();
    expect(screen.queryByText("Annotated Code")).toBeNull();
    // Line-number gutter (the row's first span; "1" also appears as an
    // hljs-number token in the highlighted code, so target the gutter cell).
    expect(container.querySelector('[data-code-line="1"] > span')?.textContent).toBe("1");
    expect(container.querySelector('[data-code-line="4"] > span')?.textContent).toBe("4");
    // No L#–# chips in the notes — the raw lines key rides in the note
    // button's title attribute; pairing shows through hover/pin extents.
    expect(container.querySelector("[data-range-chip]")).toBeNull();
    expect(
      container.querySelector('[data-annotation-note="0"]')?.getAttribute("title"),
    ).toBe("1-2");
    expect(
      container.querySelector('[data-annotation-note="1"]')?.getAttribute("title"),
    ).toBe("4");
    expect(screen.getByText("Setup")).toBeTruthy();
    expect(screen.getByText("Setup").className).toContain("font-semibold");
    expect(screen.getByText("Declares the inputs.")).toBeTruthy();
    expect(screen.getByText("Prints the result.")).toBeTruthy();
  });

  it("keeps a multi-segment lines key readable via the note's title attribute", () => {
    const { container } = renderBlock([{ lines: "1,3-4", note: "Scattered." }]);
    expect(container.querySelector("[data-range-chip]")).toBeNull();
    expect(
      container.querySelector('[data-annotation-note="0"]')?.getAttribute("title"),
    ).toBe("1,3-4");
  });

  it("renders the shared header row: quiet language label and ghost copy button", () => {
    const { container } = renderBlock([{ lines: "1", note: "Setup." }]);

    const header = container.querySelector("[data-code-header]");
    expect(header).toBeTruthy();
    const lang = container.querySelector("[data-code-lang]");
    expect(lang?.textContent).toBe("ts");
    // No pill: quiet muted text without background or border.
    expect(lang?.className).not.toContain("bg-");
    expect(lang?.className).not.toContain("border");
    expect(container.querySelector("[data-code-copy]")).toBeTruthy();
  });

  it("aligns the code and notes header cells: same height, shared bottom rule, NOTES styled like the language label", () => {
    const { container } = renderBlock([{ lines: "1", note: "Setup." }]);

    const codeHeader = container.querySelector("[data-code-header]")!;
    const notesHeader = container.querySelector("[data-code-notes-header]")!;
    expect(notesHeader).toBeTruthy();
    for (const cell of [codeHeader, notesHeader]) {
      expect(cell.className).toContain("h-7");
      expect(cell.className).toContain("items-center");
      // The standardized rule: width + color-mix over the rule tokens, so the
      // line reads continuously across both columns.
      expect(cell.className).toContain("border-b-[length:var(--docs-code-rule-width,1px)]");
      expect(cell.className).toContain("var(--docs-code-rule,var(--border))");
      expect(cell.className).toContain("--docs-code-rule-opacity");
    }
    // The NOTES label is styled EXACTLY like the language label.
    const langLabel = container.querySelector("[data-code-lang]")!;
    const notesLabel = notesHeader.querySelector("span")!;
    expect(notesLabel.textContent).toBe("Notes");
    expect(notesLabel.className).toBe(langLabel.className);
    // The vertical column divider runs through the same rule tokens.
    const aside = container.querySelector("[data-code-notes]")!;
    expect(aside.className).toContain("lg:border-l-[length:var(--docs-code-rule-width,1px)]");
    expect(aside.className).toContain("var(--docs-code-rule,var(--border))");
    // Stacked mode: the same rule as a top divider instead.
    expect(aside.className).toContain("border-t-[length:var(--docs-code-rule-width,1px)]");
    expect(aside.className).toContain("lg:border-t-0");
  });

  it("draws a hairline divider between note items, never above the first — notes never stripe", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "2", note: "Second." },
      { lines: "3", note: "Third." },
    ]);

    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;
    expect(note(0).className).not.toContain("border-t");
    for (const i of [1, 2]) {
      expect(note(i).className).toContain("border-t-[length:var(--docs-code-rule-width,1px)]");
      expect(note(i).className).toContain("var(--docs-code-rule,var(--border))");
      expect(note(i).className).toContain("--docs-code-rule-opacity");
    }
    // Prose rows never zebra (R4): no note carries the stripe token at rest.
    for (const i of [0, 1, 2]) {
      expect(note(i).className).not.toContain("--docs-zebra");
    }
  });

  it("renders notes as plain buttons — no card border, background, or ring at rest", () => {
    const { container } = renderBlock([{ lines: "1", label: "Setup", note: "Setup." }]);

    const note = container.querySelector('[data-annotation-note="0"]')!;
    expect(note.tagName).toBe("BUTTON");
    expect(note.className).not.toContain("border");
    expect(note.className).not.toContain("bg-");
    expect(note.className).not.toContain("ring");
    // No chip element renders in the note at all.
    expect(container.querySelector("[data-range-chip]")).toBeNull();
  });

  // NOTE: rewritten for the v2 zebra rule (state-shape docs v2, R4). The old
  // test ("zebra-stripes only unannotated rows...") encoded the previous
  // convention where annotated rows dropped the stripe.
  it("zebra-stripes ALL even rows — annotated included — with the shared --docs-zebra token", () => {
    const { container } = renderBlock([{ lines: "2", note: "n" }]);

    const row = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    // Even rows stripe, the annotated row 2 included; the color rides the
    // shared --docs-zebra token with the opacity knob composed in.
    for (const n of [2, 4]) {
      expect(row(n).className).toContain("--docs-zebra");
      expect(row(n).className).toContain("--docs-code-zebra-opacity");
    }
    // Odd rows never stripe.
    for (const n of [1, 3]) {
      expect(row(n).className).not.toContain("--docs-zebra");
    }
    // Annotated rows rest untinted by the wash — no data-lit, no link bg; the
    // resting signal lives on the gutter cell (2px accent bar + accent
    // number, no bg fill, no pin color yet).
    expect(row(2).hasAttribute("data-lit")).toBe(false);
    expect(row(2).className).not.toContain("--docs-link-bg");
    const gutterCell = row(2).querySelector("span")!;
    expect(gutterCell.className).toContain("border-[color:var(--docs-code-annotation-accent");
    expect(gutterCell.className).not.toContain("--docs-link-pin");
    expect(gutterCell.className).not.toContain(
      "bg-[color:color-mix(in_srgb,var(--docs-code-annotation-accent",
    );
    // 20px line metrics + 3rem gutter column.
    expect(row(1).className).toContain("h-5");
    expect(row(1).className).toContain("grid-cols-[3rem_1fr]");
    // The sky-* utilities are fully migrated to the accent var.
    expect(container.innerHTML).not.toContain("sky-");
  });

  it("lights the full extent on note hover — wash + rail + pin gutter numbers — and the wash overrides zebra", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;

    // Rest: nothing lit.
    expect(line(3).hasAttribute("data-lit")).toBe(false);
    expect(line(3).className).not.toContain("--docs-link-bg");

    // Hovering the note lights EVERY line of its extent: wash + 3px inset
    // pin rail on the rows, pin-color bold gutter numbers.
    fireEvent.mouseEnter(note(1));
    expect(line(3).getAttribute("data-lit")).toBe("true");
    expect(line(4).getAttribute("data-lit")).toBe("true");
    expect(line(3).className).toContain("--docs-link-bg");
    expect(line(3).className).toContain("inset_3px_0_0_var(--docs-link-pin");
    const gutter3 = line(3).querySelector("span")!;
    expect(gutter3.className).toContain("font-bold");
    expect(gutter3.className).toContain("--docs-link-pin");
    // The gutter cell re-pins the rail at the gutter edge (its sticky opaque
    // background would otherwise hide the row's rail) and layers the wash.
    expect(gutter3.className).toContain("inset_3px_0_0_var(--docs-link-pin");
    expect(gutter3.className).toContain("--docs-link-bg");
    // Lit even line: the wash replaces the zebra stripe (R4 override).
    expect(line(4).className).toContain("--docs-link-bg");
    expect(line(4).className).not.toContain("--docs-zebra");
    // The note itself is lit but not pinned.
    expect(note(1).getAttribute("data-lit")).toBe("true");
    expect(note(1).className).toContain("--docs-link-bg");
    expect(note(1).hasAttribute("data-pinned")).toBe(false);
    // The un-hovered pair stays dark.
    expect(line(1).hasAttribute("data-lit")).toBe(false);

    // Mouse-leave unlights when nothing is pinned.
    fireEvent.mouseLeave(note(1));
    expect(line(3).hasAttribute("data-lit")).toBe(false);
    expect(line(3).className).not.toContain("--docs-link-bg");
    expect(note(1).className).not.toContain("--docs-link-bg");
  });

  it("click pins: the pin survives hover-out, adds the ring, and Escape clears it", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;

    fireEvent.mouseEnter(note(0));
    fireEvent.click(note(0));
    fireEvent.mouseLeave(note(0));
    expect(note(0).getAttribute("data-pinned")).toBe("true");
    expect(line(1).getAttribute("data-pinned")).toBe("true");
    expect(line(1).getAttribute("data-lit")).toBe("true");
    expect(line(1).className).toContain("0_0_0_1.5px_var(--docs-link-pin");

    // Hovering another pair lights it while the pin stays lit underneath.
    fireEvent.mouseEnter(note(1));
    expect(line(3).getAttribute("data-lit")).toBe("true");
    expect(line(1).getAttribute("data-lit")).toBe("true");
    expect(line(3).hasAttribute("data-pinned")).toBe(false);
    fireEvent.mouseLeave(note(1));
    expect(line(1).getAttribute("data-lit")).toBe("true");
    expect(line(3).hasAttribute("data-lit")).toBe(false);

    // Escape clears the pin (and with it the lighting).
    fireEvent.keyDown(window, { key: "Escape" });
    expect(note(0).hasAttribute("data-pinned")).toBe(false);
    expect(line(1).hasAttribute("data-lit")).toBe(false);
  });

  it("pairs pins across code and notes: line click pins, another pin switches, same pin toggles off", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;

    // Clicking an annotated line pins its pair — the full extent.
    fireEvent.click(line(3));
    expect(note(1).getAttribute("data-pinned")).toBe("true");
    expect(line(3).getAttribute("data-pinned")).toBe("true");
    expect(line(4).getAttribute("data-pinned")).toBe("true");
    expect(note(0).hasAttribute("data-pinned")).toBe(false);
    expect(line(1).hasAttribute("data-pinned")).toBe(false);

    // Pinning another note switches the pin (one pin per group).
    fireEvent.click(note(0));
    expect(note(0).getAttribute("data-pinned")).toBe("true");
    expect(line(1).getAttribute("data-pinned")).toBe("true");
    expect(note(1).hasAttribute("data-pinned")).toBe(false);
    expect(line(3).hasAttribute("data-pinned")).toBe(false);

    // Clicking the pinned pair again clears it.
    fireEvent.click(note(0));
    expect(note(0).hasAttribute("data-pinned")).toBe(false);
    expect(line(1).hasAttribute("data-pinned")).toBe(false);

    // Plain lines are not link targets: clicking one neither pins nor clears
    // (Escape is the clear gesture now).
    fireEvent.click(line(4));
    expect(note(1).getAttribute("data-pinned")).toBe("true");
    fireEvent.click(line(2));
    expect(note(1).getAttribute("data-pinned")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(note(1).hasAttribute("data-pinned")).toBe(false);
  });

  it("is keyboard reachable: annotated lines join the tab order, focus lights, Enter pins", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;

    expect(line(3).getAttribute("tabindex")).toBe("0");
    expect(line(2).hasAttribute("tabindex")).toBe(false);

    fireEvent.focus(line(3));
    expect(line(4).getAttribute("data-lit")).toBe("true");
    expect(note(1).getAttribute("data-lit")).toBe("true");
    fireEvent.keyDown(line(3), { key: "Enter" });
    expect(note(1).getAttribute("data-pinned")).toBe("true");
    fireEvent.blur(line(3));
    expect(note(1).getAttribute("data-lit")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(note(1).hasAttribute("data-pinned")).toBe(false);
  });

  it("copies the displayed (pretty-printed) code from the header button", async () => {
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
      const { container } = render(
        <AnnotatedCodeBlock
          id="code-json"
          language="json"
          code='{"a":1}'
          annotations={[{ lines: "1", note: "n" }]}
        />,
      );
      fireEvent.click(container.querySelector("[data-code-copy]")!);
      // WYSIWYG: the pretty-printed display form, not the stored one-liner.
      expect(written).toEqual(['{\n  "a": 1\n}']);
      expect(await screen.findByText("Copied")).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  it("marks exactly the lines covered by annotation ranges, keyed by the lines key", () => {
    const { container } = renderBlock([{ lines: "2-3", note: "The math." }]);

    const annotated = Array.from(container.querySelectorAll("[data-annotated]")).map((el) =>
      el.getAttribute("data-code-line"),
    );
    expect(annotated).toEqual(["2", "3"]);
    expect(container.querySelector('[data-code-line="1"]')?.hasAttribute("data-annotated")).toBe(
      false,
    );
    expect(container.querySelector('[data-code-line="2"]')?.getAttribute("data-link-key")).toBe(
      "2-3",
    );
  });

  it("clamps out-of-range annotations and ignores empty ranges without crashing", () => {
    const { container } = renderBlock([
      { lines: "3-99", note: "Clamped to the end." },
      { lines: "50-60", note: "Fully out of range." },
      { lines: "not-a-range", note: "Unparseable." },
    ]);

    // 3-99 clamps to 3-4; the other two highlight nothing.
    const annotated = Array.from(container.querySelectorAll("[data-annotated]")).map((el) =>
      el.getAttribute("data-code-line"),
    );
    expect(annotated).toEqual(["3", "4"]);
    // All notes still render (chipless); the AUTHORED key — parseable or
    // not — rides in each note button's title attribute.
    expect(screen.getByText("Clamped to the end.")).toBeTruthy();
    expect(screen.getByText("Fully out of range.")).toBeTruthy();
    expect(screen.getByText("Unparseable.")).toBeTruthy();
    const titles = Array.from(container.querySelectorAll("[data-annotation-note]")).map((el) =>
      el.getAttribute("title"),
    );
    expect(titles).toEqual(["3-99", "50-60", "not-a-range"]);
  });

  it("highlights code lines with hljs token spans", () => {
    const { container } = renderBlock([{ lines: "1", note: "Setup." }]);

    const firstLine = container.querySelector('[data-code-line="1"] code')!;
    expect(firstLine.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(firstLine.querySelector(".hljs-number")?.textContent).toBe("1");
    expect(firstLine.textContent).toBe("const a = 1;");
  });

  it("pretty-prints one-liner JSON so annotation ranges target the nested form", () => {
    const { container } = render(
      <AnnotatedCodeBlock
        id="code-json"
        language="json"
        code='{"name":"app","deps":["a","b"]}'
        annotations={[{ lines: "3-6", note: "The dependency list." }]}
      />,
    );

    // Display-only pretty-print: 1 line in, 7 nested lines out.
    expect(container.querySelectorAll("[data-code-line]").length).toBe(7);
    const annotated = Array.from(container.querySelectorAll("[data-annotated]")).map((el) =>
      el.getAttribute("data-code-line"),
    );
    expect(annotated).toEqual(["3", "4", "5", "6"]);
    // JSON keys/strings tokenized.
    expect(container.querySelector(".hljs-attr")?.textContent).toBe('"name"');
    // Click pairing still works over the pretty-printed lines.
    fireEvent.click(container.querySelector('[data-code-line="4"]')!);
    expect(
      container.querySelector('[data-annotation-note="0"]')!.hasAttribute("data-pinned"),
    ).toBe(true);
  });

  it("resolves overlapping annotations to the earliest note on line click", () => {
    const { container } = renderBlock([
      { lines: "1-3", note: "Wide." },
      { lines: "2", note: "Narrow overlap." },
    ]);

    fireEvent.click(container.querySelector('[data-code-line="2"]')!);
    expect(
      container.querySelector('[data-annotation-note="0"]')!.hasAttribute("data-pinned"),
    ).toBe(true);
    expect(
      container.querySelector('[data-annotation-note="1"]')!.hasAttribute("data-pinned"),
    ).toBe(false);
  });
});
