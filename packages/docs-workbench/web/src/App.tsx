import { centralProjectId, themeStorage } from "./data/project-storage";
import { useMemo, useState } from "react";
import { DocsClientProvider, type DocsTreeNode } from "@codecaine-ai/docs-viewer/client";
import { DocPeekPanel } from "@codecaine-ai/docs-viewer/doc-peek-panel";
import type { SpectreRef } from "@codecaine-ai/docs-model/spectre-ref";
import { IS_STATIC, assetUrl, getTree, type SiteConfig } from "./data/api";
import { createStandaloneDocsClient } from "./data/client";
import { StandaloneCanvasEmbed } from "./shared/_components/CanvasEmbed";
import { StandaloneSequenceEmbed } from "./shared/_components/SequenceEmbed";
import { DocPage } from "./_components/DocPage";
import { RouterShell } from "./_components/RouterShell";
import { ExportDialog } from "./_components/ExportDialog";
import { StyleRailPanel } from "./_components/StyleRailPanel";
import { StyleRailOverlay } from "./_components/StyleRailOverlay";
import type { StyleRailSettings } from "./shared/style-rail-settings";
import { loadStyleRailSettings } from "./_lib/style-rail-storage";
import { useCodeTheme } from "./shared/useCodeTheme";
import { THEME_STORAGE_KEY } from "./_lib/constants";
import { readHashPath } from "./_lib/hash-route";
import { useThemeFolders } from "./_lib/useThemeFolders";
import { useThemePersistence } from "./_lib/useThemePersistence";
import { useStyleInspectorState } from "./_lib/useStyleInspectorState";
import { useStyleInspector } from "./_lib/useStyleInspector";
import { useDocsShellEffects } from "./_lib/useDocsShellEffects";
import { TopbarTitle } from "./_components/TopbarTitle";
import { TopbarActions } from "./_components/TopbarActions";

export { themeWritePayload } from "./_lib/theme-boot";

/**
 * Standalone docs workbench shell: the design-system app shell
 * (_components/RouterShell) with the docs tree in its collapsible sidebar,
 * the page title and actions in its topbar, the Style rail in its inspector,
 * and the main surface — a doc workbench page (#/<bundle path>, see DocPage
 * for the edit/annotate modes). Hash-based navigation so both `docs-cli
 * serve` and the static export deep-link from any host/subpath; the
 * light/dark toggle drives the docs theme tokens (.dark class +
 * data-theme attribute).
 *
 * Static exports (`isStatic`, the IS_STATIC build) are public reading sites:
 * the exported theme is applied as a locked consumer (nothing persists to
 * localStorage, nothing is written back), and every authoring surface is
 * absent — no style rail or its toggle, no Export button, and DocPage runs
 * read-only. The header shows the site title and repository link from
 * `data/site.json` (see getSiteConfig) instead.
 */

export type AppProps = {
  /**
   * Read-only public-site shell. Defaults to the build-time IS_STATIC flag;
   * a prop so tests can render the static shell (mirrors DocPage).
   */
  isStatic?: boolean;
};

