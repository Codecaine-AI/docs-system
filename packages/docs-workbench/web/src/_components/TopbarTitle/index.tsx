import type { SiteConfig } from "../../data/api";
import { docTitleFromPath } from "../../shared/doc-title";

export type TopbarTitleProps = {
  path: string | null;
  siteTitle: SiteConfig["title"];
};

export function TopbarTitle({ path, siteTitle }: TopbarTitleProps) {
  return path ? (
    <>
      {/* The old DocPage header's breadcrumb, above the page title. */}
      <span className="docs-topbar-crumb" title={path} aria-hidden="true">
        docs/{path}
      </span>
      <span className="docs-topbar-page">{docTitleFromPath(path)}</span>
    </>
  ) : (
    siteTitle ?? "Docs"
  );
}
