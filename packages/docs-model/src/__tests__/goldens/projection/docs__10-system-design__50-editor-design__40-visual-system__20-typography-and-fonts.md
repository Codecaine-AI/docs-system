Typography assigns font families by reading role: body, heading, code, and numeric. Shared reading metrics set the size, line height, and tracking for the document column. Theme loading and variable-injection mechanics live in Theming: Overview.

## Structure

| Reading role | Token | Living Default |
| --- | --- | --- |
| Body | --font-tx02 | System Sans |
| Heading | --font-display + --style-heading-font | System Sans |
| Code | --docs-font-code | Mono |
| Numeric | --docs-font-numeric | Body font |

| Reading metric | Living Default |
| --- | --- |
| Font size | 16px |
| Line height | 1.5 |
| Letter spacing | 0.005em |

## The Rule

A font follows its reading role across every surface; components do not choose local font families.

- **Body**

  - Paragraphs and the main reading surface use the body token.

- **Heading**

  - Document titles and headings share the heading role.

- **Code**

  - Code blocks, inline code, and keyboard labels share the code token.

- **Numeric**

  - List markers and ordered counters use the numeric token, which inherits body by default.

The style rail exposes all four family roles plus font size, line height, and letter spacing. A theme manifest may supply an arbitrary CSS stack for each role.

## Font Sources

System Sans resolves to `ui-sans-serif, system-ui, sans-serif`. Mono resolves to `ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace`. Numeric emits no separate family while it follows body.

> **Designed, not built: Custom font-file loading** — Themes can name any font family the browser can already resolve. The workbench does not load repository font binaries or register `@font-face` rules for them. Custom font-file loading is designed but not built.

## Why

- **Reading roles are explicit seams**

  - A theme can separate code or numerals without changing prose, headings, or individual components.

- **The defaults are facts, not reconstructed intent**

  - No recorded rationale selects the four-role split, the current face aliases, or the 16px / 1.5 / 0.005em metrics.
