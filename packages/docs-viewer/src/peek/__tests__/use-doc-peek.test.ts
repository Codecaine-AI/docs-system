import { describe, expect, it } from "bun:test";

import { collapseLegacyOverviewPath } from "../use-doc-peek";

describe("collapseLegacyOverviewPath", () => {
  it("collapses repeated trailing overview segments and tolerates a trailing slash", () => {
    expect(collapseLegacyOverviewPath("10-guide/00-overview")).toBe("10-guide");
    expect(collapseLegacyOverviewPath("10-guide/00-overview/00-overview/")).toBe("10-guide");
  });

  it("leaves bare, mid-path, and differently-cased segments unchanged", () => {
    expect(collapseLegacyOverviewPath("00-overview")).toBe("00-overview");
    expect(collapseLegacyOverviewPath("00-overview/")).toBe("00-overview/");
    expect(collapseLegacyOverviewPath("a/00-overview/b")).toBe("a/00-overview/b");
    expect(collapseLegacyOverviewPath("a/00-Overview")).toBe("a/00-Overview");
  });
});
