import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnnotatedCodeBlock } from "../docs-blocks/code/CodeAnnotations";

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

describe("AnnotatedCodeBlock", () => {
  it("renders code with line numbers and the note cards", () => {
    renderBlock([
      { lines: "1-2", label: "Setup", note: "Declares the inputs." },
      { lines: "4", note: "Prints the result." },
    ]);

    expect(screen.getByText("const a = 1;")).toBeTruthy();
    expect(screen.getByText("console.log(c);")).toBeTruthy();
    expect(screen.getByText("ts")).toBeTruthy();
    // Line-number gutter.
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    // Note cards with L{lines} badges and optional label.
    expect(screen.getByText("L1-2")).toBeTruthy();
    expect(screen.getByText("L4")).toBeTruthy();
    expect(screen.getByText("Setup")).toBeTruthy();
    expect(screen.getByText("Declares the inputs.")).toBeTruthy();
    expect(screen.getByText("Prints the result.")).toBeTruthy();
  });

  it("highlights exactly the lines covered by annotation ranges", () => {
    const { container } = renderBlock([{ lines: "2-3", note: "The math." }]);

    const annotated = Array.from(container.querySelectorAll("[data-annotated]")).map((el) =>
      el.getAttribute("data-code-line"),
    );
    expect(annotated).toEqual(["2", "3"]);
    expect(container.querySelector('[data-code-line="1"]')?.hasAttribute("data-annotated")).toBe(
      false,
    );
  });

  it("pairs highlights on click: code line <-> note card, one active at a time, toggling off", () => {
    const { container } = renderBlock([
      { lines: "1", note: "First." },
      { lines: "3-4", note: "Second." },
    ]);

    const line = (n: number) => container.querySelector(`[data-code-line="${n}"]`)!;
    const note = (i: number) => container.querySelector(`[data-annotation-note="${i}"]`)!;

    // Clicking an annotated line activates its pair.
    fireEvent.click(line(3));
    expect(note(1).hasAttribute("data-active")).toBe(true);
    expect(line(3).hasAttribute("data-active")).toBe(true);
    expect(line(4).hasAttribute("data-active")).toBe(true);
    expect(note(0).hasAttribute("data-active")).toBe(false);
    expect(line(1).hasAttribute("data-active")).toBe(false);

    // Clicking another note switches the active pair (one at a time).
    fireEvent.click(note(0));
    expect(note(0).hasAttribute("data-active")).toBe(true);
    expect(line(1).hasAttribute("data-active")).toBe(true);
    expect(note(1).hasAttribute("data-active")).toBe(false);
    expect(line(3).hasAttribute("data-active")).toBe(false);

    // Clicking the active pair again clears it.
    fireEvent.click(note(0));
    expect(note(0).hasAttribute("data-active")).toBe(false);
    expect(line(1).hasAttribute("data-active")).toBe(false);

    // Clicking a plain line clears any active pair.
    fireEvent.click(line(4));
    expect(note(1).hasAttribute("data-active")).toBe(true);
    fireEvent.click(line(2));
    expect(note(1).hasAttribute("data-active")).toBe(false);
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
    // All notes still render.
    expect(screen.getByText("Clamped to the end.")).toBeTruthy();
    expect(screen.getByText("Fully out of range.")).toBeTruthy();
    expect(screen.getByText("Unparseable.")).toBeTruthy();
  });

  it("resolves overlapping annotations to the earliest note on line click", () => {
    const { container } = renderBlock([
      { lines: "1-3", note: "Wide." },
      { lines: "2", note: "Narrow overlap." },
    ]);

    fireEvent.click(container.querySelector('[data-code-line="2"]')!);
    expect(
      container.querySelector('[data-annotation-note="0"]')!.hasAttribute("data-active"),
    ).toBe(true);
    expect(
      container.querySelector('[data-annotation-note="1"]')!.hasAttribute("data-active"),
    ).toBe(false);
  });
});
