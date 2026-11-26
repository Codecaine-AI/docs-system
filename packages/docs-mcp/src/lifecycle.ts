import { mkdir, readFile, writeFile, chmod, open, unlink, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { remoteSettings } from './remote';

export const PACKAGE_ROOT = process.env.CODECAINE_DOCS_PACKAGE_ROOT ?? resolve(import.meta.dir, '..');
export const CLI_PATH = join(PACKAGE_ROOT, 'src/cli.ts');
export const stateDirectory = () => process.env.CODECAINE_DOCS_STATE_DIR || join(homedir(), '.local', 'state', 'codecaine-docs');
export interface DaemonState { url: string; token: string; pid: number; packageRoot: string; startedAt: string; remote?: true }
/** The remote docs server of CODECAINE_DOCS_REMOTE_URL as a daemon state, or null when remote mode is off. */
export function remoteState(): DaemonState | null {
 const settings = remoteSettings(); if (!settings) return null;
 return { url: settings.url, token: settings.token ?? '', pid: 0, packageRoot: '', startedAt: '', remote: true };
}
const authorization = (state: DaemonState): Record<string, string> => state.token ? { Authorization: `Bearer ${state.token}` } : {};
/** Remote mode checks /health of the remote server only. It never starts, restarts or kicks a local daemon, so an outage is a tool error. */
export async function ensureRemote(state: DaemonState): Promise<DaemonState> {
 let detail: string;
 try {
  const response = await Bun.fetch(new URL('/health', state.url), { headers: authorization(state), signal: AbortSignal.timeout(5000) });
  const body = await response.json().catch(() => ({})) as any;
  if (response.ok && body.service === 'codecaine-docs') return state;
  detail = `status ${response.status}`;
 } catch (error) { detail = error instanceof Error ? error.message : String(error); }
 throw new Error(`The remote docs server at ${state.url} is not available (${detail}). Remote mode starts no local docs server; retry when the server is back.`);
}
export async function readDaemonState(): Promise<DaemonState | null> {
 try { return JSON.parse(await readFile(join(stateDirectory(), 'daemon.json'), 'utf8')); } catch { return null; }
}
export async function writeDaemonState(state: DaemonState) {
 await mkdir(stateDirectory(),{recursive:true,mode:0o700});
 await writeFile(join(stateDirectory(),'daemon.json'),JSON.stringify(state,null,2)+'\n',{mode:0o600});
 await chmod(join(stateDirectory(),'daemon.json'),0o600);
}
export async function daemonFetch(state: DaemonState, pathname: string, body?: unknown) {
 if (!state.remote) {
  const current = await readDaemonState();
  if (current && current.packageRoot === state.packageRoot) state = current;
  const url = new URL(state.url);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') throw new Error('Invalid local service address');
 }
 return Bun.fetch(new URL(pathname,state.url), {method:body===undefined?'GET':'POST',headers:{...authorization(state),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
export async function daemonHealthy(state: DaemonState|null): Promise<boolean> {
 if(!state) return false;
 try { const response=await Bun.fetch(`${state.url}/health`,{headers:{Authorization:`Bearer ${state.token}`},signal:AbortSignal.timeout(1000)}); const body=await response.json() as any; return response.ok && body.service==='codecaine-docs' && body.pid===state.pid; } catch {return false;}
}
export async function ensureDaemon(): Promise<DaemonState> {
 // Remote mode with no remote project list sends every call to the remote server, so no caller may start a local daemon.
 const remote=remoteState();if(remote&&!remoteSettings()!.projects.length)return ensureRemote(remote);
 let state=await readDaemonState(); if(await daemonHealthy(state)) {
  if(state!.packageRoot!==PACKAGE_ROOT) throw new Error('Another Docs System checkout owns the service. Run its stop command before switching installations.');
  return state!;
 }
 if(process.platform === 'darwin' && await Bun.file(join(stateDirectory(), 'background.json')).exists()) {
  const job = `gui/${process.getuid!()}/ai.codecaine.docs`;
  const kick = Bun.spawn(['launchctl', 'kickstart', job], {stdout:'ignore',stderr:'ignore'});
  if(await kick.exited !== 0) {
   const start = Bun.spawn(['launchctl','bootstrap',`gui/${process.getuid!()}`,join(homedir(),'Library/LaunchAgents/ai.codecaine.docs.plist')],{stdout:'ignore',stderr:'ignore'});
   if(await start.exited !== 0) throw new Error('The installed Docs background service could not start. Inspect its background.log.');
  }
  for(let i=0;i<100;i++){await Bun.sleep(100);state=await readDaemonState();if(await daemonHealthy(state))return state!;}
  throw new Error('Docs background service is starting. Inspect its background.log if it does not become ready.');
 }
 await mkdir(stateDirectory(),{recursive:true,mode:0o700});
 const lock=join(stateDirectory(),'startup.lock');
 for(let attempt=0;attempt<100;attempt++) {
  let handle;
  try {handle=await open(lock,'wx',0o600);} catch(e:any) {
   if(e.code!=='EEXIST')throw e;
   state=await readDaemonState();if(await daemonHealthy(state)){if(state!.packageRoot!==PACKAGE_ROOT)throw new Error('Another checkout owns the Docs service. Stop it before switching.');return state!;}
   const age=Date.now()-(await stat(lock).catch(()=>({mtimeMs:Date.now()}))).mtimeMs;
   if(age>30000){await unlink(lock).catch(()=>{});}
   await Bun.sleep(100); continue;
  }
  try {
   state=await readDaemonState();if(await daemonHealthy(state)){if(state!.packageRoot!==PACKAGE_ROOT)throw new Error('Another checkout owns the Docs service. Stop it before switching.');return state!;}
   const log=await open(join(stateDirectory(),'service.log'),'a',0o600);
   const child=spawn(process.execPath,[CLI_PATH,'daemon'],{cwd:PACKAGE_ROOT,detached:true,stdio:['ignore',log.fd,log.fd],env:process.env});child.unref();await log.close();
   for(let n=0;n<100;n++){await Bun.sleep(100);state=await readDaemonState();if(await daemonHealthy(state)){if(state!.packageRoot!==PACKAGE_ROOT)throw new Error('Another checkout owns the Docs service. Stop it before switching.');return state!;}}
   throw new Error(`Docs service did not start. Inspect ${join(stateDirectory(),'service.log')}`);
  } finally {await handle.close();await unlink(lock).catch(()=>{});}
 }
 throw new Error('Timed out waiting for Docs service startup');
}
/** The server of one route: the remote server (health-checked, never started) or the local daemon. */
export async function routeState(remote: boolean): Promise<DaemonState> {
 return remote ? ensureRemote(remoteState()!) : ensureDaemon();
}
export async function stopDaemon() {
 const state=await readDaemonState();if(!await daemonHealthy(state))return {stopped:false,reason:'not running'};
 const response=await daemonFetch(state!,'/shutdown',{});return response.json();
}
export async function implementationFingerprint() {
 const {runtimeHash}=await import('./snapshot');return runtimeHash();
}
