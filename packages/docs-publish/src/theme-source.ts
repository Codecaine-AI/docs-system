import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Bun macro (imported with `{type: 'macro'}`): reads a repo theme folder,
 * plus its `base` chain, at BUILD time so the published package carries the
 * theme as data. Consumers have no docs-system checkout. Each entry is the
 * wire shape `readThemeDefinition` accepts: `{manifest, components}`.
 */
export function readRepoThemeChain(id: string): Array<{id: string; raw: {manifest: unknown; components: Record<string, unknown>}}> {
  const themesRoot = resolve(import.meta.dir, '../../../themes');
  const chain: Array<{id: string; raw: {manifest: unknown; components: Record<string, unknown>}}> = [];
  const seen = new Set<string>();
  for (let current: string | undefined = id; current && !seen.has(current);) {
    seen.add(current);
    const folder = resolve(themesRoot, current);
    const manifestFile = resolve(folder, 'theme.json');
    if (!existsSync(manifestFile)) throw new Error(`Theme folder not found: themes/${current}`);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const components: Record<string, unknown> = {};
    const componentsDir = resolve(folder, 'components');
    if (existsSync(componentsDir)) {
      for (const file of readdirSync(componentsDir).filter(name => name.endsWith('.json')).sort()) {
        components[file.slice(0, -'.json'.length)] = JSON.parse(readFileSync(resolve(componentsDir, file), 'utf8'));
      }
    }
    chain.push({id: current, raw: {manifest, components}});
    current = typeof manifest.base === 'string' ? manifest.base : undefined;
  }
  return chain;
}
