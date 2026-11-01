import type {Fact,JsonValue} from 'eve/events';

/** Compact scenario notation for UI transport substitution, translated to the
 * installed v27 wire contract. This is synthetic UI evidence only. */
export type ChatWireEvent={type:string;data:Record<string,unknown>;meta:{id:string;at:string;deliveryIds?:string[]}};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
export function chatWireBody(events:readonly ChatWireEvent[]){
 const lines:{at:string;facts:Fact[]}[]=[],turns=new Set<string>(),runs=new Set<string>(),calls=new Set<string>();
 const add=(at:string,...facts:Fact[])=>{if(facts.length)lines.push({at,facts});};
 const turn=(id:string,at:string)=>{if(!turns.has(id)){turns.add(id);add(at,{type:'turn.started',scope:{turnId:id},data:{turnId:id,cause:{deliveryId:'fixture-'+id},follows:null}});}};
 const run=(id:string,step:unknown,at:string)=>{turn(id,at);const runId='run_'+id+'_'+String(step??0);if(!runs.has(runId)){runs.add(runId);add(at,{type:'model.requested',scope:{turnId:id,runId},data:{runId,owner:{turnId:id}}},{type:'model.started',scope:{turnId:id,runId},data:{runId,modelId:'synthetic',attempt:0}});}return runId;};
 for(const event of events){
  const d=event.data,at=event.meta.at,t=typeof d.turnId==='string'?d.turnId:'turn',scope={turnId:t};
  switch(event.type){
   case 'session.started':add(at,{type:'session.started',data:{}});break;
   case 'turn.started':turn(t,at);break;
   case 'message.received':{turn(t,at);const deliveryId='delivery_'+event.meta.id;add(at,{type:'delivery.admitted',data:{deliveryId,principal:{id:'owned',type:'user'}}},{type:'delivery.consumed',scope,data:{deliveryId,turnId:t,parts:[{kind:'text',text:String(d.message??'')}]}});break;}
   case 'step.started':run(t,d.stepIndex,at);break;
   case 'message.completed':case 'reasoning.completed':{const runId=run(t,d.stepIndex,at);add(at,{type:'content.completed',scope:{...scope,runId},data:{partId:'part_'+event.meta.id,runId,kind:event.type==='reasoning.completed'?'reasoning':'text',phase:d.finishReason==='tool-calls'?'narration':'reply',value:String(d.message??d.reasoning??'')}});break;}
   case 'actions.requested':for(const action of Array.isArray(d.actions)?d.actions:[]){const a=record(action),runId=run(t,d.stepIndex,at),callId=String(a.callId);calls.add(callId);add(at,{type:'call.requested',scope:{...scope,runId},data:{callId,owner:{runId},capability:{kind:'tool',name:String(a.toolName)},input:a.input as JsonValue}});}break;
   case 'action.result':{const r=record(d.result),callId=String(r.callId);if(calls.has(callId))add(at,{type:'call.started',scope,data:{callId}},{type:'call.settled',scope,data:{callId,outcome:'completed',output:r.output as JsonValue}});break;}
   case 'input.requested':turn(t,at);for(const raw of Array.isArray(d.requests)?d.requests:[]){const r=record(raw),action=record(r.action),callId=String(action.callId??'ask_'+String(r.requestId)),runId=run(t,d.stepIndex,at);if(!calls.has(callId)){calls.add(callId);add(at,{type:'call.requested',scope:{...scope,runId},data:{callId,owner:{runId},capability:{kind:'tool',name:String(action.toolName??'ask_question')},input:action.input as JsonValue}},{type:'call.started',scope,data:{callId}});}
    add(at,{type:'interaction.opened',scope,data:{interactionId:String(r.requestId),subject:{callId},request:{kind:r.kind==='tool-approval'?'approval':r.kind==='session-limit'?'budget':'question',prompt:String(r.prompt),allowFreeform:r.allowFreeform===true,options:r.options as never}}},{type:'turn.paused',scope,data:{turnId:t,awaiting:[{interactionId:String(r.requestId)}]}});
   }break;
   case 'input.resolved':for(const raw of Array.isArray(d.resolutions)?d.resolutions:[]){const r=record(raw),answer=record(r.response),interactionId=String(r.requestId),deliveryId='answer_'+event.meta.id,responseId='response_'+event.meta.id;add(at,{type:'delivery.admitted',data:{deliveryId,principal:{id:'owned',type:'user'}}},{type:'response.submitted',scope,data:{responseId,deliveryId,interactionId,value:{...(typeof answer.optionId==='string'?{optionId:answer.optionId}:{}),...(typeof answer.text==='string'?{text:answer.text}:{})}}},{type:'response.admitted',scope,data:{responseId}},{type:'interaction.settled',scope,data:{interactionId,outcome:r.outcome==='answered'||r.outcome==='approved'?'accepted':r.outcome==='denied'?'declined':'interrupted',cause:{responseId}}});}break;
   case 'turn.completed':case 'turn.failed':case 'turn.cancelled':turn(t,at);add(at,{type:'turn.settled',scope,data:{turnId:t,outcome:event.type==='turn.completed'?'completed':event.type==='turn.failed'?'failed':'cancelled'}});break;
   default:break;
  }
 }
 return lines.map(line=>JSON.stringify(line)).join('\n')+'\n';
}
