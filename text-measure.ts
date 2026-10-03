/**
 * bun test preload: switches @codecaine-ai/text-measure to its exact
 * HarfBuzz backend before any test lints or lays out text, so layout lints
 * measure in tests the way the docs MCP, CLI and server measure in
 * production (each host calls useHarfBuzz() at startup).
 */
import { useHarfBuzz } from "@codecaine-ai/text-measure/headless";

await useHarfBuzz();
