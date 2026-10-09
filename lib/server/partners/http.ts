import { z } from "zod";
import { HttpFailure, failure, success } from "../../contracts/http";
import { getCurrentSession } from "../auth/sessions";
import { checkSessionCsrf } from "../auth/csrf";
import { gapBody } from "../gaps/http";
import type { PartnerActor } from "./policy";
import { recordPartnerTelemetry } from "./telemetry";
import { partnerHash } from "./repository";
import { getServerConfig } from "../config";
import { partnerContractVersion } from "../../contracts/partners";
export function partnerQuery(request:Request){const query=new URL(request.url).searchParams;if([...query.keys()].some(k=>query.getAll(k).length!==1))throw new HttpFailure(422,"invalid_input","Duplicate query field");return Object.fromEntries(query);}
function boundedStructure(input:unknown){let nodes=0;const walk=(v:unknown,depth:number)=>{if(++nodes>5000||depth>12)throw new HttpFailure(422,"invalid_input","Input structure exceeds limits");if(v!==null&&typeof v==="object")for(const item of Object.values(v))walk(item,depth+1);};walk(input,0);}
export async function partnerRequest(request:Request,write:boolean,run:(actor:PartnerActor,body:unknown)=>Promise<unknown>){
  const correlationId=crypto.randomUUID(),start=performance.now();
  try {const actor=await getCurrentSession(request);if(!actor)throw new HttpFailure(401,"authentication_required","Sign in required");
    let body:unknown;if(write){checkSessionCsrf(request,actor);body=await gapBody(request,163840);boundedStructure(body);}
    const result=await run(actor,body),status=result&&typeof result==="object"&&"outcome" in result&&result.outcome==="pending"?202:200;
    const payload=result&&typeof result==="object"?{...result,contractVersion:partnerContractVersion,actorPrincipalId:actor.principalId,actorMembershipId:actor.membershipId,commandNamespace:partnerHash([getServerConfig().TURAS_ENVIRONMENT_ID,actor.principalId,actor.membershipId])}:result;
    const response=success(payload,status,correlationId);response.headers.set("Vary","Cookie");recordPartnerTelemetry({operation:write?"write":"read",outcome:"committed",durationMs:performance.now()-start,correlationId});return response;
  }catch(error){const known=error instanceof z.ZodError?new HttpFailure(422,"invalid_input","Invalid partner input"):error;
    recordPartnerTelemetry({operation:write?"write":"read",outcome:known instanceof HttpFailure&&known.status<500?"denied":"failed",durationMs:performance.now()-start,correlationId});
    const response=failure(known,correlationId);response.headers.set("Vary","Cookie");return response;}
}
