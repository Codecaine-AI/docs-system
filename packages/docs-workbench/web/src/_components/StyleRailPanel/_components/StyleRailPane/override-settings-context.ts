import { createContext } from "react";
import type { StyleRailSettings } from "../../../../shared/style-rail-settings";

/*
 * Rows read the current settings through this local context so every dot is
 * resolved by the same helper that computes pane counts.
 */
export const OverrideSettingsContext = createContext<StyleRailSettings | null>(null);

