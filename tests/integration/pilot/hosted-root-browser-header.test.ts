import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,rm,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
let evidenceDirectory:string;
beforeEach(async()=>{await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});evidenceDirectory=await mkdtemp(resolve('local-artifacts/016/root-browser-header-'));});

const browserFixture=vi.hoisted(()=>({page:undefined as unknown}));
vi.mock('@playwright/test',()=>({webkit:{launch:async()=>({newContext:async()=>({close:async()=>{},addCookies:async()=>{},newPage:async()=>browserFixture.page}),close:async()=>{}})},expect:vi.fn()}));
vi.mock('../../../lib/server/conversations/hosted-root-budget',()=>({hostedRootBudgetSchema:{parse:(value:unknown)=>value}}));
vi.mock('../../../lib/server/conversations/native-retirement-recovery',()=>({terminalNativeRetirementReceipt:vi.fn()}));
vi.mock('../../../scripts/pilot-hosted-http',()=>({boundedHostedJson:vi.fn()}));
vi.mock('../../../scripts/pilot-hosted-root-reconcile',()=>({reconcileHostedRootGeneration:vi.fn()}));
import {boundedHostedJson} from '../../../scripts/pilot-hosted-http';
import {terminalNativeRetirementReceipt} from '../../../lib/server/conversations/native-retirement-recovery';
import {runHostedRootBrowser} from '../../../scripts/pilot-hosted-root-browser';

afterEach(async()=>{vi.unstubAllGlobals();await rm(evidenceDirectory,{recursive:true,force:true});});
it('sends the owned conversation header to native creation without mutating caller authentication',async()=>{
 const id=randomUUID(),owner=randomUUID(),operation=randomUUID();let archived=false;
 const headers=new Headers({'content-type':'application/json',origin:'https://synthetic.example',cookie:'__Host-turas_session='+'a'.repeat(43),'x-csrf-token':'synthetic-csrf','x-vercel-protection-bypass':'synthetic-bypass','x-turas-conversation-id':randomUUID()});
 const original=[...headers];const requests:Request[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{requests.push(new Request(url,init));if(init.method==='PATCH'){archived=true;return new Response('{}');}return new Response('{}',{status:422});});
 const db={query:async(sql:string)=>sql.includes('FROM conversations')?{rows:[{id,owner_principal_id:owner,creation_operation_id:operation,eve_session_id:null,binding_state:'unbound',archived_at:archived?new Date():null}]}:{rows:[],rowCount:0}};
 const scope={sourceCommit:'synthetic',target:'preview',projectId:'synthetic',workspaceId:randomUUID(),environmentMarker:'synthetic',origin:'https://synthetic.example'};
 await expect(runHostedRootBrowser({scope:scope as never,db:db as never,ownerDb:db as never,headers,binding:{...scope,ownerPrincipalId:owner,conversationIds:[id]},conversationId:id,signal:new AbortController().signal,mobile:false,evidenceDirectory})).rejects.toThrow('Native root command failed');
 const create=requests[0];expect(new URL(create.url).pathname).toBe('/eve/v1/session');expect(create.method).toBe('POST');
 expect(create.headers.get('x-turas-conversation-id')).toBe(id);expect(await create.json()).toEqual({operationId:operation});
 for(const name of ['cookie','x-csrf-token','origin','content-type','x-vercel-protection-bypass'])expect(create.headers.get(name)).toBe(headers.get(name));
 expect([...headers]).toEqual(original);expect(requests).toHaveLength(2);expect(archived).toBe(true);
 const files=await readdir(evidenceDirectory);expect(files).toHaveLength(1);const trace=JSON.parse(await readFile(join(evidenceDirectory,files[0]),'utf8'));expect(trace).toMatchObject({transportProofOnly:true,responseBodyRetained:false,actualCancellationEstablished:false,observations:[]});expect(JSON.stringify(trace)).not.toContain('synthetic-csrf');
});

