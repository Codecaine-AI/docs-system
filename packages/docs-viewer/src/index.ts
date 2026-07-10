/**
 * @codecaine-ai/docs-viewer — React read/edit surface for doc.json bundles.
 *
 * Extracted from Spectre apps/frontend/src/components/docs (+ the React
 * block registry from lib/docs-model). Host integration happens through
 * ./client: a `DocsClient` (backend operations) and a `CanvasEmbedComponent`
 * (canvas rendering slot), both provided via `DocsClientProvider`. Without a
 * provider the components render read-only with a neutral "canvas embed
 * unavailable" card in place of canvas blocks.
 */

export * from "./client";
export * from "./annotate/annotations";
export * from "./render/bundle-src";
export * from "./render/block-registry";
export * from "./annotate/docs-targeting";
export * from "./annotate/useTransientHighlights";

export {
  default as DocBlockRenderer,
  renderDeltaSpans,
  type DocBlockRendererProps,
  type DocBlockSaveResult,
} from "./render/DocBlockRenderer";
export {
  default as Plannotator,
  type PlannotatorProps,
  type PlannotatorSelection,
} from "./annotate/Plannotator";
export {
  default as DocTargetingLayer,
  useDocTargeting,
  DOC_TARGETING_CSS,
  type DocTargetingLayerProps,
  type DocTargetingOptions,
  type DocTargeting,
  type DocTargetingCanvasIndex,
  type DocTargetingCreateAnnotationInput,
  type DocsAnnotationView,
} from "./annotate/doc-targeting-layer";
export { default as DocsBlockLibrary } from "./render/DocsBlockLibrary";
export { default as DocEditor, type DocEditorProps } from "./editor/DocEditor";
