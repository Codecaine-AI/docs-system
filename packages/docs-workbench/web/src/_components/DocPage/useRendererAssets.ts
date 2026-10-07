import { useMemo, useCallback } from "react";
import { assetUrl, uploadVideoAsset } from "../../data/api";
import { resolveBundleAssetSrc } from "@codecaine-ai/docs-viewer/bundle-src";

export function useRendererAssets({ path }: { path: string }) {
  const resolveAssetSrc = useMemo(
    () => (src: string) => assetUrl(resolveBundleAssetSrc(path, src)),
    [path],
  );

  // Host uploader for video files dropped onto the editor (DocEditor's
  // `uploadAsset` slot): POSTs into this bundle's assets/videos/ and hands
  // back the bundle-relative src the inserted video block will carry.
  const handleUploadAsset = useCallback(
    async (file: File) => {
      const response = await uploadVideoAsset(path, file);
      return { src: response.src };
    },
    [path],
  );
 return { resolveAssetSrc, handleUploadAsset };
}
