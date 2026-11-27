import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// A fake core with a docs-system main checkout inside it, and a docs-system worktree outside core.
let tmp: string;
let core: string;
let main: string;
let wt: string;

function write(path: string, text = "") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function link(target: string, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

function run(cmd: string[], cwd: string) {
  const result = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

/** Every entry under dir without following links: "name/" for a real folder, "name ->" for a link. */
function tree(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = prefix + entry.name;
      if (entry.isSymbolicLink()) return [`${rel} ->`];
      if (entry.isDirectory()) return [`${rel}/`, ...tree(join(dir, entry.name), `${rel}/`)];
      return [rel];
    });
}

const linkScript = (cwd: string) => run([process.execPath, "scripts/link-packages.ts"], cwd);

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "link-packages-"));
  core = join(tmp, "core");
  main = join(core, "docs-system");
  wt = join(tmp, "wt");

  for (const pkg of ["docs-model", "docs-workbench", "docs-viewer"]) {
    write(join(main, "packages", pkg, "package.json"), JSON.stringify({ name: `@codecaine-ai/${pkg}` }));
  }
  mkdirSync(join(main, "scripts"), { recursive: true });
  copyFileSync(join(import.meta.dir, "link-packages.ts"), join(main, "scripts", "link-packages.ts"));
  write(join(main, ".gitignore"), "node_modules\n");
  const git = ["git", "-c", "user.name=t", "-c", "user.email=t@example.com"];
  run([...git, "init", "-q", "-b", "main"], main);
  run([...git, "add", "-A"], main);
  run([...git, "commit", "-q", "-m", "init"], main);
  run([...git, "worktree", "add", "-q", wt], main);

  // What `bun install` left in the main checkout.
  write(join(main, "packages/docs-workbench/node_modules/tailwindcss/package.json"), "{}");
  write(join(main, "packages/docs-workbench/node_modules/.vite-temp/config.mjs"));
  write(join(main, "packages/docs-viewer/node_modules/marked/package.json"), "{}");
  write(join(main, "node_modules/@types/react/index.d.ts"));
  link("../../packages/docs-model", join(main, "node_modules/@codecaine-ai/docs-model"));

  // Core's shared node_modules, with the self-linking scope that real installs make.
  write(join(core, "node_modules/lodash/package.json"), "{}");
  write(join(core, "node_modules/lodash/cli.js"));
  write(join(core, "node_modules/@scope/a/package.json"), "{}");
  link("../@scope", join(core, "node_modules/@scope/@scope"));
  write(join(core, "node_modules/.cache/entry"));
  link("../lodash/cli.js", join(core, "node_modules/.bin/lodash"));
  link("../@codecaine-ai/docs-model/package.json", join(core, "node_modules/.bin/codecaine-docs"));
  link("../../docs-system/packages/docs-model", join(core, "node_modules/@codecaine-ai/docs-model"));
  write(join(core, "node_modules/@codecaine-ai/design-system/package.json"), "{}");

  // Traps in the worktree: node_modules is a link into core, and a file sits where a folder belongs.
  link(join(core, "node_modules"), join(wt, "node_modules"));
  write(join(wt, "packages/docs-viewer/node_modules"), "keep me");
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("link-packages in a worktree outside core", () => {
  test("replaces a linked node_modules with a flat mirror, leaves core untouched, and is idempotent", () => {
    const coreBefore = tree(join(core, "node_modules"));
    linkScript(wt);

    expect(lstatSync(join(wt, "node_modules")).isSymbolicLink()).toBe(false);
    expect(tree(join(core, "node_modules"))).toEqual(coreBefore);
    const expected = [
      ".bin/",
      ".bin/lodash ->",
      "@codecaine-ai/",
      "@codecaine-ai/design-system ->",
      "@codecaine-ai/docs-model ->",
      "@codecaine-ai/docs-viewer ->",
      "@codecaine-ai/docs-workbench ->",
      "@scope/",
      "@scope/a ->",
      "@types/",
      "@types/react ->",
      "lodash ->",
    ];
    expect(tree(join(wt, "node_modules"))).toEqual(expected);
    expect(Bun.resolveSync("@codecaine-ai/docs-model/package.json", join(wt, "packages/docs-workbench"))).toBe(
      join(wt, "packages/docs-model/package.json"),
    );
    expect(tree(join(wt, "packages/docs-workbench/node_modules"))).toEqual(["tailwindcss ->"]);

    linkScript(wt);
    expect(tree(join(wt, "node_modules"))).toEqual(expected);
  });

  test("leaves a file that sits where node_modules belongs", () => {
    expect(readFileSync(join(wt, "packages/docs-viewer/node_modules"), "utf8")).toBe("keep me");
  });
});

test("link-packages in the main checkout mirrors no dependencies", () => {
  const packageModulesBefore = tree(join(main, "packages/docs-workbench/node_modules"));
  linkScript(main);

  expect(tree(join(main, "node_modules"))).toEqual([
    "@codecaine-ai/",
    "@codecaine-ai/docs-model ->",
    "@codecaine-ai/docs-viewer ->",
    "@codecaine-ai/docs-workbench ->",
    "@types/",
    "@types/react/",
    "@types/react/index.d.ts",
  ]);
  expect(tree(join(main, "packages/docs-workbench/node_modules"))).toEqual(packageModulesBefore);
});
