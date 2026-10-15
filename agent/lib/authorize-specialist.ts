import { defineDynamic } from "eve";
import { withTransaction } from "../../lib/server/db/client";
import { readResearchRuntimeAuthority } from "../../lib/server/research/specialists/runtime-authority";
import { loadSessionResearchRequest } from "../../lib/server/research/specialists/research-cache/requests";
import { loadResearchContext,researchContextDigest } from "../../lib/server/research/specialists/solution-research/context";
import { budgetedResearchModel } from "../../lib/server/research/specialists/evaluation-budget";
import { getServerConfig } from "../../lib/server/config";
import { hiddenRecord } from "../../lib/contracts/http";

export function specialistModel(kind:'customer-update'|'best-practices'|'solution') {
  return defineDynamic({events:{
    'session.started':()=> 'openai/gpt-5.6-terra',
    async 'step.started'(_event,ctx) {
      const principal=ctx.session.auth.current;
      const attemptId=principal?.attributes?.turasAttemptId;
      if(!principal?.principalId || typeof attemptId!=='string')throw hiddenRecord();
      // Model resolvers expose session identity/auth, not ToolContext.parent.
      // Derive the parent from the immutable owner-bound attempt, then fence
      // this actual child ID against that parent's unique matching reservation.
      const {parent,authority}=await withTransaction(async db=>{
        const parent=(await db.query<{parent:string}>(`SELECT c.eve_session_id AS parent FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
          WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.environment_id=$3 AND c.binding_state='bound'`,[attemptId,principal.principalId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.parent;
        if(!parent || parent===ctx.session.id)throw hiddenRecord();
        return {parent,authority:await readResearchRuntimeAuthority(db,attemptId,principal.principalId!,
          {parentSessionId:parent,workerSessionId:ctx.session.id,kind})};
      });
      if(!authority || authority.requests.length!==1)throw hiddenRecord();
      const request=authority.requests[0];
      const identity={...authority.actor,userId:authority.actor.principalId,environmentId:getServerConfig().TURAS_ENVIRONMENT_ID,responseAttemptId:attemptId};
      const current=await loadResearchContext(identity,request.account_id);
      if(researchContextDigest(current)!==request.context_hash)throw hiddenRecord();
      if(!request.completed) {
        const reserved=await loadSessionResearchRequest(identity,parent,ctx.session.id,request.account_id,kind,ctx.abortSignal??new AbortController().signal);
        if(researchContextDigest(current)!==reserved.context_hash)throw hiddenRecord();
      }
      return budgetedResearchModel('openai/gpt-5.6-terra');
    },
  }});
}
