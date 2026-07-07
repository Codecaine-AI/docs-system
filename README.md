# docs-system

`docs-system` (Codecaine-AI/docs-system) is a self-hosted documentation system:
a normalized, id-keyed document model (`doc.json`), a mutation authority that
serves and edits it safely, a React viewer/editor, a runnable workbench app,
and a CLI — plus the framework skill (a manual for coding agents) that
describes how to use all of it.

It used to be a skill-content-only repo (`docs-framework`, Markdown +
templates only). It is now the full system: content is stored as normalized
`doc.json` bundles instead of raw Markdown/MDX, edited through a real
mutation API with locks and undo, viewed/edited through a React app, and
served by a runnable workbench (`docs serve`) or exported to a static site
(`docs export`). The old skill content lives on as `packages/framework` —
still the manual, still consumed as a skill by agents, now describing this
larger system.

---

## Package Map

| Package | What it is |
|---|---|
| [`packages/framework`](packages/framework/SKILL.md) | The skill/manual: `SKILL.md` entry point plus `00-reference` (philosophy, architecture), `10-cookbook` (navigate/produce/maintain), `20-standards` (structure rules), `30-workflows` (the `/docs:*` commands), `40-templates` (document templates), `99-appendix` (setup, operations). |
| [`packages/docs-model`](packages/docs-model) | Pure TypeScript, no React, no I/O. The `doc.json` schema (a normalized, id-keyed block tree, 20 block flavours, delta/rich-text spans), a 6-op mutation vocabulary with a pure `applyOp(doc, op) -> { doc, inverse }`, the comments schema, and Markdown projection in both directions (`projectToMarkdown`, Markdown → delta). |
| [`packages/docs-index`](packages/docs-index) | A `bun:sqlite`-backed backlinks index. Derived state lives at `<docsRoot>/.index/` (gitignored — always rebuildable via rescan). Also: reference matching, `move-doc` with inbound-reference rewriting, and path-confinement helpers so operations can't escape the docs root. |
| [`packages/docs-server`](packages/docs-server) | The embeddable mutation authority. `createDocsStore(docsRoot)` gives per-path mutexed, atomic (temp-then-rename) writes, TTL-based draft locks (423 on conflict), a single-use inverse-op undo ledger, and SSE change events. `createDocsRoutes(store)` turns that into an Elysia route factory exposing the full read+write `/api/*` table; mutating ops take an `expected_hash` and return 409 on staleness. |
| [`packages/docs-viewer`](packages/docs-viewer) | React: `DocBlockRenderer` and 20 block flavours, a TipTap-based editor (slash menu, Markdown input rules, reference chips), Plannotator-style comments, `DocTargetingLayer` (hover outline, type chips, pinpoint and text-selection targeting), `DocsBlockLibrary`, and the `DocsClientProvider` seam a host uses to inject its own client and a canvas-embed slot. |
| [`packages/docs-workbench`](packages/docs-workbench) | The runnable app. `docs serve` starts a loopback-only (127.0.0.1:4800 by default; `--host` to expose) read+write workbench — always-editable Edit mode (Notion-style auto-save) plus an Annotate mode — with a block library at `#/blocks`, SSE change flashes, and one-click undo. `docs export` produces a fully static, read-only site (relative paths — works from any subpath). |
| [`packages/docs-cli`](packages/docs-cli) | The `docs` CLI: `render`, `grep`, `backlinks rescan`, `links check`, `migrate`, `serve`, `export`. |
| [`external/canvas`](external/canvas) | Git submodule ([`Codecaine-AI/canvas`](https://github.com/Codecaine-AI/canvas)) powering canvas embeds inside the workbench. Lives under `external/` (not `packages/`) because it is a sibling Codecaine project the docs system *supports*, not a part of it. See the caveat below before cloning recursively. |

---

## Quickstart

Adopt this system in a project that already has (or will have) a `docs/`
tree, then serve it:

```bash
git submodule add https://github.com/Codecaine-AI/docs-system.git packages/docs-framework
cd packages/docs-framework && bun install && cd -
echo '  "docs": "bun packages/docs-framework/packages/docs-cli/src/index.ts"' # add to your package.json scripts
bun run docs migrate   # only if docs/ currently holds .md/.mdx files
bun run docs serve      # http://127.0.0.1:4800
```

That's the whole loop: add the submodule, install its dependencies, wire a
`docs` script, migrate existing Markdown (non-destructive — see below), and
serve. See [`packages/framework/99-appendix/10-setup-guide.md`](packages/framework/99-appendix/10-setup-guide.md)
for the full walkthrough, including the skill-mount convention for Claude
Code / Codex agents and the `--root`/`--host`/`--port` flags on `serve`.

`docs migrate` is non-destructive by default: it writes `doc.json` bundles
alongside existing `.md`/`.mdx` sources and never deletes them. `.mdx` is
preferred over a same-stem `.md` twin when both exist. Retiring the
superseded Markdown files requires the explicit, double-confirmed
`--retire-twins --yes-delete-markdown` pair (or `--dry-run` to preview).

---

## Hosting Model

A **host** adopts this system by adding it as a git submodule, then either
embeds its packages or just runs the workbench.

### (a) Embed

A host with its own backend imports `docs-server` (the mutation authority)
and `docs-viewer` (the React UI) directly, wiring its own concerns on top —
for example, resolving a project id to a `docsRoot`, or plugging in its own
agent runtime. Spectre is the reference example of this: it embeds both
packages and layers project→docsRoot resolution and its agent tooling on
top of `createDocsStore`/`createDocsRoutes`.

### (b) Run the workbench

Any repo with a `docs/` tree can just run:

```bash
bun run docs serve
```

from a directory that has this repo mounted (`--root` defaults to `./docs`
relative to the current working directory). No host backend required — the
workbench is a complete, self-contained read+write app.

### Adoption steps (detailed)

1. `git submodule add https://github.com/Codecaine-AI/docs-system.git packages/docs-framework`
   — use `tools/docs-framework` instead of `packages/docs-framework` if the
   superproject's own workspace globs (e.g. `packages/*`) would otherwise
   swallow this submodule as a workspace member. This has bitten a real
   host repo; check your `package.json`'s `workspaces` field before picking
   a mount path.
2. `bun install` **inside the mount** (`cd packages/docs-framework && bun install`)
   — and again after every pin bump (`git submodule update --remote`). This
   has also bitten us: forgetting the post-bump install leaves the mount's
   own `node_modules` stale even though the host's install succeeded.
3. Add a `docs` script to the host's `package.json` forwarding to
   `packages/docs-framework/packages/docs-cli/src/index.ts` (adjust the path
   to wherever you mounted it).
4. Run `docs migrate` if the target `docs/` tree is still Markdown.
5. Run `docs serve`.

### Boundary guarantees

- `docs-model` is React-free.
- No package under `packages/` may import host-app code.

Both are enforced by [`import-boundaries.test.ts`](import-boundaries.test.ts) at the repo root.

### Canvas submodule cycle caveat

`external/canvas` is itself a git submodule. Host repos that also embed the
canvas engine directly (not just through this repo) create a submodule
cycle: this repo depends on `canvas`, and a canvas-embedding host may in
turn depend on this repo. **Never `git clone --recursive` blindly** in that
situation — it can recurse into a submodule that points back at a
superproject you're already inside. Clone flat, then `git submodule update
--init` only the specific paths you need.

---

## Development

```bash
bun install                # from the repo root
bun run test                # runs the full workspace test suite
bunx --bun tsc --noEmit     # typecheck (via `bun run typecheck`)
```

`bun run test` runs `docs-model`, `docs-index`, `docs-cli`, `docs-server`,
`docs-viewer`, and both `docs-workbench` test trees (`src` and `web/src`).

**Known flake**: `packages/docs-workbench/web/src/__tests__/workbench.test.tsx`
— `annotate mode > hover-targets a block (outline + flavour chip) and
selecting via the layer opens the composer` — intermittently fails with an
`ENOENT` reading a temp-dir `comments.json` fixture (a test-harness timing
issue around the canvas-embed comments seam, not a product bug). Re-run the
suite if only this test fails; a clean run passes all 401 tests.

---

## License

MIT (see [`LICENSE`](LICENSE)) for original code in this repository.

Two files are vendored, labeled, non-verbatim ports from
[BlockSuite](https://github.com/toeverything/blocksuite) (MPL-2.0), each
with its own `NOTICE` explaining provenance and why the port satisfies
MPL-2.0 file-level copyleft:

- [`packages/docs-viewer/src/editor/menus/vendor/blocksuite/NOTICE`](packages/docs-viewer/src/editor/menus/vendor/blocksuite/NOTICE)
- `external/canvas/packages/canvas/src/vendor/blocksuite/NOTICE` (inside the `canvas` submodule)

Do not modify the vendored/ported files without updating their NOTICE and
file-header provenance comments accordingly.
