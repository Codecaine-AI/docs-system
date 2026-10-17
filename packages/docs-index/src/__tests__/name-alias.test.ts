import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { isExcludedDocPath } from "../paths";
import { checkDocsPath, docsFs, isDocsPathRefusal, type DocsPathIntent } from "../safe-path";

/**
 * B7-3-01: name aliases of excluded folders. On a default APFS volume
 * (case-insensitive, normalization-insensitive) `outputs/INPUTS`,
 * `Outputs/Inputs` and an NFD spelling of an NFC name all open the stored
 * folder. The chokepoint judges an existing entry by its stored name and
 * matches exclusion globs case- and normalization-insensitively, so every
 * spelling is refused for every intent, including creation targets that do
 * not exist yet, and the frozen tree stays byte- and entry-identical.
 * Positive controls keep allowed mixed-case paths working.
 */

const FROZEN = "sessions/s1/outputs/inputs/p1";
const CAFE_NFC = "café";
const CAFE_NFD = "café";
const NAIVE_NFC = "naïve";
const NAIVE_NFD = "naïve";
let temp: string;
let kb: string;
/** True on a case-insensitive volume (the stored-name assertions only apply there). */
let caseInsensitive = false;

async function write(rel: string, bytes: string) {
  await mkdir(join(kb, rel, ".."), { recursive: true });
  await writeFile(join(kb, rel), bytes);
}

/** Every entry below `rel` (folders end in "/", links are "link") with each file's sha256. */
async function treeBytes(rel: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string) => {
    for (const entry of await readdir(join(kb, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) out[path] = "link";
      else if (entry.isDirectory()) { out[`${path}/`] = "dir"; await walk(path); }
      else out[path] = createHash("sha256").update(await readFile(join(kb, path))).digest("hex");
    }
  };
  await walk(rel);
  return out;
}

