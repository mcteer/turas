import {humanResponderScope} from '../../conversations/human-responder';
import type { CurrentSession } from "../../auth/sessions";
import { getServerConfig } from "../../config";
import { withTransaction } from "../../db/client";
import { customerQuestionActor } from "../../conversations/customer-accounts";
import { readResearchRuntimeAuthority } from "./runtime-authority";
import { hiddenRecord } from "../../../contracts/http";

/** The legacy receipt identity is backed by the current live session and role,
 * rather than legacy demo logins or a model-supplied owner/workspace. */
export type AppIdentity = CurrentSession & { userId: string; environmentId: string;responseAttemptId?:string;workerSessionId?:string };
export async function researchIdentity(principal: Parameters<typeof customerQuestionActor>[1],
  lineage?:{parentSessionId:string;workerSessionId?:string;kind?:string}): Promise<AppIdentity> {
  const {actor} = await withTransaction(async db=>{
    const attemptId=principal?.attributes?.turasAttemptId;
    if(!principal?.principalId || typeof attemptId!=='string')throw hiddenRecord();
    if(lineage) {
      if(lineage.workerSessionId){
        const {authorizeSpecialistWorker}=await import('./discussions');
        const scope=(await db.query(`SELECT kind FROM specialist_discussions WHERE parent_session_id=$1 AND child_session_id=$2
          AND owner_principal_id=$3 AND environment_id=$4`,[lineage.parentSessionId,lineage.workerSessionId,principal.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
        if(!scope||lineage.kind&&lineage.kind!==scope.kind)throw hiddenRecord();
        const bound=await authorizeSpecialistWorker(db,{attemptId,principalId:principal.principalId,parentSessionId:lineage.parentSessionId,workerSessionId:lineage.workerSessionId,kind:scope.kind});
        return {actor:bound.identity};
      }
      const authority=await readResearchRuntimeAuthority(db,attemptId,principal.principalId,lineage);
      if(!authority)throw hiddenRecord();
      return authority;
    }
    try {return await customerQuestionActor(db,principal);}
    catch(error) {
      const authority=await readResearchRuntimeAuthority(db,attemptId,principal.principalId);
      if(!authority)throw error;
      return authority;
    }
  });
  return {...actor,userId:actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,
    responseAttemptId:principal?.attributes?.turasAttemptId as string,...(lineage?.workerSessionId?{workerSessionId:lineage.workerSessionId}:{})};
}

/** Human approval responses never use research-worker or latest-login fallback. */
export async function researchHumanResponderIdentity(principal:Parameters<typeof customerQuestionActor>[1]):Promise<AppIdentity>{
 return withTransaction(async db=>{const scope=await humanResponderScope(db,principal);const actor=scope.actor;return {...actor,userId:actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,responseAttemptId:scope.attemptId};});
}
