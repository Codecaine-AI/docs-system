import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CodeLines, LinkGroup, LinkTarget, type LinkedCodeLine } from "../components/linked-panels";

afterEach(() => {
  cleanup();
});

const LINES: LinkedCodeLine[] = [
  { content: "{" },
  { content: '  "name": "StateShapeState",', linkKey: "name" },
  { content: '  "source": {', linkKey: "source" },
  { content: '    "path": "state.ts"', linkKey: "path" },
  { content: "  },", linkKey: "source" },
  { content: "}" },
];

function line(container: HTMLElement, n: number): HTMLElement {
  return container.querySelector(`[data-code-line="${n}"]`) as HTMLElement;
}

describe("CodeLines", () => {
  it("continues the zebra rhythm through the filler at the line-height token's period", () => {
    // 6 lines -> the first filler band is line 7 (odd): it starts clear.
    const six = render(<CodeLines lines={LINES} />);
    const odd = six.container.querySelector("[data-code-lines-filler]") as HTMLElement;
    expect(odd.getAttribute("data-filler-parity")).toBe("odd");
    expect(odd.className).toContain("repeating-linear-gradient(to_bottom,transparent_0px");
    expect(odd.className).toContain("--docs-zebra");
    expect(odd.className).toContain("calc(var(--docs-link-line-height,21px)*2)");
    six.unmount();

    // 5 lines -> the first filler band is line 6 (even): it starts tinted.
    const five = render(<CodeLines lines={LINES.slice(0, 5)} />);
    const even = five.container.querySelector("[data-code-lines-filler]") as HTMLElement;
    expect(even.getAttribute("data-filler-parity")).toBe("even");
    expect(even.className).toContain("repeating-linear-gradient(to_bottom,var(--docs-zebra");
    expect(even.className).toContain("calc(var(--docs-link-line-height,21px)*2)");
  });

  it("numbers lines locally from 1 per panel instance (R1)", () => {
    const { container } = render(
      <>
        <CodeLines data-testid="first" lines={LINES} />
        <CodeLines data-testid="second" lines={LINES.slice(0, 2)} />
      </>,
    );
    const panels = container.querySelectorAll("[data-code-lines]");
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      const numbers = Array.from(panel.querySelectorAll("[data-line-number]")).map(
        (el) => el.textContent,
      );
      expect(numbers[0]).toBe("1");
      expect(numbers[1]).toBe("2");
    }
    expect(container.querySelectorAll('[data-testid="first"] [data-code-line]').length).toBe(6);
    expect(container.querySelectorAll('[data-testid="second"] [data-code-line]').length).toBe(2);
  });

  it("zebra-stripes even lines only, via the --docs-zebra token, transparent by default (R4)", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    for (const n of [2, 4, 6]) {
      expect(line(container, n).className).toContain("var(--docs-zebra,transparent)");
    }
    for (const n of [1, 3, 5]) {
      expect(line(container, n).className).not.toContain("--docs-zebra");
    }
  });

  it("wires linked lines into the group: hover on a prose target paints the full extent", () => {
    const { container, getByTestId } = render(
      <LinkGroup>
        <CodeLines lines={LINES} />
        <LinkTarget data-testid="note" linkKey="source">
          source note
        </LinkTarget>
      </LinkGroup>,
    );
    // Linked lines carry the key; plain lines stay inert.
    expect(line(container, 3).getAttribute("data-link-key")).toBe("source");
    expect(line(container, 5).getAttribute("data-link-key")).toBe("source");
    expect(line(container, 1).hasAttribute("data-link-key")).toBe(false);

    fireEvent.mouseEnter(getByTestId("note"));
    // First-through-last extent lines light; unrelated lines do not.
    expect(line(container, 3).getAttribute("data-lit")).toBe("true");
    expect(line(container, 5).getAttribute("data-lit")).toBe("true");
    expect(line(container, 2).hasAttribute("data-lit")).toBe(false);
    // Lit line: wash + inset rail replace the zebra (hover overrides both).
    expect(line(container, 3).className).toContain("--docs-link-bg");
    expect(line(container, 3).className).toContain("inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin");
    // Line 4 (even) rests on zebra; when lit via its own key the wash wins.
    fireEvent.mouseLeave(getByTestId("note"));
    fireEvent.mouseEnter(line(container, 4));
    expect(line(container, 4).className).toContain("--docs-link-bg");
    expect(line(container, 4).className).not.toContain("--docs-zebra");
  });

  it("clicking a linked line pins the pair; Escape clears", () => {
    const { container, getByTestId } = render(
      <LinkGroup>
        <CodeLines lines={LINES} />
        <LinkTarget data-testid="note" linkKey="source">
          source note
        </LinkTarget>
      </LinkGroup>,
    );
    fireEvent.click(line(container, 3));
    expect(line(container, 5).getAttribute("data-pinned")).toBe("true");
    expect(getByTestId("note").getAttribute("data-pinned")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(line(container, 5).hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("note").hasAttribute("data-pinned")).toBe(false);
  });
});
