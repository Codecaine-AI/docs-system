import { describe, expect, test } from "bun:test";

import { createDocsKernelClient } from "../docs-kernel-client";

describe("docs kernel client", () => {
  test("includes corpus when creating a session", async () => {
    let request: Request | undefined;
    const client = createDocsKernelClient({
      baseUrl: "http://kernel.test",
      fetchImpl: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        request = new Request(input, init);
        return Response.json({ state: {} });
      }) as unknown as typeof fetch,
    });

    await client.createSession({ path: "guide", corpus: "product-docs" });

    expect(request?.url).toBe("http://kernel.test/kernel/docs-edit-sessions");
    expect(await request?.json()).toEqual({ path: "guide", corpus: "product-docs" });
  });
});
