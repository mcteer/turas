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
/** Preserve the authenticated actor object when separate research metadata is
 * passed through an in-transaction governed read. Metadata never substitutes
 * for that actor or changes its session, role, workspace or environment. */
export function researchReadActor(identity:AppIdentity,actor:CurrentSession=identity):CurrentSession{
 if(identity.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID||identity.userId!==actor.principalId||
  (['sessionId','principalId','membershipId','workspaceId','token','kind','role','loginName'] as const).some(key=>identity[key]!==actor[key]))throw hiddenRecord();
 return actor;
}
export async function researchIdentity(principal: Parameters<typeof customerQuestionActor>[1],
  lineage?:{parentSessionId:string;workerSessionId?:string;kind?:string}): Promise<AppIdentity> {
  const {actor} = await withTransaction(async db=>{
    const attemptId=principal?.attributes?.turasAttemptId;
    if(!principal?.principalId || typeof attemptId!=='string')throw hiddenRecord();
    if(lineage) {
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
