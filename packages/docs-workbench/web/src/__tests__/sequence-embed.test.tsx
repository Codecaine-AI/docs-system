import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";

import { StandaloneSequenceEmbed } from "../pages/SequenceEmbed";

afterEach(() => cleanup());

const SAMPLE_SEQUENCE = {
  version: 1,
  id: "flow",
  title: "Login flow",
  participants: [
    { id: "a", name: "user", kind: "participant" },
    { id: "b", name: "service", kind: "participant" },
  ],
  items: [
    { kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "sign in" },
  ],
  style: {},
};

describe("StandaloneSequenceEmbed central Studio sequences", () => {
  it("renders a plain Open in Sequence Studio affordance (no iframe, no preview)", () => {
    const { getByRole, getByText, container } = render(
      <StandaloneSequenceEmbed
        id="sequence-block"
        sequenceId="auth-handshake"
        title="Auth handshake"
      />,
    );

    expect(getByText("Auth handshake")).toBeTruthy();
    const studioLink = getByRole("link", { name: "Open in Sequence Studio" }) as HTMLAnchorElement;
    expect(studioLink.href).toBe("http://localhost:3998/");
    expect(studioLink.target).toBe("_blank");
    // Unlike the canvas embed there is no Studio iframe/preview surface.
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("StandaloneSequenceEmbed sidecar src loading", () => {
  it("fetches the sidecar, validates it, and renders the read-only viewer", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(
        JSON.stringify({
          sequence_path: "guide/assets/sequences/flow.sequence.json",
          sequence_document_path: "docs/guide/assets/sequences/flow.sequence.json",
          content_hash: "hash",
          sequence: SAMPLE_SEQUENCE,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const { container, findByText } = render(
        <StandaloneSequenceEmbed
          id="sequence-block"
          src="guide/assets/sequences/flow.sequence.json"
        />,
      );

      await findByText("sign in");
      expect(requested).toEqual([
        "api/sequence?src=guide%2Fassets%2Fsequences%2Fflow.sequence.json",
      ]);
      const section = container.querySelector('[data-docs-block-type="sequence"]');
      expect(section?.getAttribute("data-source-id")).toBe("sequence-block");
      expect(container.querySelector("svg")).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces schema validation failures instead of rendering", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          sequence_path: "guide/assets/sequences/bad.sequence.json",
          sequence_document_path: "docs/guide/assets/sequences/bad.sequence.json",
          content_hash: "hash",
          sequence: { version: 1, id: "bad" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const { getByText } = render(
        <StandaloneSequenceEmbed
          id="sequence-block"
          src="guide/assets/sequences/bad.sequence.json"
        />,
      );
      await waitFor(() => getByText("Sequence failed to load"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
