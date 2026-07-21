Docs point at code with typed source references; code never points back. 

This page states the source-link object, how paths are written, and why the docs side pays all of the maintenance.

## Structure

```json
{
  "insert": "packages/docs-viewer/src/render/doc-title.ts",
  "attributes": {
    "code": true,
    "reference": {
      "kind": "source",
      "path": "packages/docs-viewer/src/render/doc-title.ts"
    }
  }
}
```
> **L6 (A different object):** kind "source" targets a repo file — resolved against the filesystem, not the docs lookup a doc link uses.
> **L7 (Full path, checkable):** Repo-relative from the root — docs links check verifies the file exists.

- **A source link is its own object**

  - `kind`: `"source"` with a repo-relative path — optionally a symbol and line.

  - `docs links check` verifies the target file exists; a doc link resolves through the docs lookup instead.

## The rule

- **One-way, doc to code**

  - No doc links in code comments; the source stays ignorant of the docs.

- **Full paths**

  - `src/auth/session/manager.ts` — never bare filenames, function names without paths, or vague pointers.

  - The typed reference carries the path, so the claim is machine-checkable.

- **Inline, with context**

  - Introduce a path where the concept is discussed, with enough context to say why the file matters.

- **Related Files only at four plus**

  - A full-path list with one-line purposes, at the end, only when a doc references four or more files.

- **Code moves, docs update**

  - When code moves or renames, the doc updates; `docs links check` reports references whose target no longer exists.

  - No generated navigation scripts

    - List files and explain briefly.

What the code itself carries — file headers, docstrings, inline comments — is in-code docs's subject.

## Why

- **The maintenance bill lands where it can be paid**

  - Docs know about code, so a refactor ends with a docs pass.

  - The code never waits on one and never carries stale doc paths outward.

- **A full path is a checkable claim**

  - A bare filename is a vibe; a typed path is verified, and a reader opens it without a search.

- **Inline beats a link farm**

  - The reader arrives at the path with the question already framed.
