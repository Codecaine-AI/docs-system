Each text surface has its own font token: `--font-tx02` (body), `--font-display` (headings), `--docs-font-code` (code blocks, inline code chips, kbd), and `--docs-font-numeric` (list markers and ordered-list counters; inherits the body font by default). Defaults live in `index.css`'s `:root`.

Two ways to set them: the style rail's Font tab (Body / Heading / Code / Number selects over the three built-in system stacks), or a theme manifest's `fonts` field, which accepts ARBITRARY stack strings — a theme can name any family the browser can resolve.

> **WARNING: Custom font FILES — designed, not built** — Loading font binaries is the one unbuilt piece: the planned path is files in the workbench's `web/public/fonts/`, registered via `@font-face` in a fonts.css, after which a theme just names the family in its stacks. The tokens are already the only seam.
