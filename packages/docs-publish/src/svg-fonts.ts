import { readBundledWoff2 } from './font-files' with { type: 'macro' };

// Inlined at build time: the bundled woff2 faces as base64, by file stem.
const WOFF2: Record<string, string> = readBundledWoff2();

type Family = 'Inter' | 'IBM Plex Mono';
const FACES: Record<Family, Record<number, string>> = {
  'Inter': {400: 'Inter-Regular', 500: 'Inter-Medium', 600: 'Inter-SemiBold', 700: 'Inter-Bold'},
  'IBM Plex Mono': {400: 'IBMPlexMono-Regular', 500: 'IBMPlexMono-Medium', 600: 'IBMPlexMono-SemiBold'},
};

/** The family stack diagrams paint with: the face their text is measured in. */
export const DIAGRAM_FONT_STACK = 'Inter, ui-sans-serif, system-ui, sans-serif';

/** The bundled weight CSS font matching paints for `desired` (CSS Fonts 4, 5.2). */
export function matchWeight(desired: number, available: number[]): number {
  if (available.includes(desired)) return desired;
  const below = available.filter(w => w < desired).sort((a, b) => b - a);
  const above = available.filter(w => w > desired).sort((a, b) => a - b);
  if (desired >= 400 && desired <= 500) {
    const upTo500 = above.filter(w => w <= 500);
    return upTo500[0] ?? below[0] ?? above[0]!;
  }
  return desired < 400 ? (below[0] ?? above[0]!) : (above[0] ?? below[0]!);
}

/** Every font weight the SVG asks for (attributes and inline CSS), plus the 400 its unweighted text paints. */
function requestedWeights(svg: string): number[] {
  const weights = new Set([400]);
  for (const [, value] of svg.matchAll(/font-weight\s*(?:=\s*["']|:\s*)([a-z0-9]+)/gi)) {
    const weight = value === 'bold' || value === 'bolder' ? 700 : value === 'normal' || value === 'lighter' ? 400 : Number(value);
    if (weight >= 1 && weight <= 1000) weights.add(weight);
  }
  return [...weights];
}

/**
 * A published diagram is an <img> SVG, which cannot load the page's fonts:
 * this embeds @font-face rules (woff2 data URLs) for the bundled faces the
 * SVG can paint (Inter at every weight it requests, IBM Plex Mono when it
 * names it), so it paints in the faces its layout measured. Sequence text
 * takes its family from `--seq-font-family`, which is set to Inter here.
 */
export function embedDiagramFonts(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;
  const families: Family[] = svg.includes('IBM Plex Mono') ? ['Inter', 'IBM Plex Mono'] : ['Inter'];
  const weights = requestedWeights(svg);
  const rules: string[] = [];
  for (const family of families) {
    const available = Object.keys(FACES[family]).map(Number);
    for (const weight of [...new Set(weights.map(w => matchWeight(w, available)))].sort((a, b) => a - b)) {
      rules.push(`@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${WOFF2[FACES[family][weight]!]}) format("woff2")}`);
    }
  }
  rules.push(`:root{--seq-font-family:${DIAGRAM_FONT_STACK}}`);
  const at = open.index + open[0].length;
  return `${svg.slice(0, at)}<style>${rules.join('')}</style>${svg.slice(at)}`;
}
