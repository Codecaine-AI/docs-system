// Pushes quality-climb images to the quality-climb-assets branch, which PR bodies link their images from.
//   bun evals/quality-climb/assets.ts --round <n> [--set climb|held-out]
//   bun evals/quality-climb/assets.ts --compare <compare.ts out dir>
// --round copies .tmp/quality-climb/round-<n>/<set>/<NN>-<slug>/page.png to round-<n>/<NN>-<slug>.png.
// --compare copies the side-by-side PNGs that compare.json lists to lanes/<lane>/<after>-vs-<before>/, then prints
// a markdown section that embeds them, for a lane PR body, and saves it as compare.md beside compare.json.
// Each push uses a temporary worktree that it removes. A local brief's page is never published, and --compare
// publishes climb pages only.
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import { loadBriefs, type RoundBrief } from "./briefs";
import type { CompareManifest } from "./compare";
import { REPO } from "./write";

export const ASSET_BRANCH = "quality-climb-assets";
export const assetName = (b: RoundBrief) => `${String(b.id).padStart(2, "0")}-${b.slug}.png`;

/** The briefs of `set` whose renders may be published: never a local brief. */
export const publishable = (briefs: RoundBrief[], set: string) => briefs.filter((b) => b.set === set && !b.local);

/**
 * A compare.ts manifest without the pages of local briefs, as `publishable` does for a round. A page folder is
 * <NN>-<slug>, so a page whose slug is a local brief's is dropped, and so is the full-page image made from it.
 */
export function publishableCompare(m: CompareManifest, briefs: RoundBrief[]): CompareManifest {
  const local = new Set(briefs.filter((b) => b.local).map((b) => b.slug));
  const pages = m.pages.filter((p) => !local.has(p.page.replace(/^\d+-/, "")));
  const full = m.full && pages.some((p) => m.full === `full-${p.image}`) ? m.full : null;
  return { ...m, pages, full };
}

/** The asset branch folder of one compare.ts run. */
export const compareFolder = (m: CompareManifest) => `lanes/${m.lane}/${m.after}-vs-${m.before}`.replace(/[^\w./-]+/g, "-");

/** The PR body section that embeds a compare.ts run, with each image under `baseUrl` (the folder's raw URL). */
export function compareSection(m: CompareManifest, baseUrl: string): string {
  const img = (file: string, width: number) => `<img src="${baseUrl}/${file}" width="${width}">`;
  return [
    `### ${m.lane}: Before and After`,
    "",
    `Each image puts the \`${m.lane}\` blocks of ${m.before} on the left and of ${m.after} on the right. Only climb pages are shown.`,
    "",
    ...m.pages.flatMap((p) => [`**${p.page}** (${p.regions} block region${p.regions === 1 ? "" : "s"})`, "", img(p.image, 900), ""]),
    ...(m.full ? ["<details><summary>Full page, before and after</summary>", "", img(m.full, 900), "", "</details>", ""] : []),
  ].join("\n");
}

/** Copies each file into a worktree of the asset branch, commits and pushes. Returns the new commit, or null when nothing changed. */
async function pushAssets(files: { from: string; to: string }[], message: string): Promise<string | null> {
  const missing = files.filter((p) => !existsSync(p.from));
  if (missing.length) throw new Error(`No image for ${missing.map((p) => p.to).join(", ")}.`);
  const tree = join(await mkdtemp(join(tmpdir(), "quality-climb-assets-")), "tree");
  await $`git -C ${REPO} fetch origin ${ASSET_BRANCH}`.quiet();
  await $`git -C ${REPO} worktree add --detach ${tree} origin/${ASSET_BRANCH}`.quiet();
  try {
    for (const p of files) {
      await mkdir(dirname(join(tree, p.to)), { recursive: true });
      await copyFile(p.from, join(tree, p.to));
    }
    await $`git -C ${tree} add ${files.map((p) => p.to)}`;
    if ((await $`git -C ${tree} diff --cached --quiet`.nothrow()).exitCode === 0) return null;
    await $`git -C ${tree} commit -q -m ${`${message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`}`;
    await $`git -C ${tree} push -q origin HEAD:${ASSET_BRANCH}`;
    return (await $`git -C ${tree} rev-parse HEAD`.text()).trim();
  } finally {
    await $`git -C ${REPO} worktree remove --force ${tree}`.quiet().nothrow();
  }
}

if (import.meta.main) {
  const { values: opt } = parseArgs({ options: { round: { type: "string" }, set: { type: "string", default: "climb" }, compare: { type: "string" } } });
  if (opt.compare) {
    const dir = resolve(opt.compare);
    const all = JSON.parse(await readFile(join(dir, "compare.json"), "utf8")) as CompareManifest;
    if (all.set !== "climb") throw new Error(`${dir}/compare.json is not a climb-set comparison, so it is not published.`);
    const manifest = publishableCompare(all, loadBriefs());
    if (manifest.pages.length < all.pages.length) console.error(`Skipped ${all.pages.length - manifest.pages.length} local brief page(s).`);
    const folder = compareFolder(manifest);
    const images = [...manifest.pages.map((p) => p.image), ...(manifest.full ? [manifest.full] : [])];
    const commit = await pushAssets(images.map((image) => ({ from: join(dir, image), to: `${folder}/${image}` })), `Lane ${manifest.lane} side-by-side images, ${manifest.after} against ${manifest.before}`);
    const repo = (await $`gh repo view --json nameWithOwner -q .nameWithOwner`.cwd(REPO).text()).trim();
    const section = compareSection(manifest, `https://raw.githubusercontent.com/${repo}/${ASSET_BRANCH}/${folder}`);
    await writeFile(join(dir, "compare.md"), section);
    console.error(commit ? `Pushed ${images.length} images: ${commit}` : "No change to push.");
    console.log(section);
  } else {
    if (!opt.round) throw new Error("Pass --round <n> or --compare <dir>.");
    if (opt.set !== "climb" && opt.set !== "held-out") throw new Error(`--set must be one of: climb, held-out. Got: ${opt.set}`);
    const roundDir = join(REPO, ".tmp/quality-climb", `round-${opt.round}`, opt.set!);
    const pages = publishable(loadBriefs(), opt.set!).map((b) => ({ from: join(roundDir, assetName(b).replace(/\.png$/, ""), "page.png"), to: `round-${opt.round}/${assetName(b)}` }));
    const commit = await pushAssets(pages, `Round ${opt.round} ${opt.set} page renders for the quality climb`);
    console.log(commit ? `Pushed ${pages.length} renders: ${commit}` : "No change to push.");
  }
}
