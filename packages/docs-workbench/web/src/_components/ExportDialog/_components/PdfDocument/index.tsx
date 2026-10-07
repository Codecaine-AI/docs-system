import type { ComponentProps, ReactElement } from "react";
import Renderer, { DOC_SURFACE_TYPOGRAPHY_CLASSES } from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { DocsClientProvider } from "@codecaine-ai/docs-viewer/client";

export type PdfDocumentProps = {
  documentModel: ComponentProps<typeof Renderer>["document"];
  path: string;
  Diagram: (props: { src?: string; title?: string; view?: string }) => ReactElement;
  resolveAssetSrc: ComponentProps<typeof Renderer>["resolveAssetSrc"];
};

export function PdfDocument({ documentModel, path, Diagram, resolveAssetSrc }: PdfDocumentProps) {
  return <DocsClientProvider canvasEmbed={Diagram} sequenceEmbed={Diagram}>
    <article className={`pdf-document ${DOC_SURFACE_TYPOGRAPHY_CLASSES}`}>
      <h1>{documentModel.title || path.split("/").at(-1)}</h1>
      <Renderer document={documentModel} bundlePath={path} resolveAssetSrc={resolveAssetSrc} />
    </article>
  </DocsClientProvider>;
}