const frozenState = async () => ({ sessions: await treeBytes("sessions"), archive: await treeBytes("archive") });

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "docs-name-alias-")));
  kb = join(temp, "kb");
  // The NFC glob guards an NFC folder; the NFD glob guards an NFC folder too (the stored form differs from the glob's).
  await write("codecaine.docs.json", JSON.stringify({
    docsRoot: ".",
    exclude: ["sessions/*/outputs/inputs/**", `archive/${CAFE_NFC}/**`, `archive/${NAIVE_NFD}/**`, "drafts/résumé/**"],
  }));
  await write(`${FROZEN}/doc.json`, "{\"frozen\":true}\n");
  await write(`${FROZEN}/assets/canvases/c.canvas.json`, "{\"frozen\":true}\n");
  await write(`${FROZEN}/sentinel.txt`, "sentinel\n");
  await write(`archive/${CAFE_NFC}/menu.txt`, "frozen menu\n");
  await write(`archive/${NAIVE_NFC}/notes.txt`, "frozen notes\n");
  await write("notes/real/doc.json", "{}\n");
  await write("notes/real/assets/images/r.png", "png");
  caseInsensitive = existsSync(join(kb, "SESSIONS"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const INTENTS: DocsPathIntent[] = ["read", "inspect", "write", "mkdir", "remove", "rename-from", "rename-to"];

/** Spellings of existing excluded entries (folders, a page, a sidecar, frozen Unicode folders and files). */
const EXISTING_ALIASES = [
  "sessions/s1/outputs/INPUTS",
  "Sessions/S1/Outputs/Inputs",
  "sessions/s1/OUTPUTS/inputs/p1",
  "sessions/s1/outputs/INPUTS/P1/DOC.JSON",
  "sessions/s1/outputs/Inputs/p1/assets/canvases/c.canvas.json",
  `archive/${CAFE_NFD}`,
  `ARCHIVE/${CAFE_NFD.toUpperCase()}/MENU.TXT`,
  `archive/${NAIVE_NFC}`,
  `archive/${NAIVE_NFD}/notes.txt`,
  `Archive/${NAIVE_NFC.toUpperCase()}`,
];

/** Creation targets that do not exist yet, in other spellings of excluded globs. */
const CREATION_ALIASES = [
  "sessions/s2/outputs/INPUTS",
  "sessions/S3/Outputs/Inputs/new-page/doc.json",
  "sessions/s1/outputs/INPUTS/p9/doc.json",
  "drafts/RÉSUMÉ",
  "drafts/résumé/cv.txt",
  `archive/${CAFE_NFD}/new.txt`,
];

describe("B7-3-01: case and Unicode spellings of excluded folders", () => {
  test("isExcludedDocPath folds case and normalization and is never weaker than the exact glob", () => {
    const exclude = ["sessions/*/outputs/inputs/**", `archive/${CAFE_NFC}/**`, "pics/caf?.png", "straße/**"];
    for (const path of [
      "sessions/s1/outputs/INPUTS",
      "SESSIONS/S1/OUTPUTS/INPUTS/p1/doc.json",
      `archive/${CAFE_NFD}`,
      `archive/${CAFE_NFC.toUpperCase()}/x`,
      `pics/${CAFE_NFC}.png`,
      `pics/${CAFE_NFD}.png`,
      `PICS/${CAFE_NFC.toUpperCase()}.PNG`,
      "STRASSE/x",
      "straße",
    ]) {
      expect(isExcludedDocPath(path, exclude)).toBe(true);
    }
    for (const path of ["sessions/s1/outputs/inputs-old", "sessions/s1/output/inputs", "archive/cafe", "pics/cafes.png", "notes/real"]) {
      expect(isExcludedDocPath(path, exclude)).toBe(false);
    }
  });

  test("every intent refuses every spelling of an existing excluded entry", () => {
    for (const path of EXISTING_ALIASES) {
      for (const intent of INTENTS) {
        const checked = checkDocsPath(kb, path, intent);
        expect({ path, intent, checked }).toMatchObject({ path, intent, checked: { ok: false, status: 403, reason: "excluded" } });
      }
    }
  });

  test("creation targets that do not exist yet are refused in every spelling", () => {
    for (const path of CREATION_ALIASES) {
      for (const intent of ["write", "mkdir", "rename-to"] as const) {
        const checked = checkDocsPath(kb, path, intent);
        expect({ path, intent, checked }).toMatchObject({ path, intent, checked: { ok: false, status: 403, reason: "excluded" } });
      }
    }
  });

  test("docsFs refuses delete, recursive delete, move source and destination, create and read in every spelling; the frozen tree is byte- and entry-identical", async () => {
    const before = await frozenState();
    const fs = docsFs(kb);
    const refused = async (label: string, run: () => Promise<unknown>) => {
      let error: unknown;
      try {
        await run();
      } catch (caught) {
        error = caught;
      }
      expect({ label, refused: isDocsPathRefusal(error), status: (error as { status?: number } | undefined)?.status })
        .toEqual({ label, refused: true, status: 403 });
    };
    // Delete and recursive delete (the reviewer's reproduction: rm of outputs/INPUTS reached the syscall).
    await refused("rm -r outputs/INPUTS", () => fs.rm("sessions/s1/outputs/INPUTS", { recursive: true }));
    await refused("rm -r Outputs/Inputs", () => fs.rm("Sessions/S1/Outputs/Inputs", { recursive: true, force: true }));
    await refused("rm -r an allowed ancestor in another case", () => fs.rm("Sessions/S1", { recursive: true }));
    await refused("rm file", () => fs.rm("sessions/s1/outputs/INPUTS/p1/sentinel.txt"));
    await refused("unlink", () => fs.unlink("sessions/s1/Outputs/Inputs/p1/doc.json"));
    await refused("rmdir", () => fs.rmdir("sessions/s1/outputs/INPUTS/p1/assets/canvases"));
    await refused("rm -r NFD", () => fs.rm(`archive/${CAFE_NFD}`, { recursive: true }));
    await refused("rm -r NFC of an NFD glob", () => fs.rm(`archive/${NAIVE_NFC.toUpperCase()}`, { recursive: true }));
    await refused("unlink NFD", () => fs.unlink(`archive/${CAFE_NFD}/menu.txt`));
    // Move source (the folder itself and an allowed ancestor holding it) and move destination.
    await refused("rename from outputs/INPUTS", () => fs.rename("sessions/s1/outputs/INPUTS", "notes/stolen"));
    await refused("rename from Outputs/Inputs/p1", () => fs.rename("Sessions/S1/Outputs/Inputs/p1", "notes/stolen"));
    await refused("rename an allowed ancestor in another case", () => fs.rename("sessions/S1/OUTPUTS", "notes/moved"));
    await refused("rename from NFD", () => fs.rename(`archive/${CAFE_NFD}`, "notes/stolen"));
    await refused("rename to an existing alias", () => fs.rename("notes/real", "sessions/s1/outputs/INPUTS/p2"));
    await refused("rename to a creation alias", () => fs.rename("notes/real", "Sessions/S2/Outputs/Inputs"));
    await refused("rename to NFD", () => fs.rename("notes/real", `archive/${CAFE_NFD}/real`));
    // Create.
    await refused("writeFile", () => fs.writeFile("sessions/s1/outputs/INPUTS/p1/new.txt", "x"));
    await refused("writeFile over a frozen file", () => fs.writeFile("Sessions/S1/Outputs/Inputs/p1/sentinel.txt", "REPLACED"));
    await refused("atomicWrite", () => fs.atomicWrite("sessions/s1/outputs/Inputs/p1/doc.json", "{}"));
    await refused("atomicWrite creation alias", () => fs.atomicWrite("sessions/s4/outputs/INPUTS/new/doc.json", "{}"));
    await refused("mkdir", () => fs.mkdir("sessions/s1/outputs/INPUTS/p9", { recursive: true }));
    await refused("writeFile NFD", () => fs.writeFile(`archive/${CAFE_NFD}/menu.txt`, "REPLACED"));
    await refused("mkdir NFD creation", () => fs.mkdir("drafts/résumé", { recursive: true }));
    // Read.
    await refused("readFile", () => fs.readFile("sessions/s1/outputs/INPUTS/p1/sentinel.txt", "utf8"));
    await refused("readFile NFD", () => fs.readFile(`archive/${CAFE_NFD}/menu.txt`, "utf8"));
    await refused("readdir", () => fs.readdir("Sessions/S1/Outputs/Inputs"));
    // A listing of the allowed parent omits the excluded child in any spelling of the parent.
    expect(await fs.readdir("sessions/s1/OUTPUTS")).toEqual([]);
    expect(await fs.readdir("ARCHIVE")).toEqual([]);

    expect(await frozenState()).toEqual(before);
    expect(existsSync(join(kb, "drafts"))).toBe(false);
    expect((await readdir(join(kb, "sessions"))).sort()).toEqual(["s1"]);
    expect(await readFile(join(kb, "notes/real/doc.json"), "utf8")).toBe("{}\n");
  });

  test("an existing entry is judged by its stored name; a final link is never followed", async () => {
    if (!caseInsensitive) return; // Stored-name resolution only differs from the spelling on a case-insensitive volume.
    const plain = join(temp, "plain");
    await mkdir(join(plain, "Folder/sub"), { recursive: true });
    await mkdir(join(plain, CAFE_NFC), { recursive: true });
    await symlink(join(plain, "Folder"), join(plain, "link"), "dir");
    for (const intent of ["inspect", "write", "mkdir", "remove", "rename-from", "rename-to"] as const) {
      expect(checkDocsPath(plain, "FOLDER", intent)).toMatchObject({ ok: true, rel: "FOLDER", canonicalRel: "Folder" });
      expect(checkDocsPath(plain, "folder/SUB", intent)).toMatchObject({ ok: true, canonicalRel: "Folder/sub" });
      expect(checkDocsPath(plain, CAFE_NFD, intent)).toMatchObject({ ok: true, canonicalRel: CAFE_NFC });
    }
    // A final link entry keeps its stored name and is not followed (write refuses it outright).
    for (const intent of ["inspect", "remove", "rename-from"] as const) {
      expect(checkDocsPath(plain, "LINK", intent)).toMatchObject({ ok: true, canonical: join(plain, "link"), canonicalRel: "link" });
    }
    expect(checkDocsPath(plain, "LINK", "write")).toMatchObject({ ok: false, reason: "symlink" });
    // A read follows the link to its target.
    expect(checkDocsPath(plain, "LINK/sub", "read")).toMatchObject({ ok: true, canonicalRel: "Folder/sub" });
    // A missing creation target keeps the caller's spelling (its exclusion verdict is folded).
    expect(checkDocsPath(plain, "Folder/NewPage", "mkdir")).toMatchObject({ ok: true, canonicalRel: "Folder/NewPage" });
  });

  test("B7-4-03: a final link reached through a full-case-fold alias reports its stored name and is not followed", async () => {
    const plain = join(temp, "plain-fold");
    await mkdir(join(plain, "target/sub"), { recursive: true });
    await symlink(join(plain, "target"), join(plain, "σ"), "dir");
    await symlink(join(plain, "target"), join(plain, "s"), "dir");
    // [alias, stored]: final sigma for sigma, long s for s.
    const pairs = [["ς", "σ"], ["ſ", "s"]] as const;
    for (const [alias, stored] of pairs) {
      if (!existsSync(join(plain, alias))) continue; // Only a volume that opens the alias resolves it.
      for (const intent of ["inspect", "remove", "rename-from"] as const) {
        expect({ alias, intent, check: checkDocsPath(plain, alias, intent) }).toMatchObject({
          alias,
          intent,
          check: { ok: true, rel: alias, canonical: join(plain, stored), canonicalRel: stored },
        });
      }
      expect(checkDocsPath(plain, alias, "write")).toMatchObject({ ok: false, reason: "symlink" });
    }
    // The stored names themselves, and the excluded-alias control: excluded stored names refuse every alias.
    expect(checkDocsPath(plain, "σ", "remove")).toMatchObject({ ok: true, canonicalRel: "σ" });
    const excludedRoot = join(temp, "plain-fold-excluded");
    await mkdir(excludedRoot, { recursive: true });
    await writeFile(join(excludedRoot, "codecaine.docs.json"), JSON.stringify({ docsRoot: ".", exclude: ["σ/**", "s/**"] }));
    await symlink(join(plain, "target"), join(excludedRoot, "σ"), "dir");
    await symlink(join(plain, "target"), join(excludedRoot, "s"), "dir");
    for (const name of ["σ", "ς", "s", "ſ"]) {
      for (const intent of INTENTS) {
        expect({ name, intent, ok: checkDocsPath(excludedRoot, name, intent).ok }).toEqual({ name, intent, ok: false });
      }
    }
    expect(await readdir(join(plain, "target"))).toEqual(["sub"]);
  });

  test("positive controls: allowed paths in other spellings still read, write, rename and list", async () => {
    const fs = docsFs(kb);
    expect(await fs.readFile("notes/real/doc.json", "utf8")).toBe("{}\n");
    await fs.atomicWrite("notes/real/doc.json", "{\"v\":2}\n");
    await fs.writeFile("notes/real/assets/images/new.png", "png2");
    await fs.mkdir("notes/fresh/page", { recursive: true });
    await fs.rename("notes/fresh", "notes/renamed");
    expect((await fs.readdir("notes")).sort()).toEqual(["real", "renamed"]);
    await fs.rm("notes/renamed", { recursive: true });
    // Non-excluded siblings that merely resemble an excluded name stay allowed.
    for (const path of ["sessions/s1/outputs/inputs-old/x.txt", "sessions/s1/output/inputs/x.txt", "archive/cafe/x.txt"]) {
      expect(checkDocsPath(kb, path, "write").ok).toBe(true);
    }
    if (caseInsensitive) {
      expect(await fs.readFile("NOTES/REAL/DOC.JSON", "utf8")).toBe("{\"v\":2}\n");
      // An atomic write through another spelling replaces the stored file and keeps its stored name.
      await fs.atomicWrite("Notes/Real/Doc.json", "{\"v\":3}\n");
      expect(await readdir(join(kb, "notes/real"))).toContain("doc.json");
      expect(await readFile(join(kb, "notes/real/doc.json"), "utf8")).toBe("{\"v\":3}\n");
      // A case-only rename still renames (the destination resolves to the source entry itself).
      await fs.rename("notes/real", "notes/Real");
      expect(await readdir(join(kb, "notes"))).toEqual(["Real"]);
      // Moving a folder into itself is refused in any spelling.
      await expect(fs.rename("notes/Real", "NOTES/REAL/inside")).rejects.toMatchObject({ status: 400 });
    }
  });
});
