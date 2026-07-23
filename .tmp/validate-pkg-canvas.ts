/**
 * Validates docs/20-implementation/10-packages/assets/canvases/package-dependency-chain.canvas.json
 * against the real canvas validator, then render-checks it with the repo's own
 * InteractiveCanvasViewer under happy-dom (the same pattern as the canvas
 * package's w2-render-smoke test — there is no separate static-svg renderer).
 *
 * Run from repo root: bun .tmp/validate-pkg-canvas.ts
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const CANVAS_PATH =
  "/Users/Ford/Github Repos/Codecaine/docs-system/docs/20-implementation/10-packages/assets/canvases/package-dependency-chain.canvas.json";

async function main() {
  const raw = await Bun.file(CANVAS_PATH).json();

  // 1 — schema validation via the real validator.
  const { validateInteractiveCanvasDocument } = await import(
    "../external/canvas/packages/canvas/src/schema"
  );
  const result = validateInteractiveCanvasDocument(raw);
  if (!result.ok) {
    console.error("VALIDATION FAILED:");
    for (const issue of result.issues) console.error(`  ${issue.path}: ${issue.message}`);
    process.exit(1);
  }
  if (result.warnings?.length) {
    console.error("VALIDATION WARNINGS (treated as failure — fix the document):");
    for (const w of result.warnings) console.error(`  ${w.path}: ${w.message}`);
    process.exit(1);
  }
  const doc = result.document;
  console.log(
    `validate: ok (${doc.objects.length} objects, ${doc.connections.length} connections)`,
  );

  // Structural assertions: exact edge set, arrows read "depends on".
  const expectedEdges = new Set([
    "docs-index->docs-model",
    "docs-server->docs-index",
    "docs-server->docs-model",
    "docs-viewer->docs-model",
    "docs-workbench->docs-server",
    "docs-workbench->docs-viewer",
    "docs-workbench->docs-index",
    "docs-workbench->docs-model",
    "docs-cli->docs-workbench",
    "docs-cli->docs-index",
    "docs-cli->docs-model",
  ]);
  const actualEdges = new Set(
    doc.connections.map((c) => `${c.from.objectId}->${c.to.objectId}`),
  );
  const missing = [...expectedEdges].filter((e) => !actualEdges.has(e));
  const extra = [...actualEdges].filter((e) => !expectedEdges.has(e));
  if (missing.length || extra.length) {
    console.error(`edge set mismatch — missing: ${missing.join(", ")} extra: ${extra.join(", ")}`);
    process.exit(1);
  }
  for (const c of doc.connections) {
    if (c.arrow !== "forward") {
      console.error(`connection ${c.id} arrow must be "forward", got ${c.arrow}`);
      process.exit(1);
    }
  }
  // framework and the external grouping must have no edges.
  for (const id of ["framework", "external-projects", "external-canvas", "external-sequence"]) {
    const touching = doc.connections.filter(
      (c) => c.from.objectId === id || c.to.objectId === id,
    );
    if (touching.length) {
      console.error(`${id} must be edgeless, found: ${touching.map((c) => c.id).join(", ")}`);
      process.exit(1);
    }
  }
  // The view target (root section) must exist and geometrically contain every object.
  const root = doc.objects.find((o) => o.id === "package-dependency-chain");
  if (!root || root.type !== "section") {
    console.error('root section "package-dependency-chain" (the view target) is missing');
    process.exit(1);
  }
  for (const o of doc.objects) {
    if (o.id === root.id) continue;
    const g = o.geometry;
    const r = root.geometry;
    if (g.x < r.x || g.y < r.y || g.x + g.width > r.x + r.width || g.y + g.height > r.y + r.height) {
      console.error(`object ${o.id} falls outside the root section bounds`);
      process.exit(1);
    }
  }
  console.log("structure: ok (11 depends-on edges, framework/external edgeless, view frames all)");

  // 2 — render check via InteractiveCanvasViewer (happy-dom, mocked shell rect).
  // Resolve React + @testing-library/react from the canvas submodule's own
  // node_modules so the viewer (whose "react" import resolves there) and the
  // test renderer share ONE React instance (see react-dedup.ts for context).
  const { createRequire } = await import("node:module");
  const canvasPkgDir =
    "/Users/Ford/Github Repos/Codecaine/docs-system/external/canvas/packages/canvas/";
  const req = createRequire(canvasPkgDir);
  const React = req("react");
  const { render } = req("@testing-library/react");
  const { InteractiveCanvasViewer } = await import(
    "../external/canvas/packages/canvas/src/InteractiveCanvasViewer"
  );

  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if ((this as HTMLElement).classList.contains("interactive-canvas-shell")) {
      return {
        x: 0, y: 0, left: 0, top: 0,
        width: 1600, height: 900, right: 1600, bottom: 900,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return originalRect.call(this);
  };

  try {
    const { container } = render(
      React.createElement(InteractiveCanvasViewer, {
        document: doc,
        view: "package-dependency-chain",
      }),
    );
    const failures: string[] = [];
    for (const object of doc.objects) {
      const node = container.querySelector(`[data-canvas-object-id="${object.id}"]`);
      if (!node) failures.push(`object ${object.id} did not render`);
    }
    const text = container.textContent ?? "";
    for (const object of doc.objects) {
      // Sections render their `title` chip; every other object renders `label`.
      const wanted = object.type === "section" ? object.title ?? "" : object.label;
      for (const line of wanted.split("\n")) {
        if (line && !text.includes(line)) {
          failures.push(`label line "${line}" (object ${object.id}) not in rendered output`);
        }
      }
    }
    const viewWarning = container.querySelector("[data-canvas-view-warning]");
    if (viewWarning) failures.push('view "package-dependency-chain" did not resolve (warning overlay shown)');
    if (failures.length) {
      console.error("RENDER CHECK FAILED:");
      for (const f of failures) console.error(`  ${f}`);
      process.exit(1);
    }
    console.log("render: ok (all node ids present, every label line found, view resolved)");
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }
}

await main();
process.exit(0);
