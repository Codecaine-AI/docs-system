// Child process for manage-files-move-memory.test.ts: preview and apply one page move in an isolated process and report peak RSS.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { manageFiles } from '../../manage-files';
import { peakRSS } from './peak-rss';

const root = process.argv[2]!;
const input = { kind: 'page' as const, path: 'page', to: 'section/moved', expected_hash: createHash('sha256').update(await readFile(join(root, 'page/doc.json'))).digest('hex') };
const preview = await manageFiles(root, input);
const result = await manageFiles(root, { ...input, preview: false, expected_tree_hash: preview.tree_hash });
const maxRSS = peakRSS();
console.log(JSON.stringify({ result, maxRSS }));
