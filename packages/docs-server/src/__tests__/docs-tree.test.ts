import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadDocsRootExcludePolicy, setDocsRootExclude } from "@codecaine-ai/docs-index/paths";
import { isDocsPathRefusal } from "@codecaine-ai/docs-index/safe-path";

import { collectBundlePaths, walkDocsDir, type DocsTreeNode, type DocsWalkYield } from "../docs-tree";
import { walkDocsDirLegacy } from "./fixtures/docs-tree.legacy";

/**
 * The single-listing walk returns the tree the probing walk returned, byte for
 * byte, on a root with nested bundles, markdown twins, links in and out of the
 * root, skipped names and excluded paths, under every way a policy reaches the
 * walk: the registration, the on-disk codecaine.docs.json, an enclosing
 * project's, and the explicit `exclude` argument.
 */

const EXCLUDE = ["sessions/*/outputs/inputs/**", "library/**/sources/**", "notes/frozen", "café/**", "odd/sub/**"];

let root: string;
let outside: string;

async function file(path: string, content = "{}") {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content);
}

async function dir(path: string) {
  await mkdir(join(root, path), { recursive: true });
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "docs-tree-")));
  outside = await realpath(await mkdtemp(join(tmpdir(), "docs-tree-outside-")));
  // Nested bundles, three deep; an index twin and a plain page inside a bundle; assets inside a bundle.
  await file("a/doc.json");
  await file("a/b/doc.json");
  await file("a/b/index.md", "# twin");
  await file("a/b/notes.md");
  await file("a/b/c/doc.json");
  await file("a/b/c/assets/doc.json");
  await file("a/b/c/assets/x.png");
  // Markdown twins: suppressed beside a bundle (any case of the extension), kept beside a plain folder.
  await file("foo/doc.json");
  await file("foo.md");
  await dir("bar");
  await file("bar.mdx");
  await file("baz/doc.json");
  await file("baz.MD");
  // A plain folder: index.md is a page there; other extensions and dotfiles are not.
  await file("plain/index.md");
  await file("plain/readme.markdown");
  await file("plain/notes.txt");
  await file("plain/.hidden.md");
  // Skipped names, and a file that only looks like one.
  await file(".drafts/doc.json");
  await file("node_modules/pkg/doc.json");
  await file("assets/doc.json");
  await file("assets.md");
  // A folder named doc.json makes its parent a bundle and is listed as a child.
  await file("weird/doc.json/inner.md");
  // Bundles whose doc.json is a link: one that resolves inside the root, one that dangles.
  await dir("viadoc");
  await symlink(join(root, "a/doc.json"), join(root, "viadoc/doc.json"));
  await dir("dangling");
  await symlink(join(root, "nowhere/doc.json"), join(root, "dangling/doc.json"));
  // Another spelling of doc.json: the volume decides.
  await file("Spelled/DOC.JSON");
  // Links: to a folder inside the root, to a folder outside it, to a file, and into an excluded folder.
  await file("linked/doc.json");
  await symlink(join(root, "linked"), join(root, "link-in"));
  await writeFile(join(outside, "doc.json"), "{}");
  await symlink(outside, join(root, "link-out"));
  await symlink(join(root, "plain/readme.markdown"), join(root, "link-md"));
  await symlink(join(root, "sessions/s1/outputs/inputs"), join(root, "link-frozen"));
  // Excluded subtree, an excluded single bundle with a twin, and a twin beside an excluded folder.
  await file("sessions/s1/outputs/inputs/p1/doc.json");
  await file("sessions/s1/outputs/inputs.md");
  await file("sessions/s1/outputs/kept/doc.json");
  await file("notes/frozen/doc.json");
  await file("notes/frozen.md");
  await file("notes/open/doc.json");
  // Folded matches: another case of an excluded path, and an NFD spelling of an NFC glob.
  await file("Library/Design/sources/x/doc.json");
  await file("Library/Design/kept/doc.json");
  await file("café/doc.json");
  await file("Résumé/doc.json");
  await file("Résumé/Lettre.md");
  // A backslash in a name is a separator to the glob matcher: `odd\sub` is the excluded `odd/sub`.
  await file("odd\\sub/doc.json");
  await file("keep\\it/doc.json");
});

afterEach(async () => {
  setDocsRootExclude(root, undefined);
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

async function same(docsRoot: string, relPath = "", exclude?: readonly string[]): Promise<DocsTreeNode[]> {
  const legacy = await walkDocsDirLegacy(docsRoot, relPath, exclude);
  const current = await walkDocsDir(docsRoot, relPath, exclude);
  expect(JSON.stringify(current, null, 1)).toBe(JSON.stringify(legacy, null, 1));
  return current;
}

function names(nodes: DocsTreeNode[]): string[] {
  return nodes.map((node) => `${node.kind}:${node.name}`);
}

function find(nodes: DocsTreeNode[], path: string): DocsTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const below = node.children ? find(node.children, path) : undefined;
    if (below) return below;
  }
  return undefined;
}

