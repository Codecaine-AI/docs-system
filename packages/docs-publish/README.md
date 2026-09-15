# Docs Publish Compatibility Package

This local proof reuses DocBlockRenderer to render an explicitly selected public collection as HTML. Optional search runs in the browser. Canvas and Sequence render through their own static SVG renderers during the build. Fitted diagram images appear directly, even without JavaScript. Clicking an image loads the existing Docs workbench Canvas or Sequence fullscreen component with validated static data. Canvas uses its native pan/zoom stage; Sequence retains its existing Fit/zoom toolbar. No download UI is added; the preview remains a normal browser image.

From the docs-system root, run `bun packages/docs-publish/build.ts`, then run `npm pack` in this package. The archive includes the Node publisher, browser assets, styles, and source provenance. Consumers need Node, not this checkout or Bun. The version in package.json identifies a local compatibility artifact, not a registry release.

Use `publishCollection({root, posts, basePath})`. Each allowlisted post has `path`, `slug`, `description`, `date` in YYYY-MM-DD form, `tags`, and optional `draft`. Drafts are excluded before reading content. Results contain HTML posts, public search entries, and referenced asset bytes. Hosts own page shells, feeds, sitemaps, canonical origins, and UI placement.

Search matches normalized words, prefixes and one-character spelling errors, weighted toward titles and tags. Common query filler is ignored. It does not infer concepts or synonyms. Call `search(entries, query, tag)` or load `browser/search-widget.js` on an element with `data-docs-search`, `data-index`, a search input, tag select, `[data-results]`, and `[role=status]`. No viewer must show the widget.

Only referenced, collection-confined files are copied. Studio-only diagrams fail the build. No local API URLs are embedded. The initial release needs clean tagged dependencies and a broader component compatibility pass; this proof does not establish a general Codecaine release policy.

Bundled videos use local `src` assets copied into the static output. The host must serve video MIME types and support byte ranges for seeking. The shared `html` block renders self-contained HTML/CSS in a sandboxed iframe; scripts require an explicit `allowScripts` setting. Code syntax colors and list markers ship in the shared component stylesheet and work without client-side highlighting.

Image-only grids use the native `image-grid` block. Set `images` to an ordered array of `{src, heading?, alt?, caption?}` and `columns` to `auto` or 1 to 4. Rows grow with the image count; narrow containers reduce columns. All image assets are bundled, and headings, captions, and alt text enter search. The shared CSS preserves image proportions and works without article JavaScript. The Docs editor supplies controls for the same stored fields.
