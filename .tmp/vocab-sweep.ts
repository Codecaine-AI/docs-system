import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  serializeDocDocument,
  validateDocDocument,
} from "../packages/docs-model/src/index.ts";

const REPO = join(import.meta.dir, "..");

type Edit = {
  block?: string; // absent => top-level doc field
  path: string; // "text[4]" | "props.rows[0][3]" | "title" (top-level) etc.
  find: string;
  replace: string;
};

const EDITS: Record<string, Edit[]> = {
  "10-system-design/20-data-model/00-overview": [
    { block: "b-00-overview-lead-2", path: "text[4]", find: "a pure markdown projection", replace: "a pure markdown render" },
    { block: "b-00-overview-canonical-bytes-9", path: "text[1]", find: "the markdown projection map", replace: "the markdown render map" },
  ],
  "10-system-design/20-data-model/10-document-tree": [
    { block: "b-10-document-tree-envelope-example-4", path: "props.annotations[0].note", find: "Rendering and projection skip the root's own paragraph wrapper and walk", replace: "Both the viewer and the markdown render skip the root's own paragraph wrapper and walk" },
  ],
  "10-system-design/20-data-model/20-rich-text": [
    { block: "b-20-rich-text-bridges-out-15", path: "text[2]", find: "for the runtime projection", replace: "for the agent surface" },
    { block: "b-20-rich-text-bridges-out-15", path: "text[2]", find: "Reference marks project as plain text", replace: "Reference marks render as plain text" },
    { block: "b-20-rich-text-bridges-out-15", path: "text[2]", find: "the projection is a greppable terminal artifact", replace: "the rendered markdown is a greppable terminal artifact" },
    { block: "b-20-rich-text-closing-18", path: "text[4]", find: "how spans project to greppable markdown", replace: "how spans render to greppable markdown" },
  ],
  "10-system-design/20-data-model/30-block-state": [
    { block: "b-30-block-state-bundles-intro-4", path: "text[2]", find: " projection function.", replace: " render function." },
  ],
  "10-system-design/20-data-model/50-canonical-bytes": [
    { path: "title", find: "serialization, projection, hashing", replace: "serialization, rendering, hashing" },
    { block: "b-50-canonical-bytes-title-1", path: "text[0]", find: "serialization, projection, hashing", replace: "serialization, rendering, hashing" },
    { block: "b-50-canonical-bytes-lead-2", path: "text[0]", find: "a markdown projection for agents", replace: "a markdown render for agents" },
    { block: "b-50-canonical-bytes-projection-8", path: "text[0]", find: "The markdown projection", replace: "The markdown render" },
    { block: "b-50-canonical-bytes-projection-intro-9", path: "text[2]", find: "so the projection can never go stale", replace: "so the render can never go stale" },
    { block: "b-50-canonical-bytes-projection-table-10", path: "props.columns[1]", find: "projects as", replace: "renders as" },
    { block: "b-50-canonical-bytes-projection-table-10", path: "props.title", find: "Projection map", replace: "Render map" },
  ],
  "10-system-design/30-block-vocabulary/00-overview": [
    { block: "b-00-vocab-overview-lead-2", path: "text[2]", find: "The markdown projection (", replace: "The markdown render (" },
    { block: "b-00-vocab-overview-lead-2", path: "text[10]", find: ") is the primary consumer: ", replace: ") is the agent surface: " },
    { block: "b-00-vocab-overview-fourteen-3", path: "text[4]", find: "keeps the projection stable", replace: "keeps the render stable" },
    { block: "b-00-vocab-overview-actions-18", path: "text[4]", find: " markdown projection.", replace: " markdown render." },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/10-paragraph": [
    { block: "b-10-paragraph-proj-h-5", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-10-paragraph-proj-6", path: "text[2]", find: "because the projection is a greppable terminal artifact", replace: "because the agent surface is a greppable terminal artifact" },
    { block: "b-10-paragraph-proj-6", path: "text[2]", find: "projects nothing at all", replace: "renders nothing at all" },
    { block: "b-10-paragraph-proj-6", path: "text[2]", find: "only its children project.", replace: "only its children render." },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/11-heading": [
    { block: "b-11-heading-state-4", path: "props.rows[0][3]", find: "the renderer, editor, and projection all treat", replace: "the renderer, editor, and agent surface all treat" },
    { block: "b-11-heading-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/12-list-item": [
    { block: "b-12-list-item-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-12-list-item-proj-7", path: "text[6]", find: "children project as nested list lines", replace: "children render as nested list lines" },
    { block: "b-12-list-item-agent-2-12", path: "text[0]", find: "derived at projection time", replace: "derived at render time" },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/13-quote": [
    { block: "b-13-quote-proj-h-5", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-13-quote-agent-2-11", path: "text[0]", find: "In projection output,", replace: "In the rendered markdown," },
    { block: "b-13-quote-agent-2-11", path: "text[2]", find: "callout, mermaid, and video projections", replace: "callout, mermaid, and video renders" },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/14-callout": [
    { block: "b-15-callout-state-4", path: "props.rows[0][3]", find: "the projection label falls back", replace: "the markdown render's label falls back" },
    { block: "b-15-callout-state-4", path: "props.rows[1][3]", find: "wins over tone in the projection.", replace: "wins over tone in the markdown render." },
    { block: "b-15-callout-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-15-callout-proj-7", path: "text[9]", find: "projects exactly that way.", replace: "renders exactly that way." },
    { block: "b-15-callout-coercion-9", path: "text[6]", find: "One projection rule covers them all.", replace: "One render rule covers them all." },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/15-divider": [
    { block: "b-16-divider-proj-h-5", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/16-image": [
    { block: "b-30-image-state-4", path: "props.rows[1][3]", find: "the projection falls back to caption", replace: "the markdown render falls back to caption" },
    { block: "b-30-image-state-4", path: "props.rows[2][3]", find: "an italic line in the projection.", replace: "an italic line in the markdown render." },
    { block: "b-30-image-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-30-image-agent-2-12", path: "text[2]", find: ": the projection is text-first, and ", replace: ": the agent surface is text-first, and " },
  ],
  "10-system-design/30-block-vocabulary/10-rich-text/17-video": [
    { block: "b-31-video-state-4", path: "props.rows[2][3]", find: "also used in the projection label.", replace: "also used in the markdown render's label." },
    { block: "b-31-video-state-4", path: "props.rows[3][3]", find: "Caption appended to the projection line.", replace: "Caption appended to the rendered markdown line." },
    { block: "b-31-video-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-31-video-agent-2-12", path: "text[2]", find: " — in the projection, that title", replace: " — in the rendered markdown, that title" },
  ],
  "10-system-design/30-block-vocabulary/20-code": [
    { block: "b-14-code-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
  ],
  "10-system-design/30-block-vocabulary/30-structured-table": [
    { block: "b-20-structured-table-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-20-structured-table-proj-7", path: "text[4]", find: "block projects just the part it has.", replace: "block renders just the part it has." },
  ],
  "10-system-design/30-block-vocabulary/40-file-tree": [
    { block: "b-21-file-tree-lead-2", path: "text[2]", find: "renders — and projects — as a ", replace: "renders — on both surfaces — as a " },
    { block: "b-21-file-tree-proj-h-7", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-21-file-tree-agent-2-16", path: "text[4]", find: " and the projection draws ", replace: " and the markdown render draws " },
  ],
  "10-system-design/30-block-vocabulary/50-interaction-surface": [
    { block: "b-22-interaction-surface-proj-h-7", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
  ],
  "10-system-design/30-block-vocabulary/60-mermaid": [
    { block: "b-23-mermaid-state-4", path: "props.rows[0][3]", find: "Label used in the projection and the rendered header.", replace: "Label used in the agent surface and the rendered header." },
    { block: "b-23-mermaid-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
    { block: "b-23-mermaid-proj-7", path: "text[6]", find: "the projection is a greppable summary line", replace: "the agent surface is a greppable summary line" },
    { block: "b-23-mermaid-agent-2-12", path: "text[0]", find: "Because the projection flattens", replace: "Because the markdown render flattens" },
    { block: "b-23-mermaid-agent-2-12", path: "text[0]", find: "the projection reader sees", replace: "the markdown reader sees" },
  ],
  "10-system-design/30-block-vocabulary/70-canvas": [
    { block: "b-24-canvas-state-4", path: "props.rows[1][3]", find: "used by the projection.", replace: "used by the markdown render." },
    { block: "b-24-canvas-proj-h-6", path: "text[0]", find: "Markdown projection", replace: "Markdown render" },
  ],
  "10-system-design/50-packages/00-overview": [
    { block: "b-00-overview-model-role-5", path: "text[1]", find: "Markdown projection in both directions.", replace: "Markdown conversion in both directions." },
  ],
  "10-system-design/50-packages/10-docs-model": [
    { block: "b-10-docs-model-lead-2", path: "text[3]", find: "format, operations, and projections that", replace: "format, operations, and rendering that" },
    { block: "b-10-docs-model-tree-6", path: "props.entries[5].note", find: "Document-to-Markdown projection.", replace: "Document-to-Markdown render." },
    { block: "b-10-docs-model-components-8", path: "text[4]", find: "validation, discovery, projection, and typed actions.", replace: "validation, discovery, rendering, and typed actions." },
    { block: "b-10-docs-model-projection-10", path: "text[3]", find: "cover Markdown projection in both directions: documents project to Markdown,", replace: "cover Markdown conversion in both directions: documents render to Markdown," },
    { block: "b-10-docs-model-dependency-table-16", path: "props.rows[6][2]", find: "the shared format and projections from the CLI.", replace: "the shared format and rendering from the CLI." },
    { block: "b-10-docs-model-consumers-19", path: "text[0]", find: "mutate, or project ", replace: "mutate, or render " },
  ],
  "10-system-design/50-packages/40-docs-viewer": [
    { block: "b-40-docs-viewer-renderer-4", path: "text[0]", find: "Read-only projection. ", replace: "Read-only render. " },
  ],
  "10-system-design/50-packages/60-docs-cli": [
    { block: "b-60-docs-cli-command-table-4", path: "props.rows[0][1]", find: "Projects a bundle to agent-readable markdown.", replace: "Renders a bundle to agent-readable markdown." },
    { block: "b-60-docs-cli-dependencies-8", path: "text[2]", find: " for render/projection, ", replace: " for rendering, " },
  ],
  "20-implementation/10-package-map": [
    { block: "b-10-package-map-roles-102", path: "props.rows[0][1]", find: "markdown projection", replace: "markdown render" },
  ],
};

function parsePath(p: string): (string | number)[] {
  const parts: (string | number)[] = [];
  for (const m of p.matchAll(/([A-Za-z_][\w-]*)|\[(\d+)\]/g)) {
    if (m[1] !== undefined) parts.push(m[1]);
    else parts.push(Number(m[2]));
  }
  return parts;
}

let total = 0;
for (const [rel, edits] of Object.entries(EDITS)) {
  const file = join(REPO, "docs", rel, "doc.json");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const pre = validateDocDocument(doc);
  if (!pre.ok) throw new Error(`${rel}: pre-validate failed: ${JSON.stringify(pre)}`);

  for (const e of edits) {
    const rootObj = e.block ? doc.blocks[e.block] : doc;
    if (e.block && !rootObj) throw new Error(`${rel}: missing block ${e.block}`);
    const parts = parsePath(e.path);
    let parent: any = rootObj;
    for (let i = 0; i < parts.length - 1; i++) parent = parent[parts[i]];
    const last = parts[parts.length - 1];
    let target: string;
    // text[N] means the span object; the string is .insert
    let isSpan = false;
    if (parts[0] === "text") {
      isSpan = true;
      target = parent[last].insert;
    } else {
      target = parent[last];
    }
    if (typeof target !== "string") throw new Error(`${rel} ${e.block ?? "(doc)"} ${e.path}: not a string`);
    const count = target.split(e.find).length - 1;
    if (count !== 1) throw new Error(`${rel} ${e.block ?? "(doc)"} ${e.path}: find occurs ${count}x: ${JSON.stringify(e.find)}`);
    const next = target.replace(e.find, e.replace);
    if (isSpan) parent[last].insert = next;
    else parent[last] = next;
    total++;
  }

  const post = validateDocDocument(doc);
  if (!post.ok) throw new Error(`${rel}: post-validate failed: ${JSON.stringify(post)}`);
  writeFileSync(file, serializeDocDocument(doc));
  console.log(`ok ${rel} (${edits.length} edits)`);
}
console.log(`total edits: ${total}`);
