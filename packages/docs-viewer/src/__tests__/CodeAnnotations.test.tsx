import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotatedCodeBlock } from "../components/code/CodeAnnotations";
import {
  CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES,
  CODE_GUTTER_MARK_END_CLASSES,
  CODE_GUTTER_MARK_START_CLASSES,
  CODE_LINE_ROW_LIT_CLASSES,
  CODE_NOTE_LIT_CLASSES,
} from "../components/code/classes";
import { RANGE_CHIP_LIT_CLASSES } from "../components/linked-panels";

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

/** True when the element carries EVERY utility of a state class constant. */
function hasClasses(element: Element, classes: string): boolean {
  return classes.split(" ").every((token) => element.classList.contains(token));
}

/** The resting gutter mark: the annotation accent at 65%, drawn as an ::after bar. */
const RESTING_MARK = "after:bg-[var(--docs-code-annotation-accent,#0b6e99)]/65";

describe("AnnotatedCodeBlock", () => {
  it("renders code with line numbers and note rows that open with their L#–# range chip", () => {
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

    // Each note is one button, stacked: a head row (range chip, then the bold
    // title), then the note text on its own row below.
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;
    expect(note(0).tagName).toBe("BUTTON");
    const [head, body] = Array.from(note(0).children);
    expect(head?.hasAttribute("data-note-head")).toBe(true);
    expect(head?.firstElementChild?.getAttribute("data-range-chip")).toBe("true");
    expect(head?.querySelector("[data-note-title]")?.textContent).toBe("Setup ");
    expect(body?.hasAttribute("data-note-body")).toBe(true);
    expect(body?.textContent).toBe("Declares the inputs.");
    expect(note(1).querySelector("[data-note-title]")).toBeNull();
    expect(note(0).querySelector("[data-range-chip]")?.textContent).toBe("L1–2");
    expect(note(1).querySelector("[data-range-chip]")?.textContent).toBe("L4");
    expect(note(0).textContent).toBe("L1–2Setup Declares the inputs.");
    expect(note(1).textContent).toBe("L4Prints the result.");
    // The authored key stays readable in the title.
    expect(note(0).getAttribute("title")).toBe("Lines 1-2");
    expect(note(1).getAttribute("title")).toBe("Lines 4");
    expect(screen.getByText("Setup").className).toContain("font-semibold");
    expect(screen.getByText("Declares the inputs.")).toBeTruthy();
    expect(screen.getByText("Prints the result.")).toBeTruthy();
  });

  it("addresses a multi-segment lines key segment by segment in the chip", () => {
    const { container } = renderBlock([
      { lines: "1,3-4", note: "Scattered." },
      { lines: "2-3", note: "Span." },
    ]);
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;
    expect(note(0).querySelector("[data-range-chip]")?.textContent).toBe("L1, L3–4");
    expect(note(0).getAttribute("title")).toBe("Lines 1,3-4");
    // Spans take an en dash, not the authored hyphen.
    expect(note(1).querySelector("[data-range-chip]")?.textContent).toBe("L2–3");
  });

  it("renders the shared header strip: code tile, quiet language label, always-visible copy button", () => {
    const { container } = renderBlock([{ lines: "1", note: "Setup." }]);

    const header = container.querySelector("[data-code-header]")!;
    expect(header).toBeTruthy();
    expect(header.querySelector("[data-code-tile]")?.getAttribute("data-code-tile")).toBe("code");
    const lang = container.querySelector("[data-code-lang]");
    expect(lang?.textContent).toBe("ts");
    // No pill, no caps: quiet lowercase mono text without background or border.
    expect(lang?.className).not.toContain("uppercase");
    expect(lang?.className).not.toContain("bg-");
    expect(lang?.className).not.toContain("border");
    const copy = container.querySelector("[data-code-copy]")!;
    expect(copy).toBeTruthy();
    expect(copy.className).not.toContain("opacity-0");
  });

  it("lays the notes column inside the dark panel, beside the code, in a 760px size-container grid", () => {
    const { container } = renderBlock([{ lines: "1", note: "Setup." }]);

    const section = container.querySelector('[data-code-annotations="code-1"]')!;
    const layout = section.querySelector(":scope > [data-code-layout]")!;
    expect(layout).toBeTruthy();
    // A size container: the notes column follows the block's own width.
    expect(layout.className).toContain("@container");
    const frame = layout.firstElementChild!;
    expect(frame.getAttribute("data-code-surface")).toBe("true");
    expect(frame.getAttribute("data-language")).toBe("ts");

    // The frame holds the header strip, then the code | notes body grid.
    const [header, body] = Array.from(frame.children);
    expect(header?.hasAttribute("data-code-header")).toBe(true);
    expect(body?.hasAttribute("data-code-body")).toBe(true);
    expect(body?.className).toContain(
      "@min-[760px]:grid-cols-[minmax(0,1fr)_var(--docs-code-notes-width,280px)]",
    );
    const [pre, aside] = Array.from(body!.children);
    expect(pre?.tagName).toBe("PRE");
    expect(aside?.tagName).toBe("ASIDE");
    expect(aside?.hasAttribute("data-code-notes")).toBe(true);
    expect(aside?.getAttribute("aria-label")).toBe("Code notes");

    // Notes sit INSIDE the code panel, on a lighter surface behind the hairline.
    expect(aside?.closest("[data-code-surface]")).toBe(frame);
    expect(aside?.className).toContain("bg-[color:var(--docs-code-notes-bg,color-mix(in_srgb,var(--docs-code-block-bg,#1e1e1e)_94%,#ffffff))]");
    expect(aside?.className).toContain("@min-[760px]:border-l-[length:var(--docs-code-rule-width,1px)]");

    // No notes header, no "Notes" label.
    expect(container.querySelector("[data-code-notes-header]")).toBeNull();
    expect(screen.queryByText("Notes")).toBeNull();
  });

  it("renders notes as plain buttons at rest — no dividers, card border, background, or ring — and never stripes them", () => {
    const { container } = renderBlock([
      { lines: "1", label: "Setup", note: "First." },
      { lines: "2", note: "Second." },
      { lines: "3", note: "Third." },
    ]);

    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;
    for (const i of [0, 1, 2]) {
      expect(note(i).tagName).toBe("BUTTON");
      expect(note(i).className).not.toContain("border");
      expect(note(i).className).not.toContain("bg-");
      expect(note(i).className).not.toMatch(/(^| )ring-/);
      // Prose rows never zebra (R4).
      expect(note(i).className).not.toContain("--docs-zebra");
      // Keyboard focus draws the shared ring.
      expect(note(i).className).toContain("focus-visible:outline-[color:var(--docs-focus-ring,");
    }
  });

  it("keeps the zebra knob on even rows (transparent by default) and rests annotated rows on the quiet gutter mark", () => {
    const { container } = renderBlock([{ lines: "2", note: "n" }]);

    const row = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    // Even rows carry the code zebra knob, annotated row 2 included; code
    // never stripes by default (transparent fallback), the opacity knob composed in.
    for (const n of [2, 4]) {
      expect(row(n).className).toContain("var(--docs-code-zebra,var(--docs-zebra,transparent))");
      expect(row(n).className).toContain("--docs-code-zebra-opacity");
    }
    // Odd rows never stripe.
    for (const n of [1, 3]) {
      expect(row(n).className).not.toContain("--docs-zebra");
    }
    // Annotated rows rest untinted — no data-lit, no lit tint, no link wash;
    // the resting signal is the gutter cell's quiet accent mark, and the
    // number keeps the gutter color.
    expect(row(2).hasAttribute("data-lit")).toBe(false);
    expect(hasClasses(row(2), CODE_LINE_ROW_LIT_CLASSES)).toBe(false);
    expect(row(2).className).not.toContain("--docs-link-bg");
    const gutterCell = row(2).querySelector("span")!;
    expect(gutterCell.classList.contains(RESTING_MARK)).toBe(true);
    expect(gutterCell.className).toContain("text-[color:var(--docs-code-gutter-fg,");
    expect(gutterCell.className).not.toContain("font-semibold");
    expect(gutterCell.className).not.toContain("--docs-link-pin");
    expect(gutterCell.className).not.toContain("bg-linear-to-b");
    // Plain rows carry no mark.
    expect(row(1).querySelector("span")!.className).not.toContain("after:");
    // Line metrics + gutter column from the code tokens.
    expect(row(1).className).toContain("h-[var(--docs-code-line-height,21px)]");
    expect(row(1).className).toContain("grid-cols-[var(--docs-code-gutter-width,40px)_1fr]");
    // The sky-* utilities are fully migrated to the accent var.
    expect(container.innerHTML).not.toContain("sky-");
  });

  it("insets the gutter mark at each run's first and last line, so adjacent annotations read as two marks", () => {
    const { container } = renderBlock([
      { lines: "1-2", note: "Pair." },
      { lines: "3", note: "Single." },
    ]);
    const gutterCell = (n: number) => container.querySelector(`[data-code-line="${n}"] > span`)!;

    expect(hasClasses(gutterCell(1), CODE_GUTTER_MARK_START_CLASSES)).toBe(true);
    expect(hasClasses(gutterCell(1), CODE_GUTTER_MARK_END_CLASSES)).toBe(false);
    expect(hasClasses(gutterCell(2), CODE_GUTTER_MARK_START_CLASSES)).toBe(false);
    expect(hasClasses(gutterCell(2), CODE_GUTTER_MARK_END_CLASSES)).toBe(true);
    // A one-line run is both its start and its end.
    expect(hasClasses(gutterCell(3), CODE_GUTTER_MARK_START_CLASSES)).toBe(true);
    expect(hasClasses(gutterCell(3), CODE_GUTTER_MARK_END_CLASSES)).toBe(true);
    // Line 4 is unannotated: no mark at all.
    expect(gutterCell(4).className).not.toContain("after:");
  });

  it("lights the full extent on note hover — accent tint, accent numbers and marks, lit chip — and the tint replaces the zebra", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const gutterCell = (n: number) => line(n).querySelector("span")!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;
    const chip = (i: number) => note(i).querySelector("[data-range-chip]")!;

    // Rest: nothing lit.
    expect(line(3).hasAttribute("data-lit")).toBe(false);
    expect(hasClasses(line(3), CODE_LINE_ROW_LIT_CLASSES)).toBe(false);
    expect(hasClasses(chip(1), RANGE_CHIP_LIT_CLASSES)).toBe(false);

    // Hovering the note lights EVERY line of its extent: the accent tint on
    // the rows, accent semibold numbers and full-accent marks in the gutter.
    fireEvent.mouseEnter(note(1));
    for (const n of [3, 4]) {
      expect(line(n).getAttribute("data-lit")).toBe("true");
      expect(hasClasses(line(n), CODE_LINE_ROW_LIT_CLASSES)).toBe(true);
      expect(hasClasses(gutterCell(n), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(true);
      // No rail, no ring, no shared link wash on code lines.
      expect(line(n).className).not.toContain("shadow-");
      expect(line(n).className).not.toContain("--docs-link-bg");
      expect(line(n).className).not.toContain("--docs-link-pin");
      expect(gutterCell(n).className).not.toContain("--docs-link-pin");
    }
    // Lit even line: the tint replaces the zebra stripe.
    expect(line(4).className).not.toContain("--docs-zebra");
    // The note is lit (page ink + link-color chip) but not pinned, and never
    // takes the shared wash/rail.
    expect(note(1).getAttribute("data-lit")).toBe("true");
    expect(hasClasses(note(1), CODE_NOTE_LIT_CLASSES)).toBe(true);
    expect(hasClasses(chip(1), RANGE_CHIP_LIT_CLASSES)).toBe(true);
    expect(note(1).className).not.toContain("--docs-link-bg");
    expect(note(1).className).not.toContain("shadow-");
    expect(note(1).hasAttribute("data-pinned")).toBe(false);
    // The un-hovered pair stays dark.
    expect(line(1).hasAttribute("data-lit")).toBe(false);
    expect(hasClasses(gutterCell(1), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
    expect(hasClasses(chip(0), RANGE_CHIP_LIT_CLASSES)).toBe(false);

    // Mouse-leave unlights when nothing is pinned.
    fireEvent.mouseLeave(note(1));
    expect(line(3).hasAttribute("data-lit")).toBe(false);
    expect(hasClasses(line(3), CODE_LINE_ROW_LIT_CLASSES)).toBe(false);
    expect(hasClasses(gutterCell(3), CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(false);
    expect(note(1).hasAttribute("data-lit")).toBe(false);
    expect(hasClasses(chip(1), RANGE_CHIP_LIT_CLASSES)).toBe(false);
  });

  it("click pins: the pin survives hover-out with the lit tint, and Escape clears it", () => {
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
    expect(hasClasses(line(1), CODE_LINE_ROW_LIT_CLASSES)).toBe(true);
    expect(hasClasses(note(0).querySelector("[data-range-chip]")!, RANGE_CHIP_LIT_CLASSES)).toBe(true);
    // The pin draws no ring on code lines.
    expect(line(1).className).not.toContain("--docs-link-ring-width");

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
    expect(hasClasses(line(1), CODE_LINE_ROW_LIT_CLASSES)).toBe(false);
  });

  it("reads the same code tokens as the plain and edit surfaces", () => {
    const { container } = renderBlock([{ lines: "1-2", label: "Setup", note: "Declares." }]);
    const cls = (selector: string) => container.querySelector(selector)!.className;

    // Frame: token border/radius.
    const frame = cls("[data-code-surface]");
    expect(frame).toContain("border-[length:var(--docs-code-border-width,1px)]");
    expect(frame).toContain("border-[color:var(--docs-code-block-border,var(--border))]");
    expect(frame).toContain("rounded-[var(--docs-code-radius,var(--radius,2px))]");

    // Scroll body: typography + top/bottom padding.
    const pre = cls("pre");
    expect(pre).toContain("text-[length:var(--docs-code-text-size,13px)]");
    expect(pre).toContain("leading-[var(--docs-code-line-height,21px)]");
    expect(pre).toContain("pt-[var(--docs-code-pad-top,12px)]");
    expect(pre).toContain("pb-[var(--docs-code-pad-bottom,12px)]");

    // Per-line row, its gutter cell, and its code cell.
    const row = cls('[data-code-line="3"]');
    expect(row).toContain("h-[var(--docs-code-line-height,21px)]");
    expect(row).toContain("grid-cols-[var(--docs-code-gutter-width,40px)_1fr]");
    const gutterCell = cls('[data-code-line="3"] > span');
    expect(gutterCell).toContain("h-[var(--docs-code-line-height,21px)]");
    expect(gutterCell).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(gutterCell).toContain("pr-[var(--docs-code-gutter-pad-x,12px)]");
    // Line numbers paint the token as-is; the fallback is the light default.
    expect(gutterCell).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");
    expect(gutterCell).toContain("--docs-code-gutter-bg");
    expect(cls('[data-code-line="3"] > code')).toContain("px-[var(--docs-code-pad-x,12px)]");

    // An annotated gutter cell at rest keeps its size AND number color; the
    // mark is the only resting signal.
    const annotatedCell = cls('[data-code-line="1"] > span');
    expect(annotatedCell).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    expect(annotatedCell).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");
    expect(annotatedCell).toContain(RESTING_MARK);

    // Even rows read the CODE zebra token (shared stripe, then transparent, as
    // fallbacks), exactly like the zebra layer of the plain/edit surfaces.
    expect(cls('[data-code-line="4"]')).toContain("var(--docs-code-zebra,var(--docs-zebra,transparent))");

    // Header strip, notes column width, note text.
    expect(cls("[data-code-header]")).toContain("h-[var(--docs-code-header-height,32px)]");
    expect(cls("[data-code-header]")).toContain("bg-[color:var(--docs-code-header-bg,");
    expect(cls("[data-code-lang]")).toContain("text-[length:var(--docs-code-header-text-size,12px)]");
    expect(cls("[data-code-lang]")).toContain("font-[var(--docs-code-header-weight,400)]");
    expect(cls("[data-code-body]")).toContain("var(--docs-code-notes-width,280px)");
    expect(cls('[data-annotation-note="0"] [data-note-body]')).toContain(
      "text-[length:var(--docs-code-note-text-size,13px)]",
    );

    for (const literal of ["h-5", "h-7", "3rem", "text-xs", "leading-[20px]", "pb-2"]) {
      expect(container.innerHTML).not.toContain(literal);
    }
  });

  it("the lit gutter cell layers the tint as a background image over its opaque sticky background", () => {
    const { container } = renderBlock([{ lines: "1", note: "First." }]);
    fireEvent.mouseEnter(container.querySelector('[data-annotation-note="0"]')!);
    const gutterCell = container.querySelector('[data-code-line="1"] > span')!;
    // Lit: accent semibold number, full-accent mark, accent 12% tint image.
    expect(hasClasses(gutterCell, CODE_GUTTER_LINE_ANNOTATED_LIT_CLASSES)).toBe(true);
    expect(gutterCell.className).toContain("bg-linear-to-b");
    // The opaque gutter background survives under horizontal scroll, and the
    // size token stays intact next to the accent color.
    expect(gutterCell.className).toContain("bg-[color:var(--docs-code-gutter-bg,");
    expect(gutterCell.className).toContain("text-[length:var(--docs-code-gutter-text-size,12px)]");
    // The lit color replaces the resting gutter color and mark.
    expect(gutterCell.className).not.toContain("--docs-code-gutter-fg");
    expect(gutterCell.classList.contains(RESTING_MARK)).toBe(false);
    // No rail shadow.
    expect(gutterCell.className).not.toContain("shadow-");
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
    // Annotated lines show the shared focus ring; plain lines are not focusable.
    expect(line(3).className).toContain("focus-visible:outline-[color:var(--docs-focus-ring,");
    expect(line(2).className).not.toContain("focus-visible:");

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
    // All notes still render; the AUTHORED key — parseable or not — rides in
    // each note button's title, and its chip addresses it as authored.
    expect(screen.getByText("Clamped to the end.")).toBeTruthy();
    expect(screen.getByText("Fully out of range.")).toBeTruthy();
    expect(screen.getByText("Unparseable.")).toBeTruthy();
    const titles = Array.from(container.querySelectorAll("[data-annotation-note]")).map((el) =>
      el.getAttribute("title"),
    );
    expect(titles).toEqual(["Lines 3-99", "Lines 50-60", "Lines not-a-range"]);
    const chips = Array.from(container.querySelectorAll("[data-annotation-note] [data-range-chip]")).map(
      (el) => el.textContent,
    );
    expect(chips).toEqual(["L3–99", "L50–60", "not-a-range"]);
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
