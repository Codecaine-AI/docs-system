// The docs-system adapter's seed: readies the written pages in a fixtures folder for export, and freezes the brief
// sources that judges read.
//   bun seed.ts <fixtures> <briefs file> <sources dir>      (cwd: the docs-system checkout)
// <fixtures> holds one page folder per brief, <set>/<NN>-<slug>/, each with corpus/ and metrics.json, as the
// docs-system writer writes them. Each corpus's themes link is pointed at this checkout's themes, so a viewer round
// shows the checkout's own theme. Each repo source a brief names is unpacked from DOCS_SOURCE_REF into <sources dir>.
import { existsSync, readdirSync } from "node:fs";
import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { $ } from "bun";

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
  await mkdir(sources, { recursive: true });
  await $`git -C ${app} archive ${ref} ${missing} | tar -x -f - -C ${sources}`.quiet();
}
console.log(`Seeded ${fixtures}, with ${missing.length} source(s) unpacked from ${ref ?? "no ref"}.`);
