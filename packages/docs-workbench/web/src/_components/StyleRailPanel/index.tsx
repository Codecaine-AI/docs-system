import { projectStorage } from "../../data/project-storage";
import { normalizeSettings } from "../../shared/style-rail-settings";
import { useState } from "react";
import { StyleRailNav } from "./_components/StyleRailNav";
import { isStyleRailPaneId, type StyleRailPaneId } from "./nav";
import { StyleRailPane } from "./_components/StyleRailPane";
import { StyleRailFooter } from "./_components/StyleRailFooter";
import type { StyleRailPanelProps, ThemePickerEntry } from "./types";

export type { StyleRailPanelProps, ThemePickerEntry } from "./types";

/**
 * Style rail — right-docked panel for live-tuning the docs theme, styled
 * with the docs' own semantic tokens so it follows light/dark. Every knob
 * resolves to CSS custom properties written onto <html>
 * (applyStyleRailVars), layered over theme/semantic.css; a knob at STOCK
 * REMOVES its override so the theme files stay authoritative.
 *
 * PERSISTENCE is two-layered (see the baseline block below
 * DEFAULT_STYLE_RAIL_SETTINGS): the durable, committable copy is the
 * `railDefaults` block of the repo's `themes/<id>/theme.json`, which every
 * consumer reads — a --theme-locked serve, a static export, a different
 * browser. A localStorage JSON blob sits ON TOP of it as this browser's
 * private override. Both are clamped on load.
 * Grain/softening effects ported from ccbcu client-dashboard's style rail.
 */

const SELECTED_PANE_STORAGE_KEY = "docs-style-rail-selected";

/**
 * The rail's body (detail pane, section nav and the theme buttons) without the rail's frame or header.
 * The app shell shows it in its inspector; StyleRail wraps it in the stand-alone rail.
 */
export function StyleRailPanel({
  settings,
  onSettingsChange,
  dark,
  onDarkChange,
  themes,
  activeThemeId,
  onSelectTheme,
  onSaveTheme,
  onSaveStyleToRepo,
  saveStyleLabel = "Save style to repo",
  codeTheme,
}: StyleRailPanelProps) {
  const [selectedPaneId, setSelectedPaneId] = useState<StyleRailPaneId>(() => {
    // docs-style-rail-section:* keys are retired; selection is the persisted pane UI state.
    try {
      const stored = projectStorage.getItem(SELECTED_PANE_STORAGE_KEY);
      return isStyleRailPaneId(stored) ? stored : "theme.presets";
    } catch {
      return "theme.presets";
    }
  });

  const selectPane = (paneId: StyleRailPaneId) => {
    setSelectedPaneId(paneId);
    try {
      projectStorage.setItem(SELECTED_PANE_STORAGE_KEY, paneId);
    } catch {
      // Session-only state when storage is unavailable.
    }
  };

  const activeThemeName =
    themes.find((theme) => theme.id === activeThemeId)?.name ?? activeThemeId ?? "Default";

  // Theme files: the exported JSON is exactly the persisted settings blob
  // plus the dark flag — importing runs it through normalizeSettings, so a
  // hand-edited or stale-schema file degrades to clamped defaults instead
  // of breaking the rail. See docs/20-implementation/40-theming.
  const exportTheme = () => {
    const blob = new Blob([JSON.stringify({ version: 1, dark, settings }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "docs-theme.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importTheme = (file: File) => {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as { dark?: unknown; settings?: unknown };
        onSettingsChange(normalizeSettings(parsed.settings ?? parsed));
        if (typeof parsed.dark === "boolean") onDarkChange(parsed.dark);
      } catch {
        // Not a theme file — leave the current theme untouched.
      }
    });
  };

  return (
        <>
          <div className="style-rail-two-pane">
            <StyleRailPane
              activeThemeId={activeThemeId}
              activeThemeName={activeThemeName}
              codeTheme={codeTheme}
              dark={dark}
              onDarkChange={onDarkChange}
              onSaveTheme={onSaveTheme}
              onSelectTheme={onSelectTheme}
              onSettingsChange={onSettingsChange}
              selectedId={selectedPaneId}
              settings={settings}
              themes={themes}
            />
            <StyleRailNav
              dark={dark}
              onSelect={selectPane}
              selectedId={selectedPaneId}
              settings={settings}
            />
          </div>

          <StyleRailFooter
            exportTheme={exportTheme}
            importTheme={importTheme}
            onSettingsChange={onSettingsChange}
            onSaveStyleToRepo={onSaveStyleToRepo}
            saveStyleLabel={saveStyleLabel}
          />
        </>
  );
}
