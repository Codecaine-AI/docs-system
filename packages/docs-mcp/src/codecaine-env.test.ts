import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codecaineEnv, loadCodecaineEnv, parseCodecaineEnv } from './codecaine-env';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

test('parses KEY=value lines and skips comments, blanks, malformed lines, and empty values', () => {
 expect(parseCodecaineEnv('# note\n\nA=1\nexport B = "two words"\nC=\nnot a line\nD=\'x=y\'\n')).toEqual({ A: '1', B: 'two words', D: 'x=y' });
});

test('the process environment wins and a key added later is read without a restart', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'codecaine-env-'));
 const file = join(dir, 'env');
 process.env.CODECAINE_ENV_FILE = file;
 expect(codecaineEnv('CODECAINE_TEST_KEY')).toBeUndefined();
 await writeFile(file, 'CODECAINE_TEST_KEY=from-file\nCODECAINE_TEST_SET=from-file\n');
 expect(codecaineEnv('CODECAINE_TEST_KEY')).toBe('from-file');
 process.env.CODECAINE_TEST_SET = 'from-process';
 expect(loadCodecaineEnv()).toEqual(['CODECAINE_TEST_KEY']);
 expect(process.env.CODECAINE_TEST_SET).toBe('from-process');
 await rm(dir, { recursive: true, force: true });
});
