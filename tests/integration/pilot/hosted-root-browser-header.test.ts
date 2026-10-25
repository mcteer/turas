import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';

vi.mock('@playwright/test',()=>({webkit:{launch:async()=>({newContext:async()=>({close:async()=>{}}),close:async()=>{}})},expect:vi.fn()}));
vi.mock('../../../lib/server/conversations/hosted-root-budget',()=>({hostedRootBudgetSchema:{parse:(value:unknown)=>value}}));
vi.mock('../../../lib/server/conversations/native-retirement-recovery',()=>({terminalNativeRetirementReceipt:vi.fn()}));
vi.mock('../../../scripts/pilot-hosted-http',()=>({boundedHostedJson:vi.fn()}));
vi.mock('../../../scripts/pilot-hosted-root-reconcile',()=>({reconcileHostedRootGeneration:vi.fn()}));
import {runHostedRootBrowser} from '../../../scripts/pilot-hosted-root-browser';

afterEach(()=>vi.unstubAllGlobals());
it('sends the owned conversation header to native creation without mutating caller authentication',async()=>{
 const id=randomUUID(),owner=randomUUID(),operation=randomUUID();let archived=false;
 const headers=new Headers({'content-type':'application/json',origin:'https://synthetic.example',cookie:'__Host-turas_session='+'a'.repeat(43),'x-csrf-token':'synthetic-csrf','x-vercel-protection-bypass':'synthetic-bypass','x-turas-conversation-id':randomUUID()});
 const original=[...headers];const requests:Request[]=[];
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{requests.push(new Request(url,init));if(init.method==='PATCH'){archived=true;return new Response('{}');}return new Response('{}',{status:422});});
 const db={query:async(sql:string)=>sql.includes('FROM conversations')?{rows:[{id,owner_principal_id:owner,creation_operation_id:operation,eve_session_id:null,binding_state:'unbound',archived_at:archived?new Date():null}]}:{rows:[],rowCount:0}};
 const scope={sourceCommit:'synthetic',target:'preview',projectId:'synthetic',workspaceId:randomUUID(),environmentMarker:'synthetic',origin:'https://synthetic.example'};
 await expect(runHostedRootBrowser({scope:scope as never,db:db as never,ownerDb:db as never,headers,binding:{...scope,ownerPrincipalId:owner,conversationIds:[id]},conversationId:id,signal:new AbortController().signal,mobile:false,evidenceDirectory:'/unused'})).rejects.toThrow('Native root command failed');
 const create=requests[0];expect(new URL(create.url).pathname).toBe('/eve/v1/session');expect(create.method).toBe('POST');
 expect(create.headers.get('x-turas-conversation-id')).toBe(id);expect(await create.json()).toEqual({operationId:operation});
 for(const name of ['cookie','x-csrf-token','origin','content-type','x-vercel-protection-bypass'])expect(create.headers.get(name)).toBe(headers.get(name));
 expect([...headers]).toEqual(original);expect(requests).toHaveLength(2);expect(archived).toBe(true);
});
