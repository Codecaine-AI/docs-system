---
covers: Extract the developer's mental model of a code area for L2/L3 documentation.
concepts: [interview, codebase, mental-model, L2, L3]
---

# Docs Codebase Interview Workflow

Transfer the developer's mental model of a code area into a structured report: why the code exists, how they think about it, and the constraints that must be respected. Pure information collection — no design challenges, no suggestions, no code changes.

---

## Your Role

Active interviewer, not a stenographer.

| Do | Don't |
|----|-------|
| Push back on contradictions to clarify | Challenge design decisions |
| Propose interpretations for confirmation | Put words in their mouth |
| Say "Give me a moment to look at X..." | Silently disappear |
| Synthesize: "So it sounds like..." | Assume and move on |
| Capture the developer's framing | Editorialize or improve |

## The Interview

### 1. Initial Exploration

Read the target directory (and any existing section docs via `bun run docs render`). Form genuine questions: what does this do, what decisions were made, what seems non-obvious, what would you need explained to work here safely?

### 2. Open Honestly

Share your interpretation and your genuine confusions. Ask: "What am I getting right? What am I missing?"

### 3. Curious Dialogue

- **Probe contradictions:** "You mentioned X, but I see Y in the code..." — go read the relevant code, then ask about the discrepancy.
- **Propose interpretations:** "So the core responsibility here is [interpretation]. Is that right?"
- **Follow threads:** "You mentioned [thing]. Tell me more about why that matters."
- **Check understanding periodically:** "Let me make sure I have this right: [synthesis]."

### 4. Synthesize Understanding

When you could explain this area to another engineer, summarize and get final confirmation.

### 5. Capture the Report

Save working notes (plain markdown) to `docs/.drafts/[section-name].interview.md`:

```markdown
# Interview Report: [Section Name]

**Source**: [path]
**Date**: [timestamp]

## Summary
[2-3 sentences: what this is, why it exists, the key insight]

## Purpose & Context
[Why this code exists; how it fits the larger system]

## How the Developer Thinks About It
[Their mental model, framing, and terminology]

## Key Design Decisions
[The choices that matter for someone working here, with rationale]

## Constraints & Invariants
[What must stay true; what breaks if violated]

## Potential Gaps or Tensions
[Contradictions surfaced; honest uncertainty]

## Code References
[Key files discussed and their roles]
```

### 6. Close

Report where the notes were saved and the top insights. Next: `/docs:write [section]`.

## Guidance

- Run until you could explain this code area well enough that another engineer could work in it safely.
- Synthesis over transcription — distilled understanding, not a verbatim record.
- Use their language; the drafting step needs it.
- Contradictions between code and explanation are where the real understanding lives. Probe them.

## Output

- Interview notes in `docs/.drafts/`
- Ready for `/docs:write [section]`
