// Pushes a round's page renders to the quality-climb-assets branch, which the draft PR links its images from.
//   bun evals/quality-climb/assets.ts --round <n> [--set climb|held-out]
// Copies .tmp/quality-climb/round-<n>/<set>/<NN>-<slug>/page.png to round-<n>/<NN>-<slug>.png in a temporary
// worktree, commits, pushes and removes the worktree. A local brief's page is never published.
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import { loadBriefs, type RoundBrief } from "./briefs";
import { REPO } from "./write";

export const ASSET_BRANCH = "quality-climb-assets";
export const assetName = (b: RoundBrief) => `${String(b.id).padStart(2, "0")}-${b.slug}.png`;

/** The briefs of `set` whose renders may be published: never a local brief. */
export const publishable = (briefs: RoundBrief[], set: string) => briefs.filter((b) => b.set === set && !b.local);

if (import.meta.main) {
  const { values: opt } = parseArgs({ options: { round: { type: "string" }, set: { type: "string", default: "climb" } } });
  if (!opt.round) throw new Error("Pass --round <n>.");
  if (opt.set !== "climb" && opt.set !== "held-out") throw new Error(`--set must be one of: climb, held-out. Got: ${opt.set}`);
  const roundDir = join(REPO, ".tmp/quality-climb", `round-${opt.round}`, opt.set!);
  const pages = publishable(loadBriefs(), opt.set!).map((b) => ({ from: join(roundDir, assetName(b).replace(/\.png$/, ""), "page.png"), to: `round-${opt.round}/${assetName(b)}` }));
  const missing = pages.filter((p) => !existsSync(p.from));
  if (missing.length) throw new Error(`No render for ${missing.map((p) => p.to).join(", ")}.`);
  const tree = join(await mkdtemp(join(tmpdir(), "quality-climb-assets-")), "tree");
  await $`git -C ${REPO} fetch origin ${ASSET_BRANCH}`.quiet();
  await $`git -C ${REPO} worktree add --detach ${tree} origin/${ASSET_BRANCH}`.quiet();
  try {
    await mkdir(join(tree, `round-${opt.round}`), { recursive: true });
    for (const p of pages) await copyFile(p.from, join(tree, p.to));
    await $`git -C ${tree} add ${pages.map((p) => p.to)}`;
    const staged = await $`git -C ${tree} diff --cached --quiet`.nothrow();
    if (staged.exitCode === 0) console.log("No change to push.");
    else {
      const message = `Round ${opt.round} ${opt.set} page renders for the quality climb\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
      await $`git -C ${tree} commit -q -m ${message}`;
      await $`git -C ${tree} push -q origin HEAD:${ASSET_BRANCH}`;
      console.log(`Pushed ${pages.length} renders: ${(await $`git -C ${tree} rev-parse HEAD`.text()).trim()}`);
    }
  } finally {
    await $`git -C ${REPO} worktree remove --force ${tree}`.quiet().nothrow();
  }
}
