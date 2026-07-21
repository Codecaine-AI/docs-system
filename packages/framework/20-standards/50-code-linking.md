---
covers: How docs reference code — one-way, inline, specific.
concepts: [code-linking, references, file-paths]
---

# Code References

---

## Rules

- Docs point to code. Code never points back to docs.
- Reference code files inline as you discuss concepts, with enough context to explain why each file matters.
- For docs referencing 4+ files, add a `Related Files` list at the end: full path + one-line purpose per file.
- Use full paths (`src/auth/session/manager.ts`), never bare filenames or vague pointers (`src/` — "the source code").
- Update references when files move or rename; `docs links check` reports doc-to-code references whose target file is missing.

## Anti-Patterns

- Vague pointers ("various files implement this").
- Bare filenames or function names without paths.
- Elaborate navigation scripts ("start here, then read, for debugging see...") — list files, explain briefly.
- Doc links embedded in code comments.

Canonical: docs/10-system-design/10-doc-standards/40-code-linking — the corpus doc owns this standard (rule and rationale); this file is the operational copy.
