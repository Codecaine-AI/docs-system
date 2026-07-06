import DocsBlockLibrary from "@codecaine-ai/docs-viewer/docs-block-library";

/**
 * `#/blocks` route — the docs block library (the same gallery Spectre's
 * blocks page renders): every registered MDX block family with editable
 * example source, live preview, and target inspection. Uses the provider-
 * injected canvas embed for the Interactive Canvas Lab preview.
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
