import { useBrowserFonts } from '@codecaine-ai/text-measure/browser';

let load: Promise<unknown> | null = null;

/**
 * Loads the measured faces (Inter, IBM Plex Mono) for the viewers and the
 * editor and switches text measurement to the browser's own widths. Faces the
 * page declares (dist/fonts.css) load through it; any other face loads from
 * dist/fonts/ next to this bundle (dist/browser/). The Canvas and Sequence
 * embeds re-lay out when the measuring backend changes. Loads once; a failure
 * keeps the approximate widths and lets a later call retry.
 */
export function loadPublishedFonts(): Promise<unknown> {
  load ??= useBrowserFonts({fontUrl: file => new URL(`../fonts/${file}.woff2`, import.meta.url).href}).then(result => {
    if (result.reason) load = null;
    return result;
  });
  return load;
}
