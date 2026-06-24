---
covers: How to add the documentation framework to your project as a reusable skill directory.
concepts: [setup, installation, symlink, initialization]
---

# Setup Guide

Keep this repository as the source of truth, symlink it into each project as a skill directory, run `/docs:init`, and start documenting.

---

## Prerequisites

- A project you want to document
- Claude Code or Codex skills support
- A local checkout of this `docs-framework` repository

## Installation: Symlink the Skill

Symlink the repository root into the skill directory your agent reads. The repository root is the skill directory; it contains `SKILL.md`.

### Step 1: Link the Framework

From your project root:

```
mkdir -p .claude/skills .codex/skills
ln -s /absolute/path/to/docs-framework .claude/skills/docs-framework
ln -s /absolute/path/to/docs-framework .codex/skills/docs-framework
```

Use the `.claude` link for Claude Code commands and the `.codex` link for Codex skills. If a project only uses one agent, create only that link.

### Step 2: Initialize Your Documentation

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

### Step 3: Run the Foundation Interview

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

### Step 4: Write Your Implementation Overview

Edit `docs/20-implementation/00-overview.md` to describe your codebase:
- System metaphor / mental model
- High-level architecture
- Section index (as you add sections)

## Directory Structure After Setup

```
your-project/
├── docs/                # YOUR project documentation
│   ├── 00-foundation/       # Why/purpose (structure varies)
│   ├── 10-system-design/    # Product structure and behavior
│   └── 20-implementation/   # Code-specific mechanics
├── .claude/
│   └── skills/docs-framework -> /absolute/path/to/docs-framework
└── .codex/
    └── skills/docs-framework -> /absolute/path/to/docs-framework
```

## One Framework, One Output

| Directory | Contains | Managed By |
|-----------|----------|------------|
| `.claude/skills/docs-framework/` or `.codex/skills/docs-framework/` | symlink to documentation framework (skill, templates, workflows, rules) | docs-framework project |
| `docs/` | YOUR project documentation | You |

**Important:** Framework edits should happen in the `docs-framework` repo. All project documentation goes in `docs/`.

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

To update the framework, commit changes in the `docs-framework` repo and pull that repo in any project that symlinks to it.

### Spectre Backend Snapshot

Spectre also embeds this skill in its backend skill library so agents can use `skill_read`. After changing this repository, run this from the Spectre repo root:

```
bun run sync:docs-framework
```

That command copies markdown from the linked skill repo into `apps/backend/src/skill-library/skills/docs-framework/` and regenerates the backend `index.ts` wrapper.

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
- **`/docs:sync`** - Compare code structure to documentation and identify gaps

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
