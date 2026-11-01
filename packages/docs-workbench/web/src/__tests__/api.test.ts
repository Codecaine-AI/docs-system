import { afterEach, describe, expect, test } from "bun:test";

import { getSiteConfig } from "../data/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
