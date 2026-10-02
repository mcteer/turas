import { describe,expect,it } from 'vitest';
import { ExecutionCommandClient } from '../../app/_components/execution/client';
const reply=(key:string)=>Response.json({data:{requestKey:key,state:'committed',executionGeneration:1,changed:[]}});
describe('execution client acknowledgement',()=>{
  it('never repeats an unknown write, reconciles the same identity, and preserves edits after submission',async()=>{
    const calls:Array<{url:string;init?:RequestInit}>=[];let key='',confirmed=0,dirtyGeneration=1,submittedGeneration=1;
    const client=new ExecutionCommandClient('csrf',async(url,init)=>{calls.push({url,init});if(init?.method==='POST'){key=JSON.parse(String(init.body)).requestKey;throw new Error('Lost response');}return reply(key);},()=>{confirmed++;});
    expect(await client.save('/commands',{action:'record.create'},()=>{if(dirtyGeneration===submittedGeneration)dirtyGeneration=0;})).toBe(false);
    expect(client.snapshot.uncertainKey).toBe(key);dirtyGeneration=2;
    expect(await client.save('/commands',{action:'record.create'})).toBe(false);
    expect(await client.reconcile()).toBe(true);expect(dirtyGeneration).toBe(2);expect(confirmed).toBe(1);
    expect(calls.filter(c=>c.init?.method==='POST')).toHaveLength(1);expect(calls[1].url).toBe(`/api/execution/receipts/${key}`);
  });
  it('refuses mismatched receipts and clears stale callbacks after authority denial',async()=>{
    let release:(response:Response)=>void=()=>{},confirmed=0,cleared=0;
    const client=new ExecutionCommandClient('csrf',()=>new Promise(resolve=>{release=resolve;}),()=>{confirmed++;},()=>{cleared++;});
    const pending=client.save('/commands',{});client.clearAuthority();release(reply('other-key'));await pending;
    expect(confirmed).toBe(0);expect(cleared).toBe(1);expect(client.snapshot.denied).toBe(true);
    const mismatch=new ExecutionCommandClient('csrf',async()=>reply('wrong-key'),()=>{confirmed++;});
    expect(await mismatch.save('/commands',{})).toBe(false);expect(mismatch.snapshot.uncertainKey).not.toBeNull();expect(confirmed).toBe(0);
  });
  it('uses different keys for distinct actions after confirmed saves',async()=>{
    const keys:string[]=[];
    const client=new ExecutionCommandClient('csrf',async(_url,init)=>{const key=JSON.parse(String(init?.body)).requestKey;keys.push(key);return reply(key);},()=>{});
    expect(await client.save('/commands',{action:'setup'})).toBe(true);expect(await client.save('/commands',{action:'record.create'})).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });
});

it('updates CSRF after initial session loading before sending a command',async()=>{
  let token='';const client=new ExecutionCommandClient('',async(_url,init)=>{token=new Headers(init?.headers).get('x-csrf-token')??'';return reply(JSON.parse(String(init?.body)).requestKey);},()=>{});
  client.setCsrf('current-session-csrf');expect(await client.save('/commands',{})).toBe(true);expect(token).toBe('current-session-csrf');
});
