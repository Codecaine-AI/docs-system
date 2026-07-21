import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { createDocsServeApp } from "../../../src/server";
import { App } from "../shell/App";

/**
 * Doc-peek wiring tests: the workbench mounts docs-viewer's DocPeekPanel as
 * a shell-level push drawer, so a `spectre:doc-reference-navigate` event with
 * intent "peek" opens the target doc beside the main surface, and intent
 * "navigate" routes through the host's hash navigation. Same stubbed-fetch
 * pattern as workbench.test.tsx (the REAL serve app behind `app.handle`);
 * the panel's own behaviour is covered by docs-viewer's component tests —
 * this suite only proves the host wiring.
 */

let docsRoot: string;
let app: ReturnType<typeof createDocsServeApp>;
let realFetch: typeof fetch;

function docJson(id: string, title: string, text: string) {
  return {
    schemaVersion: 1,
    id,
    title,
    root: "root-1",
    blocks: {
      "root-1": {
        id: "root-1",
        type: "paragraph",
        props: {},
        children: ["para-1"],
      },
      "para-1": {
        id: "para-1",
        type: "paragraph",
        props: {},
        text: [{ insert: text }],
        children: [],
      },
    },
  };
}

const BUNDLES: Array<[string, string]> = [
  ["10-source", "Source"],
  ["10-guide", "Guide"],
  ["90-peek-target", "PeekTarget"],
];

function dispatchReferenceNavigate(intent: "peek" | "navigate", path: string) {
  fireEvent(
    document,
    new CustomEvent("spectre:doc-reference-navigate", {
      detail: { ref: { kind: "doc", path }, intent },
    }),
  );
}

beforeAll(async () => {
  docsRoot = await mkdtemp(join(tmpdir(), "docs-peek-test-"));
  for (const [path, title] of BUNDLES) {
    await mkdir(join(docsRoot, path), { recursive: true });
    await writeFile(
      join(docsRoot, path, "doc.json"),
      JSON.stringify(docJson(`doc-${path}`, title, `Hello from ${title}`), null, 2),
    );
  }
  app = createDocsServeApp({ docsRoot });

  // Route the SPA's relative fetches into the real app, no network.
  realFetch = globalThis.fetch;
  const stub = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://localhost/");
    return app.handle(new Request(url.toString(), init));
  }) as typeof fetch;
  globalThis.fetch = stub;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await rm(docsRoot, { recursive: true, force: true });
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("doc peek wiring", () => {
  it("a doc-reference event with intent 'peek' opens the peek panel with the target doc", async () => {
    window.location.hash = "#/10-source";
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Hello from Source")).toBeTruthy();
    });

    dispatchReferenceNavigate("peek", "90-peek-target");

    // The panel fetched the target bundle through the DocsClient seam and
    // rendered it beside the main surface — which still shows the open doc.
    await waitFor(() => {
      expect(screen.getByText("Hello from PeekTarget")).toBeTruthy();
    });
    expect(screen.getByText("Hello from Source")).toBeTruthy();
    // The main route did not change: peek is an overlay-free side surface.
    expect(window.location.hash).toBe("#/10-source");
  });

  it("loads a legacy overview doc ref from its canonical parent bundle", async () => {
    window.location.hash = "#/10-source";
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Hello from Source")).toBeTruthy();
    });

    dispatchReferenceNavigate("peek", "10-guide/00-overview");

    await waitFor(() => {
      expect(screen.getByText("Hello from Guide")).toBeTruthy();
    });
    expect(window.location.hash).toBe("#/10-source");
  });

  it("a doc-reference event with intent 'navigate' routes through hash navigation", async () => {
    window.location.hash = "#/10-source";
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Hello from Source")).toBeTruthy();
    });

    dispatchReferenceNavigate("navigate", "90-peek-target");

    await waitFor(() => {
      expect(window.location.hash).toBe("#/90-peek-target");
    });
    // Hash navigation swapped the main surface to the target doc.
    await waitFor(() => {
      expect(screen.getByText("Hello from PeekTarget")).toBeTruthy();
    });
  });
});
