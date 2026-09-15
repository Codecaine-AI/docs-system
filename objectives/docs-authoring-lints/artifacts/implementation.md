# Docs Authoring Lints

The shared lint engine reports writing and page structure findings through Docs Writer, Docs Lab, and CLI audit. Both agents load the expanded corpus guidance. No external component lint engine or global skill was changed.

## Rule Ownership

Each folder under packages/docs-model/src/writing/ or page-structure/ owns its rule definition and nearby test. The definition carries the stable ID, corpus path, applicability, exclusions, severity, enforcement phase, audit compatibility metadata, and repair suggestion. lint/index.ts registers the rules; lint/engine.ts runs and formats them.

| Rule | Policy |
| --- | --- |
| writing.no-em-dash | Required at completion for introduced authored prose |
| writing.filler | Advisory |
| writing.dense-paragraph | Advisory over 120 words |
| structure.opening-paragraph | Advisory; audit W4 |
| structure.single-h1 | Advisory; audit W1 |
| structure.heading-order | Advisory |
| structure.image-alt | Advisory; audit W2 |
| structure.deep-list | Advisory beyond three list-item levels |

## Integration

- Docs Writer checks before mkdir/write. It retains the original baseline for successfully touched documents during tool registration so docs_check does not reject unchanged legacy findings after writes. Untouched checks audit all findings. A fresh tool registration resets this baseline.
- Docs Lab stages operations with draft findings in text and structured tool output. Acceptance recomputes complete findings before canonical writes; the service, HTTP responses, and accept-all preserve diagnostics. Temporary sources awaiting deletion use draft phase; surviving destinations still gate. Failed lint acceptance preserves stored bytes; multi-proposal rollback is tested.
- CLI audit shares content rules and preserves legacy warning IDs through rule-owned metadata. Required writing findings fail audit. Filesystem and schema checks retain their owners.
- Both agents load ten corpus documents, including new Document Purpose and Authoring Lints. Writing Style incorporates Technical Writing and Unslop. Structure preserves bullets-first doctrine. The prompts require reading lint feedback and repairing required findings.

## Limits

- Direct UI saves and blank create-only tree operations remain draft/diagnostic operations. They establish current canonical content; there is no new universal finalization gate for every UI save.
- Baselines compare exact semantic evidence with multiplicity while ignoring regenerated block IDs. Changed evidence and added duplicate occurrences are new; moving identical evidence does not introduce a new occurrence.
- Most prose judgments remain editorial. Canvas and Sequence payloads are excluded; docs-owned wrapper titles are checked. Existing Canvas/Sequence delegation tools are unwired. Canvas has owner lints; the inspected Sequence code has schemas but no equivalent agent lint engine was found.
- No commits, deployment, global skill retirement, or corpus-wide cleanup were performed. No live model session was needed for verification.

## Validation

| Check | Result |
| --- | --- |
| Shared rules, server, editor, CLI integration | 391 passed, 0 failed |
| Registered Docs Writer tools | 12 passed, 0 failed |
| Docs-system typecheck | Passed |
| Writer TUI typecheck | Passed |
| Docs-system import boundaries | 4 passed |
| Guidance references, canonical corpus, prompt snapshots | Passed |
| Wider docs-model suite | 532 passed, 2 pre-existing theming snapshot failures |
| External Canvas boundary check reached by broad file-name search | Existing annotate-to-selection boundary failure |

Detailed command output is in adjacent .log files. The two model failures concern docs/20-implementation/40-theming/doc.json, which was dirty before this work. Its canonical serialization and projection snapshot disagree with the current unrelated edits.
