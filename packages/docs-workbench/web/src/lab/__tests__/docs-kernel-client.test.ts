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

  test("targets proposal ids in accept and reject bodies", async () => {
    const requests: Request[] = [];
    const client = createDocsKernelClient({
      baseUrl: "http://kernel.test",
      fetchImpl: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        requests.push(new Request(input, init));
        return Response.json({ ok: true, alias: "R1", proposalId: "section-one" });
      }) as unknown as typeof fetch,
    });

    await client.acceptProposal("session-1", "R1", "section-one");
    await client.rejectProposal("session-1", "R1", "Needs detail", "section-two");

    expect(await requests[0]?.json()).toEqual({ proposalId: "section-one" });
    expect(await requests[1]?.json()).toEqual({
      note: "Needs detail",
      proposalId: "section-two",
    });
  });
});
