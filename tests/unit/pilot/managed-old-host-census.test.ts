import {PilotHostHttpJournal} from '../../../scripts/pilot-host-http-journal';
import {mkdtemp,realpath,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {afterEach,it,expect,vi} from 'vitest';
import {readManagedApprovedHostBindings} from '../../../lib/server/operations/managed-approved-host-bindings';
import {readManagedHostPolicy} from '../../../lib/server/operations/managed-host-policy-provider';
import {readManagedProjectHostInventory} from '../../../lib/server/operations/managed-project-host-inventory';
import {verifyManagedProtectionControls,measureManagedOldHostCensus,requireRepeatedManagedOldHostCensus} from '../../../lib/server/operations/managed-protection-controls';
vi.mock('../../../lib/server/operations/managed-edge-transport',()=>({managedEdgeRead:async(input:{host:string;headers:Record<string,string>;query?:string;signal:AbortSignal})=>{input.signal.throwIfAborted();const response=await fetch('https://'+input.host+'/api/auth/session'+(input.query??''),{method:'GET',headers:input.headers,redirect:'manual',signal:input.signal});return {status:response.status,headers:response.headers,body:Buffer.from(await response.arrayBuffer())};},pinManagedControlEdge:()=>Object.freeze({contract:'controlled-edge-pin'})}));
const key='controlled_current_automation_key',sha='a'.repeat(40),currentHost='current.vercel.app';
const scope={projectId:'prj_original',teamId:'team_original',token:'api-token',target:'production' as const,deploymentId:'dpl_current',sourceCommit:sha,approvedHosts:[currentHost]};
async function fixture(sharedHooks?:Pick<Parameters<typeof verifyManagedProtectionControls>[0],'admit'|'observe'>){
 let mode='normal';const admissions:string[]=[],observations:string[]=[];
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);request.signal.throwIfAborted();
  if(url.origin==='https://api.vercel.com'){
   if(url.pathname.startsWith('/v9/projects/'))return Response.json({id:scope.projectId,accountId:scope.teamId,targets:{production:{id:scope.deploymentId}},protectionBypass:{[key]:{scope:'automation-bypass',isEnvVar:false,note:'Controlled key',createdAt:1000,createdBy:'operator'}}});
   if(url.pathname.startsWith('/v13/deployments/'))return Response.json({id:scope.deploymentId,url:currentHost,projectId:scope.projectId,ownerId:scope.teamId,readyState:'READY',target:'production',meta:{githubCommitSha:sha}});
   if(url.pathname==='/v6/deployments')return Response.json({deployments:[['dpl_current',currentHost],['dpl_old','old.vercel.app']].map(([uid,host])=>({uid,projectId:scope.projectId,url:host,created:1000,target:'production',readyState:'READY'})),pagination:{next:null}});
   if(url.pathname==='/v4/aliases')return Response.json({aliases:[{uid:'alias_old',alias:mode==='alias-drift'?'changed.example.com':'old.example.com',created:'2026-10-19',createdAt:1000,updatedAt:1000,creator:{},deletedAt:null,deploymentId:'dpl_old',deployment:{id:'dpl_old',url:'old.vercel.app'},projectId:scope.projectId,redirect:null,redirectStatusCode:null}],pagination:{count:1,next:null,prev:null}});
   if(url.pathname==='/v1/security/firewall/config/active')return Response.json({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:scope.projectId+'#active',id:'config_original',ips:[],changes:[],version:mode==='policy-drift'?2:1,ownerId:scope.teamId,rules:[{id:'rule_original',name:'Current hosts',description:'Exact host fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:scope.approvedHosts}]}],action:{mitigate:{action:'deny'}}}]});
   if(url.pathname==='/v1/security/firewall/bypass/rules')return Response.json({error:{code:'forbidden',message:'Conditional bypass is unavailable for this team.'}},{status:403});
   if(url.pathname==='/v1/security/firewall/bypass')return Response.json({result:[]});throw Error('Unexpected metadata route');
  }
  const original=url.origin+'/api/auth/session',challenge=()=>new Response(null,{status:302,headers:{location:'https://vercel.com/sso-api?url='+encodeURIComponent(original)}});
  const header=request.headers.has('x-vercel-protection-bypass'),query=url.searchParams.has('x-vercel-protection-bypass'),cookie=request.headers.has('cookie');
  if(!header&&!query&&!cookie)return challenge();
  if(request.headers.has('x-vercel-set-bypass-cookie'))return new Response(null,{status:307,headers:{location:mode==='foreign-cookie'&&url.hostname!==currentHost?'https://foreign.example.com/':original,'set-cookie':'_vercel_jwt=controlled_provider_issued_cookie; Path=/; Secure; HttpOnly; SameSite=Lax'}});
  if(url.hostname===currentHost)return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'x-turas-code-version':sha}});
  if(mode==='bad-header'&&header||mode==='bad-query'&&query||mode==='bad-cookie'&&cookie)return challenge();
  return new Response('Controlled edge deny',{status:403,headers:{'x-vercel-mitigated':'deny'}});
 });
 const signal=new AbortController().signal;
 const metadata=async()=>({bindings:await readManagedApprovedHostBindings(scope,signal),policy:await readManagedHostPolicy({projectId:scope.projectId,teamId:scope.teamId,token:scope.token,approvedHosts:scope.approvedHosts},signal),inventory:await readManagedProjectHostInventory({projectId:scope.projectId,teamId:scope.teamId,token:scope.token,target:scope.target},signal)});
 const initial=await metadata(),hooks=sharedHooks??{admit:async(kind:string)=>{admissions.push(kind);return randomUUID();},observe:async(kind:string)=>{observations.push(kind);}};
 const control=await verifyManagedProtectionControls({...hooks,bindings:initial.bindings,scope,host:currentHost,secret:key,signal});
 return {...initial,...hooks,scope,signal,controls:[control],maximumRequests:10,metadata,transport,admissions,observations,setMode:(value:string)=>{mode=value;},oldRequests:()=>admissions.filter(kind=>kind.startsWith('old-host-')).length};
}
afterEach(()=>vi.restoreAllMocks());
it('covers every immutable and custom excluded host and each current bypass form without reclassifying challenges',async()=>{
 const input=await fixture(),proof=await measureManagedOldHostCensus(input);expect(proof).toMatchObject({oldHosts:2,requests:10,currentPostProtectionHttpCensusVerified:true,historicalStrictCensusReclassified:false,cronAdmissionClosed:false,workflowClosureVerified:false,restorationReady:false});expect(proof.rows.map(row=>row.host)).toEqual(['old.example.com','old.vercel.app']);expect(proof.rows.every(row=>row.ordinary==='protection-challenge')).toBe(true);expect(input.oldRequests()).toBe(10);expect(input.observations).toEqual(input.admissions);expect(JSON.stringify(proof)).not.toContain(key);
});
it('rejects forged inventories policies controls incomplete key coverage and insufficient original allowance before probes',async()=>{
 const input=await fixture();for(const change of [{inventory:{...input.inventory}},{policy:{...input.policy}},{controls:[{...input.controls[0]}]},{controls:[]},{maximumRequests:9}])await expect(measureManagedOldHostCensus({...input,...change})).rejects.toThrow();expect(input.oldRequests()).toBe(0);
});
it('refuses redirected header query cookie or foreign cookie-bootstrap outcomes instead of issuing partial proof',async()=>{
 for(const mode of ['bad-header','bad-query','bad-cookie','foreign-cookie']){const input=await fixture();input.setMode(mode);await expect(measureManagedOldHostCensus(input)).rejects.toThrow('failed');expect(input.oldRequests()).toBeLessThanOrEqual(10);vi.restoreAllMocks();}
});
it('awaits all aborted workers and preserves finite request admission when a persistent journal refuses dispatch',async()=>{
 const input=await fixture();let attempts=0;await expect(measureManagedOldHostCensus({...input,admit:async(kind,host)=>{if(kind.startsWith('old-host-')&&++attempts>2)throw Error('Original budget closed');return await input.admit(kind,host);}})).rejects.toThrow('failed');const dispatched=input.oldRequests();await Promise.resolve();expect(input.oldRequests()).toBe(dispatched);expect(dispatched).toBe(2);
});
it('requires distinct sequential genuine repeats and actual metadata rereads after the last HTTP response',async()=>{
 const input=await fixture(),previous=await measureManagedOldHostCensus(input),current=await measureManagedOldHostCensus(input);
 expect(()=>requireRepeatedManagedOldHostCensus({...input,previous,current})).toThrow('metadata reread');
 const metadata=await input.metadata();expect(requireRepeatedManagedOldHostCensus({...input,...metadata,previous,current})).toBe(current);
 expect(()=>requireRepeatedManagedOldHostCensus({...input,...metadata,previous:current,current})).toThrow('Distinct sequential');expect(()=>requireRepeatedManagedOldHostCensus({...input,...metadata,previous,current:{...current}})).toThrow('Genuine fresh');
 input.setMode('policy-drift');const changed=await input.metadata();expect(()=>requireRepeatedManagedOldHostCensus({...input,...changed,previous,current})).toThrow('changed');
});

