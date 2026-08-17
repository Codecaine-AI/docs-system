The executable command dialect for agents, humans, and repository automation — reading, discovery, integrity checks, migration, serving, and export as stable process calls. Source: `packages/docs-cli`.

## Governed By

Translation layer — the text-first agent reading surface the CLI makes operational.

## Decisions

### The command dialect is durable

- Decision: Command names, arguments, stdout shapes, and exit behavior are a stable contract — verification commands fail through exit status (`links check` on stale references, `audit` on structural errors while warnings stay informational); new capability extends the dialect rather than breaking it.

- Why: Repository instructions, scripts, and agent tools gate work on command vocabulary and failure semantics, not workbench UI state — the process boundary must outlive UI refactors and holds whether or not the package ever merges into the workbench. Rejected: treating the CLI as an internal detail of the app shell.

- Applies to: `packages/docs-cli/src/index.ts` — every future command and flag.

### The executable is a leaf

- Decision: No library module imports docs-cli; reusable logic lives in the packages below it, and the entrypoint dispatches argv only when executed as the CLI. `serve` and `export` dynamically import docs-workbench instead of duplicating its server, route table, or export layer.

- Why: Importing helpers must not start the command parser or the browser stack. Rejected: putting reusable logic in the CLI, which would force consumers through the executable.

- Applies to: `packages/docs-cli` — future shared logic lands in a lower package, not here.

### Side effects stay command-explicit

- Decision: `render` and `grep` never write; backlink and link commands replace only derived SQLite state; migration, serve, and export confine writes to the selected repository, docs root, build directory, or output directory.

- Why: A scriptable surface must be safe to call from automation without surprise writes. Rejected: commands with implicit side effects outside their declared scope.

- Applies to: `packages/docs-cli/src` — every future command declares and confines its write scope.

### Migration stays below the dispatcher and never deletes by default

- Decision: Adoption machinery lives in its own `packages/docs-cli/src/migrate` directory, separate from steady-state commands. Ordinary migration writes bundles alongside Markdown sources without modifying or deleting them; retirement is a separate `--retire-twins` branch that requires `--yes-delete-markdown` for a real deletion.

- Why: Adoption is not steady-state reading, and a converter that silently destroys its sources was rejected — deletion is a separate, doubly confirmed act.

- Applies to: `packages/docs-cli/src/migrate` — future adoption tooling lands here under the same safety split.
