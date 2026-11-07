// The docs-system adapter's seed: readies the written pages in a fixtures folder for export, and freezes the brief
// sources that judges read.
//   bun seed.ts <fixtures> <briefs file> <sources dir>      (cwd: the docs-system checkout)
// <fixtures> holds one page folder per brief, <set>/<NN>-<slug>/, each with corpus/ and metrics.json, as the
// docs-system writer writes them. Each corpus's themes link is pointed at this checkout's themes, so a viewer round
// shows the checkout's own theme. Each repo source a brief names is unpacked from DOCS_SOURCE_REF into <sources dir>,
// from this checkout, or from HILL_CLIMB_TARGET when this checkout lacks that commit: the climb driver renders from the
// builder repo, whose one root commit has no history, and names the target checkout in HILL_CLIMB_TARGET.
import { existsSync, readdirSync } from "node:fs";
import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";


const [fixtures, briefsFile, sources] = process.argv.slice(2).map((p) => resolve(p));
if (!fixtures || !briefsFile || !sources) throw new Error("Pass <fixtures> <briefs file> <sources dir>.");
const app = process.cwd();
const ref = process.env.DOCS_SOURCE_REF;

for (const set of ["climb", "held-out"]) {
  if (!existsSync(join(fixtures, set))) continue;
  for (const page of readdirSync(join(fixtures, set))) {
    const corpus = join(fixtures, set, page, "corpus");
    if (!existsSync(corpus)) continue;
    const link = join(corpus, "themes");
    if (await lstat(link).catch(() => null)) await rm(link, { recursive: true, force: true });
    await symlink(join(app, "themes"), link);
  }
}

const briefs = JSON.parse(await readFile(briefsFile, "utf8")) as { sources?: string[] }[];
const missing = [...new Set(briefs.flatMap((b) => b.sources ?? []).filter((s) => !isAbsolute(s) && !existsSync(join(sources, s))))];
if (missing.length) {
  if (!ref) throw new Error(`Set DOCS_SOURCE_REF so the seed can unpack ${missing.length} brief source(s).`);
  const repos = [app, process.env.HILL_CLIMB_TARGET].filter((r): r is string => !!r);
  const repo = repos.find((r) => Bun.spawnSync(["git", "-C", r, "cat-file", "-e", `${ref}^{tree}`]).exitCode === 0);
  if (!repo) throw new Error(`No checkout has DOCS_SOURCE_REF ${ref}, so the seed cannot unpack the brief sources. Looked in ${repos.join(" and ")}.`);
  // Each step's exit is checked on its own: in a pipe, a tar that reads no input can exit 0 (bsdtar on macOS does).
  const archive = Bun.spawnSync(["git", "-C", repo, "archive", ref, ...missing]);
  if (archive.exitCode !== 0) throw new Error(`git archive ${ref} failed in ${repo}: ${archive.stderr.toString().trim()}`);
  await mkdir(sources, { recursive: true });
  const untar = Bun.spawnSync(["tar", "-x", "-f", "-", "-C", sources], { stdin: archive.stdout });
  if (untar.exitCode !== 0) throw new Error(`tar could not unpack the brief sources into ${sources}: ${untar.stderr.toString().trim()}`);
  const still = missing.filter((s) => !existsSync(join(sources, s)));
  if (still.length) throw new Error(`After unpacking ${ref}, ${still.length} brief source(s) are still missing: ${still.join(", ")}.`);
}
console.log(`Seeded ${fixtures}, with ${missing.length} source(s) unpacked from ${ref ?? "no ref"}.`);
