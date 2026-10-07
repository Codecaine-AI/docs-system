import type { StyleRailSettings } from "../../../../shared/style-rail-settings";
import type { ThemePickerEntry } from "../../types";
import type { CodeThemeControls } from "../../../../shared/useCodeTheme";
import { getStyleRailPaneItem, type StyleRailPaneId } from "../../nav";
import type { createPanePatchers } from "./pane-patchers";

export type StyleRailPaneProps = {
  selectedId: StyleRailPaneId;
  activeThemeName: string;
  settings: StyleRailSettings;
  onSettingsChange: (settings: StyleRailSettings) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  themes: ThemePickerEntry[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  onSaveTheme?: (name: string) => void;
  /**
   * The central code theme picker (theme/use-code-theme.ts). Absent on a
   * static export or a theme-locked serve — the active code theme still
   * applies there, it just cannot be changed.
   */
  codeTheme?: CodeThemeControls;
};


export type PaneBodyProps = StyleRailPaneProps & {
  patchers: ReturnType<typeof createPanePatchers>;
  pane: ReturnType<typeof getStyleRailPaneItem>;
  overrideCount: number;
};
