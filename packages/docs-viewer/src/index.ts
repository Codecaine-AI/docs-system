/**
 * @codecaine-ai/docs-viewer — React read/edit surface for doc.json bundles.
 *
 * Extracted from Spectre apps/frontend/src/components/docs (+ the React
 * flavour registry from lib/docs-model). Host integration happens through
 * ./client: a `DocsClient` (backend operations) and a `CanvasEmbedComponent`
 * (canvas rendering slot), both provided via `DocsClientProvider`. Without a
 * provider the components render read-only with a neutral "canvas embed
 * unavailable" card in place of canvas blocks.
 */

export * from "./client";
export * from "./annotations";
export * from "./bundle-src";
export * from "./flavour-registry";
export * from "./docs-targeting";
export * from "./useTransientHighlights";

export {
  default as DocBlockRenderer,
  renderDeltaSpans,
  type DocBlockRendererProps,
  type DocBlockSaveResult,
} from "./DocBlockRenderer";
export {
  default as Plannotator,
  type PlannotatorProps,
  type PlannotatorSelection,
} from "./Plannotator";
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
} from "./doc-targeting-layer";
export { default as DocsBlockLibrary } from "./DocsBlockLibrary";
export { default as DocEditor, type DocEditorProps } from "./editor/DocEditor";
