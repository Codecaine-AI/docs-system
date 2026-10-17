import { expect, test } from 'bun:test';
import { closeSync, openSync, writeSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backoffMs, canActivate, createBackoff, createLogOnce, createStateLog, rotateLog } from '../background/activation-policy';

test('backoff doubles from 1 s and caps at 60 s', () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
});

test('backoff is due only after the delay, and reset makes it due at once', () => {
  let now = 0;
  const backoff = createBackoff(() => now);
  expect(backoff.due()).toBe(true);
  backoff.refuse();
  now = 999; expect(backoff.due()).toBe(false);
  now = 1000; expect(backoff.due()).toBe(true);
  backoff.refuse();
  now = 2999; expect(backoff.due()).toBe(false);
  now = 3000; expect(backoff.due()).toBe(true);
  backoff.reset();
  backoff.refuse();
  now = 4000; expect(backoff.due()).toBe(true);
});

test('activation needs zero tasks and zero drafts', () => {
  expect(canActivate({ tasks: 0, drafts: 0 })).toBe(true);
  expect(canActivate({})).toBe(true);
  expect(canActivate({ tasks: 0, drafts: 1 })).toBe(false);
  expect(canActivate({ tasks: 1, drafts: 0 })).toBe(false);
});

test('log-once logs a miss once and a recovery once', () => {
  const logs: string[] = [];
  const once = createLogOnce(m => logs.push(m));
  once.hit('a', 'back');
  once.miss('a', 'gone'); once.miss('a', 'gone');
  once.hit('a', 'back'); once.hit('a', 'back');
  once.miss('a', 'gone');
  expect(logs).toEqual(['gone', 'back', 'gone']);
});

test('state log reports only changes, and again after reset', () => {
  const logs: string[] = [];
  const state = createStateLog(m => logs.push(m));
  state.report('2 tasks'); state.report('2 tasks'); state.report('1 task'); state.reset(); state.report('1 task');
  expect(logs).toEqual(['2 tasks', '1 task', '1 task']);
});

test('rotateLog keeps the old bytes in .1 and the open append writer continues at offset 0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'docs-log-rotate-'));
  const path = join(dir, 'background.log');
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, 'old line one\nold line two\n');
    expect(await rotateLog(path, 1000)).toBe(false);
    expect(await rotateLog(path, 10)).toBe(true);
    expect(await readFile(`${path}.1`, 'utf8')).toBe('old line one\nold line two\n');
    expect(await readFile(path, 'utf8')).toBe('');
    writeSync(fd, 'new\n');
    expect(await readFile(path, 'utf8')).toBe('new\n');
  } finally { closeSync(fd); await rm(dir, { recursive: true, force: true }); }
});

test('rotateLog overwrites an existing .1 and ignores a missing log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'docs-log-rotate-'));
  const path = join(dir, 'background.log');
  try {
    expect(await rotateLog(path, 10)).toBe(false);
    await writeFile(`${path}.1`, 'stale');
    await writeFile(path, 'x'.repeat(20));
    expect(await rotateLog(path, 10)).toBe(true);
    expect(await readFile(`${path}.1`, 'utf8')).toBe('x'.repeat(20));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
