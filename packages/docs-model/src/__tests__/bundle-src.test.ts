import { describe, expect, it } from "bun:test";

import {
  canonicalBundleSrc,
  classifyBlockSrc,
  isBareBundleSrc,
  resolveBundleRelativeSrc,
} from "../bundle-src";
import { BUNDLE_SRC_FIXTURES } from "../bundle-src.fixtures";

describe("bundle src", () => {
  it("resolves the shared fixture table", () => {
    for (const fixture of BUNDLE_SRC_FIXTURES) {
      expect(
        resolveBundleRelativeSrc(fixture.bundlePath, fixture.src),
        `${fixture.bundlePath ?? "null"}: ${fixture.src}`,
      ).toBe(fixture.expected);
    }
  });

  it("classifies src forms in precedence order", () => {
    expect(classifyBlockSrc("https://example.com/x.png")).toBe("url");
    expect(classifyBlockSrc("data:image/png;base64,x")).toBe("url");
    expect(classifyBlockSrc("blob:https://example.com/id")).toBe("url");
    expect(classifyBlockSrc("/x")).toBe("root-absolute");
    expect(classifyBlockSrc("../x")).toBe("parent-escape");
    expect(classifyBlockSrc("./assets/x")).toBe("bundle-relative");
    expect(classifyBlockSrc("assets/x")).toBe("bare-bundle-relative");
    expect(classifyBlockSrc("10-section/page/assets/x")).toBe("root-relative");
  });

  it("identifies only bare assets paths as bare bundle srcs", () => {
    expect(isBareBundleSrc("assets/x")).toBe(true);
    expect(isBareBundleSrc("./assets/x")).toBe(false);
    expect(isBareBundleSrc("10-section/page/assets/x")).toBe(false);
  });

  it("canonicalizes bare assets paths", () => {
    expect(canonicalBundleSrc("assets/x")).toBe("./assets/x");
    expect(canonicalBundleSrc("./assets/x")).toBe("./assets/x");
    expect(canonicalBundleSrc("https://example.com/x.png")).toBe(
      "https://example.com/x.png",
    );
  });

  it("strips every leading dot-slash when resolving", () => {
    expect(resolveBundleRelativeSrc("10-s/page", "././assets/x")).toBe(
      "10-s/page/assets/x",
    );
  });
});
