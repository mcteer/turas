import {z} from 'zod';
const requestSchema=z.object({requestId:z.string(),kind:z.enum(['question','session-limit','tool-approval']),
 prompt:z.string(),allowFreeform:z.boolean().optional(),display:z.string().optional(),
 options:z.array(z.object({id:z.string(),label:z.string(),description:z.string().optional()})).optional()});
export type ChatInputRequest=z.infer<typeof requestSchema>;
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
 if(option)return {requestId:request.requestId,optionId:option.id};
 return request.kind==='question' && request.allowFreeform!==false?{requestId:request.requestId,text:value}:null;
}
