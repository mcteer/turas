import {z} from "zod";
import {failure,HttpFailure,success} from "../../../../../lib/contracts/http";
import {getCurrentSession} from "../../../../../lib/server/auth/sessions";
import {getServerConfig} from "../../../../../lib/server/config";
import {sourceLibrary} from "../../../../../lib/server/research/specialists/research-cache/library";

export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{customerId:string}>}):Promise<Response>{
  try{
    const session=await getCurrentSession(request);
    if(!session)throw new HttpFailure(401,"authentication_required","Sign in required");
    const {customerId}=await context.params;
    if(!z.uuid().safeParse(customerId).success)throw new HttpFailure(400,"invalid_input","Invalid customer");
    const parsed=z.coerce.number().int().min(0).max(100000).safeParse(new URL(request.url).searchParams.get('offset')??0);
    if(!parsed.success)throw new HttpFailure(400,"invalid_offset","Invalid source-library offset");
    return success(await sourceLibrary({...session,userId:session.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID},customerId,request.signal,parsed.data));
  }catch(error){return failure(error);}
}
