import {openInteractions,type SessionView,type Interaction} from 'eve/events';
import {z} from 'zod';
const requestSchema=z.object({requestId:z.string(),kind:z.enum(['question','session-limit','tool-approval']),
 action:z.object({toolName:z.string().min(1).max(300),callId:z.string().min(1).max(500),input:z.unknown()}).optional().catch(undefined),
 prompt:z.string(),allowFreeform:z.boolean().optional(),display:z.string().optional(),
 options:z.array(z.object({id:z.string(),label:z.string(),description:z.string().optional()})).optional()});
export type ChatInputRequest=z.infer<typeof requestSchema>;
export function approvalReviewReady(request:ChatInputRequest){
 return request.kind!=='tool-approval'||Boolean(request.action&&Object.hasOwn(request.action,'input')&&request.action.input!==undefined);
}
/** Project native pending requests; model prose never creates approval buttons. */
export function pendingChatInputs(events:readonly {type:string;data?:unknown}[]):ChatInputRequest[]{
 const pending=new Map<string,{request:ChatInputRequest;turnId:string|null}>();
 for(const event of events){
  if(event.type==='input.requested'){
   const parsed=z.object({requests:z.array(requestSchema),turnId:z.string().optional()}).safeParse(event.data);
   if(parsed.success)for(const request of parsed.data.requests)pending.set(request.requestId,{request,turnId:parsed.data.turnId??null});
  }else if(event.type==='input.resolved'){
   const parsed=z.object({resolutions:z.array(z.object({requestId:z.string()}))}).safeParse(event.data);
   if(parsed.success)for(const resolution of parsed.data.resolutions)pending.delete(resolution.requestId);
  }else if(['turn.cancelled','turn.failed'].includes(event.type)){
   const turn=z.object({turnId:z.string().optional()}).safeParse(event.data??{});
   if(turn.success)for(const [id,value] of pending)if(value.turnId===(turn.data.turnId??null))pending.delete(id);
  }else if(['session.completed','session.failed'].includes(event.type))pending.clear();
 }
 return [...pending.values()].map(value=>value.request);
}

export function chatInputAnswer(requests:readonly ChatInputRequest[],text:string):{requestId:string;optionId?:string;text?:string}|null {
 if(requests.length!==1 || !text.trim())return null;
 const request=requests[0],value=text.trim();
 const option=request.options?.find((option,index)=>option.id===value || option.label.toLocaleLowerCase()===value.toLocaleLowerCase() || String(index+1)===value);
 if(option){if(request.kind==='tool-approval'&&option.id==='approve'&&!approvalReviewReady(request))return null;return {requestId:request.requestId,optionId:option.id};}
 return request.kind==='question' && request.allowFreeform!==false?{requestId:request.requestId,text:value}:null;
}

/** Presentation adapter only; runtime interactions and server policy own decisions. */
export function chatInputFromInteraction(item:Interaction):ChatInputRequest|null{
 const kind=item.request.kind;
 if(kind!=='question'&&kind!=='approval'&&kind!=='budget')return null;
 return {requestId:item.interactionId,kind:kind==='approval'?'tool-approval':kind==='budget'?'session-limit':'question',
  prompt:item.request.prompt,allowFreeform:item.request.allowFreeform,display:item.request.display,
  options:item.request.options?.map(option=>({...option})),
  ...(item.call?{action:{toolName:item.call.name,callId:item.call.callId,input:item.call.input}}:{})};
}
export function pendingChatInputsFromView(view:SessionView):ChatInputRequest[]{
 return openInteractions(view).filter(item=>!item.answer).flatMap(item=>{const request=chatInputFromInteraction(item);return request?[request]:[];});
}
