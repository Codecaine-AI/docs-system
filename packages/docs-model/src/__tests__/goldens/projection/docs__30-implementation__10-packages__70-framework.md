The agent-loadable operational manual — cookbooks and interview scripts behind a `SKILL.md` entry point — distributed as a workspace package with no runtime source. Source: `packages/framework`.

## Governed By

Doc standards — the canonical rules; agent contexts render them from the corpus rather than from copies here.

Agent surface — the agent read contract this package's hand-maintained copies deviate from by name.

## Decisions

### Runtime-optional by construction

- Decision: No running package imports framework, and its `package.json` declares only a private workspace name and version — no `main`, `exports`, `bin`, scripts, or dependencies. There is no `src/` tree.

- Why: The package is versioned content — a delivery unit, not a runtime wall; installing, removing, or relocating it must not change storage, serving, rendering, editing, or CLI behavior. The manual instructs agents when to use the CLI, workbench, and server API but implements none of those surfaces. Rejected alternative — unpackaging into plain repository content — is recorded on the Packages page.

- Applies to: `packages/framework` — future manual content adds files, never runtime surface.

### Corpus authority; no operational copies

- Decision: The docs corpus is the sole home of every structural rule. This package carries no standard copies; standing agent knowledge renders from the corpus doc.json bundles through the agent markdown projection at context-assembly time.

- Why: Framework must not become a second decision-memory home. A copy tier requires hand synchronization and drifts toward teaching retired conventions; rendering from the corpus leaves one canonical text and nothing to synchronize.

- Applies to: `packages/framework` — standing agent knowledge loads from the corpus, never from standards files here.

### Loader-relative addresses

- Decision: `SKILL.md` routes intent to material named by file keys relative to the mounted skill root; cookbook, workflow, standard, and template addresses never assume an absolute mount path.

- Why: Codex and Claude skill symlinks must resolve to the same manual content from different mount points; absolute addressing was rejected because it breaks one loader or the other.

- Applies to: `packages/framework` — every future cookbook and workflow key.