/** No assistant DOM text is exposed while working, matching the real quiet UI. */
async function quietStreamingFixture(streamed:boolean){
 const id=randomUUID(),owner=randomUUID(),operation=randomUUID(),attempt=randomUUID(),budget=randomUUID(),native='synthetic-native';
 const abort=new AbortController();let sent=false,archived=false,bound=false,observations=0,reloads=0;
 vi.mocked(boundedHostedJson).mockResolvedValue({sessionId:native});
 vi.mocked(terminalNativeRetirementReceipt).mockReturnValue(true);
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{if(init.method==='PATCH')archived=true;else if(new URL(url).pathname==='/eve/v1/session')bound=true;return new Response('{}');});
 browserFixture.page={setDefaultTimeout(){},setDefaultNavigationTimeout(){},route:async()=>{},on(){},goto:async()=>{},
  getByRole:(_role:string,{name}:{name:string})=>name==='Message Turi'?{fill:async()=>{}}:name==='Send message'?{click:async()=>{sent=true;}}:{isVisible:async()=>true},
  locator:()=>{throw Error('The quiet UI has no in-progress assistant text');},
  reload:async()=>{reloads++;throw Error('Actual streaming reload observed');}};
 const db={query:async(sql:string,values:unknown[]=[])=>{
  if(sql.includes('FROM conversations'))return{rows:[{id,owner_principal_id:owner,creation_operation_id:operation,eve_session_id:bound?native:null,binding_state:bound?'bound':'unbound',archived_at:archived?new Date():null}]};
  if(sql.includes('AS streaming')){observations++;expect(values).toEqual([attempt,id,native,budget]);expect(sql).toContain('e.turn_id=a.native_turn_id');expect(sql).toContain("a.response_state='running'");expect(sql).toContain("e.event_type='message.appended'");expect(sql).toContain("visible_payload->>'messageDelta'");expect(sql).toContain("i.identity_kind='provider_response'");expect(sql).not.toContain("i.identity_kind='gateway_generation'");if(!streamed&&observations===3)abort.abort(Error('Actual stream not observed'));return{rows:[{streaming:streamed}]};}
  if(sql.includes('FROM response_attempts'))return{rows:sent?[{id:attempt,response_state:'running',deadline_at:new Date(Date.now()+120000)}]:[],rowCount:sent?1:0};
  if(sql.includes('FROM parity_evaluation_operations'))return{rows:sent?[{id:operation}]:[]};
  if(sql.includes('ordinary_native_retirements'))return{rows:[{}],rowCount:1};
  throw Error('Unexpected diagnostic SQL');
 }};
 const scope={sourceCommit:'synthetic',target:'preview',projectId:'synthetic',workspaceId:randomUUID(),environmentMarker:'synthetic',origin:'https://synthetic.example'};
 const headers=new Headers({'content-type':'application/json',origin:scope.origin,cookie:'__Host-turas_session='+'a'.repeat(43),'x-csrf-token':'synthetic-csrf'});
 const run=()=>runHostedRootBrowser({scope:scope as never,db:db as never,ownerDb:db as never,headers,binding:{...scope,budgetId:budget,ownerPrincipalId:owner,conversationIds:[id]},conversationId:id,signal:abort.signal,mobile:false,evidenceDirectory});
 return{run,reloads:()=>reloads,observations:()=>observations};
}
it('reloads a real streamed attempt while quiet final-answer presentation hides its in-progress prose',async()=>{
 const fixture=await quietStreamingFixture(true);
 await expect(fixture.run()).rejects.toThrow('Actual streaming reload observed');
 expect(fixture.reloads()).toBe(1);expect(fixture.observations()).toBe(1);
});
it('does not reload on a running provider reservation and visible Stop before actual streamed text exists',async()=>{
 const fixture=await quietStreamingFixture(false);
 await expect(fixture.run()).rejects.toThrow('Actual stream not observed');
 expect(fixture.reloads()).toBe(0);expect(fixture.observations()).toBe(3);
});
