/**
 * Component playground: renders the REAL block components from a catalog
 * page's doc.json, light and dark side by side. Served by the workbench vite
 * dev server, so editing a component or token hot-reloads both halves.
 *
 *   /playground.html?doc=<catalog path>&type=<block type>
 *     shell: two iframes (light | dark) of the frame view below
 *   …&theme=light|dark
 *     frame: the page's blocks of <type> (all blocks with &all=1)
 *   …&max=<px>|none
 *     the frame's content max-width (default 900px; `none` = full width, to
 *     check the wide lane at real page widths)
 *   …&src=/abs/path/doc.json
 *     render a doc.json from outside this corpus (fetched through vite's
 *     /@fs/ route, so the file must be under server.fs.allow)
 *
 * Each half owns its <html>, so `.dark` / [data-theme] and the :root token
 * blocks resolve exactly as in the app. No saved Style-rail theme is applied:
 * the playground shows the registry defaults.
 */
/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DocBlockRenderer, {
  DOC_SURFACE_TYPOGRAPHY_CLASSES,
} from "@codecaine-ai/docs-viewer/doc-block-renderer";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
// index.css loads @codecaine-ai/design-system/fonts.css ahead of the tokens.
import "../index.css";

const DOCS = import.meta.glob<DocDocument>("../../../../../docs/**/doc.json", {
  import: "default",
});

const params = new URLSearchParams(location.search);
const docPath = params.get("doc") ?? "10-system-design/40-block-vocabulary/30-trees-and-paths/10-file-tree";
const type = params.get("type") ?? "file-tree";
const theme = params.get("theme");
const maxParam = params.get("max");
const frameMax = maxParam === "none" ? "none" : maxParam ? Number(maxParam) : 900;
const srcPath = params.get("src");
const root = createRoot(document.getElementById("root")!);

function Shell() {
  const frame = (t: "light" | "dark") => {
    const q = new URLSearchParams(params);
    q.set("theme", t);
    return `${location.pathname}?${q}`;
  };
  return (
    // The harness's own bar stays dark whatever the frames show: pinned dark
    // tokens (page behind the frames and the hairline gap, body and ink text).
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "var(--ds-font-family-sans)",
        fontSize: "var(--ds-font-size-ui-sm)",
        background: "var(--ds-dark-color-surface-page)",
      }}
    >
      <div style={{ padding: "var(--ds-space-1-5) var(--ds-space-3)", color: "var(--ds-dark-color-text-body)" }}>
        <b style={{ color: "var(--ds-dark-color-text-ink)" }}>{type}</b> · {docPath}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ds-border-width-hairline)", flex: 1 }}>
        <iframe title="light" src={frame("light")} style={{ border: 0, width: "100%", height: "100%" }} />
        <iframe title="dark" src={frame("dark")} style={{ border: 0, width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}

function onlyType(doc: DocDocument): DocDocument {
  if (params.has("all")) return doc;
  const blocks = doc.blocks as Record<string, { id: string; type: string; children?: string[] }>;
  const keep = Object.values(blocks)
    .filter((b) => b.type === type)
    .map((b) => b.id);
  const rootBlock = blocks[doc.root as string];
  return {
    ...doc,
    blocks: { ...doc.blocks, [doc.root as string]: { ...rootBlock, children: keep } },
  } as DocDocument;
}

async function frame(t: string) {
  const html = document.documentElement;
  html.dataset.theme = t;
  html.dataset.codePanels = "dark";
  html.classList.toggle("dark", t === "dark");
  document.body.style.margin = "0";
  document.body.style.background = "var(--docs-page)";
  document.body.style.color = "var(--docs-ink)";
  const load = srcPath
    ? () => fetch(`/@fs${srcPath}`).then((response) => response.json() as Promise<DocDocument>)
    : DOCS[`../../../../../docs/${docPath}/doc.json`];
  if (!load) {
    root.render(<pre style={{ padding: "var(--ds-space-6)" }}>No doc.json at docs/{docPath}</pre>);
    return;
  }
  const doc = await load();
  root.render(
    <StrictMode>
      <main style={{ padding: "var(--ds-space-6) var(--ds-space-8)", maxWidth: frameMax }} className={DOC_SURFACE_TYPOGRAPHY_CLASSES}>
        <DocBlockRenderer document={onlyType(doc)} documentPath={docPath} bundlePath={docPath} />
      </main>
    </StrictMode>,
  );
}

if (theme) void frame(theme);
else root.render(<Shell />);
