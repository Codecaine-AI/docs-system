import { describe, expect, it } from "bun:test";
import {
  normalizeSettings,
  DEFAULT_STYLE_RAIL_SETTINGS,
} from "../shared/style-rail-settings";
import {
  applyBlockLayoutOverrideCss,
  applyStyleRailVars,
} from "../_lib/style-rail-apply";
import { styleRailStaticHead } from "../shared/style-rail-settings";

describe("styleRailStaticHead", () => {
  it("carries exactly what applyStyleRailVars and applyBlockLayoutOverrideCss write", () => {
    const settings = normalizeSettings(
      {
        accent: "green",
        colors: { background: "#fdfdfd", sidebar: null, text: "#2a2a2a" },
        layout: { radius: 4 },
        blockLayout: { code: { width: "920px" } },
      },
      DEFAULT_STYLE_RAIL_SETTINGS,
    );
    applyStyleRailVars(settings);
    applyBlockLayoutOverrideCss(settings);
    const root = document.documentElement;
    const inline = Array.from(root.style)
      .map((name) => `  ${name}: ${root.style.getPropertyValue(name)};`)
      .sort();
    const head = styleRailStaticHead(settings);
    const rootRule = head.css.slice(head.css.indexOf(":root {\n") + 8, head.css.indexOf("\n}"));
    expect(rootRule.split("\n").sort()).toEqual(inline);
    expect(head.htmlAttributes).toEqual({ "data-code-panels": root.getAttribute("data-code-panels")! });
    for (const style of Array.from(document.head.querySelectorAll("style[id^='docs-style-rail-']"))) {
      if (style.textContent) expect(head.css).toContain(style.textContent);
    }
    expect(head.css).toContain('[data-doc-lane][data-doc-block-type="code"] { max-width: 920px; }');
  });
});
