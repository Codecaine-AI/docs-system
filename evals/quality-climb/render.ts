// Renders one written page: `docs-cli export` of its scratch corpus to a static site, a Playwright PNG of the
// whole page at a fixed viewport, its markdown, its scorable blocks, and its docs_check lint findings.
// `bun render.ts lint <doc.json> <rules root>` lints with the docs-model and docs-mcp code found under the rules root.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { $ } from "bun";
import type { DocDocument } from "../../packages/docs-model/src/doc-schema";
import type { LintReport } from "../../packages/docs-model/src/lint";
import type { Box } from "./images";
import { groupOf, type BlockGroup, type Brief } from "./schema";
import { REPO, pagePath } from "./write";

export const VIEWPORT = { width: 1280, height: 900 } as const;

export interface PageBlock { id: string; type: string; group: BlockGroup; text: string }
/** `blocking` counts what the writer's docs_check with task_id blocks on: lint errors plus `styleGate` gated style findings. */
export interface LintSummary { rules: string; blocking: number; styleGate: number; findings: { ruleId: string; severity: string; blockId?: string; message: string }[] }

/** The in-scope blocks of a page in reading order, which each judge must score. */
export function pageBlocks(doc: DocDocument): PageBlock[] {
  const out: PageBlock[] = [];
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

/**
 * The tree whose lint rules judge the pages. With a git ref, the ref's packages/ folder is unpacked once
 * under .tmp/quality-climb/lint-rules/<sha>, so a later weaker rule cannot hide a fault the snapshot catches.
 */
export async function lintRules(ref?: string): Promise<{ root: string; label: string }> {
  if (!ref) return { root: REPO, label: "current rules (no snapshot)" };
  const sha = (await $`git -C ${REPO} rev-parse ${ref}^{commit}`.text()).trim();
  const root = join(REPO, ".tmp/quality-climb/lint-rules", sha);
  if (!existsSync(join(root, ".complete"))) {
    await mkdir(join(root, "node_modules/@codecaine-ai"), { recursive: true });
    const archive = join(root, "packages.tar");
    await $`git -C ${REPO} archive -o ${archive} ${sha} packages`;
    await $`tar -x -f ${archive} -C ${root} && rm ${archive}`;
    // The snapshot's own docs packages win over the worktree's when its code imports them by package name.
    for (const name of ["docs-model", "docs-index", "docs-server", "docs-style"]) {
      if (!existsSync(join(root, "node_modules/@codecaine-ai", name))) await symlink(join(root, "packages", name), join(root, "node_modules/@codecaine-ai", name));
    }
    await writeFile(join(root, ".complete"), sha);
  }
  return { root, label: `rules@${sha.slice(0, 12)}` };
}

/** The document lint and style gate of the writer's docs_check with task_id, under the rules in `root`. */
export async function lintPage(docJson: string, rules: { root: string; label: string }): Promise<LintSummary> {
  const out = await $`bun ${import.meta.path} lint ${docJson} ${rules.root}`.cwd(rules.root).quiet().nothrow();
  if (out.exitCode !== 0) throw new Error(`Lint under ${rules.label} failed: ${out.stderr.toString()}`);
  return { rules: rules.label, ...JSON.parse(out.stdout.toString()) };
}

/** Screenshots the page's scroller to `png` and returns the box of each block in PNG pixels, keyed by block id. */
async function screenshot(siteDir: string, slug: string, png: string): Promise<Record<string, Box>> {
  const { chromium } = await import("playwright");
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const target = resolve(siteDir, "." + (path === "/" ? "/index.html" : path));
    // Serve only files inside the exported site.
    if (!target.startsWith(resolve(siteDir) + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(target);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { ...VIEWPORT }, colorScheme: "light", deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.port}/#/${slug}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-docs-scroller] [data-block-id]", { timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    // The page scrolls inside the workbench scroller: grow the window until the scroller shows all of it.
    for (let i = 0; i < 4; i++) {
      const hidden = await page.evaluate(() => { const s = document.querySelector<HTMLElement>("[data-docs-scroller]")!; return s.scrollHeight - s.clientHeight; });
      if (hidden <= 0) break;
      await page.setViewportSize({ width: VIEWPORT.width, height: page.viewportSize()!.height + hidden });
      await page.waitForTimeout(300);
    }
    await page.locator("[data-docs-scroller]").screenshot({ path: png });
    return await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>("[data-docs-scroller]")!;
      const origin = scroller.getBoundingClientRect();
      const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
      for (const el of scroller.querySelectorAll<HTMLElement>("[data-block-id]")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) boxes[el.dataset.blockId!] ??= { x: r.left - origin.left, y: r.top - origin.top + scroller.scrollTop, width: r.width, height: r.height };
      }
      return boxes;
    });
  } finally {
    await browser.close();
    server.stop(true);
  }
}

