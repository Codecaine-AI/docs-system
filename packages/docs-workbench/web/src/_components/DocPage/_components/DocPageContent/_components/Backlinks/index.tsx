import type { BacklinkRow } from "../../../../../../data/api";
import type { WorkbenchMode } from "../../../../types";

export type BacklinksProps = {
  isStatic: boolean;
  mode: WorkbenchMode;
  backlinks: BacklinkRow[];
};

export function Backlinks({ isStatic, mode, backlinks }: BacklinksProps) {
  return (
(isStatic || mode === "edit") && backlinks.length > 0 && (
              <footer className="mt-10 border-t pt-4">
                <div className="text-ui-xs font-medium uppercase tracking-micro text-muted-foreground">
                  Referenced by
                </div>
                <ul className="mt-2 space-y-1">
                  {[...new Set(backlinks.map((row) => row.sourcePath))].map((sourcePath) => {
                    // Index sources are doc.json / canvas sidecar file paths;
                    // link to the owning bundle folder.
                    const owningBundle = sourcePath
                      .replace(/\/assets\/canvases\/[^/]+$/i, "")
                      .replace(/\/doc\.json$/i, "");
                    return (
                      <li key={sourcePath}>
                        <a
                          href={`#/${owningBundle}`}
                          className="font-mono text-ui-xs text-primary underline underline-offset-2"
                        >
                          {sourcePath}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </footer>
            )
  );
}
