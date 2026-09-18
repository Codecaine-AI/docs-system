#!/usr/bin/env python3
"""Build and install the consistently signed, local Docs background service."""
import argparse
import datetime
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
SOURCES = ROOT / 'packages/docs-mcp/src/background'
APP = Path('/Applications/Codecaine Docs.app')
LABEL = 'ai.codecaine.docs'
STATE = Path.home() / '.local/state/codecaine-docs'
SIGNING = Path.home() / '.config/codecaine-docs/signing.json'
PLIST = Path.home() / 'Library/LaunchAgents/ai.codecaine.docs.plist'

def run(*args, **kw):
    return subprocess.run([str(x) for x in args], check=True, **kw)

def json_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)

def request(url, token=None, body=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=3) as response: return json.load(response)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4820)
    parser.add_argument('--workspace', type=Path, default=ROOT.parent)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535: raise SystemExit('Invalid port')
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True)
    signing_source = SIGNING if SIGNING.exists() else Path.home() / '.config/sotto/signing.json'
    if not signing_source.exists(): raise SystemExit('A persistent local signing certificate is required. Configure codecaine-docs/signing.json first.')
    signing = json.loads(signing_source.read_text())
    identity, keychain = signing['identity'], signing['keychain']
    if not re.fullmatch('[0-9a-fA-F]{40}', identity): raise SystemExit('Invalid signing identity')
    bun = shutil.which('bun')
    if not bun: raise SystemExit('Bun is required')
    node = shutil.which('node')
    if not node: raise SystemExit('Node is required for Vite')
    old = json.loads((STATE / 'daemon.json').read_text()) if (STATE / 'daemon.json').exists() else None
    old_health = None
    if old:
        try: old_health = request(old['url'] + '/health', old['token'])
        except Exception: pass
    with socket.socket() as probe:
        busy_port = probe.connect_ex(('127.0.0.1', args.port)) == 0
    if busy_port and not (old_health and old_health.get('central') and old_health.get('port') == args.port):
        raise SystemExit(f'Port {args.port} is occupied by another service; no changes made.')
    if old_health and (old_health.get('tasks', 0) or old_health.get('drafts', 0)): raise SystemExit('Finish active Docs authoring tasks before installation.')
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    backup = STATE / 'install-backups' / stamp
    backup.mkdir(parents=True)
    config = {'sourceRoot': str(ROOT), 'workspace': str(args.workspace.resolve()), 'port': args.port, 'stateDirectory': str(STATE)}
    # Keep the prior authenticated MCP endpoint during the one-time migration.
    if old_health and not old_health.get('central'):
        from urllib.parse import urlparse
        config['legacyPort'] = urlparse(old['url']).port
    elif (STATE / 'background.json').exists():
        previous_config = json.loads((STATE / 'background.json').read_text())
        if previous_config.get('legacyPort'): config['legacyPort'] = previous_config['legacyPort']
    for path in [PLIST, STATE / 'background.json', STATE / 'daemon.json', STATE / 'background-current.mjs']:
        if path.exists(): shutil.copy2(path, backup / path.name)
    with tempfile.TemporaryDirectory(prefix='.codecaine-docs-', dir='/Applications') as staging:
        staged = Path(staging) / APP.name
        macos = staged / 'Contents/MacOS'; resources = staged / 'Contents/Resources'
        macos.mkdir(parents=True); resources.mkdir()
        shutil.copy2(Path(bun).resolve(), macos / 'bun')
        shutil.copy2(Path(node).resolve(), macos / 'node')
        shutil.copy2(SOURCES / 'bootstrap.mjs', resources / 'bootstrap.mjs')
        run('clang', '-O2', SOURCES / 'launcher.c', '-o', macos / 'CodecaineDocs')
        version = json.loads((ROOT / 'packages/docs-mcp/package.json').read_text())['version']
        info = {'CFBundleIdentifier': LABEL, 'CFBundleName': 'Codecaine Docs', 'CFBundleDisplayName': 'Codecaine Docs', 'CFBundleExecutable': 'CodecaineDocs', 'CFBundlePackageType': 'APPL', 'CFBundleShortVersionString': version, 'CFBundleVersion': version, 'LSUIElement': True, 'NSHighResolutionCapable': True}
        (staged / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
        for target, identifier in [(macos / 'bun', LABEL + '.runtime'), (macos / 'node', LABEL + '.viewer'), (staged, LABEL)]:
            requirement = f'=designated => identifier "{identifier}" and certificate leaf = H"{identity}"'
            cmd = ['codesign', '--force', '--sign', identity, '--keychain', keychain, '--identifier', identifier, '--requirements', requirement, '--options', 'runtime']
            if target in [macos / 'bun', macos / 'node']: cmd.extend(['--entitlements', str(SOURCES / 'runtime.entitlements.plist')])
            run(*cmd, target)
        run('codesign', '--verify', '--deep', '--strict', staged)
        run(macos / 'bun', '-e', 'console.log("Signed Docs runtime verified")')
        run(macos / 'node', '-e', 'console.log("Signed Docs viewer runtime verified")')
        candidate = STATE / 'background-candidate.mjs'
        run(bun, 'build', '--target=bun', '--format=esm', SOURCES / 'supervisor.ts', '--outfile', candidate, cwd=ROOT)
        if APP.exists():
            current_id = plistlib.loads((APP / 'Contents/Info.plist').read_bytes())['CFBundleIdentifier']
            if current_id != LABEL: raise SystemExit('A different app occupies the install path.')
            run('codesign', '--verify', '--strict', '-R', f'=identifier "{LABEL}" and certificate leaf = H"{identity}"', APP)
        # Everything is built and verified before replacing the running installation.
        try:
            subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}/{LABEL}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if old_health and not old_health.get('central'):
                request(old['url'] + '/shutdown', old['token'], {})
                for _ in range(50):
                    try: request(old['url'] + '/health', old['token']); time.sleep(.1)
                    except Exception: break
            if old_health and old_health.get('central'):
                for _ in range(100):
                    try: os.kill(old_health['pid'], 0); time.sleep(.1)
                    except ProcessLookupError: break
                else: raise RuntimeError('Previous Docs supervisor did not stop.')
            if APP.exists(): APP.rename(backup / APP.name)
            shutil.move(staged, APP)
            if (STATE / 'background-current.mjs').exists(): shutil.copy2(STATE / 'background-current.mjs', STATE / 'background-previous.mjs')
            candidate.replace(STATE / 'background-current.mjs')
            json_write(STATE / 'background.json', config)
            json_write(SIGNING, {'identity': identity, 'keychain': keychain})
            if old and not (STATE / 'service-token').exists():
                (STATE / 'service-token').write_text(old['token']); (STATE / 'service-token').chmod(0o600)
            job = {'Label': LABEL, 'ProgramArguments': [str(APP / 'Contents/MacOS/CodecaineDocs')], 'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 10, 'ProcessType': 'Interactive', 'WorkingDirectory': str(ROOT), 'EnvironmentVariables': {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'CODECAINE_DOCS_BACKGROUND_CONFIG': str(STATE / 'background.json')}, 'StandardOutPath': str(STATE / 'background.log'), 'StandardErrorPath': str(STATE / 'background.log'), 'Umask': 63}
            PLIST.parent.mkdir(parents=True, exist_ok=True); PLIST.write_bytes(plistlib.dumps(job)); PLIST.chmod(0o600)
            launched = subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(PLIST)], capture_output=True, text=True)
            if launched.returncode:
                existing = subprocess.run(['launchctl', 'print', f'gui/{os.getuid()}/{LABEL}'], capture_output=True, text=True)
                if existing.returncode or str(APP / 'Contents/MacOS/CodecaineDocs') not in existing.stdout:
                    raise SystemExit('Could not register Docs with launchd: ' + launched.stderr)
            for _ in range(120):
                try:
                    health = request(f'http://127.0.0.1:{args.port}/api/status')
                    if health.get('ready') and health.get('central'):
                        print(json.dumps({'installed': str(APP), 'url': f'http://localhost:{args.port}', 'version': version, 'backup': str(backup), 'build': health['build']}))
                        return
                except Exception: pass
                time.sleep(.5)
            raise SystemExit(f'Installation did not become ready. Inspect {STATE / "background.log"}. Backup: {backup}')
        except BaseException:
            # Restore the signed installation and its configuration, retaining failed files.
            subprocess.run(['launchctl', 'bootout', f'gui/{os.getuid()}/{LABEL}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if (backup / APP.name).exists():
                if APP.exists(): APP.rename(backup / 'Failed Codecaine Docs.app')
                shutil.move(backup / APP.name, APP)
            for path in [PLIST, STATE / 'background.json', STATE / 'daemon.json', STATE / 'background-current.mjs']:
                saved = backup / path.name
                if saved.exists(): shutil.copy2(saved, path)
                elif path.exists(): path.rename(backup / ('failed-' + path.name))
            if PLIST.exists():
                subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(PLIST)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            raise

if __name__ == '__main__': main()
