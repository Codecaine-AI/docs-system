import { THEME_TOKEN_REGISTRY } from "../../../../../../theme/theme-folders";
import { componentLeaf } from "../../../../overrides";
import { TOKEN_KEY_LABELS } from "../../constants";
import type { PaneBodyProps } from "../../types";
import { ColorRow } from "../ColorRow";
import { SliderRow } from "../SliderRow";

export type ComponentTokenRowsProps = Pick<PaneBodyProps, "settings"> & { file: string; patchComponent: PaneBodyProps["patchers"]["patchComponent"] };
export function ComponentTokenRows({ file, settings, patchComponent }: ComponentTokenRowsProps) {
  return (
Object.entries(THEME_TOKEN_REGISTRY[file] ?? {}).map(([key, token]) => {
      const label = TOKEN_KEY_LABELS[key] ?? key;
      if (token.kind === "color") {
        return (
          <ColorRow
            key={key}
            defaultExpr={`var(${token.vars[0]})`}
            label={label}
            leaf={componentLeaf(file, key)}
            onChange={(value) => patchComponent(file, key, value)}
            value={settings.components[file]?.[key] ?? null}
          />
        );
      }
      const storedValue = settings.components[file]?.[key];
      const value = storedValue === undefined
        ? token.defaultValue
        : Number.parseFloat(storedValue);
      return (
        <SliderRow
          key={key}
          label={label}
          leaf={componentLeaf(file, key)}
          max={token.max}
          min={token.min}
          onChange={(nextValue) =>
            patchComponent(file, key, `${nextValue}${token.unit ?? ""}`)
          }
          step={token.step}
          value={value}
          valueLabel={`${value}${token.unit ?? ""}`}
        />
      );
    })
  );
}
