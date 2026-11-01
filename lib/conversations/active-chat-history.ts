import type {EveMessage} from 'eve/react';
import {retainedChatMessages,type RetainedChatEvent,type RetainedChatMessage} from './retained-history';
import type {NativeAttachmentReference,NativeUserDisplayPart} from './native-message-display';

export type ChatDisplayMessage={kind:'native';message:EveMessage}|{kind:'retained';message:RetainedChatMessage;activity?:EveMessage['parts']};
/** Presentation only. Application history never enters the native session,
 * event reducer, input controls, delivery admission or provider context. */
export function activeChatHistory(native:readonly EveMessage[],history:readonly RetainedChatEvent[],canonicalUsers=false):ChatDisplayMessage[]{
 if(canonicalUsers)native=native.filter(message=>message.role!=='user');
 if(!history.length)return native.map(message=>({kind:'native' as const,message}));
 // Split only the display of multi-step assistant messages, preserving live
 // unprojected steps when one completed step already has canonical prose.
 const slots=native.flatMap(message=>{
  if(message.role!=='assistant')return [message];
  const groups=new Map<number|undefined,typeof message.parts>();
  const firstStep=message.parts.find(part=>part.type==='text')?.stepIndex;
  for(const part of message.parts){const step='stepIndex' in part?part.stepIndex:firstStep;const group=groups.get(step)??[];groups.set(step,[...group,part]);}
  return groups.size>1?[...groups].map(([step,parts])=>({...message,id:message.id+':display-step:'+String(step),parts})):[message];
 });
 const used=new Set<number>(),result:ChatDisplayMessage[]=[];
 for(const saved of retainedChatMessages(history)){
  const counterpart=slots.findIndex(message=>{
   if(message.role!==saved.role)return false;
   const id=message.id.replace(/:(?:user|assistant)$/,'');
   if(saved.role==='user'&&saved.deliveryId===id)return true;
   if(saved.id===id||saved.role==='user'&&saved.inputAliasEventIds?.includes(id))return true;
   if(saved.role==='user'||saved.turnId===undefined||saved.turnId===null||message.metadata?.turnId!==saved.turnId)return false;
   return saved.stepIndex!==undefined&&saved.stepIndex!==null&&message.parts.some(part=>part.type==='text'&&part.stepIndex===saved.stepIndex);
  });
  if(counterpart<0)result.push({kind:'retained',message:saved});
  else if(!used.has(counterpart)){
   used.add(counterpart);const live=slots[counterpart];
   const liveText=live.parts.filter(part=>part.type==='text').map(part=>part.text).join('');
   const savedText=saved.parts.filter(part=>part.type==='text').map(part=>part.text).join('');
   const nativeVisible=live.parts.some(part=>part.type==='file'||part.type==='text'&&part.text.trim());
   // Identity was established above; text containment only prevents replacing
   // retained prose with a shorter or empty resume placeholder.
   const preferLive=saved.role==='user'?nativeVisible:saved.partial&&!!liveText.trim()&&liveText.includes(savedText);
   const activity=live.parts.filter(part=>part.type!=='text');
   result.push(preferLive?{kind:'native',message:live}:{kind:'retained',message:saved,...(activity.length?{activity}:{})});
  }else result.push({kind:'retained',message:saved}); // Distinct persisted events are never consumed by another event's counterpart.
 }
 slots.forEach((message,index)=>{if(!used.has(index))result.push({kind:'native',message});});
 return result;
}
/** Exact event-scoped owned routes may supplement active file cards. Inline
 * files whose native URL is unavailable remain metadata-only. */
export function retainedActiveParts(message:RetainedChatMessage,reference?:NativeAttachmentReference):NativeUserDisplayPart[]{
 if(reference?.eventId!==message.id)return message.parts;
 let ordinal=0;
 return message.parts.map(part=>{
  if(part.type!=='file')return part;
  const slot=reference?.fileOrder?.[ordinal++];
  if(!slot||slot.kind!=='staged')return part;
  const file=reference?.files[slot.index];
  return file&&file.filename===part.filename&&file.mediaType===part.mediaType&&file.size===part.size?{...part,url:file.url}:part;
 });
}

/** Display only the settled answer for each user delivery. Intermediate model
 * steps stay in the authorized history; this never changes execution or storage. */
export function finalChatHistory(messages:readonly ChatDisplayMessage[],working:boolean):ChatDisplayMessage[]{
 const result:ChatDisplayMessage[]=[];
 let answer:ChatDisplayMessage|undefined;
 const flush=()=>{if(answer)result.push(answer);answer=undefined;};
 for(const item of messages){
  if(item.message.role==='user'){flush();result.push(item);continue;}
  const text=item.message.parts.some(part=>part.type==='text'&&part.text.trim());
  const file=item.message.parts.some(part=>part.type==='file');
  if(!text&&!file)continue;
  if(item.kind==='native'){
   const steps=item.message.parts.flatMap(part=>part.type==='text'&&part.text.trim()&&part.stepIndex!==undefined?[part.stepIndex]:[]);
   const last=steps.length?Math.max(...steps):undefined;
   answer={...item,message:{...item.message,parts:item.message.parts.filter(part=>part.type==='file'||part.type==='text'&&(last===undefined||part.stepIndex===last))}};
  }else answer=item;
 }
 if(!working)flush();
 return result;
}