it('uses one durable cumulative journal for actual controls and both complete census phases',async()=>{
 const parent=await realpath(await mkdtemp(join(tmpdir(),'turas-census-journal-')));await chmod(parent,0o700);
 try{
  const root=join(parent,'journal'),journal=await PilotHostHttpJournal.create(root,{contract:'pilot-host-http-journal-plan-v1',id:randomUUID(),projectId:scope.projectId,teamId:scope.teamId,sourceCommit:scope.sourceCommit,maximumRequests:25,maximumCostMicroUsd:2000000,expiresAt:new Date(Date.now()+3600000).toISOString(),authorityReference:'Controlled finite owned test',previousJournalDigests:['b'.repeat(64)],historicalStrictFailureRetained:true,unknownCostHoldsRetained:true,automaticRetries:false});
  const input=await fixture(journal.hooks('controls')),previous=await measureManagedOldHostCensus({...input,...journal.hooks('first-census')}),current=await measureManagedOldHostCensus({...input,...journal.hooks('final-census')}),metadata=await input.metadata();
  expect(requireRepeatedManagedOldHostCensus({...input,...metadata,previous,current})).toBe(current);expect(journal.status()).toMatchObject({reserved:25,observed:25,pending:0,remaining:0,admissionClosed:true,unknownCostHoldsRetained:true});const reopened=await PilotHostHttpJournal.open(root);expect(reopened.status()).toEqual(journal.status());await expect(reopened.hooks('controls').admit('protection-header',currentHost)).rejects.toThrow('aggregate');
 }finally{await rm(parent,{recursive:true,force:true});}
});
