import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
  CardShell,
  ProseRows,
  RangeChip,
  formatLineRange,
  formatLinesKey,
} from "../components/linked-panels";

afterEach(() => {
  cleanup();
});

describe("RangeChip", () => {
  it("formats a single line as L# and a span as L#–# with an en dash (R2)", () => {
    expect(formatLineRange(4)).toBe("L4");
    expect(formatLineRange(4, 4)).toBe("L4");
    expect(formatLineRange(2, 7)).toBe("L2–7");
    // Reversed input normalizes.
    expect(formatLineRange(7, 2)).toBe("L2–7");
  });

  it("formats an annotation lines key segment by segment (L1, L4–6)", () => {
    expect(formatLinesKey("4")).toBe("L4");
    expect(formatLinesKey("4-9")).toBe("L4–9");
    expect(formatLinesKey("1,4-6")).toBe("L1, L4–6");
    // Whitespace and empty segments are tolerated; reversed spans normalize.
    expect(formatLinesKey(" 2 - 3 , ,5")).toBe("L2–3, L5");
    expect(formatLinesKey("9-4")).toBe("L4–9");
    // Unparseable segments pass through trimmed instead of vanishing.
    expect(formatLinesKey("1, not-a-range")).toBe("L1, not-a-range");
  });

  it("renders a quiet 12px mono outlined chip in the page muted color", () => {
    const { container } = render(<RangeChip end={7} start={2} />);
    const chip = container.querySelector("[data-range-chip]") as HTMLElement;
    expect(chip.textContent).toBe("L2–7");
    expect(chip.className).toContain("font-mono");
    expect(chip.className).toContain("text-[12px]");
    expect(chip.className).toContain("whitespace-nowrap");
    expect(chip.className).toContain("text-[color:var(--docs-muted,");
    // Not the old bold annotation-accent chip.
    expect(chip.className).not.toContain("font-bold");
    expect(chip.className).not.toContain("--docs-code-annotation-accent");
    expect(chip.className).not.toContain("--docs-link,");
  });

  it("takes a lines key instead of start/end, and turns to the link color when lit", () => {
    const { container, rerender } = render(<RangeChip lines="1,4-6" />);
    const chip = () => container.querySelector("[data-range-chip]") as HTMLElement;
    expect(chip().textContent).toBe("L1, L4–6");
    expect(chip().className).not.toContain("--docs-link,");
    rerender(<RangeChip lines="1,4-6" lit />);
    expect(chip().textContent).toBe("L1, L4–6");
    expect(chip().className).toContain("text-[color:var(--docs-link,");
    // The lit text color replaces the muted one (cn() keeps the later utility).
    expect(chip().className).not.toContain("--docs-muted");
  });
});

describe("CardShell", () => {
  it("renders the rounded bordered card with a 12px mono header bar, as authored (no caps)", () => {
    const { container, getByText } = render(
      <CardShell label="state — StateShapeState" legend="structure ↔ example">
        <div data-testid="body">body</div>
      </CardShell>,
    );
    const card = container.querySelector("[data-card-shell]") as HTMLElement;
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border");
    expect(card.className).toContain("overflow-hidden");
    const bar = container.querySelector("[data-card-shell-bar]") as HTMLElement;
    expect(bar.className).toContain("font-mono");
    expect(bar.className).toContain("text-[12px]");
    expect(bar.className).not.toContain("uppercase");
    expect(bar.className).toContain("justify-between");
    expect(bar.className).toContain("border-b");
    expect(getByText("state — StateShapeState")).toBeTruthy();
    expect(getByText("structure ↔ example")).toBeTruthy();
    expect(getByText("body")).toBeTruthy();
  });

  it("omits the legend slot when no legend is given", () => {
    const { container } = render(<CardShell label="typescript">content</CardShell>);
    expect(container.querySelector("[data-card-shell-label]")?.textContent).toBe("typescript");
    expect(container.querySelector("[data-card-shell-legend]")).toBeNull();
  });
});

describe("ProseRows", () => {
  it("divides rows with hairlines and never zebra-stripes (R4)", () => {
    const { container } = render(
      <ProseRows>
        <div>one</div>
        <div>two</div>
        <div>three</div>
      </ProseRows>,
    );
    const stack = container.querySelector("[data-prose-rows]") as HTMLElement;
    expect(stack.className).toContain("divide-y");
    expect(stack.className).toContain("var(--docs-code-rule,var(--border))");
    expect(stack.className).not.toContain("--docs-zebra");
    expect(stack.children.length).toBe(3);
  });
});
