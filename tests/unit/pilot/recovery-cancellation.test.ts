import {it,expect} from 'vitest';
import {withRecoveryCancellation,withHostedCatalogCancellation} from '../../../lib/server/operations/recovery-cancellation';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
async function interrupted(signal:'SIGINT'|'SIGTERM'|null,repeated=false){
 const source=`import {withRecoveryCancellation} from './lib/server/operations/recovery-cancellation.ts';
 let cleaned=false;const before=[process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')];
 try{await withRecoveryCancellation(${signal?5000:50},async signal=>{try{console.log('ready');await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}finally{await new Promise(r=>setTimeout(r,100));cleaned=true;}});}catch{console.log(JSON.stringify({cleaned,aborted:true,listenersRestored:JSON.stringify(before)===JSON.stringify([process.listenerCount('SIGINT'),process.listenerCount('SIGTERM')])}));}`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source],{cwd:resolve('.'),env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});let stdout='',sent=false;
 child.stdout.on('data',bytes=>{stdout+=bytes.toString();if(signal&&!sent&&stdout.includes('ready')){sent=true;child.kill(signal);if(repeated)setTimeout(()=>child.kill(signal),20);}});child.stderr.resume();
 const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);try{const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});expect(code).toBe(0);expect(JSON.parse(stdout.trim().split('\n').at(-1)!)).toEqual({cleaned:true,aborted:true,listenersRestored:true});}finally{clearTimeout(timeout);if(child.exitCode===null)child.kill('SIGKILL');}
}
it('settles recovery cleanup on an actual SIGINT',()=>interrupted('SIGINT'));
it('settles recovery cleanup on an actual SIGTERM',()=>interrupted('SIGTERM'));
it('settles recovery cleanup at the bounded deadline',async()=>{await interrupted(null);await expect(withRecoveryCancellation(900001,async()=>true)).rejects.toThrow('Bounded operation');expect(await withHostedCatalogCancellation(7200000,async signal=>!signal.aborted)).toBe(true);await expect(withHostedCatalogCancellation(7200001,async()=>true)).rejects.toThrow('Bounded operation');});

it('keeps cleanup protected across repeated termination signals',()=>interrupted('SIGTERM',true));
