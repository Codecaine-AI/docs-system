import { describe, expect, test } from "bun:test";
import { BUNDLE_SRC_FIXTURES } from "@codecaine-ai/docs-model/bundle-src-fixtures";
import { classifyBlockSrc, resolveBundleRelativeSrc } from "@codecaine-ai/docs-model/bundle-src";
import { componentSidecarPath } from "../tools";

const canvasSrc = new Map([
  ["./assets/x", "./assets/canvases/x.canvas.json"],
  ["assets/x", "assets/canvases/x.canvas.json"],
  ["10-section/page/assets/x", "10-section/page/assets/canvases/x.canvas.json"],
  ["../x", "../assets/canvases/x.canvas.json"],
  ["/x", "/assets/canvases/x.canvas.json"],
  ["https://example.com/x.png", "https://example.com/assets/canvases/x.canvas.json"],
]);

describe("componentSidecarPath", () => {
  for (const fixture of BUNDLE_SRC_FIXTURES) {
    const src = canvasSrc.get(fixture.src)!;
    test(`${fixture.bundlePath ?? "root"}: ${src}`, () => {
      const kind = classifyBlockSrc(src);
      const resolved = resolveBundleRelativeSrc(fixture.bundlePath, src);
      const accepted = kind !== "url" && kind !== "parent-escape" && !resolved.startsWith("/");
      expect(componentSidecarPath(fixture.bundlePath ?? "", "canvas", src)).toBe(
        accepted ? resolved.replace(/^\.\//, "") : null,
      );
    });
  }
});
