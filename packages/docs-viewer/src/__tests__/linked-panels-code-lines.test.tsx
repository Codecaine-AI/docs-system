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
  it("keeps ONE line metric: rows, leading and the filler all read the line-height token (21px default)", () => {
    expect(CODE_LINE_HEIGHT_PX).toBe(21);
    const { container } = render(<CodeLines lines={LINES} />);
    const row = line(container, 1);
    expect(row.className).toContain("h-[var(--docs-link-line-height,21px)]");
    expect(row.className).toContain("leading-[var(--docs-link-line-height,21px)]");
    const body = row.parentElement as HTMLElement;
    expect(body.className).toContain("font-mono");
    expect(body.className).toContain("leading-[var(--docs-link-line-height,21px)]");
    expect(gutter(container, 1).className).toContain(
      "leading-[var(--docs-link-line-height,21px)]",
    );
    // No hardcoded line box survives next to the token.
    for (const el of [row, body, gutter(container, 1)]) {
      expect(el.className).not.toContain("h-5");
      expect(el.className).not.toContain("leading-[20px]");
      expect(el.className).not.toContain("leading-[21px]");
    }
  });

  it("reads the panel typography and gutter metrics from the linking tokens", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    const body = line(container, 1).parentElement as HTMLElement;
    expect(body.className).toContain("text-[length:var(--docs-link-text-size,13px)]");
    const cell = gutter(container, 1);
    expect(cell.className).toContain("w-[var(--docs-link-gutter-width,40px)]");
    expect(cell.className).toContain("text-[length:var(--docs-link-gutter-text-size,12px)]");
    // The filler's gutter rule shares the gutter cell's width token, so the
    // hairline stays unbroken at any width.
    const filler = container.querySelector("[data-code-lines-filler]") as HTMLElement;
    const rule = filler.firstElementChild as HTMLElement;
    expect(rule.className).toContain("w-[var(--docs-link-gutter-width,40px)]");
  });

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

  it("renders the gutter: right-aligned numbers behind a hairline rule, not selectable", () => {
    const { container } = render(<CodeLines lines={LINES} />);
    const cell = gutter(container, 1);
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("select-none");
    expect(cell.className).toContain("border-r");
    expect(cell.className).toContain("var(--docs-code-rule,var(--border))");
    // Numbers paint the gutter token as-is; the fallback is its light default.
    expect(cell.className).toContain("text-[color:var(--docs-code-gutter-fg,#888784)]");
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
    expect(line(container, 3).className).toContain("inset_var(--docs-link-rail-width,3px)_0_0_var(--docs-link-pin");
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
    expect(line(container, 3).className).toContain("0_0_0_var(--docs-link-ring-width,1.5px)_var(--docs-link-pin");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(line(container, 5).hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("note").hasAttribute("data-pinned")).toBe(false);
  });
});
