import type { PaneBodyProps } from "../../../../types";
import { ControlGroup } from "../../../../_components/ControlGroup";
import { cn } from "@codecaine-ai/docs-viewer/ui/cn";

export type PresetsPaneProps = PaneBodyProps;

export function PresetsPane(props: PresetsPaneProps) {
  const { themes, activeThemeId, onSelectTheme, onSaveTheme } = props;

  const saveThemePrompt = () => {
    if (!onSaveTheme) return;
    const name = window.prompt("Theme name (saved to the repo's themes/ folder):");
    if (name?.trim()) onSaveTheme(name.trim());
  };

  return (
    <ControlGroup>
      <div className="grid grid-cols-2 gap-1.5">
        {themes.map((theme) => (
          <button
            key={theme.id}
            className={cn(
              "style-rail-preset-button border px-2 py-1.5 text-ui-xs",
              theme.id === activeThemeId
                ? "border-primary/50 bg-muted text-foreground"
                : "text-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onSelectTheme(theme.id)}
            title={
              theme.source === "global"
                ? "shared by every project"
                : theme.source === "repo"
                  ? "themes/ folder in this repo"
                  : "built-in"
            }
            type="button"
          >
            {theme.name}
          </button>
        ))}
      </div>
      {onSaveTheme && (
        <button
          className="style-rail-preset-button w-full border px-2 py-1.5 text-ui-xs text-foreground hover:bg-muted hover:text-foreground"
          onClick={saveThemePrompt}
          type="button"
        >
          Save current look as theme…
        </button>
      )}
    </ControlGroup>
  );
}
