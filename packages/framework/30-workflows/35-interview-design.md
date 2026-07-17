---
covers: Extract system-agnostic design knowledge through structured architectural dialogue.
concepts: [interview, design, system, architecture, contracts, data-flow, blueprints]
---

# Docs Design Interview Workflow

Extract the architect's blueprints: how the system works, how data flows, what contracts exist, what boundaries the system enforces — without referencing language, framework, or implementation detail. If you catch yourself writing a class name or framework pattern, you've drifted into Implementation territory.

---

## Your Role

System architect drawing blueprints from a working system.

| Do | Don't |
|----|-------|
| Describe behaviors in system terms | Reference classes, functions, or language features |
| Map data shapes as conceptual structures | Use language-specific type syntax |
| Identify contracts between components | Describe how contracts are enforced in code |
| Trace flow through the system | Trace flow through files or modules |
| Capture invariants the system maintains | Explain how invariants are checked |

Design sits between Foundation ("what problem and why") and Implementation ("how the code does it"): specific about system behavior, silent about how it's built.

## Before Starting

- Foundation docs: `bun run docs render docs/00-foundation/00-overview`
- Existing Design docs: `bun run docs grep <term> docs/10-system-design` or targeted `docs render`
- Source code — to know what the system actually does (but describe it in system terms)

Never read `doc.json` directly.

## The Interview

More structured than Foundation: actively extract flow, data shapes, contracts, boundaries.

### 1. Open with System Understanding

Present your architectural interpretation — no code references — plus what you're unsure about. Ask: "What am I getting right? What's wrong?"

### 2. System Behavior and Flow

- **Lifecycle:** "Walk me through the lifecycle of [core entity]. What phases does it move through? What triggers transitions?"
- **Data flow:** "When [event] happens, what data moves where? Where does data enter and leave the system?"
- **Decision points:** "Where does the system make decisions? Where does it wait, retry, or give up?"

### 3. Data Shapes and Contracts

- **Shapes:** "What does a [core entity] carry? What's required vs. optional? How does the shape change as it moves through the system?"
- **Contracts:** "When A hands off to B, what does A guarantee? What does B expect? What validation happens at boundaries?"
- **Invariants:** "What must always be true? What does the system actively prevent?"

### 4. Boundaries and Integration

- **System boundary:** "Where does this system end? What does it own vs. delegate? What crosses the boundary, in what shape?"
- **Component boundaries:** "How would you draw boxes around the major parts? If you split this across teams, where would the lines be?"
- **Errors:** "When things go wrong, what's the system's strategy? Which failure modes does it handle vs. propagate?"

### 5. Synthesize the Blueprint

Reflect back: system overview, core flow, key components, data shapes, contracts, boundaries. Iterate until confirmed.

### 6. Capture the Report

Save working notes (plain markdown) to `docs/.drafts/design.interview.md`:

```markdown
# Design Interview: [System/Area Name]

**Date**: [timestamp]
**Scope**: [What part of the system this covers]

## System Overview
[2-4 paragraphs — behaviors, flow, purpose of each component. No code.]

## Core Flow
### [Flow name]
1. [Step — what happens, what data moves]

## Data Shapes
### [Core entity]
- [field]: [purpose] (required/optional)

## Contracts
### [Component A] → [Component B]
- **Guarantees**: / **Expects**: / **Shape**:

## Boundaries
- **Owns**: / **Delegates**:

## Invariants
- [Thing that must always be true]

## Open Questions
- [Unresolved architectural decisions]

## Suggested Design Doc Structure
- [Doc]: [What system aspect it covers]
```

### 7. Close

Report where the notes were saved and the blueprint summary. Next: `/docs:write design`.

## Guidance

- Every sentence should make sense to someone who has never seen the codebase.
- Be specific about behavior: "receives requests, validates against the contract schema, queues for ordered processing" — not "processes things".
- Capture reality; where it drifts from Foundation, flag the drift.
- Run until someone could implement the system in a different language from your report plus Foundation.

## Output

- Interview notes at `docs/.drafts/design.interview.md`
- Suggested Design doc structure
- Ready for `/docs:write design`
