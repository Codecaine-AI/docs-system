import { themeStorage } from "../data/project-storage";
import { THEME_TOKEN_REGISTRY } from "../theme/theme-folders";
import {
  STYLE_RAIL_COLOR_LEAVES,
  getStyleRailBaseline,
  normalizeSettings,
  type StyleRailSettings,
} from "../shared/style-rail-settings";

/**
 * v3 = the @codecaine-ai/design-system rollout hid the rail's color controls
 * (style-rail-color-controls.ts). A v2 blob can hold color picks this browser
 * made, so the cache moved: with no v3 blob, the v2 one (else the v1 one) is
 * read once, its non-color settings carry over and its color picks are
 * dropped (dropStoredColorPicks), so they read as omitted keys do. The old
 * blobs are never rewritten or deleted.
 *
 * v2 = the stock reading metrics moved (14px / 1.7 / 100ch → 18px / 1.45 /
 * 60ch). The cache always stores the FULL normalized settings, so every v1
 * blob pinned the old stock metrics even when nobody touched those knobs —
 * and on a project with no repo theme the cache is the authority, so those
 * stale values kept winning. v1 blobs are read once through
 * migrateLegacyStyleRailBlob.
 */
const STORAGE_KEY = "docs-style-rail-settings.v3";
/**
 * Exported so App can recognise a `storage` event for this cache. The cache
 * lives in `themeStorage`: one origin-wide key while the shared global theme
 * is active (so a stale per-project v1/v2 blob can never override it), the
 * per-project key otherwise.
 */
export const STYLE_RAIL_STORAGE_KEY = STORAGE_KEY;
/** The cache before the color controls were hidden (may hold color picks). */
const PREVIOUS_STORAGE_KEY = "docs-style-rail-settings.v2";
const LEGACY_STORAGE_KEY = "docs-style-rail-settings.v1";

/** The v1 stock reading metrics. A v1 value equal to one of these is untouched stock, not a choice. */
const LEGACY_STOCK_METRICS = { fontSize: 14, lineHeight: 1.7, contentWidth: 100 } as const;

/**
 * Drops v1 reading metrics that still sit at the v1 stock values so they fall
 * through to the current baseline. A metric the user actually moved (any
 * other value) survives. Exported for tests.
 */
export function migrateLegacyStyleRailBlob(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const blob = { ...(raw as Record<string, unknown>) };
  const dropStock = (section: string, key: keyof typeof LEGACY_STOCK_METRICS) => {
    const value = blob[section];
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const next = { ...(value as Record<string, unknown>) };
    if (next[key] === LEGACY_STOCK_METRICS[key]) delete next[key];
    blob[section] = next;
  };
  dropStock("typography", "fontSize");
  dropStock("typography", "lineHeight");
  // contentWidth lived under typography in the oldest blobs, then layout
  // (or `surfaces`); normalizeSettings reads all three.
  dropStock("typography", "contentWidth");
  dropStock("layout", "contentWidth");
  dropStock("surfaces", "contentWidth");
  return blob;
}

/**
 * Removes this browser's color picks (STYLE_RAIL_COLOR_LEAVES) and its
 * per-component color tokens from a pre-v3 blob, keeping every other setting.
 * A removed leaf is an omitted key, so normalizeSettings resolves it the way
 * it resolves any omitted key (the repo baseline where the leaf inherits one,
 * else stock). Exported for tests.
 */
export function dropStoredColorPicks(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const blob = { ...(raw as Record<string, unknown>) };
  for (const path of STYLE_RAIL_COLOR_LEAVES) {
    const [group, key] = path.split(".");
    if (key === undefined) {
      delete blob[group!];
      continue;
    }
    // `colors` is all picks; drop the group so it inherits as a whole.
    if (group === "colors") {
      delete blob.colors;
      continue;
    }
    const value = blob[group!];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const next = { ...(value as Record<string, unknown>) };
    delete next[key];
    blob[group!] = next;
  }
  const components = blob.components;
  if (components && typeof components === "object" && !Array.isArray(components)) {
    const kept: Record<string, unknown> = {};
    for (const [file, tokens] of Object.entries(components as Record<string, unknown>)) {
      if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) continue;
      const fileKept = Object.fromEntries(
        Object.entries(tokens as Record<string, unknown>).filter(
          ([key]) => THEME_TOKEN_REGISTRY[file]?.[key]?.kind !== "color",
        ),
      );
      if (Object.keys(fileKept).length > 0) kept[file] = fileKept;
    }
    blob.components = kept;
  }
  return blob;
}

/**
 * Reads the browser cache, filling any omitted keys from the installed
 * baseline. App uses this only as the first-frame/offline fallback when the
 * active repo theme has no railDefaults; a repo railDefaults block is the
 * durable authority and replaces stale cache during normal boot.
 */
export function loadStyleRailSettings(): StyleRailSettings {
  try {
    const raw = themeStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeSettings(JSON.parse(raw));
    // Read-only migration: a locked host calls this too and must not write
    // storage, so the v2 (or v1) blob is left in place and simply superseded
    // by the first v3 save on an unlocked host. Its color picks do not carry.
    const previous = themeStorage.getItem(PREVIOUS_STORAGE_KEY);
    if (previous) return normalizeSettings(dropStoredColorPicks(JSON.parse(previous)));
    const legacy = themeStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      return normalizeSettings(dropStoredColorPicks(migrateLegacyStyleRailBlob(JSON.parse(legacy))));
    }
    return getStyleRailBaseline();
  } catch {
    return getStyleRailBaseline();
  }
}

/** True when a browser cache exists; retained for cache-aware hosts/tests. */
export function hasStoredStyleRailSettings(): boolean {
  try {
    return (
      themeStorage.getItem(STORAGE_KEY) !== null ||
      themeStorage.getItem(PREVIOUS_STORAGE_KEY) !== null ||
      themeStorage.getItem(LEGACY_STORAGE_KEY) !== null
    );
  } catch {
    return false;
  }
}

export function saveStyleRailSettings(settings: StyleRailSettings) {
  try {
    themeStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session if storage is unavailable.
  }
}
