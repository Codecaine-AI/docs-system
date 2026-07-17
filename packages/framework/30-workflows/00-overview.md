---
covers: How-to guides for executing documentation tasks via /docs:* commands.
type: overview
concepts: [workflows, commands, init, scaffold, interview, write, annotate, audit]
---

# Workflows

Step-by-step guides for documentation tasks, invoked via the `/docs:*` commands. Every workflow reads docs through the docs CLI (`bun run docs render`, `docs grep`) and writes them through the workbench editor or docs-server API — content is stored as `doc.json` bundles, never read directly. `docs serve`, `docs export`, and `docs migrate` are the remaining CLI surface not tied to a specific workflow — see `99-appendix/10-setup-guide.md` for the full command list.

---

## Workflow Categories

### Setup & Structure
| Workflow | Command | Purpose |
|----------|---------|---------|
| [10-init.md](10-init.md) | `/docs:init` | Initialize `docs/` structure |
| [20-scaffold.md](20-scaffold.md) | `/docs:scaffold` | Map source code to doc sections |

### Knowledge Extraction
| Workflow | Command | Purpose |
|----------|---------|---------|
| [30-interview-foundation.md](30-interview-foundation.md) | `/docs:interview-foundation` | Extract intent and vision |
| [35-interview-design.md](35-interview-design.md) | — (loaded via the produce cookbook) | Extract system-level architecture |
| [40-interview-codebase.md](40-interview-codebase.md) | `/docs:interview-codebase` | Extract code understanding |

### Documentation Generation
| Workflow | Command | Purpose |
|----------|---------|---------|
| [50-write.md](50-write.md) | `/docs:write` | Write/update L2/L3 docs from notes |
| [60-annotate.md](60-annotate.md) | `/docs:annotate` | Write L4/L5 headers in code |

### Maintenance
| Workflow | Command | Purpose |
|----------|---------|---------|
| [70-audit.md](70-audit.md) | `/docs:audit` | Validate structure, references, and health |
