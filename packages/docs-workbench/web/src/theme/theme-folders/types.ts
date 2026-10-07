import type { StyleRailSettings } from "../../shared/style-rail-settings";

export type ThemeModeValue = string | { light: string; dark: string };

export type ThemeComponents = Record<string, Record<string, ThemeModeValue>>;

/** Theme manifests may override any rail leaf without restating its siblings. */
export type StyleRailDefaults = {
  [Key in keyof StyleRailSettings]?: StyleRailSettings[Key] extends object
    ? DeepPartial<StyleRailSettings[Key]>
    : StyleRailSettings[Key];
};

type DeepPartial<Value> = Value extends object
  ? { [Key in keyof Value]?: DeepPartial<Value[Key]> }
  : Value;

export type ThemeManifest = {
  name: string;
  /** Id of the theme this one layers over; missing token values fall through. */
  base?: string;
  /** Dark-mode flag applied when the theme is selected. */
  dark?: boolean;
  /** Font stacks written to the per-surface font tokens (custom stacks allowed). */
  fonts?: Partial<Record<"body" | "heading" | "code" | "number", string>>;
  /**
   * The repo-side style-rail settings file: this block IS where the rail's
   * knobs persist, and loading a theme installs it as the rail's BASELINE
   * (StyleRail.tsx setStyleRailBaseline) — what "default" means, what Reset
   * returns to, and what a --theme-locked serve or static export renders.
   * Browser localStorage is only a cache/fallback when this block is absent;
   * it never overrides a loaded repo value.
   */
  railDefaults?: StyleRailDefaults;
};

export type ThemeDefinition = {
  id: string;
  manifest: ThemeManifest;
  components: ThemeComponents;
  source: "builtin" | "repo";
};

export type ThemeTokenDefinition =
  | {
      vars: string[];
      kind: "color";
    }
  | {
      vars: string[];
      kind: "length";
      min: number;
      max: number;
      step: number;
      /** px for most lengths; ch where the length is a count of mono glyphs (the ledger name column). */
      unit: "px" | "ch";
      defaultValue: number;
    }
  | {
      vars: string[];
      kind: "number";
      min: number;
      max: number;
      step: number;
      unit?: never;
      defaultValue: number;
    };

