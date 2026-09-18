import { readFile, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const configPath = process.env.CODECAINE_DOCS_BACKGROUND_CONFIG ?? join(homedir(), '.local/state/codecaine-docs/background.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const current = join(config.stateDirectory, 'background-current.mjs');
const previous = join(config.stateDirectory, 'background-previous.mjs');
let child;
let stopping = false;
process.on('SIGTERM', () => { stopping = true; child?.kill(); });
process.on('SIGINT', () => { stopping = true; child?.kill(); });
while (!stopping) {
  const start = Date.now();
  child = Bun.spawn([process.execPath, current], { cwd: config.sourceRoot, env: { ...process.env, CODECAINE_DOCS_BACKGROUND_CONFIG: configPath }, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;
  if (stopping) break;
  if (code !== 75 && code !== 0 && Date.now() - start < 30000) {
    try { await copyFile(previous, current); console.error('[docs] Restored the previous supervisor after startup failure.'); } catch {}
  }
  if (code !== 75) await Bun.sleep(3000);
}
