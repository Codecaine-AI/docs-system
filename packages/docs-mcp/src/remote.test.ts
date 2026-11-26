import { expect, test } from 'bun:test';
import { clientReply, endpoint, mapPath, remoteSettings, routeCall } from './remote';

const settings = (env: Record<string, string>) => remoteSettings({ CODECAINE_DOCS_REMOTE_URL: 'https://docs.example.test', ...env })!;

test('the path map takes the longest matching prefix and keeps the rest of the path', () => {
  const map = settings({ CODECAINE_DOCS_REMOTE_PATH_MAP: '/home/u/kb=/srv/kb:/home/u/kb/media=/srv/media' });
  expect(mapPath(map, '/home/u/kb/pages/a')).toBe('/srv/kb/pages/a');
  expect(mapPath(map, '/home/u/kb/media/clip.mp4')).toBe('/srv/media/clip.mp4');
  expect(mapPath(map, '/home/u/kb')).toBe('/srv/kb');
});

test('a sibling prefix, a path outside every prefix and a trailing slash map as expected', () => {
  const map = settings({ CODECAINE_DOCS_REMOTE_PATH_MAP: '/a=/remote/a/' });
  expect(mapPath(map, '/a-2/page')).toBeUndefined();
  expect(mapPath(map, '/b')).toBeUndefined();
  expect(mapPath(map, '/a/')).toBe('/remote/a');
  expect(mapPath(map, '/a/..notes')).toBe('/remote/a/..notes');
  expect(mapPath(settings({ CODECAINE_DOCS_REMOTE_PATH_MAP: '/a=/' }), '/a/x')).toBe('/x');
});

test('hybrid routing: a listed project goes remote, another project stays local on the local workspace, and a named workspace is resolved', () => {
  const hybrid = settings({ CODECAINE_DOCS_REMOTE_PATH_MAP: '/home/u/kb=/srv/kb', CODECAINE_DOCS_REMOTE_WORKSPACE: '/srv/kb', CODECAINE_DOCS_REMOTE_PROJECTS: 'kb-1' });
  expect(routeCall(hybrid, '/home/u/repo', { project: 'kb-1' })).toEqual({ remote: true, workspace: '/srv/kb' });
  expect(routeCall(hybrid, '/home/u/kb', { project: 'code-2' }, { localWorkspace: '/home/u/repo' })).toEqual({ remote: false, workspace: '/home/u/repo' });
  expect(routeCall(hybrid, '/home/u/repo', {})).toEqual({ remote: false, workspace: '/home/u/repo' });
  expect(routeCall(hybrid, '/home/u/repo', { workspace: '/home/u/kb/../kb/x' })).toEqual({ remote: true, workspace: '/srv/kb/x' });
  const task = { remote: true, workspace: '/srv/kb' };
  expect(routeCall(hybrid, '/home/u/repo', { task_id: 't' }, { known: task })).toBe(task);
});

test('an endpoint keeps the base path of the remote URL', () => {
  expect(endpoint('https://host.test/docs', '/rpc').href).toBe('https://host.test/docs/rpc');
  expect(endpoint('https://host.test/docs/', '/health').href).toBe('https://host.test/docs/health');
  expect(endpoint('https://host.test', '/tools').href).toBe('https://host.test/tools');
});

test('a remote reply drops the server file path and keeps its image, and a local reply keeps both', () => {
  const data = { ok: true, svg_path: '/srv/tmp/flow.svg', program: 'seq' };
  const reply = { content: [{ type: 'text', text: JSON.stringify(data) }, { type: 'image', data: 'iVBORw0K', mimeType: 'image/png' }], structuredContent: data };
  const remote = clientReply(reply, { remote: true, workspace: '/srv/kb' });
  expect(remote.structuredContent).toEqual({ ok: true, program: 'seq' });
  expect(remote.content).toEqual([{ type: 'text', text: JSON.stringify({ ok: true, program: 'seq' }) }, reply.content[1]!]);
  expect(clientReply(reply, { remote: false, workspace: '/home/u/kb' })).toBe(reply);
});
