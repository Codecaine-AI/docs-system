import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  CODE_LINE_HEIGHT_PX,
  CodeLines,
  LinkGroup,
  LinkTarget,
  type LinkedCodeLine,
} from "../components/linked-panels";

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

function gutter(container: HTMLElement, n: number): HTMLElement {
  return line(container, n).querySelector("[data-line-number]") as HTMLElement;
}

describe("CodeLines", () => {
  it("keeps the load-bearing 20px line metric", () => {
    expect(CODE_LINE_HEIGHT_PX).toBe(20);
    const { container } = render(<CodeLines lines={LINES} />);
    const row = line(container, 1);
    expect(row.className).toContain("h-5");
    expect(row.className).toContain("leading-[20px]");
    const body = row.parentElement as HTMLElement;
    expect(body.className).toContain("font-mono");
    expect(body.className).toContain("leading-[20px]");
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

  it("renders the gutter: right-aligned numbers behind a hairline rule, not selectable", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    const cell = gutter(container, 1);
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("select-none");
    expect(cell.className).toContain("border-r");
    expect(cell.className).toContain("var(--docs-code-rule,var(--border))");
  });

  it("zebra-stripes even lines only, via the --docs-zebra token (R4)", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    for (const n of [2, 4, 6]) {
      expect(line(container, n).className).toContain("--docs-zebra");
    }
    for (const n of [1, 3, 5]) {
      expect(line(container, n).className).not.toContain("--docs-zebra");
    }
  });

  it("never soft-wraps: literal whitespace with horizontal scroll", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    const panel = container.querySelector("[data-code-lines]") as HTMLElement;
    expect(panel.className).toContain("overflow-x-auto");
    const body = line(container, 1).parentElement as HTMLElement;
    expect(body.className).toContain("w-max");
    expect(body.className).toContain("min-w-full");
    expect(line(container, 1).className).toContain("whitespace-pre");
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
    expect(line(container, 3).className).toContain("inset_3px_0_0_var(--docs-link-pin");
    // Line 4 (even) rests on zebra; when lit via its own key the wash wins.
    fireEvent.mouseLeave(getByTestId("note"));
    fireEvent.mouseEnter(line(container, 4));
    expect(line(container, 4).className).toContain("--docs-link-bg");
    expect(line(container, 4).className).not.toContain("--docs-zebra");
  });

  it("turns the gutter number pin-color and bold while its line is lit", () => {
    const { container, getByTestId } = render(
      <LinkGroup>
        <CodeLines lines={LINES} />
        <LinkTarget data-testid="note" linkKey="name">
          name note
        </LinkTarget>
      </LinkGroup>,
    );
    expect(gutter(container, 2).className).not.toContain("font-bold");
    fireEvent.mouseEnter(getByTestId("note"));
    expect(gutter(container, 2).className).toContain("font-bold");
    expect(gutter(container, 2).className).toContain("--docs-link-pin");
    expect(gutter(container, 3).className).not.toContain("font-bold");
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
    expect(line(container, 3).className).toContain("0_0_0_1.5px_var(--docs-link-pin");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(line(container, 5).hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("note").hasAttribute("data-pinned")).toBe(false);
  });
});
