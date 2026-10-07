import { getStyleRailBaseline } from "../../../../shared/style-rail-settings";
import type { StyleRailPanelProps } from "../../types";

export type StyleRailFooterProps = Pick<StyleRailPanelProps, "onSettingsChange" | "onSaveStyleToRepo" | "saveStyleLabel"> & {
  exportTheme: () => void;
  importTheme: (file: File) => void;
};

export function StyleRailFooter({ exportTheme, importTheme, onSettingsChange, onSaveStyleToRepo, saveStyleLabel }: StyleRailFooterProps) {
  return (
          <div className="shrink-0 space-y-1.5 border-t p-2">
            <div className="flex gap-1.5">
              <button
                className="flex-1 rounded border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={exportTheme}
                type="button"
              >
                Export theme
              </button>
              <label className="flex-1 cursor-pointer rounded border px-2 py-1.5 text-center text-ui-xs text-foreground hover:bg-muted hover:text-foreground">
                Import theme
                <input
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) importTheme(file);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
            {/* Writes the current knobs into the repo theme file, making
                them the baseline every consumer inherits. The debounced
                auto-save in App.tsx already does this in the background;
                this is the explicit, immediate affordance for "make what I
                am looking at the repo default". */}
            {onSaveStyleToRepo && (
              <button
                className="w-full rounded border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted hover:text-foreground"
                onClick={onSaveStyleToRepo}
                type="button"
              >
                {saveStyleLabel}
              </button>
            )}
            {/* "Defaults" means the REPO baseline, not stock: resetting
                returns to the committed theme file, so a reset here matches
                what every other consumer of this repo already renders. */}
            <button
              className="w-full rounded border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSettingsChange(getStyleRailBaseline())}
              type="button"
            >
              Reset to defaults
            </button>
          </div>
  );
}
