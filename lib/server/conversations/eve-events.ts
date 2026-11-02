import {createHash} from 'node:crypto';
import {interaction,parts,runs,turns,type SessionView,type FactPosition} from 'eve/events';
import type {SessionEvent,SessionStreamEvent} from 'eve/client';
import type {NativeEvent} from './projection';

/** Application projection v1 is retained for its governed ledgers. These are
 * observations of v27 facts, never a converted session or replay authority. */
export function projectEveFact(sessionId:string,event:SessionEvent,position:FactPosition,at:string,view:SessionView):NativeEvent{
 const id='evt_'+createHash('sha256').update(JSON.stringify([sessionId,position.line,position.index])).digest('hex');
 const meta={id,at,protocol:27 as const,position};
 const noop:NativeEvent={type:'native.observed',data:{nativeProtocol:27},meta};
 const turnId=event.scope?.turnId??('turnId' in event.data&&typeof event.data.turnId==='string'?event.data.turnId:undefined);
 const sequence=turnId?turns(view).findIndex(turn=>turn.turnId===turnId):-1;
 const runId=event.scope?.runId??('runId' in event.data&&typeof event.data.runId==='string'?event.data.runId:undefined);
 const turnRuns=turnId?runs(view,{turnId}):[];
 const stepIndex=runId?turnRuns.findIndex(run=>run.runId===runId):undefined;
 const run=runId?turnRuns.find(run=>run.runId===runId):undefined;
 const data={nativeProtocol:27,turnId,sequence,...(stepIndex!==undefined&&stepIndex>=0?{stepIndex}:{})};
 const observed=(type:string,value:Record<string,unknown>):NativeEvent=>({type,data:{...data,...value},meta});
 switch(event.type){
  case 'delivery.consumed':if(!event.data.parts.length)return noop;return {...observed('message.received',{
   turnId:event.data.turnId,message:event.data.parts.map(part=>part.kind==='text'?part.text:`[file: ${part.filename} (${part.mediaType})]`).join('\n'),
   parts:event.data.parts.map(part=>part.kind==='text'?{type:'text',text:part.text}:{type:'file',mediaType:part.mediaType,filename:part.filename,size:part.size}),
  }),meta:{...meta,deliveryIds:[event.data.deliveryId]}};
  case 'content.completed':{
   if(event.data.kind!=='text'&&event.data.kind!=='result')return noop;
   if(event.data.kind==='text'&&parts(view,{runId:event.data.runId}).some(part=>part.kind==='result'))return noop;
   const message=event.data.kind==='result'?JSON.stringify(event.data.value):event.data.value;
   if(typeof message!=='string')return noop; // referenced/withheld content is never invented
   return observed('message.completed',{message,finishReason:event.data.phase==='reply'?'stop':'tool-calls'});
  }
  case 'model.settled':
   if(!turnId||!run||stepIndex===undefined||stepIndex<0)return noop;
   return observed(event.data.outcome==='completed'?'step.completed':'step.failed',{
    usage:run.usage??null,code:event.data.error?.code??event.data.outcome,
   });
  case 'interaction.opened':{
   const item=interaction(view,event.data.interactionId);if(!item)return noop;
   const kind=item.request.kind;if(!['question','approval','budget'].includes(kind))return noop;
   return observed('input.requested',{turnId:item.turnId,requests:[{
    requestId:item.interactionId,...item.request,
    ...(item.call?{action:{kind:'tool-call',callId:item.call.callId,toolName:item.call.name,input:item.call.input}}:{}),
   }].map(request=>({...request,kind:kind==='approval'?'tool-approval':kind==='budget'?'session-limit':'question'}))});
  }
  case 'interaction.settled':{
   const item=interaction(view,event.data.interactionId);if(!item||!['question','approval','budget'].includes(item.request.kind))return noop;
   const decided=event.data.outcome==='accepted'||event.data.outcome==='declined';
   const outcome=decided?(item.request.kind==='approval'?(event.data.outcome==='accepted'?'approved':'denied'):event.data.outcome==='accepted'?'answered':'denied'):'dismissed';
   return observed('input.resolved',{turnId:item.turnId,resolutions:[{
    requestId:item.interactionId,kind:item.request.kind==='approval'?'tool-approval':item.request.kind==='budget'?'session-limit':'question',outcome,nativeOutcome:event.data.outcome,
    ...(decided&&item.answer?{optionId:item.answer.optionId,text:item.answer.text}:{}),
   }]});
  }
  case 'turn.settled':return observed('turn.'+event.data.outcome,{turnId:event.data.turnId,code:event.data.error?.code,details:{semanticErrorId:event.data.error?.id}});
  default:return noop;
 }
}

/** A read must publish the complete commit before projecting any of its facts,
 * so model settlement includes usage.recorded later in that same line. */
export function projectEveEvents(sessionId:string,events:readonly SessionStreamEvent[],view:SessionView){
 return events.map(event=>({index:event.meta.position.line,event:(()=>{const projected=projectEveFact(sessionId,event,event.meta.position,event.meta.at,view);return {...projected,meta:{...projected.meta,endOfLine:event.meta.endOfLine,next:event.meta.next}};})()}));
}
