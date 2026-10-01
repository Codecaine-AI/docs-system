import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CalloutDocsBlock } from "../components/rich-text/CalloutDocsBlock";

/**
 * The callout's `variant` prop picks one of four layouts (styled by the
 * component's stylesheet off data-callout-variant), and no variant shows a
 * visible type label: the icon names the type for assistive tech and in its
 * hover tooltip.
 */

afterEach(cleanup);

const callout = new CalloutDocsBlock();

function renderCallout(data: { tone: string; variant?: string; title?: string; kind?: string }) {
  const { container } = render(
    callout.render(
      {
        tag: "Callout",
        type: "callout",
        targetKind: "callout",
        sourceId: null,
        data: { ...data, body: "Body text." },
      },
      { renderMarkdown: (body) => <p>{body}</p> },
    ),
  );
  return container.querySelector('[data-docs-block-type="callout"]') as HTMLElement;
}

/** Rendered text, minus the component's inline stylesheet. */
const visibleText = (aside: HTMLElement) =>
  Array.from(aside.children)
    .filter((child) => child.tagName !== "STYLE")
    .map((child) => child.textContent)
    .join("");

describe("callout variants", () => {
  it.each([
    ["eyebrow", "eyebrow"],
    ["hairline", "hairline"],
    ["rail", "rail"],
    ["tab", "tab"],
    [undefined, "eyebrow"],
    ["card", "eyebrow"],
  ])("variant %p renders as %p", (variant, expected) => {
    const aside = renderCallout({ tone: "warning", variant, title: "Check this" });
    expect(aside.getAttribute("data-callout-variant")).toBe(expected);
  });

  it("shows no type label; the icon names the tone, or the kind when set", () => {
    const toned = renderCallout({ tone: "risk", variant: "tab" });
    expect(visibleText(toned)).toBe("Body text.");
    const icon = toned.querySelector("[data-callout-icon]");
    expect(icon?.getAttribute("role")).toBe("img");
    expect(icon?.getAttribute("aria-label")).toBe("Risk");
    expect(icon?.getAttribute("data-tip")).toBe("Risk");
    expect(icon?.hasAttribute("title")).toBe(false);
    cleanup();

    const kinded = renderCallout({ tone: "info", kind: "Requirement", title: "Keep ids" });
    expect(visibleText(kinded)).toBe("Keep idsBody text.");
    expect(kinded.querySelector("[data-callout-icon]")?.getAttribute("aria-label")).toBe(
      "Requirement",
    );
  });
});
