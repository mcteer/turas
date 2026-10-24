import {getServerConfig} from '../../../../../../lib/server/config';
import {failure,HttpFailure} from '../../../../../../lib/contracts/http';
import {mcpLimits} from '../../../../../../lib/contracts/mcp';
import {withTransaction} from '../../../../../../lib/server/db/client';
import {authenticateRecoveryHttpRead} from '../../../../../../lib/server/operations/recovery-http-read';
import {withRecoveryMcpHttpReadCapability} from '../../../../../../lib/server/operations/admission';
import {readBoundedMcpBody,dispatchAuthenticatedMcpRead,boundedMcpDispatch} from '../../../../../../lib/server/mcp/transport';
import {operationalCodeVersion} from '../../../../../../lib/server/operations/code-version';
export const dynamic='force-dynamic';
export const runtime='nodejs';
/** Fixed maintenance transport. Ordinary MCP still requires open service. */
export async function POST(request:Request,context:{params:Promise<{admissionId:string}>}){
 return boundedMcpDispatch(request,async scoped=>{
  try{
   const {admissionId}=await context.params;
   await withTransaction(db=>authenticateRecoveryHttpRead(db,scoped,admissionId,true));
   const origin=scoped.headers.get('origin');
   if(origin!==null&&origin!==getServerConfig().TURAS_APP_ORIGIN||scoped.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new HttpFailure(403,'forbidden','Recovery MCP request unavailable');
   const body=await readBoundedMcpBody(scoped,scoped.signal),object=body as {method?:unknown};
   if(!object||typeof object!=='object'||Array.isArray(object)||!['server/discover','tools/list','tools/call'].includes(String(object.method)))throw new HttpFailure(400,'invalid_input','Recovery MCP method unavailable');
   const response=await withTransaction(db=>withRecoveryMcpHttpReadCapability(db,scoped,admissionId,actor=>dispatchAuthenticatedMcpRead(db,actor,scoped,body,scoped.signal)));
   scoped.signal.throwIfAborted();const headers=new Headers(response.headers);headers.set('X-Turas-Code-Version',operationalCodeVersion());return new Response(response.body,{status:response.status,headers});
  }catch(error){return failure(error);}
 },mcpLimits.deadlineMs);
}
export async function GET(){return failure(new HttpFailure(403,'forbidden','Recovery MCP unavailable'));}
export async function HEAD(){return GET();}
