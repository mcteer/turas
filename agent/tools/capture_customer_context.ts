import {normalChatTool} from "../lib/normal-chat-tool";
import {defineTool} from 'eve/tools';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {accountIdSchema,contextSchema} from '../../lib/contracts/customer-journey';
import {withTransaction} from '../../lib/server/db/client';
import {customerQuestionActor} from '../../lib/server/conversations/customer-accounts';
import {submitProfileCommandDetailed} from '../../lib/server/profiles/service';
import {HttpFailure} from '../../lib/contracts/http';
import {currentAttemptUserMessages} from '../../lib/server/conversations/steering';
const authoredTool=defineTool({
 description:'Save a DRAFT customer journey note, milestone, risk, decision or measured outcome from customer context explicitly supplied by the user. Preserve scope, journey stage, dates, source and numeric impact. It remains Pending steward review; this neither accepts a fact nor publishes a reusable pattern. source.excerpt must quote the actual user message, never an assistant reply or invented evidence.',
 inputSchema:z.object({accountId:accountIdSchema,requestId:z.uuid(),context:contextSchema}).strict(),
 async execute(input,ctx){
  ctx.abortSignal.throwIfAborted();
  return withTransaction(async db=>{
   const {actor,attemptId}=await customerQuestionActor(db,ctx.session.auth.current);
   const message=(await currentAttemptUserMessages(db,attemptId,actor.principalId,actor.workspaceId))
    .find(message=>message.text.includes(input.context.source.excerpt));
   if(!message || !message.text.includes(input.context.source.excerpt))throw new HttpFailure(422,'human_source_required','Quote the actual supplied user context; assistant-authored claims are not human evidence');
   const context=input.context.source.kind==='conversation'?{...input.context,source:{...input.context.source,reference:`Turas conversation ${ctx.session.id}`,url:''}}:input.context;
   const result=await submitProfileCommandDetailed(actor,input.accountId,{action:'propose_record',requestKey:input.requestId,
    requestedAudience:actor.kind==='partner'?'delivery':'internal',dataCategory:actor.kind==='partner'?'delivery_context':'other_internal',
    payload:{kind:'claim',title:context.title,text:context.summary,sourceType:'manual',legacyJourney:context,
     sourceMessageId:message.id,sourceExcerpt:context.source.excerpt,sourceSpanDigest:createHash('sha256').update(context.source.excerpt).digest('hex')},
   },db,{submissionChannel:'agent_proposal'});
   return {status:'draft_saved',record:result.data,reason:'Draft saved for steward review. The source and structured journey/impact are retained; accepted customer context was not changed.'};
  });
 },
});

export default normalChatTool(authoredTool);
