# Repository README Template

Template for the root README.md that provides a human-friendly entry point to any repository using this documentation framework, with quick links to setup and core documentation.

## Template

```markdown
# [Application Name]

[One-paragraph description of what this application does and its primary value proposition]

## Setup & Configuration

For detailed setup instructions, see the setup guide under `docs/20-implementation/99-appendix/`.

## Documentation

Documentation lives in `docs/` as three layers of `doc.json` doc bundles — browse them with `bun run docs serve`, or render one with `bun run docs render <path>`:

**Foundation** (why we build): `docs/00-foundation/` — intent and boundaries; structure varies per project.

**System Design** (how it's designed): `docs/10-system-design/` — architecture and behavior, by concept.

**Implementation** (how it works): `docs/20-implementation/` — system structure and navigation, mirroring source.

**Appendix** (operations): `docs/20-implementation/99-appendix/` — setup, deployment, tooling.

## Key Features

- [Feature 1]: Brief description
- [Feature 2]: Brief description
- [Feature 3]: Brief description
```

## Usage Guidelines

### Purpose
The README serves as the landing page for developers who:
- Just cloned the repository
- Need quick access to setup instructions
- Want to understand what the application does
- Are looking for common development tasks

### Key Sections

1. **Application Description**: One clear paragraph explaining the value proposition
2. **Documentation Links**: Direct paths to both overview (understanding) and appendix (doing)
3. **Key Features**: 3-5 bullet points highlighting main capabilities

### Paths to Include

Always point to:
- `docs/00-foundation/` - Why the system exists
- `docs/10-system-design/` - Design rationale
- `docs/20-implementation/` - How the system works
- `docs/20-implementation/99-appendix/` - Setup and operations

Docs are `doc.json` bundles, so a README links to folders (or tells readers to use `docs serve`/`docs render`) rather than to `.md` files.