describe("walkDocsDir matches the probing walk", () => {
  test("with the registered policy: twins, links, skipped names and excluded paths", async () => {
    setDocsRootExclude(root, EXCLUDE);
    const tree = await same(root);

    // The volume decides whether DOC.JSON opens as doc.json; every other row is fixed.
    const fixed = names(tree).filter((name) => !name.endsWith(":Spelled"));
    expect(fixed).toEqual([
      "bundle:a",
      "dir:bar",
      "bundle:baz",
      "dir:dangling",
      "bundle:foo",
      "bundle:keep\\it",
      "dir:Library",
      "bundle:linked",
      "dir:notes",
      "dir:plain",
      "bundle:Résumé",
      "dir:sessions",
      "bundle:viadoc",
      "bundle:weird",
      "file:assets.md",
      "file:bar.mdx",
    ]);
    expect(find(tree, "odd\\sub")).toBeUndefined();
    expect(collectBundlePaths(tree)).toContain("a/b/c");
    expect(find(tree, "a/b")?.children?.map((node) => node.name)).toEqual(["c", "notes.md"]);
    expect(find(tree, "a/b/c")?.children).toBeUndefined();
    expect(find(tree, "bar")?.children).toEqual([]);
    expect(find(tree, "plain")?.children?.map((node) => node.name)).toEqual(["index.md", "readme.markdown"]);
    expect(find(tree, "weird")?.children?.map((node) => `${node.kind}:${node.name}`)).toEqual(["dir:doc.json"]);
    expect(find(tree, "sessions/s1/outputs")?.children?.map((node) => node.name)).toEqual(["kept", "inputs.md"]);
    expect(find(tree, "notes")?.children?.map((node) => node.name)).toEqual(["open", "frozen.md"]);
    expect(find(tree, "Library/Design")?.children?.map((node) => node.name)).toEqual(["kept"]);
    expect(find(tree, "Résumé")?.children?.map((node) => node.name)).toEqual(["Lettre.md"]);
    for (const absent of ["link-in", "link-out", "link-md", "link-frozen", "café", "node_modules", ".drafts", "assets"]) {
      expect(find(tree, absent)).toBeUndefined();
    }
  });

  test("with no policy at all, and with the explicit exclude argument", async () => {
    const open = await same(root);
    expect(collectBundlePaths(open)).toContain("sessions/s1/outputs/inputs/p1");
    expect(find(open, "notes")?.children?.map((node) => node.name)).toEqual(["frozen", "open"]);

    const explicit = await same(root, "", EXCLUDE);
    expect(collectBundlePaths(explicit)).not.toContain("sessions/s1/outputs/inputs/p1");
    expect(find(explicit, "notes")?.children?.map((node) => node.name)).toEqual(["open", "frozen.md"]);
  });

  test("with the on-disk codecaine.docs.json policy", async () => {
    await writeFile(join(root, "codecaine.docs.json"), JSON.stringify({ name: "kb", docsRoot: ".", exclude: EXCLUDE }));
    loadDocsRootExcludePolicy(root);
    const tree = await same(root);
    expect(collectBundlePaths(tree)).not.toContain("sessions/s1/outputs/inputs/p1");
    expect(find(tree, "Library/Design")?.children?.map((node) => node.name)).toEqual(["kept"]);
  });

  test("from a folder below the root, and through a link into the root", async () => {
    setDocsRootExclude(root, EXCLUDE);
    const bundle = await same(root, "a/b");
    expect(names(bundle)).toEqual(["bundle:c", "file:notes.md"]);
    const linked = await same(root, "link-in");
    expect(linked).toEqual([]);
    const session = await same(root, "sessions/s1/outputs");
    expect(names(session)).toEqual(["bundle:kept", "file:inputs.md"]);
  });

  test("a start folder whose canonical location is excluded is refused the same way", async () => {
    setDocsRootExclude(root, EXCLUDE);
    const caught = (run: Promise<unknown>) => run.then(() => null, (error: unknown) => error);
    const legacy = await caught(walkDocsDirLegacy(root, "link-frozen"));
    const current = await caught(walkDocsDir(root, "link-frozen"));
    expect(isDocsPathRefusal(legacy) && legacy.reason).toBe("excluded");
    expect(isDocsPathRefusal(current) && current.reason).toBe("excluded");
  });

  test("served from inside an enclosing project: its globs apply with the served folder's prefix", async () => {
    await writeFile(join(root, "codecaine.docs.json"), JSON.stringify({ name: "kb", docsRoot: ".", exclude: EXCLUDE }));
    // A glob that names a child of the served folder.
    const notes = await same(join(root, "notes"));
    expect(names(notes)).toEqual(["bundle:open", "file:frozen.md"]);
    // A glob with a wildcard above the served folder.
    const outputs = await same(join(root, "sessions/s1/outputs"));
    expect(names(outputs)).toEqual(["bundle:kept", "file:inputs.md"]);
    // The served folder itself is excluded: nothing below it is listed.
    const frozen = await same(join(root, "notes/frozen"));
    expect(frozen).toEqual([]);
    // No glob reaches the served folder.
    const a = await same(join(root, "a"));
    expect(names(a)).toEqual(["bundle:b"]);
  });
});

