/// <reference types="vite/client" />
/**
 * The faces docs surfaces paint and measure with: Inter 3.19 (prose, tables,
 * tree notes, diagrams) and IBM Plex Mono 2.5 (code). The entry stylesheet
 * (index.css) imports @codecaine-ai/design-system's fonts.css, which declares
 * every face; its woff2 files are byte-identical to @codecaine-ai/text-measure's
 * bundled builds. `loadDocsFonts()` loads those declared faces and switches
 * text measurement from the approximate table backend to the browser's own
 * canvas, so widths measured in JS match what the page paints.
 * Layouts that measure text re-run when `useTextMeasureRevision()` changes.
 */
import { useSyncExternalStore } from "react";
import {
  onBackendChange,
  useBrowserFonts as loadBundledFonts,
  type BrowserFontsResult,
} from "@codecaine-ai/text-measure/browser";

let fontsLoad: Promise<BrowserFontsResult> | null = null;

const hasFontLoadingApi = () => typeof document !== "undefined" && "fonts" in document && typeof FontFace !== "undefined";

/**
 * Loads the bundled faces once; later calls share the same promise. Resolves
 * with the active backend, plus a `reason` when the faces cannot be used (the
 * table backend then stays active and a later call retries).
 */
export function loadDocsFonts(): Promise<BrowserFontsResult> {
  fontsLoad ??= loadBundledFonts().then((result) => {
    if (result.reason) {
      fontsLoad = null;
      // Without a font loading API (tests, server rendering) there is nothing to warn about.
      if (hasFontLoadingApi()) console.warn(`[docs] text measurement stays on the ${result.backend} backend: ${result.reason}`);
    } else if (import.meta.env?.DEV) {
      console.info(`[docs] text measurement: ${result.backend} backend (bundled Inter and IBM Plex Mono loaded)`);
    }
    return result;
  });
  return fontsLoad;
}

let revision = 0;
// Registered at import, before any component subscribes, so the revision has
// moved by the time subscribers read it.
onBackendChange(() => {
  revision += 1;
});
const subscribe = (notify: () => void) => onBackendChange(notify);
const readRevision = () => revision;

/**
 * Counts text-measure backend switches. Widths change when the bundled fonts
 * arrive, so a layout that measures text depends on this value.
 */
export function useTextMeasureRevision(): number {
  return useSyncExternalStore(subscribe, readRevision, readRevision);
}