/**
 * Renders the brief's page in `pageDir` to page.png, page.md, blocks.json, boxes.json (each block's place in the PNG) and lint.json. `rebuild` rebuilds the viewer SPA first.
 * `systemRoot` is the Docs System checkout that exports the page (this worktree by default).
 */
export async function renderPage(brief: Brief, pageDir: string, rules: { root: string; label: string }, rebuild: boolean, systemRoot = REPO) {
  const siteDir = join(pageDir, "site");
  const emptyThemes = join(pageDir, "no-global-theme");
  await mkdir(emptyThemes, { recursive: true });
  // No global theme: the export snapshots the repo's own default theme, which the climb may change.
  const exported = await $`bun ${join(systemRoot, "packages/docs-cli/src/index.ts")} export --root ${join(pageDir, "corpus/docs")} --out ${siteDir} ${rebuild ? ["--rebuild"] : []}`
    .env({ ...process.env, CODECAINE_DOCS_GLOBAL_THEMES: emptyThemes } as Record<string, string>).cwd(systemRoot).quiet().nothrow();
  if (exported.exitCode !== 0) throw new Error(`Export failed for brief ${brief.id}: ${exported.stderr.toString()}`);
  const docJson = pagePath(pageDir, brief);
  const doc = JSON.parse(await readFile(docJson, "utf8")) as DocDocument;
  await copyFile(join(siteDir, "data/markdown", `${brief.slug}.md`), join(pageDir, "page.md"));
  await writeFile(join(pageDir, "blocks.json"), JSON.stringify(pageBlocks(doc), null, 2));
  const lint = await lintPage(docJson, rules);
  await writeFile(join(pageDir, "lint.json"), JSON.stringify(lint, null, 2));
  const boxes = await screenshot(siteDir, brief.slug, join(pageDir, "page.png"));
  await writeFile(join(pageDir, "boxes.json"), JSON.stringify(boxes, null, 2));
  return { png: join(pageDir, "page.png"), lint };
}

if (import.meta.main && process.argv[2] === "lint") {
  const { useHarfBuzz } = await import("@codecaine-ai/text-measure/headless");
  await useHarfBuzz().catch(() => console.error("text-measure: HarfBuzz did not load, so layout lints stay approximate"));
  const model = join(process.argv[4]!, "packages/docs-model/src");
  const { validateDocDocument } = await import(join(model, "doc-schema.ts"));
  const { lintDocument } = await import(join(model, "lint/index.ts"));
  const { styleGate } = await import(join(process.argv[4]!, "packages/docs-mcp/src/lint-feedback.ts"));
  const parsed = validateDocDocument(JSON.parse(await readFile(process.argv[3]!, "utf8")));
  if (!parsed.ok) throw new Error(`Invalid doc.json: ${parsed.issues.map((i: { message: string }) => i.message).join("; ")}`);
  // The writer's task created the page, so docs_check has no baseline for it and every finding is introduced.
  const report: LintReport = lintDocument(parsed.document, { phase: "complete" });
  const gated: unknown[] = styleGate(report);
  const brief = (f: (typeof report.findings)[number]) => ({ ruleId: f.ruleId, severity: f.severity, blockId: f.blockId, message: f.message });
  console.log(JSON.stringify({ blocking: report.blocking.length + gated.length, styleGate: gated.length, findings: report.findings.map(brief) }));
}
