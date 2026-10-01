import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CalloutDocsBlock, calloutLabel } from "../components/rich-text/CalloutDocsBlock";

/**
 * Every callout renders ONE note card: the retired `variant` prop is still
 * read and stamped on data-callout-variant (so docs round-trip), but the
 * layout no longer changes with it. The card's type is PRINTED — the kind
 * when set, else the tone name, in sentence case — never tooltip-only; the
 * tone glyph is decorative.
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

  it("prints the type label: the tone name, or the kind when set", () => {
    const toned = renderCallout({ tone: "risk", variant: "tab" });
    expect(visibleText(toned)).toBe("RiskBody text.");
    const icon = toned.querySelector("[data-callout-icon]");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.hasAttribute("data-tip")).toBe(false);
    expect(icon?.hasAttribute("title")).toBe(false);
    cleanup();

    const kinded = renderCallout({ tone: "info", kind: "Requirement", title: "Keep ids" });
    expect(kinded.querySelector("[data-callout-label]")?.textContent).toBe("Requirement");
    expect(kinded.querySelector("[data-callout-title]")?.textContent).toBe("Keep ids");
    expect(visibleText(kinded)).toBe("RequirementKeep idsBody text.");
  });
});

describe("calloutLabel", () => {
  it.each([
    [undefined, "warning", "Warning"],
    ["", "decision", "Decision"],
    ["gotcha", "warning", "Gotcha"],
    ["Boundary under review", "warning", "Boundary under review"],
    ["OPEN QUESTION", "info", "Open question"],
    ["API change", "info", "API change"],
    [undefined, "unknown-tone", "Info"],
  ])("kind %p on tone %p prints %p", (kind, tone, label) => {
    expect(calloutLabel(kind, tone)).toBe(label);
  });
});
