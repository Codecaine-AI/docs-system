import type { StyleRailSettings } from "../../../../shared/style-rail-settings";
import { paneOverrideCount } from "../../overrides";
import { STYLE_RAIL_GROUPS, type StyleRailPaneId } from "../../nav";

export type StyleRailNavProps = {
  selectedId: StyleRailPaneId;
  settings: StyleRailSettings;
  dark: boolean;
  onSelect: (id: StyleRailPaneId) => void;
};

export function StyleRailNav({
  selectedId,
  settings,
  onSelect,
}: StyleRailNavProps) {
  return (
    <nav aria-label="Style sections" className="style-rail-nav">
      {STYLE_RAIL_GROUPS.map((group) => (
        <div className="style-rail-nav-group" key={group.id}>
          <div className="style-rail-nav-label">{group.label}</div>
          <div className="style-rail-nav-items">
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected = item.id === selectedId;
              const overrideCount = paneOverrideCount(settings, item.id);
              const overrideLabel = overrideCount === 1 ? "override" : "overrides";
              const overrideName =
                overrideCount > 0 ? `, ${overrideCount} ${overrideLabel}` : "";
              const accessibleName =
                overrideCount > 0 ? `${item.label}${overrideName}` : undefined;
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  aria-label={accessibleName}
                  className="style-rail-nav-item"
                  data-active={selected ? "true" : undefined}
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="style-rail-nav-icon">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                  <span aria-hidden="true" className="style-rail-nav-status">
                    {overrideCount > 0 &&
                      (item.id.startsWith("blocks.") ? (
                        <span className="style-rail-nav-override-count">{overrideCount}</span>
                      ) : (
                        <span className="style-rail-nav-override-dot" />
                      ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