export function App({ isStatic = IS_STATIC }: AppProps = {}) {
  const [siteConfig, setSiteConfig] = useState<SiteConfig>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [tree, setTree] = useState<DocsTreeNode[] | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(readHashPath());
  const [sidePeekOpen, setSidePeekOpen] = useState(false);
  // Light/dark and the rail settings are part of the theme's look, so their
  // instant cache follows the theme: origin-wide under the shared global
  // theme (themeStorage), per-project otherwise.
  const [dark, setDark] = useState<boolean>(
    () => themeStorage.getItem(THEME_STORAGE_KEY) === "dark",
  );
  const [styleSettings, setStyleSettings] = useState<StyleRailSettings>(() =>
    loadStyleRailSettings(),
  );
  // The machine-wide active code theme (docs-server code-themes.ts): applied
  // to every code pane below; null until (or unless) the API answers.
  const { theme: codeTheme, controls: codeThemeControls } = useCodeTheme();
  const { styleOpen, setStyleOpen, styleButtonRef } = useStyleInspectorState();
  // DocPage portals its page actions into this topbar slot.
  const [topbarSlot, setTopbarSlot] = useState<HTMLSpanElement | null>(null);
  const themeFolders = useThemeFolders({ isStatic, dark, setDark, setStyleSettings });
  const { themeId, globalTheme, themeLocked, themeReady, handleSelectTheme } = themeFolders;
  const { canAuthorTheme, handleSaveStyleToRepo, themePickerEntries } = useThemePersistence({
    ...themeFolders, isStatic, dark, setDark, styleSettings, setStyleSettings, codeTheme,
  });

  const { styleAvailable, setStyleOpenByUser, closeStyle, handleStyleKeyDown, handleShellKeyDown, handlePeekOpenChange } = useStyleInspector({
    isStatic, themeReady, themeLocked, styleOpen, setStyleOpen, styleButtonRef, setSidePeekOpen,
  });
  const { booting } = useDocsShellEffects({ themeReady, isStatic, path, setPath, setTree, setTreeError, setSiteConfig });

  const client = useMemo(() => createStandaloneDocsClient(), []);

  return (
    <DocsClientProvider
      client={client}
      canvasEmbed={StandaloneCanvasEmbed}
      sequenceEmbed={StandaloneSequenceEmbed}
    >
      {/* The style engine's root (.docs-style-shell: the softening effects)
          wraps the whole shell so its knobs reach the sidebar, topbar and
          inspector too. */}
      <div
        className="docs-style-shell docs-app"
        data-docs-booting={booting ? "" : undefined}
        onKeyDown={handleShellKeyDown}
      >
        <RouterShell
          appName={
            siteConfig.title ? (
              <span data-docs-site-title="">{siteConfig.title}</span>
            ) : centralProjectId() ? (
              <a href="/" title="All documentation projects">Docs · Projects</a>
            ) : (
              "Docs"
            )
          }
          title={<TopbarTitle path={path} siteTitle={siteConfig.title} />}
          actions={
            <TopbarActions
              setTopbarSlot={setTopbarSlot} isStatic={isStatic} siteConfig={siteConfig}
              styleAvailable={styleAvailable} styleButtonRef={styleButtonRef}
              styleOpen={styleOpen} sidePeekOpen={sidePeekOpen} closeStyle={closeStyle}
              setStyleOpenByUser={setStyleOpenByUser} tree={tree} setExportOpen={setExportOpen}
            />
          }
          tree={tree}
          treeError={treeError}
          selectedPath={path}
          isStatic={isStatic}
          persistSidebar={themeReady && themeLocked === false}
          inspector={
            // The Style rail is the one inspector: the chrome panel this
            // host persists. Hidden entirely on a theme-locked serve or a
            // static export (the rail IS the authoring surface). The doc
            // preview (DocPeekPanel) and the AI dock stay page panels inside
            // the doc column: they belong to the document, not the chrome.
            styleAvailable
              ? {
                  title: "Style",
                  open: styleOpen,
                  onClose: closeStyle,
                  content: (
                    <div className="docs-style-inspector" onKeyDown={handleStyleKeyDown}>
                      <StyleRailPanel
                        settings={styleSettings}
                        onSettingsChange={setStyleSettings}
                        dark={dark}
                        onDarkChange={setDark}
                        themes={themePickerEntries}
                        activeThemeId={themeId}
                        onSelectTheme={handleSelectTheme}
                        onSaveStyleToRepo={canAuthorTheme ? handleSaveStyleToRepo : undefined}
                        saveStyleLabel={globalTheme ? "Save global style" : undefined}
                        codeTheme={codeThemeControls}
                      />
                    </div>
                  ),
                }
              : undefined
          }
        >
          <div className="docs-workspace flex min-h-0">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {path ? (
                <DocPage
                  path={path}
                  isStatic={isStatic}
                  sidePeekOpen={sidePeekOpen}
                  alignment={styleSettings.layout.alignment}
                  topbarActionsTarget={topbarSlot}
                  onDocMoved={(newPath) => {
                    // A title rename moved the bundle: follow it and let the
                    // sidebar pick up the new name.
                    window.location.hash = `#/${newPath}`;
                    void getTree()
                      .then(({ tree: nodes }) => setTree(nodes))
                      .catch(() => {});
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-ui-lg text-muted-foreground">
                  Select a doc from the tree
                </div>
              )}
            </div>
            {/* Side-peek push drawer: a self-contained width-animated flex
                sibling (collapsed to w-0 when closed) docked against the doc
                content. It listens for spectre:doc-reference-navigate itself;
                the host only supplies navigation + asset resolution. */}
            <DocPeekPanel
              projectId="local"
              onOpenChange={handlePeekOpenChange}
              onNavigate={(ref: SpectreRef) => {
                if (ref.kind === "doc") {
                  window.location.hash = `#/${ref.path}`;
                }
                // "source" refs have no navigation target in the workbench yet.
              }}
              // Same underlying helper DocPage's resolver closes over. Only the
              // panel knows the peeked doc's bundle path, so bundle-relative
              // (`./assets/...`) canonicalization has to happen viewer-side —
              // the host can only map docs-root-relative srcs to fetchable URLs.
              resolveAssetSrc={assetUrl}
            />
          </div>
        </RouterShell>
      </div>
      <StyleRailOverlay settings={styleSettings} dark={dark} />
      {!isStatic && exportOpen && tree && <ExportDialog tree={tree} currentPath={path} onClose={() => setExportOpen(false)} />}
    </DocsClientProvider>
  );
}
