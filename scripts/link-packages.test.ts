import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

// A fake core with a docs-system main checkout inside it, three docs-system worktrees (outside core,
// inside core and nested in the main checkout), and three trees that have no main checkout to mirror from.
let tmp: string;
let core: string;
let main: string;
let outside: string;
let inside: string;
let nested: string;

const MEMBERS = ["action-log", "annotations", "canvas", "design-system", "sequence", "text-measure"];

function write(path: string, text = "") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function link(target: string, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

function run(cmd: string[], cwd: string, env?: Record<string, string>) {
  const result = Bun.spawnSync(cmd, { cwd, env: env ?? process.env, stdout: "pipe", stderr: "pipe" });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function git(args: string[], cwd: string) {
  const result = run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], cwd);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed in the fixture: ${result.stderr}`);
}

const linkScript = (cwd: string, env?: Record<string, string>) => run([process.execPath, "scripts/link-packages.ts"], cwd, env);
const checkScript = (cwd: string) => run([process.execPath, "scripts/link-packages.ts", "--check"], cwd);

/**
 * Every entry under dir, read without following a link: "name/" for a real folder, and
 * "name -> <where it really lands, from the fixture root>" for a link.
 */
function where(dir: string, skip: string[] = [], prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !skip.includes(entry.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const rel = prefix + entry.name;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) return [`${rel} -> ${existsSync(path) ? relative(tmp, realpathSync(path)) : "BROKEN"}`];
      if (entry.isDirectory()) return [`${rel}/`, ...where(path, skip, `${rel}/`)];
      return [rel];
    });
}

/** Core and the main checkout in it, without the worktrees under core/trees and the main checkout's .worktrees. */
const coreAndMain = () => where(core, [".git", "trees", ".worktrees"]);

/** The source files of a docs-system tree: four packages, one with a bin, and the script under test. */
function seed(tree: string) {
  for (const pkg of ["docs-model", "docs-workbench", "docs-viewer"]) {
    write(join(tree, "packages", pkg, "package.json"), JSON.stringify({ name: `@codecaine-ai/${pkg}` }));
  }
  write(join(tree, "packages/docs-cli/package.json"), JSON.stringify({ name: "@codecaine-ai/docs-cli", bin: { "docs-cli": "./src/index.ts" } }));
  write(join(tree, "packages/docs-cli/src/index.ts"));
  mkdirSync(join(tree, "scripts"), { recursive: true });
  copyFileSync(join(import.meta.dir, "link-packages.ts"), join(tree, "scripts", "link-packages.ts"));
  write(join(tree, ".gitignore"), "node_modules\n");
}

function commit(tree: string) {
  git(["add", "-A"], tree);
  git(["commit", "-q", "-m", "init"], tree);
}

/** The links a tree makes for its own packages and bin, as `where` prints them. */
const ownLinks = (tree: string) => [
  ".bin/",
  `.bin/docs-cli -> ${tree}/packages/docs-cli/src/index.ts`,
  "@codecaine-ai/",
  `@codecaine-ai/docs-cli -> ${tree}/packages/docs-cli`,
  `@codecaine-ai/docs-model -> ${tree}/packages/docs-model`,
  `@codecaine-ai/docs-viewer -> ${tree}/packages/docs-viewer`,
  `@codecaine-ai/docs-workbench -> ${tree}/packages/docs-workbench`,
];

/** The root node_modules of a tree that mirrors the main checkout's and core's, as `where` prints it. */
const mirroredRoot = (tree: string) => [
  ".bin/",
  `.bin/docs-cli -> ${tree}/packages/docs-cli/src/index.ts`,
  ".bin/lodash -> core/node_modules/lodash/cli.js",
  ".bin/tsc -> core/node_modules/typescript/bin/tsc",
  "@codecaine-ai/",
  "@codecaine-ai/action-log -> core/action-log",
  "@codecaine-ai/annotations -> core/annotations",
  "@codecaine-ai/canvas -> core/canvas",
  "@codecaine-ai/design-system -> core/design-system",
  `@codecaine-ai/docs-cli -> ${tree}/packages/docs-cli`,
  `@codecaine-ai/docs-model -> ${tree}/packages/docs-model`,
  `@codecaine-ai/docs-viewer -> ${tree}/packages/docs-viewer`,
  `@codecaine-ai/docs-workbench -> ${tree}/packages/docs-workbench`,
  "@codecaine-ai/sequence -> core/sequence",
  "@codecaine-ai/text-measure -> core/text-measure",
  "@scope/",
  "@scope/a -> core/node_modules/@scope/a",
  "@types/",
  "@types/react -> core/docs-system/node_modules/@types/react",
  "lodash -> core/node_modules/lodash",
  "tailwindcss -> core/node_modules/tailwindcss",
  "typescript -> core/node_modules/typescript",
];

const WORKBENCH_MODULES = [
  ".bin/",
  ".bin/tailwindcss -> core/docs-system/packages/docs-workbench/node_modules/tailwindcss/cli.js",
  "tailwindcss -> core/docs-system/packages/docs-workbench/node_modules/tailwindcss",
];

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "link-packages-")));
  core = join(tmp, "core");
  main = join(core, "docs-system");
  outside = join(tmp, "outside");
  inside = join(core, "trees/inside");
  nested = join(main, ".worktrees/nested");

  seed(main);
  git(["init", "-q", "-b", "main"], main);
  commit(main);
  git(["worktree", "add", "-q", outside], main);
  git(["worktree", "add", "-q", inside], main);
  git(["worktree", "add", "-q", nested], main);

  // What `bun install` left in the main checkout: docs-workbench's own tailwindcss with its bin and a
  // Vite cache, and a root node_modules that links the workspace packages and an external/ submodule.
  write(join(main, "packages/docs-workbench/node_modules/tailwindcss/package.json"), '{"version":"4.0.0"}');
  write(join(main, "packages/docs-workbench/node_modules/tailwindcss/cli.js"));
  link("../tailwindcss/cli.js", join(main, "packages/docs-workbench/node_modules/.bin/tailwindcss"));
  write(join(main, "packages/docs-workbench/node_modules/.vite-temp/config.mjs"));
  write(join(main, "packages/docs-viewer/node_modules/marked/package.json"), "{}");
  write(join(main, "node_modules/@types/react/index.d.ts"));
  write(join(main, "external/annotations/package.json"), "{}");
  link("../../packages/docs-model", join(main, "node_modules/@codecaine-ai/docs-model"));
  link("../../external/annotations", join(main, "node_modules/@codecaine-ai/annotations"));
  // A package that main gained after the worktrees branched off.
  write(join(main, "packages/docs-extra/package.json"), JSON.stringify({ name: "@codecaine-ai/docs-extra" }));
  link("../../packages/docs-extra", join(main, "node_modules/@codecaine-ai/docs-extra"));

  // Core's shared node_modules: installed packages and their bins, a scope that links to itself,
  // a cache, a broken bin, the member checkouts, and the main checkout's packages and CLI.
  write(join(core, "node_modules/lodash/package.json"), "{}");
  write(join(core, "node_modules/lodash/cli.js"));
  write(join(core, "node_modules/typescript/bin/tsc"));
  write(join(core, "node_modules/tailwindcss/package.json"), '{"version":"3.0.0"}');
  write(join(core, "node_modules/@scope/a/package.json"), "{}");
  link("../@scope", join(core, "node_modules/@scope/@scope"));
  write(join(core, "node_modules/.cache/entry"));
  link("../lodash/cli.js", join(core, "node_modules/.bin/lodash"));
  link("../typescript/bin/tsc", join(core, "node_modules/.bin/tsc"));
  link("../ghost/cli.js", join(core, "node_modules/.bin/ghost"));
  link("../@codecaine-ai/docs-cli/src/index.ts", join(core, "node_modules/.bin/docs-cli"));
  for (const pkg of ["docs-model", "docs-cli", "docs-extra"]) {
    link(`../../docs-system/packages/${pkg}`, join(core, "node_modules/@codecaine-ai", pkg));
  }
  for (const member of MEMBERS) {
    write(join(core, member, "package.json"), "{}");
    link(`../../${member}`, join(core, "node_modules/@codecaine-ai", member));
  }

  // Traps in the outside worktree: two node_modules folders are links into core and the main
  // checkout, and a file sits where a third belongs.
  link(join(core, "node_modules"), join(outside, "node_modules"));
  link(join(main, "packages/docs-workbench/node_modules"), join(outside, "packages/docs-workbench/node_modules"));
  write(join(outside, "packages/docs-viewer/node_modules"), "keep me");

  // Traps in the inside worktree: the folders that own packages and bins are linked into
  // (@codecaine-ai and .bin) are links into core, and a scope and a package's .bin are links into
  // the main checkout.
  link(join(core, "node_modules/@codecaine-ai"), join(inside, "node_modules/@codecaine-ai"));
  link(join(core, "node_modules/.bin"), join(inside, "node_modules/.bin"));
  link(join(main, "node_modules/@types"), join(inside, "node_modules/@types"));
  link(join(main, "packages/docs-workbench/node_modules/.bin"), join(inside, "packages/docs-workbench/node_modules/.bin"));

  // Traps in the nested worktree: an older run left a broken bin and a link to a main checkout package.
  link("../gone/cli.js", join(nested, "node_modules/.bin/gone"));
  link(join(main, "packages/docs-extra"), join(nested, "node_modules/@codecaine-ai/docs-extra"));

  // Trees with no main checkout to mirror from. `plain` is no git repo. `submodule` keeps its git
  // folder elsewhere, as a submodule does. `bare-worktree` is a worktree of that repo, so the folder
  // next to its git folder (store) is no checkout, though it holds packages and node_modules.
  write(join(tmp, "store/packages/docs-model/node_modules/trap/package.json"), "{}");
  write(join(tmp, "store/node_modules/trap/package.json"), "{}");
  seed(join(core, "trees/plain"));
  seed(join(core, "trees/submodule"));
  git(["init", "-q", "-b", "main", "--separate-git-dir", join(tmp, "store/repo.git")], join(core, "trees/submodule"));
  commit(join(core, "trees/submodule"));
  git(["worktree", "add", "-q", join(core, "trees/bare-worktree")], join(core, "trees/submodule"));
  mkdirSync(join(tmp, "empty-path"));
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("link-packages in a worktree outside core", () => {
  test("links each dependency to where it is installed and each own package and bin to this tree", () => {
    const before = coreAndMain();
    const first = linkScript(outside);

    expect(where(join(outside, "node_modules"))).toEqual(mirroredRoot("outside"));
    expect(where(join(outside, "packages/docs-workbench/node_modules"))).toEqual(WORKBENCH_MODULES);
    expect(first.exitCode).toBe(0);
    expect(coreAndMain()).toEqual(before);

    const rerun = linkScript(outside);
    expect(where(join(outside, "node_modules"))).toEqual(mirroredRoot("outside"));
    expect(rerun.exitCode).toBe(0);
  });

  test("leaves core and the main checkout unchanged when a build then writes into node_modules", () => {
    const before = coreAndMain();
    linkScript(outside);
    const probes = [
      "node_modules/.cache/probe",
      "node_modules/.bin/probe",
      "node_modules/@types/probe",
      "node_modules/@codecaine-ai/probe",
      "packages/docs-workbench/node_modules/.vite-temp/probe",
      "packages/docs-workbench/node_modules/.bin/probe",
    ].map((path) => join(outside, path));
    for (const probe of probes) write(probe);

    const after = coreAndMain();
    for (const probe of probes) rmSync(probe);
    rmSync(join(outside, "node_modules/.cache"), { recursive: true });
    rmSync(join(outside, "packages/docs-workbench/node_modules/.vite-temp"), { recursive: true });
    expect(after).toEqual(before);
  });

  test("keeps a file that sits where node_modules belongs", () => {
    linkScript(outside);

    expect(readFileSync(join(outside, "packages/docs-viewer/node_modules"), "utf8")).toBe("keep me");
  });

  test.each([
    { planted: "a link into the main checkout's source", path: "node_modules/planted", target: () => join(main, "packages/docs-model") },
    { planted: "a broken link", path: "node_modules/.bin/planted", target: () => "../planted/cli.js" },
    { planted: "a link in a scope folder's place", path: "node_modules/@planted", target: () => join(core, "node_modules/@scope") },
  ])("--check fails on $planted, and the next link run removes it", ({ path, target }) => {
    linkScript(outside);
    link(target(), join(outside, path));

    const check = checkScript(outside);
    expect(check.exitCode).toBe(1);
    expect(check.stdout).toContain(`FAIL ${path}`);

    expect(linkScript(outside).exitCode).toBe(0);
    expect(where(join(outside, "node_modules")).filter((line) => line.includes("planted"))).toEqual([]);
  });
});

describe("link-packages in a worktree inside core", () => {
  test("mirrors only the main checkout's own node_modules, in real folders, and writes nothing through a linked folder", () => {
    const before = coreAndMain();
    const result = linkScript(inside);

    expect(where(join(inside, "node_modules"))).toEqual([...ownLinks("core/trees/inside"), "@types/", "@types/react -> core/docs-system/node_modules/@types/react"]);
    expect(where(join(inside, "packages/docs-workbench/node_modules"))).toEqual(WORKBENCH_MODULES);
    expect(result.exitCode).toBe(0);
    expect(coreAndMain()).toEqual(before);
  });
});

describe("link-packages in a worktree nested in the main checkout", () => {
  test("mirrors core's node_modules too, so it never climbs into the main checkout's, and removes older wrong links", () => {
    const before = coreAndMain();
    const result = linkScript(nested);

    expect(where(join(nested, "node_modules"))).toEqual(mirroredRoot("core/docs-system/.worktrees/nested"));
    expect(where(join(nested, "packages/docs-workbench/node_modules"))).toEqual(WORKBENCH_MODULES);
    expect(result.exitCode).toBe(0);
    expect(coreAndMain()).toEqual(before);
  });

  test("--check fails when a core member resolves from the main checkout's external/", () => {
    linkScript(nested);
    rmSync(join(nested, "node_modules/@codecaine-ai/annotations"));

    const check = checkScript(nested);
    expect(check.exitCode).toBe(1);
    expect(check.stdout).toContain("FAIL @codecaine-ai/annotations");

    expect(linkScript(nested).exitCode).toBe(0);
  });
});

test("link-packages in the main checkout links its own packages and bins and mirrors no dependencies", () => {
  const packageModulesBefore = where(join(main, "packages/docs-workbench/node_modules"));
  linkScript(main);

  expect(where(join(main, "node_modules"))).toEqual([
    ".bin/",
    ".bin/docs-cli -> core/docs-system/packages/docs-cli/src/index.ts",
    "@codecaine-ai/",
    "@codecaine-ai/annotations -> core/docs-system/external/annotations",
    "@codecaine-ai/docs-cli -> core/docs-system/packages/docs-cli",
    "@codecaine-ai/docs-extra -> core/docs-system/packages/docs-extra",
    "@codecaine-ai/docs-model -> core/docs-system/packages/docs-model",
    "@codecaine-ai/docs-viewer -> core/docs-system/packages/docs-viewer",
    "@codecaine-ai/docs-workbench -> core/docs-system/packages/docs-workbench",
    "@types/",
    "@types/react/",
    "@types/react/index.d.ts",
  ]);
  expect(where(join(main, "packages/docs-workbench/node_modules"))).toEqual(packageModulesBefore);
});

describe("link-packages in a tree with no main checkout", () => {
  test.each([
    { tree: "plain", layout: "without git on the PATH", env: () => ({ PATH: join(tmp, "empty-path") }) },
    { tree: "submodule", layout: "in a tree whose git folder sits elsewhere", env: () => undefined },
    { tree: "bare-worktree", layout: "in a worktree whose main git folder is no .git of a checkout", env: () => undefined },
  ])("links its own packages and mirrors nothing $layout", ({ tree, env }) => {
    const dir = join(core, "trees", tree);
    const result = linkScript(dir, env());

    expect(where(join(dir, "node_modules"))).toEqual(ownLinks(`core/trees/${tree}`));
    expect(existsSync(join(dir, "packages/docs-model/node_modules"))).toBe(false);
    expect(result.exitCode).toBe(0);
  });
});
