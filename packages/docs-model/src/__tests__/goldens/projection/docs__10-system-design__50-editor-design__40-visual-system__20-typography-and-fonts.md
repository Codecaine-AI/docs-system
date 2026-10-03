Typography assigns font families by reading role: body, heading, code, and numeric. Shared reading metrics set the size, line height, and tracking for the document column. The stock defaults below are built into the workbench, and the shared Global theme from Themes starts from them, so every project reads with these values until someone tunes that theme. The structural decisions behind theme loading and variable injection live in Theming: Overview.

## Structure

| Reading role | Token | Stock Default |
| --- | --- | --- |
| Body | --font-tx02 | System Sans |
| Heading | --font-display + --style-heading-font | System Sans |
| Code | --docs-font-code | Mono |
| Numeric | --docs-font-numeric | Body font |

| Reading metric | Stock Default | Style Rail range |
| --- | --- | --- |
| Font size | 18px | 12 to 28px |
| Line height | 1.45 | 1.1 to 2.1 |
| Letter spacing | 0em | -0.02 to 0.08em |

## The Rule

A font follows its reading role across every surface. Components do not choose local font families.

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

Body and headings default to System Sans, which resolves to `ui-sans-serif, system-ui, sans-serif` and is SF Pro on macOS. The System Serif option resolves to `ui-serif, Georgia, "Times New Roman", serif`, which is New York on macOS. Mono resolves to `ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace`. Numeric emits no separate family while it follows body.

> **Boundary: Fonts resolve from the host** — A theme names font families. A stack resolves only when the browser or host already provides the face. The workbench loads no repository font binaries and registers no `@font-face` rules.

## Reference Book

The stock reading metrics adapt the layout of *Building a Second Brain* by Tiago Forte. The book's face, EB Garamond, was tried as a serif body and replaced with System Sans because the owner preferred the sans body. The owner also chose a slightly smaller size with more open leading, 18px at 1.45 instead of the book's 20px at 1.3. Both give a line pitch of about 26px, so the vertical rhythm matches the book. The book values come from body pages of the calibre-made US Letter PDF, 612 by 792pt. The measure is the line length, and the leading is the distance between baselines.

| Metric | Book | Workbench |
| --- | --- | --- |
| Body face | EB Garamond | System Sans, SF Pro on macOS |
| Font size | 15pt (20px) | `18px` |
| Leading | 19.5pt (26px), a 1.3 ratio | `1.45` (about 26px) |
| Measure | About 80 characters (79 to 82 on full lines), 468pt (624px) wide inside 1in margins | `60ch` (about 650px), about 84 characters |
| Headings | Roboto Medium, about 17pt (23px) | System Sans |
| Paragraph spacing | None | Not matched: 0.75rem above and below |
| First-line indent | 18pt (1.2em) | Not matched: none |
| Alignment | Justified | Not matched: left-aligned |

CoreText measures SF Pro, the System Sans face on macOS, at 18px with a `0` glyph of about 10.84px and an average of about 7.77px per character of the book's text. A `60ch` lane is therefore about 650px wide and holds about 84 characters. The lane is set in `ch`, so its width scales with the font size and the character count stays the same. That line runs slightly longer than the book's line of about 80 characters. The owner kept `60ch` because the sizing reads well. The content width control ranges from `40ch` to `140ch`.

> **Limitation: Paragraph metrics are hard-coded** — Paragraph spacing, first-line indent, and alignment are not theme settings. `PARAGRAPH_CLASSES` applies `my-3` to every paragraph, so paragraphs keep 0.75rem above and below and stay left-aligned.

## Why

- **Reading roles are explicit seams**

  - A theme can separate code or numerals without changing prose, headings, or individual components.

- **Metrics follow a book that reads well**

  - The stock defaults adapt a printed layout the owner reads comfortably for long sessions, and the Global theme every project renders starts from them. The 18px size at a 1.45 line height keeps the book's 26px line pitch. The measure is set in `ch`, so the line keeps about 84 characters when the font size changes.
