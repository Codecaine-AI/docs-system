import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Bun macro (imported with `{type: 'macro'}`): reads the woff2 faces that
 * @codecaine-ai/text-measure bundles at BUILD time, as base64 keyed by file
 * stem ("Inter-SemiBold"), so the published package can embed them in
 * diagram SVGs without a docs-system checkout.
 */
export function readBundledWoff2(): Record<string, string> {
  const fontsDir = resolve(dirname(Bun.resolveSync('@codecaine-ai/text-measure/fonts.css', import.meta.dir)), 'fonts');
  const files = ['Inter-Regular', 'Inter-Medium', 'Inter-SemiBold', 'Inter-Bold', 'IBMPlexMono-Regular', 'IBMPlexMono-Medium', 'IBMPlexMono-SemiBold'];
  return Object.fromEntries(files.map(file => [file, readFileSync(resolve(fontsDir, `${file}.woff2`)).toString('base64')]));
}
