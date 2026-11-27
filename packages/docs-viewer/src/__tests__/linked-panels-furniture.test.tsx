import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { RangeChip, formatLineRange, formatLinesKey } from "../components/linked-panels";

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
