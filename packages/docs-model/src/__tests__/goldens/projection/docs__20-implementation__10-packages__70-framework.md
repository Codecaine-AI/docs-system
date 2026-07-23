`@codecaine-ai/docs-framework-skill` is the agent-loadable operational manual for navigating, producing, and maintaining a docs corpus. It contains no runtime source: a `SKILL.md` entry point routes authoring intent into cookbooks, standards, workflows, templates, and setup guidance. The package exists to deliver that methodology to host repositories; a running docs installation does not load it.

## Why It Is a Package at All

The distribution boundary exists for convenience. Workspace packaging makes the methodology resolvable and versionable, while the mount described in `packages/framework/99-appendix/10-setup-guide.md` lets host repositories pin the docs-system checkout and symlink agent skill directories to this package. Those are delivery properties, not a runtime boundary.

`packages/framework/package.json` makes the narrow boundary literal: it declares only the private workspace name and version. It has no `main`, `exports`, `bin`, scripts, or dependency fields.

This makes framework the odd one out under `packages/`. The neighboring packages expose libraries, an executable command surface, or a runnable application; framework is versioned content. Its package line names a delivery unit rather than a runtime boundary.

> **Open call: Framework Packaging** — Framework-as-package remains a judgment call. Plain repository content or a dedicated skill distribution channel could replace this boundary without changing the runtime architecture; the current package earns its place only through resolving, versioning, and symlinking convenience.

## What It Owns

`packages/framework/SKILL.md` is the entry contract. The rest of the package is the material it can load: a pointer-only reference area, intent cookbooks, imperative standards, task workflows, adaptable document templates, and mounting instructions. There is no `src/` tree.

```
packages/
└── framework/
    ├── 00-reference/
    │   └── 00-overview.md  # Pointer stub to canonical corpus rationale.
    ├── 10-cookbook/  # Navigate, produce, and maintain entry paths.
    ├── 20-standards/  # Loadable operational copies of structure rules.
    ├── 30-workflows/  # Step-by-step task execution guides.
    ├── 40-templates/  # Starting shapes from Foundation through in-code docs.
    ├── 99-appendix/
    │   └── 10-setup-guide.md  # Submodule, symlink, command, and update procedure.
    ├── SKILL.md  # Agent entry point and intent router.
    └── package.json  # Private workspace identity and version only.
```

## The Load Surface

The public surface is content addressed through the skill loader, not JavaScript exports. `packages/framework/SKILL.md` accepts a task, classifies it as navigate, produce, or maintain, then names the relative file key to load with `skill_read`. The operations below describe that routing contract; they are not executable functions or CLI commands.

**docs-framework — intent routing**

```
navigate(task: research | understand | locate) -> 10-cookbook/10-navigate.md  # Research the documented system, narrow by SCAN/SKIM/READ, and follow implementation references into code only as needed.
  task: research | understand | locate  # A request to understand the existing system.
produce(task: create | document-new) -> 10-cookbook/20-produce.md → scaffold, interview, write, annotate  # Create documentation for a new project, feature, component, or significant addition.
  task: create | document-new  # A request that adds new documented surface.
maintain(task: fix | refactor | update | audit) -> 10-cookbook/30-maintain.md → write, audit  # Bring existing documentation back into alignment and verify its health.
  task: fix | refactor | update | audit  # A request that changes or checks an existing documented area.
```

## Design Inside the Boundary

### Intent Routes to Workflows

`packages/framework/10-cookbook/00-overview.md` keeps the first choice task-shaped rather than command-shaped. A cookbook assembles the required stages; `packages/framework/30-workflows/00-overview.md` indexes the bounded procedures for initialization, scaffolding, interviews, writing, annotation, and audit. This keeps the entry point small while letting one intent compose more than one workflow.

### What It Deliberately Does Not Own

The structural decision record. `packages/framework/00-reference/00-overview.md` explicitly holds no doctrine, and `packages/framework/20-standards/00-overview.md` identifies its rules as operational copies. The manual may explain how to apply a rule; the corpus owns why the rule exists.

### Canonical Rationale, Operational Copies

Each structural standard ends with a literal `Canonical:` pointer. The copy gives an agent the imperative rule in loadable Markdown; the target corpus doc carries the rule and rationale together.

`packages/framework/20-standards/10-hierarchy-layers.md` points to Structure; the directory-rules copy shares that home because both apply the same depth and bundle structure.

`packages/framework/20-standards/30-numbering-system.md` points to Numbering, where stable order, local insertion, and gap exhaustion are defended.

`packages/framework/20-standards/40-doc-linking.md` points to Cross-doc linking; `packages/framework/20-standards/50-code-linking.md` points to Code linking. The operational copies state what an author does; the corpus explains why links are typed, restrained, one-way, and mechanically checkable.

### Templates Stay Adaptable

`packages/framework/40-templates/00-overview.md` declares templates to be starting points rather than mandatory document shapes. The catalogue offers Foundation patterns, implementation overviews, section archetypes, concept docs, file headers, and docstrings; workflows select and adapt the closest fit. This keeps reusable authoring help in the manual without turning an example into a corpus invariant.

> **Named deviation: Skill Content Is Hand-Maintained** — The Agent surface establishes rendered text as the agent read contract. This package instead keeps hand-maintained Markdown copies and has no generator or build script. Canonical pointers and same-change synchronization contain that deviation.

## Invariants and Firewalls

- **Runtime Optionality**

  - No running package imports framework. Installing, removing, or relocating the manual does not change document storage, indexing, serving, rendering, editing, or CLI behavior.

- **Corpus Authority**

  - A structural change updates its canonical corpus doc first and synchronizes the operational copy in the same change. Framework must not become a second decision-memory home.

- **Instructions, Not Implementations**

  - The manual tells agents when to use the docs CLI, workbench, and server API. It implements none of those surfaces and owns no storage, transport, validation, or rendering policy.

- **Loader-Relative Addresses**

  - Cookbook, workflow, standard, and template keys stay relative to the mounted skill root. Codex and Claude symlinks therefore resolve to the same manual content.

## Related Files

### Entry and Distribution

- `packages/framework/package.json`

  - Declares the private workspace identity and version without a runtime surface.

- `packages/framework/SKILL.md`

  - Defines the loadable skill, intent routing, manual layout, and corpus-authority rule.

- `packages/framework/00-reference/00-overview.md`

  - Keeps the reference area as a pointer stub instead of a duplicate doctrine store.

- `packages/framework/99-appendix/10-setup-guide.md`

  - Defines submodule pinning, skill symlinks, CLI wiring, and framework updates.

### Operational Routing

- `packages/framework/10-cookbook/00-overview.md`

  - Classifies tasks into navigate, produce, and maintain intents.

- `packages/framework/30-workflows/00-overview.md`

  - Indexes the bounded procedures assembled by the cookbooks.

- `packages/framework/20-standards/00-overview.md`

  - Declares the standards directory to be operational copies of corpus rules.

- `packages/framework/40-templates/00-overview.md`

  - Defines the adaptable template catalogue and its principles-over-prescriptions rule.

### Canonical Pointer Examples

- `packages/framework/20-standards/10-hierarchy-layers.md`

  - Carries the loadable layer and depth rules and points to their Structure rationale home.

- `packages/framework/20-standards/30-numbering-system.md`

  - Carries the operational prefix rules and points to their Numbering rationale home.

- `packages/framework/20-standards/40-doc-linking.md`

  - Carries the operational reference-span rules and points to their Cross-doc linking rationale home.

- `packages/framework/20-standards/50-code-linking.md`

  - Carries the operational source-reference rules and points to their Code linking rationale home.
