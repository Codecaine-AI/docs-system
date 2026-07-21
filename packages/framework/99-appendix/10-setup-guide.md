---
covers: How to mount docs-system into a host project (submodule + skill symlinks) and initialize your documentation.
concepts: [setup, installation, git-submodule, symlink, initialization, hosting, mount]
---

# Setup Guide

Keep [`Codecaine-AI/docs-system`](https://github.com/Codecaine-AI/docs-system) as the source of truth, mount it into each project as a git submodule, point the agent skill directories at the manual living inside it (`packages/framework`), run `/docs:init`, and start documenting.

This repository is the full docs system, not just the skill content: `packages/framework` (this manual), `packages/docs-model`, `packages/docs-index`, `packages/docs-server`, `packages/docs-viewer`, `packages/docs-workbench` (the `docs serve` / `docs export` app), and `packages/docs-cli` (the `docs` command). A host project only needs to *mount the whole repo* — the skill directory is a subpath inside it, not the repo root.

---

## Prerequisites

- A project you want to document
- Claude Code or Codex skills support
- Git submodule support (or a local checkout of `docs-system` to symlink instead)
- [Bun](https://bun.sh) — the CLI, server, and workbench all run on it

## Installation: Git Submodule

Use a Git submodule when the project should carry a pinned `docs-system` version.

### Step 1: Add the Repo as a Submodule

From your project root:

```
git submodule add https://github.com/Codecaine-AI/docs-system.git packages/docs-framework
```

Mount path note: if your project's own `package.json` `workspaces` globs would swallow a `packages/*` submodule as a workspace member (for example a glob like `"packages/*"` with no exclusion), mount it at `tools/docs-framework` instead of `packages/docs-framework` and adjust the paths below accordingly. This has bitten a real host repo — check your workspace globs before picking a path.

### Step 2: Install Its Dependencies

Run `bun install` **inside the mount** — the host's own `bun install` does not reach into a submodule's independent workspace:

```
cd packages/docs-framework && bun install && cd -
```

Repeat this after every pin bump (`git submodule update --remote packages/docs-framework`). Forgetting the post-bump install is the single most common way this setup breaks — the mount's `node_modules` goes stale even though the bump itself succeeded.

### Step 3: Point the Skill Directories at the Manual

The skill content — `SKILL.md` and this manual — lives at `packages/framework` *inside* the submodule, not at the submodule root. Symlink your agents' skill directories to that subpath:

```
mkdir -p .claude/skills .codex/skills
ln -s ../../packages/docs-framework/packages/framework .codex/skills/docs-framework
ln -s ../../.codex/skills/docs-framework .claude/skills/docs-framework
```

`.codex/skills/docs-framework` resolves (through the submodule) to `packages/framework`. `.claude/skills/docs-framework` is a symlink to that same symlink, so Claude Code commands read the identical framework content. If a project only uses one agent, create only that mount.

After cloning a project that uses this setup, initialize the submodule (the symlinks are plain files checked into git and need no separate init):

```
git submodule update --init --recursive packages/docs-framework
```

### Step 4: Add a `docs` Script

Add a script to your project's `package.json` forwarding to the CLI entry point inside the mount:

```json
"scripts": {
  "docs": "bun packages/docs-framework/packages/docs-cli/src/index.ts"
}
```

Adjust the path if you mounted at `tools/docs-framework`. From here on, `bun run docs <command>` is the CLI (`render`, `grep`, `backlinks rescan`, `links check`, `migrate`, `serve`, `export` — see [30-workflows](../30-workflows/00-overview.md) for how each is used, and the root [`README.md`](https://github.com/Codecaine-AI/docs-system#quickstart) for the full command reference).

### Symlink-Only Alternative (No Submodule)

For a local-only project, symlink an existing `docs-system` checkout instead of adding a submodule:

```
mkdir -p .claude/skills .codex/skills
ln -s /absolute/path/to/docs-system/packages/framework .codex/skills/docs-framework
ln -s ../../.codex/skills/docs-framework .claude/skills/docs-framework
```

Wire the `docs` script to the same checkout's `packages/docs-cli/src/index.ts`.

### Step 5: Initialize Your Documentation

In Claude Code, run:

```
/docs:init
```

This creates your `docs/` directory with the three-layer structure:

```
docs/
├── 00-foundation/           # Why/purpose (freeform)
│   └── 00-overview.md       # Placeholder until interview
├── 10-system-design/        # Product structure and behavior
│   └── 00-overview.md       # System design overview
├── 20-implementation/       # Code-specific mechanics
│   └── 00-overview.md       # Implementation overview
└── .drafts/                 # Working directory for interviews
```

### Step 6: Run the Foundation Interview

**This is the critical step.** The Foundation interview explores what you're building and why.

Run:
```
/docs:interview-foundation
```

This is a curious, exploratory conversation—not a checklist. The agent will explore:
- What is this trying to BE?
- What should it do extremely well?
- How do you think about this problem?
- What would feel "right" vs. "wrong"?

Structure emerges from the conversation. You might end up with:
- Problem-focused docs (problem.md, landscape.md, approach.md)
- Vision-focused docs (vision.md, constraints.md, direction.md)
- Thinking-focused docs (context.md, ideas.md, decisions.md)
- A single narrative document
- Or something else entirely

After the interview, run `/docs:write foundation` to generate the docs.

### Step 7: Write Your Implementation Overview

Edit `docs/20-implementation/00-overview.md` to describe your codebase:
- System metaphor / mental model
- High-level architecture
- Section index (as you add sections)

## Directory Structure After Setup

```
your-project/
├── docs/                            # YOUR project documentation
│   ├── 00-foundation/                   # Why/purpose (structure varies)
│   ├── 10-system-design/                # Product structure and behavior
│   ├── 20-implementation/                # Code-specific mechanics
│   └── .index/                          # Derived backlinks index (gitignore this)
├── .claude/
│   └── skills/docs-framework -> ../../.codex/skills/docs-framework
├── .codex/
│   └── skills/docs-framework -> ../../packages/docs-framework/packages/framework
└── packages/
    └── docs-framework/                  # docs-system submodule (the whole repo)
        └── packages/
            ├── framework/                   # <- both skill symlinks resolve here
            ├── docs-cli/                    # <- your `docs` script forwards here
            ├── docs-model/, docs-index/, docs-server/, docs-viewer/, docs-workbench/
            └── canvas/                      # nested submodule — see the cycle caveat
```

Each folder inside `docs/` holds `doc.json` bundles once you've run `docs migrate` (or once you author fresh content through `docs serve`'s Edit mode) — not raw markdown files. The three-layer directory shape still applies; only the on-disk representation of each node changed. For the bundle anatomy and the rendered surfaces, see the docs-system corpus: `docs/10-system-design/20-interaction-surfaces`.

## One Repo, One Output

| Directory | Contains | Managed By |
|-----------|----------|------------|
| `packages/docs-framework/` | docs-system submodule (the whole repo: framework manual, model, index, server, viewer, workbench, CLI) | docs-system project |
| `.codex/skills/docs-framework` | symlink into the submodule's `packages/framework` | you (set up once) |
| `.claude/skills/docs-framework` | symlink to the Codex symlink | you (set up once) |
| `docs/` | YOUR project documentation | you |

**Important:** Framework edits should happen in the `docs-system` repo. All project documentation goes in `docs/`.

## Adding Sections to Implementation

For each major domain in your codebase, create a section inside `20-implementation/`:

```
docs/
├── 00-foundation/
│   └── ...
├── 10-system-design/
│   └── 00-overview.md
├── 20-implementation/
│   ├── 00-overview.md
│   ├── 10-authentication/
│   │   ├── 00-overview.md
│   │   └── 10-session-management.md
│   ├── 20-api/
│   │   └── 00-overview.md
│   └── 30-data/
│       └── 00-overview.md
```

## Updating the Framework

To update, commit changes in the `docs-system` repo, then bump the submodule pin in each consuming project and reinstall its dependencies:

```
git submodule update --remote packages/docs-framework
cd packages/docs-framework && bun install && cd -
```

The reinstall step is not optional — see the pin-bump note in Step 2 above. The skill symlinks (`.codex/skills/docs-framework`, `.claude/skills/docs-framework`) need no update; they point at a path inside the submodule, so a pin bump updates their target content automatically.

### Host-Embedded Skill Snapshots

A host that also embeds this skill's content into its own backend skill library (for example, so its agent runtime can `skill_read` it without a filesystem mount at request time) needs a sync step after every framework change. This is host-specific tooling, not part of docs-system itself — check the host's own scripts (e.g. a `sync:docs-framework`-style script) for what it copies and where. Typically this copies the backend-relevant subset (`SKILL.md`, `00-reference/`, `10-cookbook/`, `20-standards/`, `40-templates/`) out of the submodule's `packages/framework` and regenerates a registry wrapper — confirm against the host's actual sync script rather than assuming this list, since hosts can choose a different subset.

## Available Commands

### Setup & Structure
- **`/docs:init`** - Initialize `docs/` with three-layer structure
- **`/docs:scaffold`** - Generate section structure from source code

### Knowledge Extraction
- **`/docs:interview-foundation`** - Explore understanding through curious dialogue
- **`/docs:interview-codebase <path>`** - Extract understanding of a specific code area through interactive conversation

### Documentation Generation
- **`/docs:write <section>`** - Generate documentation from interview notes

### Code Annotation
- **`/docs:annotate <path>`** - Add L4 file headers and L5 function docstrings to source code

### Maintenance
- **`/docs:audit`** - Check your documentation for structural issues and semantic drift

## CLI Commands (`bun run docs <command>`)

These run directly, outside of agent slash commands — use them from a terminal or from a workflow that needs to read/write `doc.json` bundles programmatically:

- **`docs render <path>`** - Project a `doc.json` bundle to Markdown and print it
- **`docs grep <term> [pathPrefix]`** - Search bundle content under a path prefix (default `docs`)
- **`docs backlinks rescan [docsRoot]`** - Rebuild the backlinks index at `<docsRoot>/.index/` from scratch
- **`docs links check [docsRoot]`** - Rescan, then report every reference whose target doesn't resolve (exits non-zero if any are found)
- **`docs migrate [repoRoot] [--drafts] [--dry-run]`** - Non-destructive `.md`/`.mdx` → `doc.json` migration (see [Quickstart](../../../README.md#quickstart) for the retirement flags)
- **`docs serve [--root <path>] [--port <port>] [--host <addr>] [--dev] [--rebuild]`** - Run the read+write workbench (loopback-only unless `--host` is given)
- **`docs export [--root <path>] --out <dir> [--rebuild]`** - Produce a static, read-only site

## Troubleshooting

### Skills/commands not appearing in Claude Code

Ensure the relevant skill root is at your project root and `docs-framework` resolves to the local repo:

```
ls -la .claude/skills/docs-framework
ls -la .codex/skills/docs-framework
```

Restart the agent if needed.

### "docs/ already exists"

The `/docs:init` command validates existing structure rather than overwriting. Run `/docs:audit` to check the health of existing documentation.

### `bun install` inside the mount fails, or `docs serve` can't find `@codecaine-ai/canvas`

The submodule has its own workspace and its own nested `external/canvas` submodule. Make sure both were initialized:

```
git submodule update --init --recursive packages/docs-framework
cd packages/docs-framework && bun install
```

If your host project *also* embeds the canvas engine directly (not just through this repo), do not `git clone --recursive` the host — that can create a submodule cycle (this repo depends on `canvas`; a canvas-embedding host may depend on this repo). Clone flat and initialize only the specific submodule paths you need.
