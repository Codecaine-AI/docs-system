The agent-loadable operational manual — cookbooks, standards, workflows, and templates behind a `SKILL.md` entry point — distributed as a workspace package with no runtime source. Source: `packages/framework`.

## Governed By

Doc standards — the canonical rules whose operational copies this package carries.

Agent surface — the agent read contract this package's hand-maintained copies deviate from by name.

## Decisions

### Runtime-optional by construction

- Decision: No running package imports framework, and its `package.json` declares only a private workspace name and version — no `main`, `exports`, `bin`, scripts, or dependencies. There is no `src/` tree.

- Why: The package is versioned content — a delivery unit, not a runtime wall; installing, removing, or relocating it must not change storage, serving, rendering, editing, or CLI behavior. The manual instructs agents when to use the CLI, workbench, and server API but implements none of those surfaces. Rejected alternative — unpackaging into plain repository content — is recorded on the Packages page.

- Applies to: `packages/framework` — future manual content adds files, never runtime surface.

### Corpus authority; standards are operational copies

- Decision: The docs corpus is the canonical home of every structural rule; each standard under `packages/framework/20-standards` is an operational copy ending in a literal `Canonical:` pointer, and a structural change updates the corpus doc first and synchronizes the copy in the same change. The reference area stays a pointer stub holding no doctrine.

- Why: Framework must not become a second decision-memory home. The copies are hand-maintained Markdown — a named deviation from the rendered-text agent contract — contained by the canonical pointers and same-change synchronization; a generator was rejected as machinery the deviation does not yet earn.

- Applies to: `packages/framework/20-standards`, `packages/framework/00-reference` — every future standard copy carries a canonical pointer.

### Loader-relative addresses

- Decision: `SKILL.md` routes intent to material named by file keys relative to the mounted skill root; cookbook, workflow, standard, and template addresses never assume an absolute mount path.

- Why: Codex and Claude skill symlinks must resolve to the same manual content from different mount points; absolute addressing was rejected because it breaks one loader or the other.

- Applies to: `packages/framework` — every future cookbook, workflow, standard, and template key.
