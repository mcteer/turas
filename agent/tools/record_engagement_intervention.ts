import {defineTool} from 'eve/tools';
import {always} from 'eve/tools/approval';
import {normalChatTool} from '../lib/normal-chat-tool';
import {interventionSchema,approveOrdinaryIntervention,recordOrdinaryIntervention} from '../../lib/server/ordinary-operations/interventions';
export const authoredTool=defineTool({
 description:'Record an explicit human approved/rejected/deferred decision about the exact current real proposed scope intervention. Requires the authorized reviewer, exact proposal/revision/version, rationale and identical request key on retry. Does not change accepted plans, assign people or execute changes.',
 inputSchema:interventionSchema,availableInSubagents:false,
 approval:{request:always(),response:async({responder,request})=>{
  try{await approveOrdinaryIntervention(responder,request.toolInput,{requestId:request.requestId,callId:request.callId});return {status:'allowed' as const};}
  catch{return {status:'rejected' as const,reason:'Only the currently authorized human reviewer may approve this exact current proposed intervention.'};}
 }},
 execute:(input,ctx)=>recordOrdinaryIntervention(ctx.session.auth.current,input,ctx.callId),
});
export default normalChatTool(authoredTool);
