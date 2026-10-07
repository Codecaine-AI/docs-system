import type { ComponentProps, Dispatch, SetStateAction } from "react";
import type DocBlockRenderer from "@codecaine-ai/docs-viewer/doc-block-renderer";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import type { PlannotatorSelection } from "@codecaine-ai/docs-viewer/plannotator";
import type { DocEditRequest } from "@codecaine-ai/docs-viewer/lab";
import type { DocLabSessionResult, DocLabStagedRegion } from "../../lab";
export type FlowRendererProps = {
  path: string;
  resolveAssetSrc: ComponentProps<typeof DocBlockRenderer>["resolveAssetSrc"];
  handleCanvasObjectSelect: ComponentProps<typeof DocBlockRenderer>["onCanvasObjectSelect"];
};
export type FlowComposerProps = {
  selection: PlannotatorSelection | null;
  handleComposerSubmit: (body: string) => Promise<void>;
  setPaneError: Dispatch<SetStateAction<string | null>>;
  setSelection: Dispatch<SetStateAction<PlannotatorSelection | null>>;
};
export type FlowProps = FlowRendererProps & FlowComposerProps & {
  doc: DocDocument | null;
  stagedRegions: DocLabStagedRegion[];
  composerTopLevelId: string | null;
  waitingRequests: { byTopLevel: Map<string, DocEditRequest[]> };
  lab: DocLabSessionResult;
};
export type { DocLabSessionResult, DocLabStagedRegion };
