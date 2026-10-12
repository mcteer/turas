import {it,expect} from 'vitest';
import {pilotHostedRequest} from '../../../scripts/pilot-hosted-request';
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
});
it('rejects foreign and non-API paths before dispatch',async()=>{
 let calls=0;const transport:typeof fetch=async()=>{calls++;return response('{}');};const request=pilotHostedRequest(input(transport));for(const path of ['//foreign.example/api/x','/other','/api/../other','/api/\\foreign'])await expect(request(path,'GET')).rejects.toThrow('same-origin');expect(calls).toBe(0);
});
it('honors cancellation before dispatch',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();const transport:typeof fetch=async()=>{calls++;return response('{}');};await expect(pilotHostedRequest({...input(transport),signal:controller.signal})('/api/synthetic','GET')).rejects.toThrow();expect(calls).toBe(0);
});
