import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { DocBlock } from "@codecaine-ai/docs-model/doc-schema";
import type { DocBlockRenderContext } from "../../../render/block-registry";
import { descriptors as callStackDescriptors } from "../descriptor";
import { descriptors as componentTreeDescriptors } from "../../component-tree/descriptor";

const RENDER_CTX: DocBlockRenderContext = {
  renderText: () => null,
  renderChildren: () => null,
  renderMarkdown: () => null,
};

afterEach(() => {
  cleanup();
});

function renderBlock(type: "call-stack" | "component-tree", props: Record<string, unknown>): Element | null {
  const block: DocBlock = { id: "rows", type, props, children: [] };
  const descriptor = (type === "call-stack" ? callStackDescriptors : componentTreeDescriptors)[0]!;
  render(<>{descriptor.render(block, RENDER_CTX)}</>);
  return document.querySelector('[data-block-id="rows"]');
}

/** One summary per row: guide kinds, then the row's code text. */
function rowSummaries(wrapper: Element | null): string[] {
  return [...(wrapper?.querySelectorAll("[data-outline-row]") ?? [])].map((row) => {
    const guides = [...row.querySelectorAll("[data-g]")].map((guide) => guide.getAttribute("data-g")).join(",");
    return `${guides || "-"} ${row.querySelector(".docs-tree__code")?.textContent ?? ""}`;
  });
}

describe("call-stack rows", () => {
  const frames = [
    {
      text: "runDaemon()",
      source: "packages/docs-mcp/src/daemon.ts:7",
      frames: [
        { text: "createService({ globalRoot })", change: "removed" },
        { text: "createService({ codeThemesRoot })", change: "added", comment: "state dir" },
        { text: "!codeThemesRoot", kind: "branch", frames: [{ text: "set.status = 409" }] },
      ],
    },
  ];

  it("draws joined guides, a diff gutter, a comment column and a source column", () => {
    const wrapper = renderBlock("call-stack", { frames });
    expect(rowSummaries(wrapper)).toEqual([
      "- runDaemon()",
      "tee createService({ globalRoot })",
      "tee createService({ codeThemesRoot })",
      "end ?!codeThemesRoot",
      "blank,end set.status = 409",
    ]);
    const rows = [...(wrapper?.querySelectorAll("[data-outline-row]") ?? [])];
    expect(rows.map((row) => row.getAttribute("data-change"))).toEqual([null, "removed", "added", null, null]);
    expect(rows.map((row) => row.querySelector(".docs-tree__mark")?.textContent)).toEqual([
      "",
      "\u2212removed",
      "+added",
      "",
      "",
    ]);
    expect(rows[2].querySelector(".docs-tree__note")?.textContent).toBe("state dir");
    const source = rows[0].querySelector("[data-outline-source]");
    expect(source?.getAttribute("title")).toBe("packages/docs-mcp/src/daemon.ts:7");
    // The basename is what shows; the folder is there for assistive tech, not hidden in a tooltip.
    expect(source?.textContent).toBe("packages/docs-mcp/src/daemon.ts:7");
    expect(source?.querySelector(".docs-tree__sr")?.textContent).toBe("packages/docs-mcp/src/");
    expect(wrapper?.querySelector("figcaption")?.textContent).toBe("Call stack");
  });

  it("leads a branch row with ? (once) and leaves its condition uncolored", () => {
    const wrapper = renderBlock("call-stack", {
      frames: [{ text: "? ready", kind: "branch", frames: [{ text: "go()" }] }],
    });
    const branch = wrapper?.querySelector('[data-outline-row="branch"] .docs-tree__code');
    expect(branch?.textContent).toBe("?ready");
    expect(branch?.querySelector("[data-outline-token]")).toBeNull();
  });

  it("omits the gutter when no frame changed", () => {
    const wrapper = renderBlock("call-stack", { frames: [{ text: "main()" }] });
    expect(wrapper?.querySelector("[data-diff]")).toBeNull();
    expect(wrapper?.querySelector(".docs-tree__mark")).toBeNull();
  });

  it("marks the frame's first call as its callee, then keywords, properties and literals by role", () => {
    const wrapper = renderBlock("call-stack", {
      frames: [{ text: 'return store.apply(args.ops, 409, "x", wrap(y))' }],
    });
    const tokens = [...(wrapper?.querySelectorAll("[data-outline-token]") ?? [])]
      .filter((node) => node.getAttribute("data-outline-token") !== "punct")
      .map((node) => `${node.getAttribute("data-outline-token")}:${node.textContent}`);
    expect(tokens).toEqual(["keyword:return", "callee:apply", "prop:ops", "number:409", 'string:"x"', "call:wrap"]);
  });
});

describe("component-tree rows", () => {
  it("tells components, intrinsic tags, props and hooks apart", () => {
    const wrapper = renderBlock("component-tree", {
      nodes: [
        {
          text: "<DocPage path={path}>",
          nodes: [
            { text: "useCodeTheme()", kind: "hook" },
            { text: '<dialog className="x">' },
          ],
        },
      ],
    });
    const tokens = [...(wrapper?.querySelectorAll("[data-outline-token]") ?? [])]
      .filter((node) => node.getAttribute("data-outline-token") !== "punct")
      .map((node) => `${node.getAttribute("data-outline-token")}:${node.textContent}`);
    expect(tokens).toEqual([
      "type:DocPage",
      "prop:path",
      "hook:useCodeTheme",
      "tag:dialog",
      "prop:className",
      'string:"x"',
    ]);
    expect(wrapper?.querySelector("figcaption")?.textContent).toBe("Component tree");
  });
});
