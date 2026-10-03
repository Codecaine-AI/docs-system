import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildPdfHtml, createPrintContext } from "../lib/pdf-document";
import { exportPages, pdfEntryPath } from "../lib/pdf-selection";
import { ExportDialog } from "../shell/ExportDialog";
import type { DocsTreeNode } from "@codecaine-ai/docs-viewer/client";

const tree: DocsTreeNode[] = [{ name: "Guide", kind: "bundle", path: "10-guide", children: [
  { name: "Setup", kind: "bundle", path: "10-guide/10-setup" },
  { name: "Advanced", kind: "dir", path: "10-guide/20-advanced", children: [
    { name: "Setup", kind: "bundle", path: "10-guide/20-advanced/10-setup" },
    { name: "asset", kind: "file", path: "10-guide/20-advanced/asset" },
  ] },
] }];

afterEach(cleanup);
describe("PDF selection", () => {
  test("preserves tree order, parent pages and full paths without legacy files", () => {
    expect(exportPages(tree).map(page => pdfEntryPath(page.path))).toEqual([
      "10-guide.pdf", "10-guide/10-setup.pdf", "10-guide/20-advanced/10-setup.pdf",
    ]);
    for (const path of ["../escape", "/absolute", "a/../b", "a\\b", "a//b", "a\n"]) expect(() => pdfEntryPath(path)).toThrow();
  });
  test("defaults to ZIP/current page, allows section and individual selection, disables empty exports", () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    render(<ExportDialog tree={tree} currentPath="10-guide" onClose={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("zip");
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Select section"));
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Setup")[0]!);
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear"));
    expect((screen.getByRole("button", { name: /^Export$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Advanced"));
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
});

describe("PDF print document", () => {
  const SEQUENCE = {
    version: 1,
    id: "flow",
    title: "Login flow",
    participants: [
      { id: "a", name: "user", kind: "participant" },
      { id: "b", name: "service", kind: "participant" },
    ],
    items: [
      { kind: "message", id: "m1", from: "a", to: "b", line: "sync", text: "sign in" },
      { kind: "message", id: "m2", from: "b", to: "a", line: "return", text: "token" },
    ],
    style: {},
  };
  const page = (blocks: Record<string, unknown>) => ({
    schemaVersion: 1,
    id: "guide",
    title: "Guide",
    root: "root",
    blocks: { root: { id: "root", type: "paragraph", props: {}, children: Object.keys(blocks) }, ...blocks },
  });
  const sequenceBlock = (id: string, file: string) =>
    ({ id, type: "sequence", props: { src: `./assets/sequences/${file}`, title: id }, children: [] });
  const paragraph = (id: string, text: Array<{ insert: string; attributes?: Record<string, unknown> }>) =>
    ({ id, type: "paragraph", props: {}, text, children: [] });
  const FONT = new Uint8Array([1, 2, 3]);
  const FONT_DATA = "data:font/woff2;base64,AQID";

  const originalFetch = globalThis.fetch;
  const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
  const originalUrl = window.location.href;
  let styles: HTMLStyleElement | null = null;
  let requested: string[] = [];
  /** Serves `docs` by bundle path, SEQUENCE for sidecars, and font files through `font`. */
  function serve(docs: Record<string, unknown>, font: (url: string) => Promise<Response> = async () => new Response(new Blob([FONT], { type: "font/woff2" }))) {
    requested = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("api/bundle")) return Response.json({ doc: docs[new URLSearchParams(url.split("?")[1]).get("path") ?? ""] });
      if (url.startsWith("api/sequence")) return Response.json({ sequence: SEQUENCE });
      return font(url);
    }) as typeof fetch;
  }
  /** The app stylesheet a print context collects: the bundled faces, one cross-origin face, and the code font rule. */
  function installStyles() {
    happyDOM.setURL("http://docs.test/");
    styles = document.createElement("style");
    styles.textContent = [
      '@font-face { font-family: "Inter"; font-weight: 400; src: url("/fonts/Inter-Regular.woff2") format("woff2"); }',
      '@font-face { font-family: "IBM Plex Mono"; font-weight: 400; src: url("/fonts/IBMPlexMono-Regular.woff2") format("woff2"); }',
      '@font-face { font-family: "Elsewhere"; src: url("https://fonts.example/elsewhere.woff2") format("woff2"); }',
      ".docs-markdown { font-family: var(--font-tx02); }",
      ".docs-markdown code { font-family: var(--docs-font-code); }",
    ].join("\n");
    document.head.append(styles);
  }
  afterEach(() => {
    styles?.remove();
    styles = null;
    globalThis.fetch = originalFetch;
    happyDOM.setURL(originalUrl);
  });

  test("inlines diagrams as SVG whose marker ids stay unique on the page", async () => {
    serve({ guide: page({ first: sequenceBlock("first", "a.sequence.json"), second: sequenceBlock("second", "b.sequence.json") }) });
    const html = new DOMParser().parseFromString(await buildPdfHtml("guide", createPrintContext()), "text/html");
    const diagrams = Array.from(html.querySelectorAll("figure .pdf-diagram > svg"));
    expect(diagrams).toHaveLength(2);
    expect(html.querySelector("figure img")).toBeNull();
    const ids = Array.from(html.querySelectorAll("[id]"), element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of diagrams) {
      const own = new Set(Array.from(svg.querySelectorAll("[id]"), element => element.id));
      const references = Array.from(svg.outerHTML.matchAll(/url\(#([^)]+)\)/g), match => match[1]!);
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) expect(own.has(reference)).toBe(true);
    }
  });

  test("embeds the font files each page renders, fetching each file once", async () => {
    installStyles();
    serve({
      prose: page({ p: paragraph("p", [{ insert: "Only prose." }]) }),
      code: page({ p: paragraph("p", [{ insert: "Call " }, { insert: "measure()", attributes: { code: true } }]) }),
    });
    const print = createPrintContext();
    const prose = await buildPdfHtml("prose", print);
    expect(prose).toContain(`font-family: Inter; font-weight: 400; src: url("${FONT_DATA}") format("woff2")`);
    expect(prose).not.toContain('font-family: "IBM Plex Mono"');
    expect(prose).not.toContain(".woff2\"");
    expect(prose).not.toContain("Elsewhere");
    const code = await buildPdfHtml("code", print);
    expect(code).toContain(`font-family: "IBM Plex Mono"; font-weight: 400; src: url("${FONT_DATA}") format("woff2")`);
    expect(requested.filter(url => url.endsWith(".woff2"))).toEqual([
      "http://docs.test/fonts/Inter-Regular.woff2",
      "http://docs.test/fonts/IBMPlexMono-Regular.woff2",
    ]);
    expect(print.missingFonts.size).toBe(0);
  });

  test("leaves out a font file that fails to load and reports it, instead of failing the export", async () => {
    installStyles();
    serve(
      { code: page({ p: paragraph("p", [{ insert: "Call " }, { insert: "measure()", attributes: { code: true } }]) }) },
      async url => (url.includes("Plex") ? new Response("missing", { status: 404 }) : new Response(new Blob([FONT], { type: "font/woff2" }))),
    );
    const print = createPrintContext();
    const html = await buildPdfHtml("code", print);
    expect(html).toContain(`src: url("${FONT_DATA}")`);
    expect(html).not.toContain("IBMPlexMono-Regular.woff2");
    expect(Array.from(print.missingFonts)).toEqual(["IBM Plex Mono 400"]);
  });

  test("Cancel export releases the dialog while a request is stalled", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    let stalled = false;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      if (String(input) === "api/bundle?path=cancel-probe") stalled = true;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;
    render(<ExportDialog tree={[{ name: "Probe", kind: "bundle", path: "cancel-probe" }]} currentPath="cancel-probe" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    // The export loads its PDF modules lazily, which can take seconds in a loaded run.
    await waitFor(() => expect(stalled).toBe(true), { timeout: 10_000 });
    // act flushes the dialog's updates itself instead of waiting on the React scheduler.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("Export canceled.");
    expect((screen.getByRole("button", { name: "Export" }) as HTMLButtonElement).disabled).toBe(false);
  }, 15_000);
});
