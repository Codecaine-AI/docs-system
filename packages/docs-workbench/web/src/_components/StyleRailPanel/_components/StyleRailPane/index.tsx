import { getStyleRailPaneItem } from "../../nav";
import { paneOverrideCount } from "../../overrides";
import { OverrideSettingsContext } from "./override-settings-context";
import { createPanePatchers } from "./pane-patchers";
import type { StyleRailPaneProps } from "./types";
import { ThemePane } from "./_components/ThemePane";
import { LayoutPane } from "./_components/LayoutPane";
import { BlockPane } from "./_components/BlockPane";
export type { StyleRailPaneProps } from "./types";

export function StyleRailPane(props: StyleRailPaneProps) {
  const { selectedId, activeThemeName, settings, onSettingsChange } = props;
  const pane = getStyleRailPaneItem(selectedId);
  const overrideCount = paneOverrideCount(settings, selectedId);
  const overrideSummary = overrideCount === 0
    ? "No overrides"
    : `${overrideCount} ${overrideCount === 1 ? "override" : "overrides"}`;

  const patchers = createPanePatchers(settings, onSettingsChange);
  const bodyProps = { ...props, patchers, pane, overrideCount };

  return (
    <OverrideSettingsContext.Provider value={settings}>
      <section aria-labelledby="style-rail-pane-title" className="style-rail-detail">
        <header className="style-rail-detail-head">
          <h2 id="style-rail-pane-title">{pane.label}</h2>
          <p>
            {selectedId === "theme.presets"
              ? `Layered over ${activeThemeName} theme`
              : `${overrideSummary} · layered over ${activeThemeName} theme`}
          </p>
        </header>
        <div className="style-rail-detail-body">{selectedId.startsWith("theme.") ? <ThemePane {...bodyProps} /> : selectedId.startsWith("layout.") ? <LayoutPane {...bodyProps} /> : <BlockPane {...bodyProps} />}</div>
      </section>
    </OverrideSettingsContext.Provider>
  );
}
