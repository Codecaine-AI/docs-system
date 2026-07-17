---
covers: Extract the developer's understanding of what the project is trying to be, through exploratory dialogue.
concepts: [interview, foundation, understanding, mental-model, exploration]
---

# Docs Foundation Interview Workflow

Extract what the project is trying to BE through curious dialogue. Foundation is the intent anchor — manifesto-style, fluid, narrative. Structure emerges from the conversation; do not force categories.

---

## Your Role

Curious explorer helping crystallize understanding.

| Do | Don't |
|----|-------|
| Follow threads that reveal how they think | Force answers into predefined boxes |
| Ask "tell me more about..." when something sparks | Rush through a checklist |
| Probe what "feels right" vs. "feels wrong" | Accept surface-level answers |
| Let silence happen — they're thinking | Fill every pause |
| Notice what they're excited about | Treat all topics as equally important |

## Before Starting

Read available context:

- `README.md`
- Existing Foundation docs: `bun run docs render docs/00-foundation/00-overview` (never read `doc.json` directly)
- Project metadata (`package.json`, `pyproject.toml`, etc.)

## The Interview

No rigid phases. Follow the understanding.

### 1. Open with Curiosity

Present your interpretation of what you've read, then invite correction: "What is this thing trying to be? Not features — what's the core idea?"

### 2. Explore the Mental Space

Starting points — go where the energy is:

- **The core idea:** "What's the one thing this should do extremely well?" "When you imagine this working perfectly, what does that look like?"
- **How they think about it:** "What's the mental model for how this works?" "When you're making decisions, what guides you?"
- **What feels right/wrong:** "What would feel 'off' even if it technically worked?" "What would make you proud? What would make you cringe?"
- **The shape of the solution:** "You could have built this many ways. Why this shape?" "What did you give up? What did you protect?"
- **Who this is for:** "Paint me a picture of someone using this well." "What problem are they having right before they reach for this?"
- **What this isn't:** "What's adjacent but explicitly not this?" "What would be scope creep vs. core mission?"

### 3. Follow the Energy

- When they light up: "Tell me more... Why does that matter so much?"
- When they hesitate: "What are the options you're weighing?"
- When something seems central: "Let me make sure I understand: [reflect back]. Is that right?"

### 4. Let Structure Emerge

Notice what patterns emerge — problem-focused, vision-focused, trade-off-driven. Let their natural way of thinking shape the structure; do not force it into predefined categories.

### 5. Synthesize and Confirm

Reflect back the core idea, what matters most, what this isn't, the experience they're going for. Ask: "What am I missing? What did I get wrong?" Iterate until confirmed.

### 6. Capture the Report

Save working notes (plain markdown) to `docs/.drafts/foundation.interview.md`:

```markdown
# Foundation Interview: [Project Name]

**Date**: [timestamp]

## The Core Understanding
[2-4 paragraphs capturing their mental model]

## Key Threads
### [Thread that emerged — use their language]
[What you learned]

## What This Isn't
[Boundaries and non-goals that emerged naturally]

## Open Questions
[Unresolved tensions and uncertainties they named]

## Suggested Foundation Structure
[Organic file boundaries driven by what naturally groups together — or a single narrative document. Fewer, more fluid docs beat many rigid ones.]
```

### 7. Close

Report where the notes were saved, the core idea in one line, and the suggested structure. Next: `/docs:write foundation`.

## Guidance

- Use their language — preserve it for the drafting phase.
- Foundation is manifesto, not spec. Fluid, narrative, opinionated.
- Run until you could explain to another developer what this project is trying to BE and what would feel right vs. wrong when building it.

## Output

- Interview notes at `docs/.drafts/foundation.interview.md`
- Suggested structure based on what emerged
- Ready for `/docs:write foundation`
