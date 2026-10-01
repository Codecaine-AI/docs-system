import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import { descriptors } from "../components/stack/descriptor";
import type { DocBlockRenderContext } from "../render/block-registry";

afterEach(() => {
  cleanup();
});

const ctx: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

function renderStack(props: Record<string, unknown>) {
  const block: DocBlock = { id: "s1", type: "stack", props, children: [] };
  return render(descriptors[0]!.render(block, ctx) as ReactElement);
}

describe("stack renderer", () => {
  it("nests children in a named container and draws arrows and rule lines between siblings", () => {
    const { container, getByRole } = renderStack({
      nodes: [
        {
          name: "Docs framework",
          color: "blue",
          uses: true,
          children: [{ name: "docs-viewer", badge: "product", detail: "DocBlockRenderer", uses: "DocsClient" }, { name: "docs-model" }],
        },
        { name: "External" },
      ],
      boundaries: [{ after: "Docs framework", rule: "docs-model imports canvas only via agent-schema" }],
    });

    const group = container.querySelector('[data-stack-group][data-color="blue"]');
    expect(group?.querySelector("[data-stack-chip-name]")?.textContent).toBe("Docs framework");
    expect([...group!.querySelectorAll("[data-stack-name]")].map((n) => n.textContent)).toEqual(["docs-viewer", "docs-model"]);
    expect(group?.querySelector("[data-stack-uses-label]")?.textContent).toBe("DocsClient");

    // The container's unlabelled arrow crosses the rule line, which draws it.
    const boundary = getByRole("separator");
    expect(boundary.textContent).toBe("docs-model imports canvas only via agent-schema");
    expect(boundary.hasAttribute("data-crossed")).toBe(true);
    expect(boundary.previousElementSibling).toBe(group);
  });

  it("lays a container's children in two columns on request", () => {
    const { container } = renderStack({ nodes: [{ name: "External", columns: 2, children: [{ name: "a" }, { name: "b" }] }] });
    expect((container.querySelector("[data-stack-body]") as HTMLElement).style.getPropertyValue("--cols")).toBe("2");
  });

  it("renders the invalid placeholder when nodes is missing", () => {
    const { container } = renderStack({});
    expect(container.textContent).toContain("Invalid Stack block");
  });
});
