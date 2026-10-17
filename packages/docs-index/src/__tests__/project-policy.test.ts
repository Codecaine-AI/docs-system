import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  docsRootExclude,
  isExcludedOnDiskUnderDocsRoot,
  isExcludedUnderDocsRoot,
  loadDocsRootExcludePolicy,
  resolveDocBundleJsonPath,
} from "../paths";
import { loadDocsProjectPolicy, validateExcludeGlobs } from "../project-policy";
import { isRecordFilePath } from "../subtree-guard";

/**
 * The project policy every host loads from codecaine.docs.json, with no
 * registration call: the project's own globs, an enclosing docsRoot "."
 * project's globs for a folder served on its own, and fail-closed validation.
 */

let temp: string;

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-policy-")));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function config(folder: string, value: unknown) {
  await mkdir(join(temp, folder), { recursive: true });
  await writeFile(join(temp, folder, "codecaine.docs.json"), typeof value === "string" ? value : JSON.stringify(value));
}

describe("loadDocsProjectPolicy", () => {
  test("a docsRoot \".\" project governs itself and any folder inside it, by prefix", async () => {
    await config("kb", { docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] });
    await mkdir(join(temp, "kb/sessions/s1/outputs/inputs/p1"), { recursive: true });
    const own = loadDocsProjectPolicy(join(temp, "kb"));
    expect(own.scopes.map((scope) => [scope.prefix, scope.exclude])).toEqual([["", ["sessions/*/outputs/inputs/**"]]]);
    const inner = loadDocsProjectPolicy(join(temp, "kb/sessions"));
    expect(inner.scopes.map((scope) => scope.prefix)).toEqual(["sessions"]);
    expect(isExcludedUnderDocsRoot(join(temp, "kb"), "sessions/s1/outputs/inputs/p1")).toBe(true);
    expect(isExcludedUnderDocsRoot(join(temp, "kb/sessions"), "s1/outputs/inputs/p1")).toBe(true);
    expect(isExcludedUnderDocsRoot(join(temp, "kb/sessions"), "s1/outputs/other")).toBe(false);
    // A docs root that is itself excluded excludes everything it serves.
    expect(isExcludedUnderDocsRoot(join(temp, "kb/sessions/s1/outputs/inputs"), "p1")).toBe(true);
  });

  test("a project with docsRoot \"docs\" governs its docs folder; unrelated configs do not", async () => {
    await config("repo", { exclude: ["frozen/**"] });
    await mkdir(join(temp, "repo/docs/frozen"), { recursive: true });
    await config("other", { docsRoot: "elsewhere", exclude: ["x/**"] });
    expect(docsRootExclude(join(temp, "repo/docs"))).toEqual(["frozen/**"]);
    expect(resolveDocBundleJsonPath(join(temp, "repo/docs"), "frozen/page")).toBeNull();
    expect(resolveDocBundleJsonPath(join(temp, "repo/docs"), "kept/page")).not.toBeNull();
    expect(docsRootExclude(join(temp, "other"))).toEqual([]);
  });

  test("validation fails closed: malformed JSON or an invalid exclude throws", async () => {
    await config("bad-json", "{ not json");
    expect(() => loadDocsProjectPolicy(join(temp, "bad-json"))).toThrow(/Cannot read/);
    expect(() => loadDocsRootExcludePolicy(join(temp, "bad-json"))).toThrow(/Cannot read/);
    for (const exclude of ["sessions/**", [42], ["../escape/**"], ["/abs/**"], [""]]) {
      await config("bad-exclude", { docsRoot: ".", exclude });
      expect(() => loadDocsRootExcludePolicy(join(temp, "bad-exclude"))).toThrow(/Invalid exclude/);
    }
    expect(validateExcludeGlobs(["./a/**", "b"], "x")).toEqual(["a/**", "b"]);
  });
});

describe("isExcludedOnDiskUnderDocsRoot", () => {
  test("a symbolic link that leads into an excluded folder is excluded, also for a path not created yet", async () => {
    await config("kb", { docsRoot: ".", exclude: ["sessions/*/outputs/inputs/**"] });
    await mkdir(join(temp, "kb/sessions/s2/outputs"), { recursive: true });
    await mkdir(join(temp, "kb/notes"), { recursive: true });
    await symlink(join(temp, "kb/sessions/s2/outputs"), join(temp, "kb/notes/out2"));
    const kb = join(temp, "kb");
    // Lexically allowed, but on disk the write would land in sessions/s2/outputs/inputs/new.
    expect(isExcludedUnderDocsRoot(kb, "notes/out2/inputs/new/doc.json")).toBe(false);
    expect(isExcludedOnDiskUnderDocsRoot(kb, "notes/out2/inputs/new/doc.json")).toBe(true);
    expect(resolveDocBundleJsonPath(kb, "notes/out2/inputs/new")).toBeNull();
    // Positive control: the same link to a path outside the exclusion.
    expect(isExcludedOnDiskUnderDocsRoot(kb, "notes/out2/report/doc.json")).toBe(false);
  });
});

describe("isRecordFilePath", () => {
  test("names base-shapes record files and task records, nothing else", () => {
    for (const path of ["notes/a/note.json", "places/p/entity.json", "library/t/sources/s/source.json", "references/r/reference.json", "projects/p/project.json", "sessions/s/session.json", "tasks/rotate-keys.json", "places/p/tasks/plot.json"]) {
      expect(isRecordFilePath(path)).toBe(true);
    }
    for (const path of ["notes/a/doc.json", "notes/a/annotations.json", "notes/a/proposals.json", "notes/a/assets/canvases/c.canvas.json", "tasks", "notes/tasks.json"]) {
      expect(isRecordFilePath(path)).toBe(false);
    }
  });
});

describe("isRecordFilePath and a docs page named tasks (B7-2-03)", () => {
  test("a page folder named tasks is no Task store: its doc.json and docs sidecars are never records", () => {
    for (const path of [
      "tasks/doc.json",
      "tasks/annotations.json",
      "tasks/proposals.json",
      "tasks/flow.canvas.json",
      "tasks/q.sequence.json",
      "tasks/old.doc.json",
      "tasks/doc.json.tmp-0f8fad5b-d9cb-469f-a165-70867728950e",
      "tasks/assets/canvases/c.canvas.json",
      "notes/page/assets/tasks/config.json",
    ]) {
      expect(isRecordFilePath(path)).toBe(false);
    }
  });

  test("a genuine Task record stays protected, also beside a doc.json", () => {
    for (const path of ["tasks/rotate-keys.json", "places/p/tasks/plot.json", "projects/alpha/tasks/plot-swatch-sheet.json", "tasks/task.json", "x/note.json"]) {
      expect(isRecordFilePath(path)).toBe(true);
    }
  });
});
