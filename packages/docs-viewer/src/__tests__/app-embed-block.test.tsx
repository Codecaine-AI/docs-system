import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { validateDocDocument, type DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { checkStateProps } from "../../../docs-model/src/components/validate";
import { AppEmbedBlock } from "../components/rich-text/AppEmbedDocsBlock";
import type { AppEmbedHost, AppEmbedRef } from "../components/rich-text/app-embed-host";
import DocBlockRenderer from "../render/DocBlockRenderer";
import { docToPM, pmToDoc } from "../editor/core/convert";
import type { ReactNodeViewProps } from "@tiptap/react";
import { AppEmbedEditorNodeView } from "../components/rich-text/app-embed-editor-node-view";
import { DocEditorNodeViewProvider } from "../editor/views/node-view-context";

// happy-dom would otherwise fetch every app URL into its iframe.
const dom = (window as unknown as { happyDOM?: { settings: { disableIframePageLoading: boolean } } }).happyDOM;
beforeAll(() => { if (dom) dom.settings.disableIframePageLoading = true; });
afterAll(() => { if (dom) dom.settings.disableIframePageLoading = false; });
afterEach(cleanup);

/** A host serving every app at `https://apps.test/<app>/<view>?<params>`, with a change channel per app. */
function fakeHost(options: { available?: (ref: AppEmbedRef) => boolean } = {}) {
  const resolved: AppEmbedRef[] = [];
  const listeners = new Map<string, Set<() => void>>();
  let version = 0;
  const host: AppEmbedHost = {
    resolve(ref) {
      resolved.push(ref);
      if (options.available && !options.available(ref)) return null;
      const query = [ref.params, version ? `v=${version}` : ""].filter(Boolean).join("&");
      return { src: `https://apps.test/${ref.app}/${ref.view ?? ""}${query ? `?${query}` : ""}` };
    },
    subscribe(ref, onChange) {
      const set = listeners.get(ref.app) ?? new Set();
      set.add(onChange);
      listeners.set(ref.app, set);
      return () => set.delete(onChange);
    },
  };
  return {
    host,
    resolved,
    listenerCount: (app: string) => listeners.get(app)?.size ?? 0,
    change(app: string, bump = true) {
      if (bump) version += 1;
      act(() => { for (const listener of [...(listeners.get(app) ?? [])]) listener(); });
    },
  };
}

const embed = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-docs-block-type="app-embed"][data-source-id="${id}"]`) as HTMLElement;

describe("app-embed state", () => {
  it("validates closed typed props and the 240 to 2000 height range", () => {
    expect(checkStateProps("app-embed", { app: "graph" })).toEqual([]);
    expect(checkStateProps("app-embed", {
      codebase: "ent_kb", app: "graph", view: "map", params: "q=1", title: "Map", height: 480, poster: "./assets/images/map.png",
    })).toEqual([]);
    for (const invalid of [{}, { app: "graph", height: 100 }, { app: "graph", height: 2400 }, { app: "graph", url: "http://127.0.0.1:5173" }, { app: "graph", title: 3 }]) {
      expect(checkStateProps("app-embed", invalid as Record<string, unknown>).length).toBeGreaterThan(0);
    }
  });

  it("validates as a doc block and round-trips through the editor schema", () => {
    const raw = {
      schemaVersion: 1, id: "doc", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["app"] },
        app: { id: "app", type: "app-embed", props: { app: "graph", view: "map", height: 600 }, children: [] },
      },
    };
    const result = validateDocDocument(raw);
    expect(result.ok).toBe(true);
    const doc = (result as { ok: true; document: DocDocument }).document;
    expect(doc.blocks.app!.type).toBe("app-embed");
    expect(pmToDoc(docToPM(doc), doc, () => "new-id").blocks.app).toEqual(doc.blocks.app);
  });
});

describe("AppEmbedBlock", () => {
  it("shows the quiet unavailable state with title, app, and view when there is no host or resolve returns null", () => {
    const { container, rerender } = render(<AppEmbedBlock id="a" app="graph" view="map" title="Knowledge map" />);
    const block = embed(container, "a");
    expect(block.getAttribute("data-app-embed-state")).toBe("unavailable");
    expect(block.textContent).toContain("App not available here");
    expect(block.textContent).toContain("Knowledge map");
    expect(block.textContent).toContain("graph · map");
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("button", { name: /start/i })).toBeNull();

    const { host, resolved } = fakeHost({ available: () => false });
    rerender(<AppEmbedBlock id="a" app="graph" view="map" title="Knowledge map" host={host} />);
    expect(resolved).toEqual([{ app: "graph", view: "map" }]);
    expect(embed(container, "a").getAttribute("data-app-embed-state")).toBe("unavailable");
  });

  it("renders the unavailable state through DocBlockRenderer when the host provides no resolver", () => {
    const doc: DocDocument = {
      schemaVersion: 1, id: "doc", root: "root",
      blocks: {
        root: { id: "root", type: "paragraph", props: {}, children: ["app"] },
        app: { id: "app", type: "app-embed", props: { app: "graph", title: "Map" }, children: [] },
      },
    };
    const { container } = render(<DocBlockRenderer document={doc} />);
    expect(embed(container, "app").textContent).toContain("App not available here");
  });

  it("shows the poster and Start, then mounts the sandboxed iframe with Stop and Open in new window", () => {
    const { host } = fakeHost();
    const { container } = render(
      <AppEmbedBlock id="a" app="graph" view="map" params="q=1" title="Map" height={300} poster="/assets/map.png" host={host} />,
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/assets/map.png");
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start Map" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://apps.test/graph/map?q=1");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-pointer-lock allow-downloads");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame.getAttribute("allow")).toBe("fullscreen; autoplay");
    expect(frame.getAttribute("loading")).toBe("lazy");
    expect(container.querySelector("img")).toBeNull();
    const open = screen.getByRole("link", { name: /open in new window/i });
    expect(open.getAttribute("href")).toBe("https://apps.test/graph/map?q=1");
    expect(open.getAttribute("target")).toBe("_blank");

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("shows a placeholder with the title and view when there is no poster, and clamps the height", () => {
    const { host } = fakeHost();
    const { container } = render(<AppEmbedBlock id="a" app="graph" view="map" title="Map" height={5000} host={host} />);
    expect(container.querySelector("img")).toBeNull();
    const body = embed(container, "a").lastElementChild as HTMLElement;
    expect(body.textContent).toContain("Map");
    expect(body.textContent).toContain("map");
    expect(body.style.height).toBe("2000px");
  });

  it("keeps one live embed per window: starting one stops the other", () => {
    const { host, listenerCount } = fakeHost();
    const { container } = render(
      <>
        <AppEmbedBlock id="first" app="graph" title="First" host={host} />
        <AppEmbedBlock id="second" app="board" title="Second" host={host} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start First" }));
    expect(embed(container, "first").getAttribute("data-app-embed-state")).toBe("live");

    fireEvent.click(screen.getByRole("button", { name: "Start Second" }));
    expect(embed(container, "first").getAttribute("data-app-embed-state")).toBe("idle");
    expect(embed(container, "second").getAttribute("data-app-embed-state")).toBe("live");
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(listenerCount("graph")).toBe(0);
    expect(listenerCount("board")).toBe(1);

    // Restarting the first stops the second again.
    fireEvent.click(screen.getByRole("button", { name: "Start First" }));
    expect(embed(container, "second").getAttribute("data-app-embed-state")).toBe("idle");
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("reloads a live embed when the host reports a change and ignores changes while stopped", () => {
    const fake = fakeHost();
    const { container } = render(<AppEmbedBlock id="a" app="graph" view="map" title="Map" host={fake.host} />);
    // Stopped: nothing listens, so a change does nothing.
    expect(fake.listenerCount("graph")).toBe(0);
    fake.change("graph");
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start Map" }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://apps.test/graph/map?v=1");
    expect(fake.listenerCount("graph")).toBe(1);

    // A change re-resolves and sets the same frame's src again.
    fake.change("graph");
    expect(container.querySelector("iframe")).toBe(frame);
    expect(frame.getAttribute("src")).toBe("https://apps.test/graph/map?v=2");
    expect(screen.getByRole("link", { name: /open in new window/i }).getAttribute("href")).toBe("https://apps.test/graph/map?v=2");

    // An unchanged URL is still set again, which reloads the frame.
    const writes: string[] = [];
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(frame), "src")!;
    Object.defineProperty(frame, "src", {
      configurable: true,
      get: () => descriptor.get!.call(frame),
      set: (value: string) => { writes.push(value); descriptor.set!.call(frame, value); },
    });
    fake.change("graph", false);
    expect(writes).toEqual(["https://apps.test/graph/map?v=2"]);

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(fake.listenerCount("graph")).toBe(0);
  });
});

describe("app-embed editor node view", () => {
  const node = (blockProps: Record<string, unknown>) =>
    ({ node: { attrs: { blockId: "app", blockProps } } }) as unknown as ReactNodeViewProps;

  it("reads the host's resolver and asset URLs from the editor node-view context", () => {
    const { host } = fakeHost();
    const { container } = render(
      <DocEditorNodeViewProvider value={{ appEmbeds: host, resolveAssetSrc: (src) => `/api/asset?path=${src}` }}>
        <AppEmbedEditorNodeView {...node({ app: "graph", title: "Map", poster: "./assets/images/map.png" })} />
      </DocEditorNodeViewProvider>,
    );
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/api/asset?path=./assets/images/map.png");
    fireEvent.click(screen.getByRole("button", { name: "Start Map" }));
    expect(container.querySelector("iframe")!.getAttribute("src")).toBe("https://apps.test/graph/");
  });

  it("shows the unavailable state when the editor host has no resolver", () => {
    const { container } = render(<AppEmbedEditorNodeView {...node({ app: "graph", view: "map" })} />);
    expect(embed(container, "app").textContent).toContain("App not available here");
  });
});
