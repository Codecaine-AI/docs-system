import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { LinkGroup, LinkTarget } from "../components/linked-panels";

afterEach(() => {
  cleanup();
});

/** One group, two elements on "alpha", one on "beta". */
function Fixture() {
  return (
    <LinkGroup>
      <LinkTarget data-testid="a1" linkKey="alpha">
        first alpha
      </LinkTarget>
      <LinkTarget data-testid="a2" linkKey="alpha">
        second alpha
      </LinkTarget>
      <LinkTarget data-testid="b1" linkKey="beta">
        beta
      </LinkTarget>
    </LinkGroup>
  );
}

describe("LinkGroup linking engine", () => {
  it("registers targets with data-link-key and tabIndex=0", () => {
    const { getByTestId } = render(<Fixture />);
    expect(getByTestId("a1").getAttribute("data-link-key")).toBe("alpha");
    expect(getByTestId("b1").getAttribute("data-link-key")).toBe("beta");
    expect(getByTestId("a1").getAttribute("tabindex")).toBe("0");
    expect(getByTestId("b1").getAttribute("tabindex")).toBe("0");
  });

  it("hover lights EVERY element with the key; hover-out clears", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.mouseEnter(getByTestId("a1"));
    expect(getByTestId("a1").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("a2").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("b1").hasAttribute("data-lit")).toBe(false);
    // Lit style: background wash + 3px inset rail in the pin color.
    expect(getByTestId("a2").className).toContain("--docs-link-bg");
    expect(getByTestId("a2").className).toContain("inset_3px_0_0_var(--docs-link-pin");
    fireEvent.mouseLeave(getByTestId("a1"));
    expect(getByTestId("a1").hasAttribute("data-lit")).toBe(false);
    expect(getByTestId("a2").hasAttribute("data-lit")).toBe(false);
    expect(getByTestId("a2").className).not.toContain("--docs-link-bg");
  });

  it("focus lights like hover; blur clears", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.focus(getByTestId("a2"));
    expect(getByTestId("a1").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("a2").getAttribute("data-lit")).toBe("true");
    fireEvent.blur(getByTestId("a2"));
    expect(getByTestId("a1").hasAttribute("data-lit")).toBe(false);
  });

  it("click pins: the pin survives hover-out; a second click unpins", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.mouseEnter(getByTestId("a1"));
    fireEvent.click(getByTestId("a1"));
    fireEvent.mouseLeave(getByTestId("a1"));
    for (const id of ["a1", "a2"]) {
      expect(getByTestId(id).getAttribute("data-pinned")).toBe("true");
      expect(getByTestId(id).getAttribute("data-lit")).toBe("true");
    }
    // Pinned adds the 1.5px ring in the pin color.
    expect(getByTestId("a1").className).toContain("0_0_0_1.5px_var(--docs-link-pin");
    fireEvent.click(getByTestId("a2"));
    fireEvent.mouseLeave(getByTestId("a2"));
    expect(getByTestId("a1").hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("a1").hasAttribute("data-lit")).toBe(false);
  });

  it("pinning another key unpins the first (one pin per group)", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.click(getByTestId("a1"));
    expect(getByTestId("a1").getAttribute("data-pinned")).toBe("true");
    fireEvent.click(getByTestId("b1"));
    expect(getByTestId("a1").hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("a1").hasAttribute("data-lit")).toBe(false);
    expect(getByTestId("b1").getAttribute("data-pinned")).toBe("true");
    expect(getByTestId("b1").getAttribute("data-lit")).toBe("true");
  });

  it("hovering another key while one is pinned lights both; the pin stays", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.click(getByTestId("a1"));
    fireEvent.mouseLeave(getByTestId("a1"));
    fireEvent.mouseEnter(getByTestId("b1"));
    expect(getByTestId("a1").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("b1").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("b1").hasAttribute("data-pinned")).toBe(false);
    fireEvent.mouseLeave(getByTestId("b1"));
    expect(getByTestId("a1").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("b1").hasAttribute("data-lit")).toBe(false);
  });

  it("Enter and Space toggle the pin from the keyboard", () => {
    const { getByTestId } = render(<Fixture />);
    fireEvent.keyDown(getByTestId("a1"), { key: "Enter" });
    expect(getByTestId("a2").getAttribute("data-pinned")).toBe("true");
    fireEvent.keyDown(getByTestId("a1"), { key: " " });
    expect(getByTestId("a2").hasAttribute("data-pinned")).toBe(false);
    // Unrelated keys do nothing.
    fireEvent.keyDown(getByTestId("a1"), { key: "a" });
    expect(getByTestId("a2").hasAttribute("data-pinned")).toBe(false);
  });

  it("Escape clears all pins in ALL groups", () => {
    const { getByTestId } = render(
      <>
        <LinkGroup>
          <LinkTarget data-testid="g1" linkKey="one">
            group one
          </LinkTarget>
        </LinkGroup>
        <LinkGroup>
          <LinkTarget data-testid="g2" linkKey="two">
            group two
          </LinkTarget>
        </LinkGroup>
      </>,
    );
    fireEvent.click(getByTestId("g1"));
    fireEvent.click(getByTestId("g2"));
    expect(getByTestId("g1").getAttribute("data-pinned")).toBe("true");
    expect(getByTestId("g2").getAttribute("data-pinned")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getByTestId("g1").hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("g1").hasAttribute("data-lit")).toBe(false);
    expect(getByTestId("g2").hasAttribute("data-pinned")).toBe(false);
    expect(getByTestId("g2").hasAttribute("data-lit")).toBe(false);
  });

  it("groups are isolated: the same key in another group never lights", () => {
    const { getByTestId } = render(
      <>
        <LinkGroup>
          <LinkTarget data-testid="left" linkKey="shared">
            left
          </LinkTarget>
        </LinkGroup>
        <LinkGroup>
          <LinkTarget data-testid="right" linkKey="shared">
            right
          </LinkTarget>
        </LinkGroup>
      </>,
    );
    fireEvent.mouseEnter(getByTestId("left"));
    expect(getByTestId("left").getAttribute("data-lit")).toBe("true");
    expect(getByTestId("right").hasAttribute("data-lit")).toBe(false);
  });

  it("renders inert outside a LinkGroup (no crash, no wiring)", () => {
    const { getByTestId } = render(
      <LinkTarget data-testid="lone" linkKey="alpha">
        standalone
      </LinkTarget>,
    );
    const lone = getByTestId("lone");
    expect(lone.hasAttribute("data-link-key")).toBe(false);
    expect(lone.hasAttribute("tabindex")).toBe(false);
    fireEvent.mouseEnter(lone);
    fireEvent.click(lone);
    expect(lone.hasAttribute("data-lit")).toBe(false);
    expect(lone.hasAttribute("data-pinned")).toBe(false);
  });
});
