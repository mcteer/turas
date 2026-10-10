import { failure,HttpFailure,success } from '../../contracts/http';
import { mcpCreateConnectionSchema,mcpRevokeConnectionSchema,mcpManagementPageSchema,mcpIdSchema } from '../../contracts/mcp';
import { getCurrentSession } from '../auth/sessions';
import { checkSessionCsrf } from '../auth/csrf';
import { createMcpConnection,revokeMcpConnection,listMcpConnections,listMcpUsage,reconcileMcpRequest } from './management';
import { readBoundedMcpBody } from './transport';
import { getServerConfig } from '../config';
import { mcpResponseFits } from '../../contracts/mcp';
function boundedSuccess(data:unknown,status=200){if(!mcpResponseFits({data,correlationId:'0'.repeat(36)}))throw new HttpFailure(503,'unavailable','Response unavailable');return success(data,status);}
function page(request:Request){
  const entries=Object.fromEntries(new URL(request.url).searchParams);
  const input=mcpManagementPageSchema.safeParse({...entries,limit:entries.limit===undefined?20:Number(entries.limit)});
  if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');return input.data;
}
async function browser(request:Request,write=false){
  const origin=request.headers.get('origin');if(origin!==null&&origin!==getServerConfig().TURAS_APP_ORIGIN)throw new HttpFailure(403,'forbidden','Request denied');
  const session=await getCurrentSession(request);if(!session)throw new HttpFailure(401,'authentication_required','Sign in required');
  if(write)checkSessionCsrf(request,session);return session;
}
export async function getMcpManagement(request:Request,admin=false,id?:string){
  try{const actor=await browser(request);return boundedSuccess(id?await listMcpUsage(actor,id,page(request)):await listMcpConnections(actor,page(request),admin));}
  catch(error){return failure(error);}
}
export async function postMcpManagement(request:Request,id?:string){
  try{
    const actor=await browser(request,true),raw=await readBoundedMcpBody(request,AbortSignal.any([request.signal,AbortSignal.timeout(10000)]));
    if(id){if(!mcpIdSchema.safeParse(id).success)throw new HttpFailure(422,'invalid_input','Invalid request');
      const input=mcpRevokeConnectionSchema.safeParse(raw);if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');
      return boundedSuccess(await revokeMcpConnection(actor,id,input.data));
    }
    const input=mcpCreateConnectionSchema.safeParse(raw);if(!input.success)throw new HttpFailure(422,'invalid_input','Invalid request');
    const result=await createMcpConnection(actor,input.data);return boundedSuccess(result,result.secretAvailable?201:200);
  }catch(error){return failure(error);}
}
export async function reconcileMcpManagement(request:Request,key:string){
  try{return boundedSuccess(await reconcileMcpRequest(await browser(request),key));}catch(error){return failure(error);}
}