describe("walkDocsDir while the disk changes under it", () => {
  test("a folder replaced by a link while the walk yields is skipped, whether the link leaves the root or stays in it", async () => {
    setDocsRootExclude(root, EXCLUDE);
    // Two real folders when the root is listed, each with a page or a bundle below it.
    await file("zzz/doc.json");
    await file("zzz/inner/doc.json");
    await file("aaa/page.md");
    await writeFile(join(outside, "private.md"), "private");
    // In the first yield (the root is listed, no child is read yet): zzz becomes a link out of the
    // root, aaa a link to a bundle inside it. The folders move out of the root.
    let yields = 0;
    const swapInFirstYield: DocsWalkYield = () => {
      if (yields++ > 0) return undefined;
      return (async () => {
        await rename(join(root, "zzz"), join(outside, "was-zzz"));
        await symlink(outside, join(root, "zzz"));
        await rename(join(root, "aaa"), join(outside, "was-aaa"));
        await symlink(join(root, "linked"), join(root, "aaa"));
      })();
    };

    const raced = await walkDocsDir(root, "", undefined, swapInFirstYield);

    expect(find(raced, "zzz")).toBeUndefined();
    expect(find(raced, "aaa")).toBeUndefined();
    const paths = JSON.stringify(raced);
    expect(paths).not.toContain("private.md");
    expect(paths).not.toContain("was-zzz");
    expect(paths).not.toContain('"zzz/');
    expect(paths).not.toContain('"aaa/');
    // The rest is the tree both walks return now that the two links are in the listing.
    expect(raced).toEqual(await same(root));
    expect(find(raced, "linked")?.kind).toBe("bundle");
  });

  // `zone` holds one folder, `parent`, with `child` below it, so a walk from `zone` yields first for
  // `zone` and then for `parent`: in that second yield `parent` is listed and `parent/child` is not yet.
  async function ancestorSwappedInSecondYield(replaceParent: () => Promise<void>): Promise<DocsTreeNode[]> {
    let yields = 0;
    const swapInSecondYield: DocsWalkYield = () => {
      if (++yields !== 2) return undefined;
      return (async () => {
        await rename(join(root, "zone/parent"), join(outside, "was-parent"));
        await replaceParent();
      })();
    };
    return walkDocsDir(root, "zone", undefined, swapInSecondYield);
  }

  test.each([
    ["a link out of the root", () => symlink(outside, join(root, "zone/parent"))],
    ["a link to a folder inside the root", () => symlink(join(root, "elsewhere"), join(root, "zone/parent"))],
    ["a plain file", () => writeFile(join(root, "zone/parent"), "not a folder")],
  ])("an ancestor replaced by %s after it was listed and before its child is: nothing below it is read", async (_what, replaceParent) => {
    setDocsRootExclude(root, EXCLUDE);
    await file("zone/parent/child/original.md", "# original");
    await file("zone/keep.md", "# keep");
    // Both link targets hold a `child` with a page, so `zone/parent/child` still opens a folder: not the one the walk expects.
    await mkdir(join(outside, "child"));
    await writeFile(join(outside, "child/private.md"), "private");
    await file("elsewhere/child/private.md", "private");

    const raced = await ancestorSwappedInSecondYield(replaceParent);

    const paths = JSON.stringify(raced);
    expect(paths).not.toContain("private.md");
    expect(paths).not.toContain("original.md");
    expect(paths).not.toContain('"zone/parent/');
    // `parent` was listed before the swap, so its node stays, with nothing below it. The rest is what
    // both walks return now that `parent` is not a folder.
    expect(find(raced, "zone/parent")).toEqual({ name: "parent", path: "zone/parent", kind: "dir", children: [] });
    expect(raced.filter((node) => node.path !== "zone/parent")).toEqual(await same(root, "zone"));
  });
});
