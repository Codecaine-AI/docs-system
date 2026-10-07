import type { StyleRailSettings } from "../../shared/style-rail-settings";

export type StyleRailOverlayProps = { settings: StyleRailSettings; dark: boolean };

/**
 * Full-viewport SVG turbulence grain (ported from ccbcu's
 * DashboardStyleOverlay). Opacity/blend come from the CSS vars;
 * frequency/contrast bind here.
 */
export function StyleRailOverlay({ settings, dark }: StyleRailOverlayProps) {
  const { grain } = settings;
  if (!grain.enabled) return null;
  // Static noise, the original recipe. Overlay is symmetric around the
  // base, so it gets plain mid-gray-centered noise. Multiply can only
  // darken and screen can only lighten, so for those the noise is biased
  // into the band next to the blend's neutral point (just below white for
  // multiply, just above black for screen) — the static lands without
  // shifting the page's average luminance.
  const blend = grain.blendMode === "auto" ? (dark ? "screen" : "overlay") : grain.blendMode;
  const bias =
    blend === "multiply"
      ? { scale: 0.45, offset: 0.55 }
      : blend === "screen"
        ? { scale: 0.45, offset: 0 }
        : { scale: 1, offset: 0 };
  const slope = grain.contrast * bias.scale;
  const intercept = ((1 - grain.contrast) / 2) * bias.scale + bias.offset;
  return (
    <div aria-hidden="true" className="docs-grain-layer">
      <svg className="h-full w-full" focusable="false" preserveAspectRatio="none">
        <filter id="docs-grain-filter" colorInterpolationFilters="sRGB">
          <feTurbulence
            baseFrequency={String(grain.frequency)}
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncG type="linear" slope={String(slope)} intercept={String(intercept)} />
            <feFuncB type="linear" slope={String(slope)} intercept={String(intercept)} />
            {/* feTurbulence emits noisy alpha too; make the layer opaque so
                the blend result depends only on the luminance above. */}
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
        </filter>
        <rect filter="url(#docs-grain-filter)" height="100%" width="100%" />
      </svg>
    </div>
  );
}

