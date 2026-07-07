import DocsBlockLibrary from "@codecaine-ai/docs-viewer/docs-block-library";

/**
 * `#/blocks` route — the docs block library: a catalog of every doc.json
 * block flavour, rendered from real DocDocument fragments through the same
 * DocBlockRenderer the doc pages use. The canvas example renders through the
 * provider-injected canvas embed (StandaloneCanvasEmbed, see App.tsx).
 */
export function BlocksPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-8">
        <DocsBlockLibrary />
      </div>
    </div>
  );
}
