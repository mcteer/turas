import type {Client,PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {mcpLimits} from '../../contracts/mcp';
import {readBoundedMcpBody,dispatchAuthenticatedMcpRead} from '../mcp/transport';
import {withAuthenticatedWorkMcpRead} from './authenticated-recovery-read';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Owner-controller transport only. No normal MCP ingress exception, caller actor,
 * model invocation, credential renewal or externally effectful tool is available. */
export async function readWorkRecoveryMcpRequest(db:Client,target:LockedWorkRecoveryTarget,request:Request):Promise<Response>{
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(request.method!=='POST'||url.pathname!=='/api/mcp/v1'||url.search!==''||url.hash!==''||url.origin!==target.origin||request.headers.get('host')!==url.host||(origin!==null&&origin!==target.origin)||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpFailure(403,'forbidden','Recovery MCP request unavailable');
 const deadline=Math.min(target.deadline,Date.now()+mcpLimits.deadlineMs),signal=AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
 const body=await readBoundedMcpBody(request,signal),object=body as {method?:unknown};
 if(!object||typeof object!=='object'||Array.isArray(object)||!['server/discover','tools/list','tools/call'].includes(String(object.method)))throw new HttpFailure(400,'invalid_input','Recovery MCP method unavailable');
 return withAuthenticatedWorkMcpRead(db,target,request.headers.get('authorization'),deadline,async actor=>{
  signal.throwIfAborted();await db.query("SELECT set_config('transaction_timeout',$1,true)",[`${Math.max(1,deadline-Date.now())}ms`]);
  const response=await dispatchAuthenticatedMcpRead(db as unknown as PoolClient,actor,request,body,signal);signal.throwIfAborted();return response;
 });
}
