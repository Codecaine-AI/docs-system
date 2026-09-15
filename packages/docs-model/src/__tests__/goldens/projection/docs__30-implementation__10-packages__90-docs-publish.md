packages/docs-publish is a local compatibility package for publishing Docs bundles inside a host website. It reuses the existing document renderer and supplies optional browser search plus portable read-only diagrams, without starting the workbench or an authoring server.

## Decisions

Render article bodies during the build through DocBlockRenderer and React server rendering. The host owns page URLs, navigation, metadata, sitemap, feed, and deployment. This keeps the reusable document renderer independent of a personal-site layout or framework.

List markers and ordered counters use the shared list-markers.css stylesheet in both workbench and publisher. Code listings also share code.css, including the hljs token palette, code frame, language header, and annotation formatting. Published article bodies include the docs-markdown scope. A host must include the packaged component stylesheet; token markup and utility classes alone do not supply these styles.

Require an explicit collection allowlist. publishCollection receives a content root, post metadata, and a trailing-slash basePath. It validates metadata and document structure, rejects duplicate slugs, skips drafts before reading content, and resolves referenced files beneath the collection root using real paths. No internal project corpus is discovered or exported automatically.

Build-rendered Canvas and Sequence images appear directly in article HTML and remain visible without JavaScript. Clicking one loads the same StandaloneCanvasEmbed or StandaloneSequenceEmbed fullscreen UI used by Docs workbench. Optional initialDocument, initiallyOpen, and onViewerClose props let static hosts supply validated data without workbench API requests. The native Canvas stage retains pan and zoom; Sequence retains its existing toolbar. No download controls are added. The preview remains a browser image that can be dragged or saved normally. Escape closes the viewer and restores focus. The landing imports none of this code.

## Optional Search

src/search.ts exports search independently of the DOM. src/search-widget.ts supplies an opt-in widget for hosts that want a search bar and tag filter. Search entries contain URL, title, description, tags, and document body text projected through the Docs model. Drafts and unselected pages never enter the index.

Matching normalizes accents and case, ignores common filler, and supports exact words, prefixes, and one-character spelling errors. Titles and tags rank above descriptions and body text. All meaningful query terms must match. This is lexical search: synonyms, semantic retrieval, and queries about diagram object labels are not implemented.

Hosts can call search with their own UI. For the bundled widget, supply a data-docs-search container with data-index pointing to the JSON index, a search input, a select for tags, a data-results list, and a role=status element. The widget fetches the index only on interaction. Static links stay available when JavaScript is disabled or the initial fetch fails.

## Package and Release Boundary

Run bun packages/docs-publish/build.ts from the docs-system root, then npm pack ./packages/docs-publish. Build output includes the Node publisher, browser chunks, generated component CSS, and provenance.json. A host can pin the archive in its lockfile and build under Node without Bun, workspace symlinks, or access to this checkout.

Version 0.1.0-proof.9 is a compatibility archive built from the current development checkout, which contains uncommitted changes. It is not a clean registry release. The personal-site consumer records exact archive integrity in package-lock.json. Before stable adoption, build from clean tagged sources, pin compatible Canvas and Sequence revisions, and increment the package version for every changed artifact.

## Verification and Limits

bun test packages/docs-publish/src checks server-rendered text, drafts, metadata, duplicate slugs, unsafe paths and symlinks, Studio-only rejection, and search ranking. The personal-site Docker proof checks both real diagrams, no-JavaScript reading, route behavior, mobile layout, and independence from local authoring APIs.

The personal-site proof covers prose, images, code listings, Canvas, Sequence, and video integration. It does not certify every Docs block, cross-document references, external player availability, or accessibility of every diagram interaction. A full migration must inventory and test those cases. The package remains isolated from the root workspace list while its public contract is reviewed.

## Video and HTML Portability

The shared VideoBlock emits provider iframes for YouTube, Vimeo, and Loom when a typed video block supplies url. Other URLs become link cards. Bundle-relative src is copied into published assets and emits a native video element with controls and metadata preload. url takes precedence when both fields are present. Bundle videos need no provider or authoring API. Small compressed clips suit this path; large or frequently replaced recordings increase repository history, deployment size, and transfer costs. Upload and asset reads support the same 64 MiB video limit. Deployed servers should return the video MIME type and support byte ranges for seeking.

The HTML block embeds self-contained HTML through the shared srcdoc renderer. Inline CSS and data assets travel inside the document, without an asset server. Scripts require explicit allowScripts=true and run in an opaque-origin iframe sandbox. CSP blocks fetch and external subresources. Relative assets and CDN libraries are unsupported. Frame self-navigation is not fully isolated from the network. Use typed image, video, Canvas, or Sequence blocks when those fit the content. Ordinary html code listings stay displayed source.

GitHub Pages is the proposed default deployment for repository-owned documentation. The existing docs-cli export command supplies a static viewer, while this publisher supplies article bodies for a host. A reusable Pages workflow, versioned release contract, and verification under a repository subpath remain unimplemented. The personal-site migration uses the existing combined Railway build and does not require changing its public domain.

Shared code styles live in packages/docs-viewer/src/styles/code.css and are imported by workbench and publisher. The renderer emits highlighted tokens during the build; the stylesheet supplies syntax colors and code fonts, with palette fallbacks for static hosts. The code header defines only a bottom border, including on hosts without Tailwind preflight.

A video block with bundle-relative src is portable: the publisher copies the file into its assets output. Hosts must supply the video MIME type and support byte ranges for reliable seeking. The Docs server uses its 64 MiB video upload limit when reading accepted video extensions; other attachments retain the 20 MiB limit. Small compressed clips can ship with the repository. External providers remain an option for longer recordings.

## Image Grid Publication

Image Grid uses the shared renderer and image-grid.css in both publisher and workbench. Each item resolves through the publisher asset callback, so all referenced images are confined to the explicit collection and copied to content-hashed output paths.

Grid headings, alt text, and captions enter the projected search text. Responsive CSS preserves proportions and source order without article JavaScript. The source keeps the ordered images array and column preference, so local edits and public rebuilds use the same layout.
