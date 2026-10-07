import { X } from "lucide-react";
import type { StyleRailLeafRef } from "../../../../overrides";
import { styleRailColorControls } from "../../../../../../shared/style-rail-settings/color-controls";
import { RowLabel } from "../RowLabel";
import { resolveCssColor } from "./resolve-css-color";

export type ColorRowProps = {
  label: string;
  leaf?: StyleRailLeafRef;
  value: string | null;
  defaultExpr: string;
  onChange: (value: string | null) => void;
};

/**
 * One color picker row. Renders nothing while the rail's color controls are
 * hidden (style-rail-color-controls.ts); the code stays for when they return.
 */
export function ColorRow({
  label,
  leaf,
  value,
  defaultExpr,
  onChange,
}: ColorRowProps) {
  if (!styleRailColorControls()) return null;
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-ui-xs">
      <RowLabel label={label} leaf={leaf} />
      <span className="flex items-center gap-1.5">
        {value !== null && (
          <button
            aria-label={`Reset ${label} color to theme default`}
            className="style-icon-button !h-5 !w-5"
            onClick={() => onChange(null)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <input
          aria-label={label}
          className="style-color"
          onChange={(event) => onChange(event.currentTarget.value)}
          type="color"
          value={value ?? resolveCssColor(defaultExpr)}
        />
      </span>
    </div>
  );
}
