import { defineDynamic } from "eve";
import { withTransaction } from "../../lib/server/db/client";
import { readResearchRuntimeAuthority } from "../../lib/server/research/specialists/runtime-authority";
import { loadSessionResearchRequest } from "../../lib/server/research/specialists/research-cache/requests";
import { loadResearchContext,researchContextDigest } from "../../lib/server/research/specialists/solution-research/context";
import { budgetedResearchModel } from "../../lib/server/research/specialists/evaluation-budget";
import { getServerConfig } from "../../lib/server/config";
import { hiddenRecord } from "../../lib/contracts/http";
import { defineState } from "eve/context";
import { z } from "zod";
const parentState=defineState('turas.specialist-parent.v1',()=>({parentSessionId:null as string|null}));

export function specialistModel(kind:'customer-update'|'best-practices'|'solution') {
  return defineDynamic({events:{
    'session.started'(event) {
      const parsed=z.object({data:z.object({invocation:z.object({kind:z.literal('subagent'),parentSessionId:z.string().min(1)})})}).safeParse(event);
      if(!parsed.success)throw hiddenRecord();
      const invocation=parsed.data.data.invocation;
      parentState.update(()=>({parentSessionId:invocation.parentSessionId}));
      return budgetedResearchModel('openai/gpt-5.6-terra');
    },
    async 'step.started'(_event,ctx) {
      const principal=ctx.session.auth.current;
      const attemptId=principal?.attributes?.turasAttemptId;
      const parent=parentState.get().parentSessionId;
      if(!principal?.principalId || typeof attemptId!=='string' || !parent)throw hiddenRecord();
      const authority=await withTransaction(db=>readResearchRuntimeAuthority(db,attemptId,principal.principalId,
        {parentSessionId:parent,workerSessionId:ctx.session.id,kind}));
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
