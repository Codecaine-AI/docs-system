import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { parseProcessOutline } from "@codecaine-ai/docs-model";
import { ProcessOutlineDocsBlock } from "../ProcessOutlineDocsBlock";
import { equalizeProcessOutlineWidths } from "../equal-width";

afterEach(() => {
  cleanup();
});

/** happy-dom has no layout: give each outline a natural width keyed by its source id. */
function stubWidths(widths: Record<string, number>): void {
  for (const section of document.querySelectorAll('[data-docs-block-type="process-outline"]')) {
    const outline = section.querySelector<HTMLElement>(".docs-process-outline")!;
    const natural = widths[section.getAttribute("data-source-id") ?? ""] ?? 0;
    outline.getBoundingClientRect = () => {
      const width = outline.style.width ? Number.parseFloat(outline.style.width) : natural;
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  }
}

const steps = parseProcessOutline("Run\n  -> Step");
const block = (id: string) => (
  <div className="lane">
    <ProcessOutlineDocsBlock id={id} steps={steps} />
  </div>
);

describe("equalizeProcessOutlineWidths", () => {
  it("gives a run of adjacent outlines the widest natural width of the run", () => {
    render(
      <main>
        {block("a")}
        {block("b")}
        {block("c")}
      </main>,
    );
    stubWidths({ a: 300, b: 480, c: 260 });
    equalizeProcessOutlineWidths();

    const widths = [...document.querySelectorAll<HTMLElement>(".docs-process-outline")].map((o) => o.style.width);
    expect(widths).toEqual(["480px", "480px", "480px"]);
  });

  it("breaks the run at any other block and leaves a lone outline to size itself", () => {
    render(
      <main>
        {block("a")}
        {block("b")}
        <p>prose between runs</p>
        {block("c")}
      </main>,
    );
    stubWidths({ a: 300, b: 480, c: 260 });
    equalizeProcessOutlineWidths();

    const widths = [...document.querySelectorAll<HTMLElement>(".docs-process-outline")].map((o) => o.style.width);
    expect(widths).toEqual(["480px", "480px", ""]);
  });

  it("re-measures from natural widths, so a run shrinks when its widest outline narrows", () => {
    render(
      <main>
        {block("a")}
        {block("b")}
      </main>,
    );
    stubWidths({ a: 300, b: 480 });
    equalizeProcessOutlineWidths();
    stubWidths({ a: 300, b: 320 });
    equalizeProcessOutlineWidths();

    const widths = [...document.querySelectorAll<HTMLElement>(".docs-process-outline")].map((o) => o.style.width);
    expect(widths).toEqual(["320px", "320px"]);
  });
});
