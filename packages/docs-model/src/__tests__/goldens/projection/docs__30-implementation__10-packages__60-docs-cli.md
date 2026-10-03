The executable command dialect for agents, humans, and repository automation: reading, discovery, integrity checks, migration, serving, and export as stable process calls. Source: `packages/docs-cli`.

## Governed By

Translation layer: the text-first agent reading surface the CLI makes operational.

Text Measurement defines the measuring backends and the startup rule every docs host follows.

## Decisions

### The Command Dialect Is Durable

- **Decision**

  - Command names, arguments, stdout shapes, and exit behavior are a stable contract.

  - Verification commands fail through exit status. `links check` fails on stale references, and `audit` fails on structural errors while warnings stay informational.

  - New capability extends the dialect rather than breaking it.

- **Why**

  - Repository instructions, scripts, and agent tools gate work on command vocabulary and failure semantics, not on workbench UI state.

  - The process boundary must outlive UI refactors, and it holds whether or not the package ever merges into the workbench.

  - Treating the CLI as an internal detail of the app shell was rejected.

- **Applies to**

  - The rule covers `packages/docs-cli/src/index.ts` and every future command and flag.

### The executable is a leaf

- Decision: No library module imports docs-cli; reusable logic lives in the packages below it, and the entrypoint dispatches argv only when executed as the CLI. `serve` and `export` dynamically import docs-workbench instead of duplicating its server, route table, or export layer.

- Why: Importing helpers must not start the command parser or the browser stack. Rejected: putting reusable logic in the CLI, which would force consumers through the executable.

- Applies to: `packages/docs-cli`. Future shared logic lands in a lower package, not here.

### Side effects stay command-explicit

- Decision: `render` and `grep` never write; backlink and link commands replace only derived SQLite state; migration, serve, and export confine writes to the selected repository, docs root, build directory, or output directory.

- Why: A scriptable surface must be safe to call from automation without surprise writes. Rejected: commands with implicit side effects outside their declared scope.

- Applies to: `packages/docs-cli/src`. Every future command declares and confines its write scope.

### Migration stays below the dispatcher and never deletes by default

- Decision: Adoption machinery lives in its own `packages/docs-cli/src/migrate` directory, separate from steady-state commands. Ordinary migration writes bundles alongside Markdown sources without changing or deleting them; retirement is a separate `--retire-twins` branch that requires `--yes-delete-markdown` for a real deletion.

- Why: Adoption is not steady-state reading, and a converter that silently destroys its sources was rejected. Deletion is a separate, doubly confirmed act.

- Applies to: `packages/docs-cli/src/migrate`. Future adoption tooling lands here under the same safety split.

### Linting Commands Load HarfBuzz First

- **Decision**

  - `audit`, `style`, `serve`, `export`, and `migrate` load the exact HarfBuzz backend of `@codecaine-ai/text-measure` before they run, because each one lints documents.

  - When HarfBuzz does not load, the command prints one warning and runs on the approximate table backend. audit ends its report with the backend it used, such as `text measure: harfbuzz (exact)`. Commands that never lint skip the load.

- **Why**

  - Layout lints measure text widths, and only an exact backend matches what the browser paints. Without it, the lints still run and call their widths approximate.

- **Applies to**

  - The rule covers `LINTING_COMMANDS` in `packages/docs-cli/src/index.ts` and the report in `packages/docs-cli/src/audit.ts`. A future command that lints joins `LINTING_COMMANDS`.
