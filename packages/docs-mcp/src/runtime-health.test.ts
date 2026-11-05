import { expect, test } from 'bun:test';
import { memoryLine, memoryReport, startMemoryLog } from './runtime-health';

test('memoryReport carries process.memoryUsage() and the JSC heap size in bytes', () => {
  const report = memoryReport();
  for (const key of ['rss', 'heapUsed', 'heapTotal', 'external', 'arrayBuffers'] as const) {
    expect(Number.isFinite(report.memory[key])).toBe(true);
    expect(report.memory[key]).toBeGreaterThanOrEqual(0);
  }
  expect(report.memory.rss).toBeGreaterThan(report.memory.heapUsed);
  expect(report.jscHeapSize).toBeGreaterThan(0);
  expect(JSON.parse(JSON.stringify(report))).toEqual(report);
});

test('memoryLine names every number in MB', () => {
  const MB = 1048576;
  const line = memoryLine({ memory: { rss: 2 * MB, heapUsed: MB, heapTotal: 3 * MB, external: 0, arrayBuffers: 512 }, jscHeapSize: MB });
  expect(line).toBe('[docs-runtime] memory rss 2 MB, JS heap used 1 MB of 3 MB, JSC heap 1 MB, external 0 MB, arrayBuffers 0 MB');
  expect(memoryLine()).toMatch(/^\[docs-runtime\] memory rss \d+ MB, JS heap used \d+ MB of \d+ MB, JSC heap \d+ MB/);
});

test('startMemoryLog logs a line on its interval until stopped', async () => {
  const lines: string[] = [];
  const stop = startMemoryLog(line => lines.push(line), 20);
  await Bun.sleep(90);
  stop();
  const logged = lines.length;
  expect(logged).toBeGreaterThanOrEqual(1);
  expect(lines[0]).toStartWith('[docs-runtime] memory rss ');
  await Bun.sleep(60);
  expect(lines.length).toBe(logged);
});
