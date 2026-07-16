# docs-cli — the agent dialect

`@codecaine-ai/docs-cli` is the stable agent command dialect and the human entry point for docs-system. It is the only package that exposes a binary: `docs-cli` maps to `./src/index.ts` at `packages/docs-cli/src/index.ts`.

## What it owns

**Command surface**

| command | what it does |
| --- | --- |
| render <path> | Projects a bundle to agent-readable markdown. An agent never parses doc.json directly. |
| grep <term> [pathPrefix] | Searches across bundles. |
| backlinks rescan [docsRoot] | Rebuilds the derived docs-index database. |
| links check [docsRoot] | Checks reference integrity and exits non-zero on broken references. |
| migrate [repoRoot] | Migrates markdown to bundles non-destructively by default, writing doc.json alongside .mdx sources. Deletion requires both --retire-twins and --yes-delete-markdown. |
| serve | Runs the workbench as a static SPA, or with --dev for HMR. |
| export --out <dir> | Produces a fully static read-only site. |

## Why it is its own package

> **Forcing constraint: Keep the command dialect stable** — Agents read with `docs render`, discover with `docs grep`, and verify integrity with `docs links check`. That command surface must remain scriptable and stable independently of how the app shell evolves. `docs-cli` is also the only package with a bin.

## Dependencies

It depends on `docs-model` for render/projection, docs-index for backlinks/links, and docs-workbench for serve/export. Nothing depends on `docs-cli`; it is a leaf.

## Using it alone

Agents use `render`, `grep`, and `links check` constantly without starting a server. `migrate` is a one-time adoption tool. Host repositories invoke the CLI through their submodule mount.

> **Boundary under review: The split is not forced** — Merging `docs-cli` into docs-workbench is a live candidate: `serve` and `export` already just drive the workbench, and the two packages ship together. The current split is a judgment call between command dialect and app shell, not a forced boundary.
