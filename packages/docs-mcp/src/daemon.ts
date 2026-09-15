import { randomBytes } from 'node:crypto';
import { createInteractionService } from './service';
import { PACKAGE_ROOT, writeDaemonState, implementationFingerprint, stateDirectory } from './lifecycle';
import { join } from 'node:path';
import { unlink, mkdir, open, readFile } from 'node:fs/promises';

export async function runDaemon(){
 await mkdir(stateDirectory(),{recursive:true,mode:0o700});
 const lockPath=join(stateDirectory(),'daemon.lock');
 let lock: Awaited<ReturnType<typeof open>>;
 try{lock=await open(lockPath,'wx',0o600);}catch(error:any){
  if(error.code!=='EEXIST')throw error;
  const owner=Number(await readFile(lockPath,'utf8').catch(()=>''));
  if(!owner)throw new Error('Docs service is starting; retry shortly.');
  let live=true;try{process.kill(owner,0);}catch(e:any){if(e.code==='ESRCH')live=false;}
  if(live)throw new Error('A Docs service already owns this state directory. Use start or mcp to connect.');
  await unlink(lockPath);lock=await open(lockPath,'wx',0o600);
 }
 await lock.writeFile(String(process.pid));
 const service=createInteractionService();const token=randomBytes(32).toString('hex');const fingerprint=await implementationFingerprint();
 const startedAt=new Date().toISOString();
 const server=Bun.serve({hostname:'127.0.0.1',port:0,idleTimeout:120,async fetch(request){
  const url=new URL(request.url);
  if(url.hostname!=='127.0.0.1' || (request.headers.get('origin') && request.headers.get('origin')!==url.origin))return new Response('Forbidden origin',{status:403});
  if(request.headers.get('authorization')!==`Bearer ${token}`)return new Response('Unauthorized',{status:401});
  try{
   if(url.pathname==='/health')return Response.json({service:'codecaine-docs',pid:process.pid,startedAt,packageRoot:PACKAGE_ROOT,fingerprint,...service.stats()});
   if(url.pathname==='/shutdown'&&request.method==='POST'){setTimeout(()=>{void shutdown();},100);return Response.json({stopped:true});}
   if(url.pathname==='/tools')return Response.json({tools:service.listTools()});
   if(url.pathname==='/rpc'&&request.method==='POST'){
    const body=await request.json() as any;if(typeof body.workspace!=='string'||typeof body.name!=='string')return Response.json({error:'workspace and name required'},{status:400});
    return Response.json(await service.call(body.workspace,body.name,body.arguments??{}));
   }
   const match=url.pathname.match(/^\/projects\/([^/]+)\/api(?:\/|$)/);
   if(match)return service.uiRequest(match[1]!,request);
   return new Response('Not found',{status:404});
  }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:500});}
 }});
 await writeDaemonState({url:`http://127.0.0.1:${server.port}`,token,pid:process.pid,packageRoot:PACKAGE_ROOT,startedAt});
 console.error(`Codecaine Docs service listening at http://127.0.0.1:${server.port}`);
 async function shutdown(){server.stop(true);await unlink(join(stateDirectory(),'daemon.json')).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});process.exit(0);}
 process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
 return server;
}
