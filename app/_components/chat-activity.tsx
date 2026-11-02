"use client";

import type { EveMessage } from "eve/react";
import type { ChatInputRequest } from "../../lib/chat-inputs";
import { getWebUrl } from "../../lib/chat-attachments";
import { ChatInputRequestCard } from "./chat-input-request";
import { ChatMarkdown } from "./chat-markdown";
import { NativeChatAttachment } from "./attachments/native-chat-attachment";

type Part = EveMessage["parts"][number];
type Response = { requestId: string; optionId?: string; text?: string };

export function activityRequestIds(parts: readonly Part[]) {
 return parts.flatMap(part=>part.type==='interaction'?[part.interactionId]:part.type==='tool'&&part.interaction?[part.interaction.interactionId]:[]);
}
export function assistantHasContent(parts:readonly Part[],requests:readonly ChatInputRequest[]){
 return parts.some(part=>part.type==='text'&&part.text.trim()||part.type==='file'||
  (part.type==='interaction'||part.type==='tool'&&part.interaction)&&requests.some(request=>request.requestId===(part.type==='interaction'?part.interactionId:part.type==='tool'?part.interaction?.interactionId:undefined)));
}

/** Render the SDK's current interactions; model text cannot create controls. */
export function ChatAssistantParts({parts,streaming,requests,disabled,onResponse,activityOnly=false}:{
 parts:readonly Part[];streaming:boolean;requests:readonly ChatInputRequest[];disabled:boolean;
 onResponse:(response:Response)=>Promise<void>;activityOnly?:boolean;
}){
 return parts.map((part,index)=>{
  if(part.type==='text')return activityOnly||!part.text?null:<ChatMarkdown key={part.id??index} text={part.text} streaming={streaming&&part.state!=="done"}/>;
  if(part.type==='file')return activityOnly?null:<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size} url={part.url}/>;
  const item=part.type==='interaction'?part:part.type==='tool'?part.interaction:undefined;
  if(!item)return null;
  if(item.request.kind==='sign-in'){
   const challenge=item.request.signIn,url=getWebUrl(challenge?.url??item.request.link?.url??'');
   return <section className="chat-input-request" aria-label="Sign in" key={item.interactionId}>
    <p>{item.request.prompt}</p>
    {item.status==='open'?<>{challenge?.instructions&&<p>{challenge.instructions}</p>}{challenge?.userCode&&<code>{challenge.userCode}</code>}{url&&<a href={url.href} target="_blank" rel="noopener noreferrer">{item.request.link?.label??'Sign in'}</a>}</>:<small>Sign-in {item.outcome}</small>}
   </section>;
  }
  const pending=requests.find(request=>request.requestId===item.interactionId);
  if(pending)return <ChatInputRequestCard key={item.interactionId} request={pending} disabled={disabled} onResponse={onResponse}/>;
  if(item.answer||item.status==='settled')return <section className="chat-input-request chat-input-resolved" aria-label="Submitted response" key={item.interactionId}>
   <p>{item.request.prompt}</p><p className="muted">{item.answer?.optionId?item.request.options?.find(option=>option.id===item.answer?.optionId)?.label??item.answer.optionId:item.answer?.text}</p>
   <small>{item.status==='settled'?item.outcome:'Response submitted'}</small>
  </section>;
  return null;
 });
}
