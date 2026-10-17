import { randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
  watch as watchFs,
  type Dirent,
  type FSWatcher,
  type Stats,
} from "node:fs";
import * as fsp from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  docsRootPolicyScopes,
  foldDocsPath,
  foldsTogether,
  hasDocsRootExcludePolicy,
  isExcludedDocPath,
  isExcludedUnderDocsRoot,
} from "./paths";

/**
 * The docs-root filesystem chokepoint. Every read, write, rename, unlink,
 * mkdir, listing and watch the docs system performs on a served docs root
 * (the docs store, Canvas/Sequence/source/asset sidecar adapters, move
 * rewrites, undo inverses, uploads, indexers, corpus management, export
 * walkers and MCP tools) goes through this module, so one rule decides every
 * target:
 *
 * 1. Lexical: the target names a path inside the served root (absolute under
 *    the root, or root-relative without escaping `..`).
 * 2. Canonical: the target is resolved on disk. Reads follow symbolic links
 *    (realpath of the target, or of its deepest existing ancestor plus the
 *    missing components). Writes, removals, renames and mkdir judge the entry
 *    itself (the canonical parent plus the entry's stored name on disk, never
 *    following a final symbolic link); a write whose final component is a
 *    symbolic link is refused, because the write would follow it. A dangling
 *    symbolic link on the way is refused. The caller's spelling of an
 *    existing entry never decides: `outputs/INPUTS` and an NFD spelling of a
 *    name are judged by the name the volume stores (B7-3-01).
 * 3. Confinement: the canonical target must lie inside the canonical served
 *    root. A canonical escape (a link that leaves the root, including into a
 *    sibling of a served subfolder) is refused.
 * 4. Policy: the lexical and the canonical target are evaluated against every
 *    governing project policy (`isExcludedUnderDocsRoot`: the served project's
 *    own `exclude` and every enclosing `"docsRoot": "."` project whose scope
 *    covers the served root). An excluded target is refused. Matching is
 *    case- and Unicode-normalization-insensitive, so a missing creation target
 *    is refused in every spelling. A malformed policy refuses everything
 *    (fail closed).
 * 5. Subtrees: a recursive remove or a directory rename also checks every
 *    descendant (lstat walk, links never followed) at its source and, for a
 *    rename, at its destination.
 *
 * The guarded operations check immediately before their system call, so a
 * caller that holds a mutation lock re-checks inside it; `preflightDocsPaths`
 * lets a mutation owner check every target before its first write. The
 * system call is made on the canonical path that was checked.
 *
 * `docsOutputFs` applies the same corpus rule to the export output folder
 * (B7-3-02): no link at or below it, and no destination on a path the corpus
 * forbids.
 *
 * Accepted residual risks (single-user local tool, B7-3-03 and B7-3-04): a
 * hard link shares an inode under an allowed name, and a folder swapped for a
 * link by another process between the check and the system call is followed.
 * Frozen archives are protected against both by read-only permissions on
 * every file and folder.
 */

export type DocsPathIntent =
  /** Read a file or list a folder; symbolic links are followed. */
  | "read"
  /** Inspect the entry itself (lstat); a final symbolic link is not followed. */
  | "inspect"
  /** Create or replace a file. */
  | "write"
  /** Create a folder (and missing ancestors). */
  | "mkdir"
  /** Unlink a file, remove a folder (recursively or empty). */
  | "remove"
  /** The source of a rename. */
  | "rename-from"
  /** The destination of a rename. */
  | "rename-to";

export type DocsPathRefusalReason =
  | "unsafe"
  | "outside-root"
  | "excluded"
  | "symlink"
  | "unresolvable"
  | "policy-invalid";

export type DocsPathTarget = {
  /** Lexical absolute path under the served root. */
  abs: string;
  /** Lexical root-relative path (`a/b`, "" for the root itself). */
  rel: string;
  /** Canonical absolute path the system call uses. */
  canonical: string;
  /** Canonical root-relative path. */
  canonicalRel: string;
};

export type DocsPathRefusal = {
  ok: false;
  status: number;
  reason: DocsPathRefusalReason;
  path: string;
  detail: string;
};

