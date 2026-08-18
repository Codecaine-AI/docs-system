import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_LAB_CONFIG, fetchLabConfig } from "../data/api";

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

  test("falls back after a fetch failure", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await fetchLabConfig()).toEqual(DEFAULT_LAB_CONFIG);
  });
});
