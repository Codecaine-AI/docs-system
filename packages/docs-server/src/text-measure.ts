import { activeBackend, useHarfBuzz } from "@codecaine-ai/text-measure/headless";

/** Loads tried before the host settles on the approximate table backend for the rest of the process. */
export const TEXT_MEASURE_LOAD_ATTEMPTS = 3;

let loading: Promise<void> | undefined;
let attempts = 0;

/**
 * Loads @codecaine-ai/text-measure's exact HarfBuzz backend once per
 * process, so layout lints (docs-model layout/*) measure text the way the
 * browser paints it. createDocsRoutes starts the load, and every save-time
 * lint awaits it, so a host that embeds the routes (the workbench server,
 * the docs MCP service) needs no setup of its own.
 *
 * A failed load logs one warning and leaves the approximate table backend in
 * place: lints still run, and layout findings say "approximate". The next
 * call tries again, up to TEXT_MEASURE_LOAD_ATTEMPTS loads in all, so a
 * transient failure (a font file read while it was being replaced) does not
 * keep the process approximate for good.
 */
export function textMeasureReady(): Promise<void> {
  if (loading) return loading;
  if (attempts >= TEXT_MEASURE_LOAD_ATTEMPTS) return Promise.resolve();
  attempts += 1;
  const attempt = attempts;
  loading = useHarfBuzz().catch((error: unknown) => {
    const retry = attempt < TEXT_MEASURE_LOAD_ATTEMPTS ? "the next lint retries" : "no more retries";
    console.error(
      `text-measure: HarfBuzz did not load (attempt ${attempt} of ${TEXT_MEASURE_LOAD_ATTEMPTS}, ${retry}), so layout lints stay approximate: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    loading = undefined;
  });
  return loading;
}

/** The backend layout lints measure with right now, for health and audit output. */
export function textMeasureBackend(): { name: string; exact: boolean } {
  return activeBackend();
}
