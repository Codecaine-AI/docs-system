import DocBlockRenderer from "@codecaine-ai/docs-viewer/doc-block-renderer";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import { narrowDocToRootChildren } from "../../../../lab";
import type { FlowRendererProps } from "../../types";

export type DocRunProps = FlowRendererProps & { sourceDoc: DocDocument; ids: readonly string[] };

export function DocRun({ sourceDoc, ids, path, resolveAssetSrc, handleCanvasObjectSelect }: DocRunProps) {
    if (ids.length === 0) return null;
    return (
      <DocBlockRenderer
        document={narrowDocToRootChildren(sourceDoc, ids)}
        projectId="local"
        documentPath={`docs/${path}`}
        bundlePath={path}
        resolveAssetSrc={resolveAssetSrc}
        onCanvasObjectSelect={handleCanvasObjectSelect}
      />
    );
}