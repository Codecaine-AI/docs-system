import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CardShell, ProseRows, RangeChip, formatLineRange } from "../components/linked-panels";

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

  it("renders the mono chip with the shared accent styling", () => {
    const { container } = render(<RangeChip end={7} start={2} />);
    const chip = container.querySelector("[data-range-chip]") as HTMLElement;
    expect(chip.textContent).toBe("L2–7");
    expect(chip.className).toContain("font-mono");
    expect(chip.className).toContain("font-bold");
    expect(chip.className).toContain("whitespace-nowrap");
    expect(chip.className).toContain("--docs-code-annotation-accent");
  });
});

describe("CardShell", () => {
  it("renders the rounded bordered card with an uppercase-mono header bar", () => {
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
    expect(bar.className).toContain("uppercase");
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