export type DocsPathCheck = ({ ok: true } & DocsPathTarget) | DocsPathRefusal;

/** Thrown by the guarded operations; `status` is the HTTP status a caller should answer with. */
export class DocsPathRefusedError extends Error {
  readonly code = "EDOCSREFUSED";
  readonly status: number;
  readonly reason: DocsPathRefusalReason;
  readonly path: string;
  constructor(refusal: DocsPathRefusal) {
    super(refusal.detail);
    this.name = "DocsPathRefusedError";
    this.status = refusal.status;
    this.reason = refusal.reason;
    this.path = refusal.path;
  }
}

export function isDocsPathRefusal(error: unknown): error is DocsPathRefusedError {
  return error instanceof DocsPathRefusedError;
}

const FOLLOWING_INTENTS: ReadonlySet<DocsPathIntent> = new Set(["read"]);
const ROOT_FORBIDDEN_INTENTS: ReadonlySet<DocsPathIntent> = new Set(["write", "remove", "rename-from", "rename-to"]);

function refusal(status: number, reason: DocsPathRefusalReason, path: string, detail: string): DocsPathRefusal {
  return { ok: false, status, reason, path, detail };
}

/** "" for `base` itself, `a/b` below it, null outside it. */
function relInside(base: string, path: string): string | null {
  if (path === base) return "";
  const rel = relative(base, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** The canonical served root (realpath; the resolved path when the root does not exist yet). */
export function realDocsRootPath(docsRoot: string): string {
  try {
    return realpathSync(docsRoot);
  } catch {
    return resolve(docsRoot);
  }
}

/**
 * The canonical identity of an absolute path for in-memory keys (path locks):
 * realpath of the deepest existing ancestor plus the missing components. It
 * performs no read or write of the target.
 */
export function canonicalPathKey(absPath: string): string {
  let ancestor = resolve(absPath);
  const missing: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(ancestor), ...missing);
    } catch {
      const parent = dirname(ancestor);
      if (parent === ancestor) return resolve(absPath);
      missing.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}

class Unresolvable extends Error {}

/**
 * The name the folder `parentCanonical` stores for its entry `name`, whose
 * lstat is `entry`: `name` itself when an entry is spelled exactly so, else
 * the one listed entry a case-insensitive, normalization-insensitive volume
 * opens for `name` (`INPUTS` for a stored `inputs`, an NFD spelling for a
 * stored NFC name, and through full case folding final sigma `ς` for a stored
 * `σ` and long s `ſ` for a stored `s`, B7-4-03). A candidate must fold to the
 * same name in some folding form and be the same entry on disk (device and
 * inode of its lstat, links never followed). `name` when the listing finds no
 * single such entry.
 */
function storedEntryName(parentCanonical: string, name: string, entry: Stats): string {
  let names: string[];
  try {
    names = readdirSync(parentCanonical);
  } catch {
    return name;
  }
  if (names.includes(name)) return name;
  const matches = names.filter((candidate) => {
    if (!foldsTogether(candidate, name)) return false;
    try {
      const stats = lstatSync(join(parentCanonical, candidate));
      return stats.dev === entry.dev && stats.ino === entry.ino;
    } catch {
      return false;
    }
  });
  return matches.length === 1 ? matches[0]! : name;
}

/**
 * Canonical form of `abs`. Following: realpath of the target, or of its
 * deepest existing ancestor plus the missing components. Not following: the
 * canonical parent plus the entry's stored name (B7-3-01: the name on disk,
 * not the caller's spelling, so `outputs/INPUTS` on a default APFS volume is
 * judged as the stored `outputs/inputs`); an existing non-link entry is
 * resolved with realpath of the entry itself, a final symbolic link is never
 * followed (its stored name comes from the parent's listing), and a missing
 * entry keeps the caller's spelling (exclusion matching is case- and
 * normalization-insensitive, so a creation target is judged in every
 * spelling). A dangling symbolic link on the way, or any error other than a
 * missing component, is unresolvable.
 */
function canonicalize(abs: string, follow: boolean): string {
  if (!follow) {
    const parent = dirname(abs);
    if (parent === abs) return abs;
    const parentCanonical = canonicalize(parent, true);
    let entry: Stats;
    try {
      entry = lstatSync(abs);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return join(parentCanonical, basename(abs));
      throw new Unresolvable(`${code ?? String(error)}`);
    }
    if (entry.isSymbolicLink()) return join(parentCanonical, storedEntryName(parentCanonical, basename(abs), entry));
    let real: string;
    try {
      real = realpathSync(abs);
    } catch (error) {
      throw new Unresolvable(`${(error as NodeJS.ErrnoException).code ?? String(error)}`);
    }
    // A non-link entry's realpath is its canonical parent plus its stored name; anything else
    // means the entry changed between the lstat and the realpath.
    if (dirname(real) !== parentCanonical) throw new Unresolvable("entry changed while it was resolved");
    return real;
  }
  const tail: string[] = [];
  let candidate = abs;
  for (;;) {
    try {
      return join(realpathSync(candidate), ...tail);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const parent = dirname(candidate);
      if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === candidate) {
        throw new Unresolvable(`${code ?? String(error)}`);
      }
      // A component that exists but cannot be resolved is a dangling symbolic link.
      let entry: Stats | undefined;
      try {
        entry = lstatSync(candidate);
      } catch {
        entry = undefined;
      }
      if (entry?.isSymbolicLink()) throw new Unresolvable("dangling symbolic link");
      tail.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

function excludedByPolicy(docsRoot: string, rel: string): boolean {
  return rel !== "" && isExcludedUnderDocsRoot(docsRoot, rel);
}

/**
 * Resolves and checks one target. `target` is absolute (under the served
 * root, lexically or canonically) or root-relative. Never throws.
 */
export function checkDocsPath(docsRoot: string, target: string, intent: DocsPathIntent = "read"): DocsPathCheck {
  const shown = typeof target === "string" ? target : String(target);
  if (typeof target !== "string" || target.includes("\0")) {
    return refusal(400, "unsafe", shown, `Invalid docs path: ${shown}`);
  }
  const rootAbs = resolve(docsRoot);
  const rootReal = realDocsRootPath(docsRoot);
  let rel: string | null;
  if (isAbsolute(target)) {
    const abs = resolve(target);
    rel = relInside(rootAbs, abs) ?? relInside(rootReal, abs);
  } else {
    rel = relInside(rootAbs, resolve(rootAbs, target));
  }
  if (rel === null) {
    return refusal(400, "outside-root", shown, `Path escapes the docs directory: ${shown}`);
  }
  const shownRel = rel || ".";
  if (rel === "" && ROOT_FORBIDDEN_INTENTS.has(intent)) {
    return refusal(400, "unsafe", shownRel, "The docs root itself cannot be written, removed or renamed.");
  }
  const abs = rel === "" ? rootAbs : join(rootAbs, ...rel.split("/"));

  try {
    if (excludedByPolicy(docsRoot, rel)) {
      return refusal(403, "excluded", rel, `Path is excluded from this docs project: ${rel}`);
    }
    let canonical: string;
    try {
      if (intent === "write") {
        let entry: Stats | undefined;
        try {
          entry = lstatSync(abs);
        } catch {
          entry = undefined;
        }
        if (entry?.isSymbolicLink()) {
          return refusal(403, "symlink", rel, `Refusing to write through a symbolic link: ${rel}`);
        }
      }
      canonical = canonicalize(abs, FOLLOWING_INTENTS.has(intent));
    } catch (error) {
      if (error instanceof Unresolvable) {
        return refusal(403, "unresolvable", rel, `Path cannot be resolved safely (${error.message}): ${shownRel}`);
      }
      throw error;
    }
    const canonicalRel = relInside(rootReal, canonical);
    if (canonicalRel === null) {
      return refusal(403, "outside-root", rel, `Path leads outside the docs directory on disk: ${shownRel}`);
    }
    if (excludedByPolicy(docsRoot, canonicalRel)) {
      return refusal(403, "excluded", rel, `Path is excluded from this docs project: ${shownRel} (on disk: ${canonicalRel})`);
    }
    return { ok: true, abs, rel, canonical, canonicalRel };
  } catch (error) {
    return refusal(
      500,
      "policy-invalid",
      rel,
      `Docs project policy cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** `checkDocsPath` that throws `DocsPathRefusedError`. */
export function guardDocsPath(docsRoot: string, target: string, intent: DocsPathIntent = "read"): DocsPathTarget {
  const checked = checkDocsPath(docsRoot, target, intent);
  if (!checked.ok) throw new DocsPathRefusedError(checked);
  return checked;
}

/** True when `checkDocsPath` allows the target. */
export function isDocsPathAllowed(docsRoot: string, target: string, intent: DocsPathIntent = "read"): boolean {
  return checkDocsPath(docsRoot, target, intent).ok;
}

export type DocsPreflightTarget = { path: string; intent: DocsPathIntent };
export type DocsPreflightResult =
  | { ok: true }
  | { ok: false; status: number; detail: string; refused: DocsPathRefusal[] };

/**
 * Checks every target of a mutation before its first write. The highest
 * status among the refusals answers (403 before 400). The guarded operations
 * still re-check each target at its system call.
 */
export function preflightDocsPaths(docsRoot: string, targets: readonly DocsPreflightTarget[]): DocsPreflightResult {
  const refused: DocsPathRefusal[] = [];
  for (const target of targets) {
    const checked = checkDocsPath(docsRoot, target.path, target.intent);
    if (!checked.ok) refused.push(checked);
  }
  if (refused.length === 0) return { ok: true };
  const status = Math.max(...refused.map((entry) => entry.status));
  const shown = refused.slice(0, 10).map((entry) => entry.detail).join("; ");
  return {
    ok: false,
    status,
    detail: `Refused before any change: ${shown}${refused.length > 10 ? `; and ${refused.length - 10} more` : ""}`,
    refused,
  };
}

/** A child entry of a guarded listing, with its exclusion verdict. */
export type DocsDirEntry = {
  name: string;
  /** Lexical root-relative path of the entry. */
  rel: string;
  /** Root-relative path of the entry at its canonical location (the folder's stored path plus the stored name). */
  canonicalRel: string;
  /** lstat-typed entry: a symbolic link is reported as a link, never followed. */
  entry: Dirent;
  /** True when the entry (lexically or at its canonical location) is excluded. */
  excluded: boolean;
};

function classifyEntries(docsRoot: string, dir: DocsPathTarget, entries: Dirent[]): DocsDirEntry[] {
  return entries.map((entry) => {
    const rel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
    const canonicalRel = dir.canonicalRel ? `${dir.canonicalRel}/${entry.name}` : entry.name;
    return {
      name: entry.name,
      rel,
      canonicalRel,
      entry,
      excluded: excludedByPolicy(docsRoot, rel) || excludedByPolicy(docsRoot, canonicalRel),
    };
  });
}

/**
 * Refuses a recursive remove or a directory rename when a descendant is
 * excluded at its source, or would be at its destination.
 */
function subtreeRefusal(
  docsRoot: string,
  source: DocsPathTarget,
  destination?: DocsPathTarget,
): DocsPathRefusal | null {
  if (!hasDocsRootExcludePolicy(docsRoot)) return null;
  const walk = (relBelow: string): DocsPathRefusal | null => {
    let entries: Dirent[];
    try {
      entries = readdirSync(relBelow ? join(source.canonical, relBelow) : source.canonical, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      return refusal(403, "unresolvable", source.rel, `Cannot inspect ${source.rel}: ${code ?? String(error)}`);
    }
    for (const entry of entries) {
      const below = relBelow ? `${relBelow}/${entry.name}` : entry.name;
      const join2 = (base: string) => (base ? `${base}/${below}` : below);
      if (excludedByPolicy(docsRoot, join2(source.rel)) || excludedByPolicy(docsRoot, join2(source.canonicalRel))) {
        return refusal(403, "excluded", join2(source.rel), `Path is excluded from this docs project: ${join2(source.rel)}`);
      }
      if (
        destination &&
        (excludedByPolicy(docsRoot, join2(destination.rel)) || excludedByPolicy(docsRoot, join2(destination.canonicalRel)))
      ) {
        return refusal(403, "excluded", join2(destination.rel), `Path would land on an excluded path: ${join2(destination.rel)}`);
      }
      if (entry.isDirectory()) {
        const found = walk(below);
        if (found) return found;
      }
    }
    return null;
  };
  return walk("");
}

function lstatOrNull(path: string): Stats | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

export type DocsWatchListener = (eventType: string, relPath: string) => void;

/** The guarded filesystem bound to one served docs root. */
export type DocsFs = {
  readonly docsRoot: string;
  check(path: string, intent?: DocsPathIntent): DocsPathCheck;
  guard(path: string, intent?: DocsPathIntent): DocsPathTarget;
  preflight(targets: readonly DocsPreflightTarget[]): DocsPreflightResult;
  readFile(path: string): Promise<Buffer<ArrayBuffer>>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  /** Reads `length` bytes at `start` (asset range requests). */
  readRange(path: string, start: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
  stat(path: string): Promise<Stats>;
  lstat(path: string): Promise<Stats>;
  /** False for a missing or refused target. */
  exists(path: string): Promise<boolean>;
  existsSync(path: string): boolean;
  /** lstat-based existence of the entry itself; false for a missing or refused target. */
  lexists(path: string): Promise<boolean>;
  /** Names of the folder's entries, excluded entries omitted. */
  readdir(path: string): Promise<string[]>;
  /** lstat-typed entries of the folder, excluded entries omitted. */
  readdirEntries(path: string): Promise<Dirent[]>;
  /** Every entry with its exclusion verdict (for guards that must see excluded entries). */
  readdirClassified(path: string): Promise<DocsDirEntry[]>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  /** Write-temp-then-rename in the target's folder; creates missing parent folders. */
  atomicWrite(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Recursive watch of the served root; events for refused paths are dropped. */
  watch(listener: DocsWatchListener): FSWatcher;
};

/** The guarded filesystem for `docsRoot`. */
export function docsFs(docsRoot: string): DocsFs {
  const guard = (path: string, intent: DocsPathIntent = "read") => guardDocsPath(docsRoot, path, intent);
  const listing = async (path: string) => {
    const dir = guard(path, "read");
    return classifyEntries(docsRoot, dir, await fsp.readdir(dir.canonical, { withFileTypes: true }));
  };
  const self: DocsFs = {
    docsRoot,
    check: (path, intent = "read") => checkDocsPath(docsRoot, path, intent),
    guard,
    preflight: (targets) => preflightDocsPaths(docsRoot, targets),
    readFile: (async (path: string, encoding?: "utf8") => {
      const target = guard(path, "read");
      return encoding ? fsp.readFile(target.canonical, encoding) : fsp.readFile(target.canonical);
    }) as DocsFs["readFile"],
    async readRange(path, start, length) {
      const target = guard(path, "read");
      const bytes = new Uint8Array(length);
      const handle = await fsp.open(target.canonical, "r");
      try {
        await handle.read(bytes, 0, length, start);
      } finally {
        await handle.close();
      }
      return bytes;
    },
    stat: async (path) => fsp.stat(guard(path, "read").canonical),
    lstat: async (path) => fsp.lstat(guard(path, "inspect").canonical),
    async exists(path) {
      const checked = checkDocsPath(docsRoot, path, "read");
      if (!checked.ok) return false;
      try {
        await fsp.stat(checked.canonical);
        return true;
      } catch {
        return false;
      }
    },
    existsSync(path) {
      const checked = checkDocsPath(docsRoot, path, "read");
      if (!checked.ok) return false;
      try {
        statSync(checked.canonical);
        return true;
      } catch {
        return false;
      }
    },
    async lexists(path) {
      const checked = checkDocsPath(docsRoot, path, "inspect");
      if (!checked.ok) return false;
      try {
        await fsp.lstat(checked.canonical);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    readdir: async (path) => (await listing(path)).filter((item) => !item.excluded).map((item) => item.name),
    readdirEntries: async (path) => (await listing(path)).filter((item) => !item.excluded).map((item) => item.entry),
    readdirClassified: listing,
    async writeFile(path, data) {
      await fsp.writeFile(guard(path, "write").canonical, data);
    },
    async atomicWrite(path, data) {
      const target = guard(path, "write");
      await self.mkdir(dirname(target.abs), { recursive: true });
      const temp = guard(`${target.abs}.tmp-${randomUUID()}`, "write");
      try {
        await fsp.writeFile(temp.canonical, data);
        // Re-checked right before the replace.
        await fsp.rename(temp.canonical, guard(path, "write").canonical);
      } catch (error) {
        await fsp.unlink(temp.canonical).catch(() => undefined);
        throw error;
      }
    },
    async mkdir(path, options) {
      await fsp.mkdir(guard(path, "mkdir").canonical, { recursive: options?.recursive ?? false });
    },
    async unlink(path) {
      await fsp.unlink(guard(path, "remove").canonical);
    },
    async rmdir(path) {
      await fsp.rmdir(guard(path, "remove").canonical);
    },
    async rm(path, options) {
      const target = guard(path, "remove");
      if (options?.recursive && lstatOrNull(target.canonical)?.isDirectory()) {
        const refused = subtreeRefusal(docsRoot, target);
        if (refused) throw new DocsPathRefusedError(refused);
      }
      await fsp.rm(target.canonical, { recursive: options?.recursive ?? false, force: options?.force ?? false });
    },
    async rename(from, to) {
      const source = guard(from, "rename-from");
      const destination = guard(to, "rename-to");
      // Compared folded too: on a case-insensitive volume `a` and `A/x` name the same folder tree.
      const into = (from: string, to: string) => relInside(from, to) !== null && from !== to;
      if (
        into(source.canonical, destination.canonical) ||
        into(foldDocsPath(source.canonical), foldDocsPath(destination.canonical))
      ) {
        throw new DocsPathRefusedError(
          refusal(400, "unsafe", destination.rel, `Cannot move ${source.rel} into itself: ${destination.rel}`),
        );
      }
      if (lstatOrNull(source.canonical)?.isDirectory()) {
        const refused = subtreeRefusal(docsRoot, source, destination);
        if (refused) throw new DocsPathRefusedError(refused);
      }
      // A case- or normalization-only rename (`page` to `Page`) on a case-insensitive volume: the
      // destination resolves to the source entry itself, so the new spelling is renamed to in the
      // same canonical folder. Its exclusion verdict is the source's (matching is folded).
      let destinationPath = destination.canonical;
      const wanted = basename(destination.abs);
      if (
        destinationPath === source.canonical &&
        wanted !== basename(source.canonical) &&
        foldDocsPath(wanted) === foldDocsPath(basename(source.canonical))
      ) {
        destinationPath = join(dirname(source.canonical), wanted);
      }
      await fsp.rename(source.canonical, destinationPath);
    },
    watch(listener) {
      const rootReal = guard("", "read").canonical;
      return watchFs(rootReal, { recursive: true }, (eventType, filename) => {
        if (typeof filename !== "string" || filename.length === 0) return;
        const rel = filename.split(sep).join("/");
        try {
          if (excludedByPolicy(docsRoot, rel)) return;
        } catch {
          return;
        }
        listener(eventType, rel);
      });
    },
  };
  return self;
}

/** What an export writes in its output folder. */
export type DocsOutputIntent = "read" | "write" | "mkdir";

/**
 * Checks one destination of `docs-cli export` (B7-3-02). The output folder
 * may lie anywhere, also inside the corpus, but nothing the export writes may
 * reach a path the corpus forbids:
 *
 * 1. Lexical: the target is the output folder `outDir` or lies below it.
 * 2. No symbolic link at or below the output folder: the output folder
 *    itself and every existing component from it down to the target are
 *    lstat-checked, so neither a linked output folder (B7-4-01: also one that
 *    points at an ordinary allowed folder), a linked descendant folder
 *    (`data/` into frozen inputs, `data/files` into the corpus) nor a linked
 *    final file (`index.html`) is ever written through. Links strictly above
 *    the output folder (`/tmp/out`, a parent of `--out` that is a link) are
 *    resolved, never refused.
 * 3. Canonical: the target's canonical location (realpath of its deepest
 *    existing ancestor plus the missing components). A dangling link on the
 *    way is refused.
 * 4. Corpus: a canonical target inside the served docs root goes through
 *    `checkDocsPath` with the same intent (every governing policy, links,
 *    confinement). Both the requested (lexical) target and the canonical
 *    target are matched against the corpus exclusion and against the
 *    `exclude` globs of every governing project (the served project or an
 *    enclosing `"docsRoot": "."` project), each form relative to each scope
 *    root; either form excluded refuses (B7-4-02: a permitted parent link
 *    cannot carry a lexically excluded destination to an allowed folder). The
 *    requested form is read relative to every existing ancestor of the output
 *    folder whose realpath is a scope root, so another spelling of the root
 *    (`/tmp` for `/private/tmp`, a link to the root) is judged the same. A
 *    malformed policy refuses everything.
 *
 * The guarded output operations check immediately before each system call.
 */
export function checkDocsOutputPath(
  docsRoot: string,
  outDir: string,
  target: string,
  intent: DocsOutputIntent = "write",
): DocsPathCheck {
  const shown = typeof target === "string" ? target : String(target);
  if (typeof target !== "string" || target.includes("\0") || typeof outDir !== "string" || outDir.includes("\0")) {
    return refusal(400, "unsafe", shown, `Invalid export output path: ${shown}`);
  }
  const outAbs = resolve(outDir);
  const rel = isAbsolute(target) ? relInside(outAbs, resolve(target)) : relInside(outAbs, resolve(outAbs, target));
  if (rel === null) {
    return refusal(400, "outside-root", shown, `Export output refused: path escapes the output folder: ${shown}`);
  }
  const shownRel = rel || ".";
  const abs = rel === "" ? outAbs : join(outAbs, ...rel.split("/"));

  // B7-4-01: the output folder itself first (also for the output folder as the target), then
  // every existing component below it down to the target.
  const components = [outAbs];
  for (const segment of rel ? rel.split("/") : []) components.push(join(components[components.length - 1]!, segment));
  for (const walked of components) {
    let entry: Stats;
    try {
      entry = lstatSync(walked);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") break;
      return refusal(403, "unresolvable", rel, `Export output refused: cannot inspect ${shownRel} (${code ?? String(error)})`);
    }
    if (entry.isSymbolicLink()) {
      const link = walked === outAbs ? `the output folder ${outAbs}` : relative(outAbs, walked).split(sep).join("/");
      return refusal(403, "symlink", rel, `Export output refused: ${link} is a symbolic link; an export never writes through one`);
    }
  }

  let outCanonical: string;
  let canonical: string;
  try {
    outCanonical = canonicalize(outAbs, true);
    canonical = canonicalize(abs, true);
  } catch (error) {
    if (error instanceof Unresolvable) {
      return refusal(403, "unresolvable", rel, `Export output refused: cannot resolve ${shownRel} safely (${error.message})`);
    }
    throw error;
  }
  const canonicalRel = relInside(outCanonical, canonical);
  if (canonicalRel === null) {
    return refusal(403, "outside-root", rel, `Export output refused: ${shownRel} leads outside the output folder on disk`);
  }

  try {
    const rootReal = realDocsRootPath(docsRoot);
    if (relInside(rootReal, canonical) !== null) {
      const corpus = checkDocsPath(docsRoot, canonical, intent);
      if (!corpus.ok) return { ...corpus, path: rel, detail: `Export output refused: ${corpus.detail}` };
    }
    // B7-4-02: the requested target, relative to a root it names lexically, is judged as well as
    // the canonical one, so a permitted parent link never carries an excluded destination to an
    // allowed folder.
    const requested = requestedForms(outAbs, rel);
    for (const corpusRel of [relInside(resolve(docsRoot), abs), relInside(rootReal, abs), ...requested.relTo(rootReal)]) {
      if (corpusRel !== null && excludedByPolicy(docsRoot, corpusRel)) {
        return refusal(403, "excluded", rel, `Export output refused: ${shownRel} is excluded from this docs project (requested ${corpusRel})`);
      }
    }
    for (const scope of docsRootPolicyScopes(docsRoot)) {
      const forms: Array<[string, string | null]> = [
        ["on disk", relInside(scope.projectDocsRoot, canonical)],
        ["requested", relInside(scope.projectDocsRoot, abs)],
        ...requested.relTo(scope.projectDocsRoot).map((form): [string, string] => ["requested", form]),
      ];
      for (const [label, inScope] of forms) {
        if (inScope !== null && inScope !== "" && isExcludedDocPath(inScope, scope.exclude)) {
          return refusal(
            403,
            "excluded",
            rel,
            `Export output refused: ${shownRel} lies on a path ${scope.configPath} excludes (${label} ${inScope})`,
          );
        }
      }
    }
  } catch (error) {
    return refusal(
      500,
      "policy-invalid",
      rel,
      `Docs project policy cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { ok: true, abs, rel, canonical, canonicalRel };
}

/**
 * The requested (lexical) export target `outAbs/rel` read relative to a root
 * (B7-4-02): for every existing ancestor of the output folder (itself
 * included) whose realpath is `root`, the lexical remainder from that ancestor
 * to the target. Components at and below the output folder hold no links (the
 * output guard refuses them), so its ancestors are the only places a link can
 * move the requested path.
 */
function requestedForms(outAbs: string, rel: string): { relTo(root: string): string[] } {
  const ancestors: Array<{ real: string; rest: string[] }> = [];
  let ancestor = outAbs;
  const rest: string[] = rel ? rel.split("/") : [];
  for (;;) {
    try {
      ancestors.push({ real: realpathSync(ancestor), rest: [...rest] });
    } catch {
      // A missing (or unreadable) ancestor names no root; the canonical check covers the target.
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    rest.unshift(basename(ancestor));
    ancestor = parent;
  }
  return {
    relTo(root) {
      return ancestors.filter((entry) => entry.real === root).map((entry) => entry.rest.join("/"));
    },
  };
}

/** The guarded export output folder (B7-3-02): every export write goes through it. */
export type DocsOutputFs = {
  readonly outDir: string;
  check(path: string, intent?: DocsOutputIntent): DocsPathCheck;
  guard(path: string, intent?: DocsOutputIntent): DocsPathTarget;
  /** Checks every destination before the first write; the highest status answers. */
  preflight(targets: ReadonlyArray<{ path: string; intent: DocsOutputIntent }>): DocsPreflightResult;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  /** Creates or truncates a regular file; the final component is opened without following a link. */
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
};

/** The guarded output folder `outDir` of an export of `docsRoot`. */
export function docsOutputFs(docsRoot: string, outDir: string): DocsOutputFs {
  const check = (path: string, intent: DocsOutputIntent = "write") => checkDocsOutputPath(docsRoot, outDir, path, intent);
  const guard = (path: string, intent: DocsOutputIntent = "write"): DocsPathTarget => {
    const checked = check(path, intent);
    if (!checked.ok) throw new DocsPathRefusedError(checked);
    return checked;
  };
  return {
    outDir,
    check,
    guard,
    preflight(targets) {
      const refused: DocsPathRefusal[] = [];
      for (const target of targets) {
        const checked = check(target.path, target.intent);
        if (!checked.ok) refused.push(checked);
      }
      if (refused.length === 0) return { ok: true };
      const shown = refused.slice(0, 10).map((entry) => entry.detail).join("; ");
      return {
        ok: false,
        status: Math.max(...refused.map((entry) => entry.status)),
        detail: `Refused before any change: ${shown}${refused.length > 10 ? `; and ${refused.length - 10} more` : ""}`,
        refused,
      };
    },
    readFile: async (path, encoding) => fsp.readFile(guard(path, "read").canonical, encoding),
    async writeFile(path, data) {
      const target = guard(path, "write");
      const handle = await fsp.open(
        target.canonical,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
        0o666,
      );
      try {
        await handle.writeFile(data);
      } finally {
        await handle.close();
      }
    },
    async mkdir(path, options) {
      await fsp.mkdir(guard(path, "mkdir").canonical, { recursive: options?.recursive ?? false });
    },
  };
}
