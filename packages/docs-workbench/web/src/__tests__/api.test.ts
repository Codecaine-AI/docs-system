import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_LAB_CONFIG, fetchLabConfig, getSiteConfig } from "../data/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchLabConfig", () => {
  test("returns the serve route payload", async () => {
    globalThis.fetch = (async () => Response.json({
      kernelUrl: "http://kernel.test:4840",
      corpus: "product-docs",
    })) as unknown as typeof fetch;

    expect(await fetchLabConfig()).toEqual({
      kernelUrl: "http://kernel.test:4840",
      corpus: "product-docs",
    });
  });

  test("static exports never probe the live-only route", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({});
    }) as unknown as typeof fetch;
    expect(await fetchLabConfig(true)).toEqual(DEFAULT_LAB_CONFIG);
    expect(calls).toBe(0);
  });

  test("falls back after a fetch failure", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await fetchLabConfig()).toEqual(DEFAULT_LAB_CONFIG);
  });
});

describe("getSiteConfig", () => {
  test("drops a non-http(s) repoUrl and tolerates a missing file", async () => {
    globalThis.fetch = (async () => Response.json({
      repoUrl: "javascript:alert(1)",
      title: " Docs Site ",
    })) as unknown as typeof fetch;
    expect(await getSiteConfig(true)).toEqual({ title: "Docs Site" });

    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    expect(await getSiteConfig(true)).toEqual({});
  });

  test("a live workbench has no site config and makes no request", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({ repoUrl: "https://github.com/a/b" });
    }) as unknown as typeof fetch;
    expect(await getSiteConfig(false)).toEqual({});
    expect(calls).toBe(0);
  });
});
