import { useEffect, useMemo, useState } from "react";
import type { DocDocument } from "@codecaine-ai/docs-model/doc-schema";
import DocBlockRenderer from "@codecaine-ai/docs-viewer/doc-block-renderer";
import { resolveBundleAssetSrc } from "@codecaine-ai/docs-viewer/bundle-src";

import { assetUrl, getBacklinks, getBundle, type BacklinkRow } from "./api";

/**
 * One doc bundle: fetches the /api/bundle-shaped payload for `path`, renders
 * it through DocBlockRenderer inside the same typography wrapper Spectre's
 * DocsViewer uses, and appends a small read-only "Referenced by" footer fed
 * by the backlinks index. Read-only: no editor, no comment mutations.
 */
export function DocPage({ path }: { path: string }) {
  const [doc, setDoc] = useState<DocDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setDoc(null);
    setBacklinks([]);
    void (async () => {
      try {
        const payload = await getBundle(path);
        if (cancelled) return;
        setDoc(payload.doc as DocDocument);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load doc");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    void getBacklinks(path)
      .then((rows) => {
        if (!cancelled) setBacklinks(rows.filter((row) => row.targetKind === "doc"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  const resolveAssetSrc = useMemo(
    () => (src: string) => assetUrl(resolveBundleAssetSrc(path, src)),
    [path],
  );

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading {path}...</div>;
  }
  if (error) {
    return (
      <div className="p-8 text-sm">
        <div className="font-medium text-destructive">Failed to load doc bundle</div>
        <div className="mt-1 text-muted-foreground">
          {path}: {error}
        </div>
      </div>
    );
  }
  if (!doc) return null;

  return (
    <div className="mx-auto w-full max-w-[88ch] px-5 py-6 sm:px-8">
      <div className="mb-4 border-b pb-2 font-mono text-xs text-muted-foreground" title={path}>
        docs/{path}
      </div>
      <div className="spectre-markdown prose prose-sm dark:prose-invert relative max-w-none font-sans text-sm leading-[1.7]">
        <DocBlockRenderer
          document={doc}
          projectId="local"
          documentPath={`docs/${path}`}
          bundlePath={path}
          resolveAssetSrc={resolveAssetSrc}
        />
      </div>
      {backlinks.length > 0 && (
        <footer className="mt-10 border-t pt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Referenced by
          </div>
          <ul className="mt-2 space-y-1">
            {[...new Set(backlinks.map((row) => row.sourcePath))].map((sourcePath) => {
              // Index sources are doc.json / canvas sidecar file paths; link
              // to the owning bundle folder.
              const bundle = sourcePath
                .replace(/\/assets\/canvases\/[^/]+$/i, "")
                .replace(/\/doc\.json$/i, "");
              return (
                <li key={sourcePath}>
                  <a
                    href={`#/${bundle}`}
                    className="font-mono text-xs text-primary underline underline-offset-2"
                  >
                    {sourcePath}
                  </a>
                </li>
              );
            })}
          </ul>
        </footer>
      )}
    </div>
  );
}
