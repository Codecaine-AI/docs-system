Typography assigns font families by reading role: body, heading, code, and numeric. The Default theme sets body and headings in Inter and code in IBM Plex Mono, the two families the workbench bundles. Shared reading metrics set the size, line height, and tracking for the document column, and the shared Global theme from Themes starts from these stock values. The structural decisions behind theme loading and variable injection live in Theming: Overview.

## Structure

| Reading role | Token | Default theme | Stylesheet default |
| --- | --- | --- | --- |
| Body | --font-tx02 | Inter | Inter |
| Heading | --font-display + --style-heading-font | Inter | Inter |
| Code | --docs-font-code | IBM Plex Mono | IBM Plex Mono |
| Numeric | --docs-font-numeric | Body font | Body font |

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

The workbench bundles Inter 3.19 and IBM Plex Mono 2.5 from `@codecaine-ai/text-measure`, the faces the layout lints measure with. `main.tsx` imports the package's `fonts.css`, which declares Inter at weights 400, 500, 600, and 700 and IBM Plex Mono at 400, 500, and 600. `loadDocsFonts()` in `docs-fonts.ts` loads the woff2 files at startup without blocking the first render.

Each reading role takes its family from the first of three sources that sets it:

1. A style-rail pick wins when it differs from the rail's stock choice, because the rail sets the role's token inline on the page.

2. The active theme's `fonts` block comes next. The Default theme sets Inter and IBM Plex Mono there.

3. The `:root` defaults in `read-surface.css` come last. They also set Inter for body and headings and IBM Plex Mono for code, so a theme without a `fonts` block paints the bundled faces too.

The rail's stock choices are the bundled faces. Inter resolves to `Inter, ui-sans-serif, system-ui, sans-serif`, and IBM Plex Mono, the stock code choice, resolves to `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`. Serif and Mono name faces the host provides: `ui-serif, Georgia, 'Times New Roman', serif` and `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace`. A saved Fira Code pick, the earlier stock code choice, reads as IBM Plex Mono.

> **Boundary: Measured text needs the bundled faces** — The layout lints measure document text in Inter and IBM Plex Mono. A page paints what they measured when it loads text-measure's `fonts.css` and keeps the stock faces. The workbench loads the file at startup, and a published page links the copy in `docs-publish`'s build output. A theme or a rail pick that names another face, such as Serif or Mono, paints that face, so layout findings only approximate what its pages paint. Sequence and canvas diagrams paint in the bundled faces whatever the theme sets, and Text Measurement states the full guarantee.

## Reference Book

The stock reading metrics adapt the layout of *Building a Second Brain* by Tiago Forte. The book's face, EB Garamond, was tried as a serif body, and the owner chose a sans body instead. The owner also chose a slightly smaller size with more open leading, 18px at 1.45 instead of the book's 20px at 1.3. Both give a line pitch of about 26px, so the vertical rhythm matches the book. The book values come from body pages of the calibre-made US Letter PDF, 612 by 792pt. The measure is the line length, and the leading is the distance between baselines.

| Metric | Book | Workbench |
| --- | --- | --- |
| Body face | EB Garamond | Inter in the Default theme |
| Font size | 15pt (20px) | `18px` |
| Leading | 19.5pt (26px), a 1.3 ratio | `1.45` (about 26px) |
| Measure | About 80 characters (79 to 82 on full lines), 468pt (624px) wide inside 1in margins | `60ch` (675px), about 79 characters |
| Headings | Roboto Medium, about 17pt (23px) | Inter in the Default theme |
| Paragraph spacing | None | Not matched: 0.75rem above and below |
| First-line indent | 18pt (1.2em) | Not matched: none |
| Alignment | Justified | Not matched: left-aligned |

Inter's `0` is 0.625em wide, so `1ch` at 18px is 11.25px and a `60ch` lane is 675px. On this corpus's prose Inter averages about 8.5px per character at 18px, so the lane holds about 79 characters, close to the book's line of about 80. The lane is set in `ch`, so its width scales with the font size and the character count stays the same. A different body face changes the lane width. For example, SF Pro on macOS has a `0` of about 10.84px, which makes the lane about 650px. The content width control ranges from `40ch` to `140ch`.

> **Limitation: Paragraph metrics are hard-coded** — Paragraph spacing, first-line indent, and alignment are not theme settings. `PARAGRAPH_CLASSES` applies `my-3` to every paragraph, so paragraphs keep 0.75rem above and below and stay left-aligned.

## Why

- **Reading roles are explicit seams**

  - A theme can separate code or numerals without changing prose, headings, or individual components.

- **Metrics follow a book that reads well**

  - The stock defaults adapt a printed layout the owner reads comfortably for long sessions, and the Global theme every project renders starts from them.

  - The 18px size at a 1.45 line height keeps the book's 26px line pitch.

  - The measure is set in `ch`, so a line keeps about 79 Inter characters when the font size changes.
