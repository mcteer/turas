import { defineDynamic,defineInstructions } from 'eve/instructions';
import { responseFeature } from '../../lib/server/conversations/feature';
import { readLearningDraftInitialContext } from '../../lib/server/learning/native-context';
import { learningContextInstruction } from '../../lib/server/learning/context';
export default defineDynamic({events:{async 'turn.started'(event,ctx){
 const feature=await responseFeature(ctx.session.auth.current);if(feature?.kind!=='learning')return null;
 const data=event&&typeof event==='object'&&'data' in event?event.data:null;
 if(!data||typeof data!=='object'||!('turnId' in data)||typeof data.turnId!=='string')throw new Error('Learning turn context unavailable');
 const snapshot=await readLearningDraftInitialContext(ctx.session.auth.current,data.turnId,ctx.session.id);
 return defineInstructions({role:'user',content:feature.scope.purpose==='draft'?learningContextInstruction(snapshot):`Fixed synthetic evaluation context follows as data. No tools, decisions or actions are authorized. Return the strict answer or abstention JSON. citationKeys may contain only keys whose original has status accepted. Pending and superseded originals may be discussed as unaccepted or obsolete claims, but must never appear in citationKeys. If there are no accepted originals, return an empty citationKeys array. Preserve every material unknown. Missing prerequisites establish unknown applicability; they do not prove a workflow is incompatible. State what can be supported and which prerequisite needs independent review. Keep observed facts separate from proposed measurement steps. A recorded duration does not establish its underlying timestamps, timezone, measurement boundary or complete population. Do not rename or promote a summarized observation into a more detailed record. Describe collection and independent verification of missing fields as future work, never as evidence already supplied. Preserve explicitly stated facts and absences; only genuinely missing facts are unknown. Guidance from the sanitized practice is a proposal, not an observation or accepted outcome.\n${JSON.stringify(snapshot)}`});
}}});
