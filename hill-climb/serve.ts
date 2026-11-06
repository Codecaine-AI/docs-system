// The docs-system adapter's start command: exports each brief's written page with this checkout's viewer, writes
// the page's evidence into its page folder, then serves the exported sites on $PORT.
//   bun serve.ts      (cwd: the docs-system checkout)
// Env: HILL_CLIMB_BRIEFS (the round's briefs file, each brief with record and dir), HILL_CLIMB_FIXTURES (the page
// folders, <set>/<NN>-<slug>/), HILL_CLIMB_ROUND (the round folder), PORT, and CODECAINE_DOCS_GLOBAL_THEMES (an empty
// folder, so the export snapshots the checkout's own theme). DOCS_REBUILD=0 skips the viewer rebuild.
// Each page goes to <round>/site/<record>/, so the adapter route is /<record>/#/<slug>.
// Evidence per page folder: page.md (the export's markdown), blocks.json (the scorable blocks in reading order),
// lint.json (docs_check's blocking count under this checkout's rules) and metrics.json (the writer's, copied).
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { $ } from "bun";

interface Brief { id: number; set: string; slug: string; record: string; dir: string }
interface Block { id: string; type: string; text?: { insert: string }[]; children?: string[] }
interface Doc { root: string; blocks: Record<string, Block> }

const env = (name: string) => { const v = process.env[name]; if (!v) throw new Error(`Set ${name}.`); return v; };
const app = process.cwd();
const briefs = JSON.parse(await readFile(env("HILL_CLIMB_BRIEFS"), "utf8")) as Brief[];
const fixtures = env("HILL_CLIMB_FIXTURES");
const site = join(env("HILL_CLIMB_ROUND"), "site");
const port = Number(env("PORT"));
const emptyThemes = env("CODECAINE_DOCS_GLOBAL_THEMES");
await mkdir(emptyThemes, { recursive: true });

// The block groups a judge scores, as in the tool's schema.ts. Other types (canvas, sequence, embeds) are out of scope.
const GROUPS = new Set(["callout", "code", "structured-table", "file-tree", "interaction-surface", "state-shape", "process-outline", "stack", "call-stack", "component-tree", "pseudocode", "file-explorer"]);
const RICH_TEXT = new Set(["paragraph", "heading", "list-item"]);
const groupOf = (type: string) => (RICH_TEXT.has(type) ? "rich-text" : GROUPS.has(type) ? type : null);

/** The in-scope blocks of a page in reading order, which each judge must score. */
function pageBlocks(doc: Doc) {
  const out: { id: string; type: string; group: string; text: string }[] = [];
  const visit = (id: string) => {
    const block = doc.blocks[id];
    if (!block) return;
    const group = id === doc.root ? null : groupOf(block.type);
    if (group) out.push({ id, type: block.type, group, text: (block.text ?? []).map((s) => s.insert).join("").slice(0, 80) });
    for (const child of block.children ?? []) visit(child);
  };
  visit(doc.root);
  return out;
}

const fromApp = (path: string) => import(join(app, path));
const { useHarfBuzz } = await import(Bun.resolveSync("@codecaine-ai/text-measure/headless", app));
await useHarfBuzz().catch(() => console.error("text-measure: HarfBuzz did not load, so layout lints stay approximate"));
const { validateDocDocument } = await fromApp("packages/docs-model/src/doc-schema.ts");
const { lintDocument } = await fromApp("packages/docs-model/src/lint/index.ts");
const { styleGate } = await fromApp("packages/docs-mcp/src/lint-feedback.ts");

/** The document lint and style gate of the writer's docs_check with task_id. Every finding is introduced: the writer's task made the page. */
function lint(doc: unknown) {
  const parsed = validateDocDocument(doc);
  if (!parsed.ok) throw new Error(`Invalid doc.json: ${parsed.issues.map((i: { message: string }) => i.message).join("; ")}`);
  const report = lintDocument(parsed.document, { phase: "complete" });
  const gated: unknown[] = styleGate(report);
  type Finding = { ruleId: string; severity: string; blockId?: string; message: string };
  return {
    rules: "current rules (no snapshot)", blocking: report.blocking.length + gated.length, styleGate: gated.length,
    findings: report.findings.map((f: Finding) => ({ ruleId: f.ruleId, severity: f.severity, blockId: f.blockId, message: f.message })),
  };
}

let rebuild = process.env.DOCS_REBUILD !== "0";
for (const b of briefs) {
  const written = join(fixtures, b.set, `${String(b.id).padStart(2, "0")}-${b.slug}`);
  const docJson = join(written, "corpus/docs", b.slug, "doc.json");
  if (!existsSync(join(written, "metrics.json")) || !existsSync(docJson)) throw new Error(`No finished page for brief ${b.id} in ${written}.`);
  const out = join(site, b.record);
  const exported = await $`bun ${join(app, "packages/docs-cli/src/index.ts")} export --root ${join(written, "corpus/docs")} --out ${out} ${rebuild ? ["--rebuild"] : []}`.cwd(app).quiet().nothrow();
  if (exported.exitCode !== 0) throw new Error(`Export failed for brief ${b.id}: ${exported.stderr.toString()}`);
  rebuild = false;
  const doc = JSON.parse(await readFile(docJson, "utf8")) as Doc;
  await mkdir(b.dir, { recursive: true });
  await copyFile(join(out, "data/markdown", `${b.slug}.md`), join(b.dir, "page.md"));
  await writeFile(join(b.dir, "blocks.json"), JSON.stringify(pageBlocks(doc), null, 2));
  await writeFile(join(b.dir, "lint.json"), JSON.stringify(lint(doc), null, 2));
  await copyFile(join(written, "metrics.json"), join(b.dir, "metrics.json"));
  console.log(`exported brief ${b.id} to ${out}`);
}

Bun.serve({ port, hostname: "127.0.0.1", async fetch(request) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  if (path === "/") return new Response("ok");
  const target = resolve(site, "." + (path.endsWith("/") ? `${path}index.html` : path));
  // Serve only files inside the exported sites.
  if (!target.startsWith(resolve(site) + sep)) return new Response("Not found", { status: 404 });
  const file = Bun.file(target);
  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
} });
console.log(`serving ${site} on ${port}`);
