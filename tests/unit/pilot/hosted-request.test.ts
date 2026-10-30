import {it,expect} from 'vitest';
import {pilotHostedRequest,PilotHostedResponseError} from '../../../scripts/pilot-hosted-request';
import {reconcileOriginalAcceptedProfileReceipt} from '../../../scripts/pilot-source-recipe';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
const scope={origin:'https://synthetic.example',sourceCommit:'a'.repeat(40)} as PilotHostedScope;
const response=(body:string,version=scope.sourceCommit,status=200)=>new Response(body,{status,headers:{'content-type':'application/json','x-turas-code-version':version}});
const input=(transport:typeof fetch)=>({scope,headers:new Headers(),signal:new AbortController().signal,transport});
it('reads bounded JSON from the exact release without retrying or following redirects',async()=>{
 let calls=0;const transport:typeof fetch=async(url,options)=>{calls++;expect(url).toBe(scope.origin+'/api/synthetic');expect(options).toMatchObject({redirect:'manual',cache:'no-store',method:'POST',body:'{"synthetic":true}'});return response('{"data":true}');};
 await expect(pilotHostedRequest(input(transport))('/api/synthetic','POST',{synthetic:true})).resolves.toEqual({data:true});expect(calls).toBe(1);
});
it('rejects a release mismatch before reading domain content',async()=>{
 const transport:typeof fetch=async()=>response('{"data":true}','b'.repeat(40));await expect(pilotHostedRequest(input(transport))('/api/synthetic','GET')).rejects.toThrow('release differs');
});
it('rejects oversized streamed JSON before accumulating an unbounded body',async()=>{
 const transport:typeof fetch=async()=>response(' '.repeat(1048577));await expect(pilotHostedRequest(input(transport))('/api/synthetic','GET')).rejects.toThrow('private bound');
});
it('does not retry an uncertain mutation body',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;return response('{');};await expect(pilotHostedRequest(input(transport))('/api/synthetic','POST',{})).rejects.toThrow();expect(calls).toBe(1);
 // A read of the original exact receipt may recover a committed timeout;
 // neither the transport nor reconciliation may repeat the mutation.
 const first=new Error('synthetic original write timeout'),path='/api/customers/synthetic/commands/exact-original-key';
 let reads=0;const methods:string[]=[];
 const request=pilotHostedRequest(input(async(_url,init)=>{methods.push(init?.method??'GET');reads++;return reads===1?response('{"error":{"code":"unavailable"}}',scope.sourceCommit,503):response('{"data":{"action":"accept_revision","status":200,"result":{"recordId":"synthetic"}}}');}));
 await expect(reconcileOriginalAcceptedProfileReceipt({request,path,signal:new AbortController().signal,firstPostFailure:first})).resolves.toEqual({recordId:'synthetic'});expect(methods).toEqual(['GET','GET']);expect(calls).toBe(1);
 const exhausted:string[]=[];let failed:unknown;try{await reconcileOriginalAcceptedProfileReceipt({path,signal:new AbortController().signal,firstPostFailure:first,request:async(p,m)=>{exhausted.push(p+':'+m);throw new PilotHostedResponseError(503,true,null);}});}catch(error){failed=error;}
 expect(exhausted).toEqual(Array(3).fill(path+':GET'));expect(failed).toBeInstanceOf(AggregateError);expect((failed as AggregateError).cause).toBe(first);expect((failed as AggregateError).errors[0]).toBe(first);
 for(const error of[new PilotHostedResponseError(403,true,null),new PilotHostedResponseError(503,false,null),new TypeError('uncertain read')]){let count=0;try{await reconcileOriginalAcceptedProfileReceipt({path,signal:new AbortController().signal,firstPostFailure:first,request:async()=>{count++;throw error;}});}catch(value){expect(value).toBeInstanceOf(AggregateError);expect((value as AggregateError).cause).toBe(first);}expect(count).toBe(1);}
 const abort=new AbortController();abort.abort();let abortedCalls=0;await expect(reconcileOriginalAcceptedProfileReceipt({path,signal:abort.signal,firstPostFailure:first,request:async()=>{abortedCalls++;return{};}})).rejects.toBeInstanceOf(AggregateError);expect(abortedCalls).toBe(0);

});
it('rejects foreign and non-API paths before dispatch',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;return response('{}');};const request=pilotHostedRequest(input(transport));for(const timeout of [0,-1,10001,Infinity,NaN])await expect(request('/api/synthetic','GET',undefined,timeout)).rejects.toThrow('bounded');for(const path of ['//foreign.example/api/x','/other','/api/../other','/api/\\foreign'])await expect(request(path,'GET')).rejects.toThrow('same-origin');expect(calls).toBe(0);
});
it('honors cancellation before dispatch',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();const transport:typeof fetch=async()=>{calls++;return response('{}');};await expect(pilotHostedRequest({...input(transport),signal:controller.signal})('/api/synthetic','GET')).rejects.toThrow();expect(calls).toBe(0);
});
it('binds expected denial codes to the serving release without retaining private error prose',async()=>{
 const privateText='Private synthetic customer and credential text';
 const denied:typeof fetch=async()=>response(JSON.stringify({error:{code:'qualification_incomplete',message:privateText}}),scope.sourceCommit,409);
 let error:unknown;try{await pilotHostedRequest(input(denied))('/api/synthetic','POST',{});}catch(value){error=value;}
 expect(error).toBeInstanceOf(PilotHostedResponseError);expect(error).toMatchObject({status:409,releaseMatches:true,errorCode:'qualification_incomplete'});expect(String(error)).not.toContain(privateText);expect(JSON.stringify(error)).not.toContain(privateText);
 const stale:typeof fetch=async()=>response(JSON.stringify({error:{code:'qualification_incomplete',message:privateText}}),'b'.repeat(40),409);
 await expect(pilotHostedRequest(input(stale))('/api/synthetic','POST',{})).rejects.toMatchObject({status:409,releaseMatches:false,errorCode:null});
 const untrusted:typeof fetch=async()=>response(JSON.stringify({error:{code:privateText,message:privateText}}),scope.sourceCommit,409);
 await expect(pilotHostedRequest(input(untrusted))('/api/synthetic','POST',{})).rejects.toMatchObject({status:409,releaseMatches:true,errorCode:null});
});
