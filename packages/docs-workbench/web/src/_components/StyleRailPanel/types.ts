import type { StyleRailSettings } from "../../shared/style-rail-settings";
import type { CodeThemeControls } from "../../shared/useCodeTheme";

/** `global` = the host's shared theme, stored outside every repo. */
export type ThemePickerEntry = { id: string; name: string; source: "builtin" | "repo" | "global" };

export type StyleRailPanelProps = {
  settings: StyleRailSettings;
  onSettingsChange: (settings: StyleRailSettings) => void;
  dark: boolean;
  onDarkChange: (dark: boolean) => void;
  /** Theme catalogue: built-ins plus the repo's themes/ folders. */
  themes: ThemePickerEntry[];
  activeThemeId: string;
  onSelectTheme: (id: string) => void;
  /** Absent in static exports (no server to write the folder). */
  onSaveTheme?: (name: string) => void;
  /**
   * Promotes the current knobs to the repo BASELINE by writing them into
   * `themes/<id>/theme.json`. Absent whenever this host may not author the
   * theme — a static export, or a serve that is (or might still be)
   * `--theme-locked`; the server refuses such a write with 403 regardless.
   */
  onSaveStyleToRepo?: () => void;
  /** Button text for onSaveStyleToRepo; the shared global theme is not a repo file. */
  saveStyleLabel?: string;
  /** Central code theme picker (Typography pane); absent when it cannot be changed. */
  codeTheme?: CodeThemeControls;
};
