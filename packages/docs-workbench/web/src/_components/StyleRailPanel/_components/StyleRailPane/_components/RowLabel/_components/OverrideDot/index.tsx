import { useContext } from "react";
import { isLeafOverridden, type StyleRailLeafRef } from "../../../../../../overrides";
import { OverrideSettingsContext } from "../../../../override-settings-context";

export type OverrideDotProps = { leaf?: StyleRailLeafRef };

export function OverrideDot({ leaf }: OverrideDotProps) {
  const settings = useContext(OverrideSettingsContext);
  if (!leaf || !settings) return null;
  const overridden = isLeafOverridden(settings, leaf);
  return (
    <span
      aria-hidden="true"
      className="style-rail-row-override-dot"
      data-overridden={overridden ? "true" : "false"}
    />
  );
}
