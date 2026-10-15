'use client';
import {useState} from 'react';
import type {ChatInputRequest} from '../../lib/chat-inputs';
export function ChatInputRequestCard({request,disabled,onResponse}:{request:ChatInputRequest;disabled:boolean;
 onResponse:(response:{requestId:string;optionId?:string;text?:string})=>Promise<void>}){
 const [text,setText]=useState('');
 const freeform=request.allowFreeform!==false && request.kind==='question';
 return <section className="chat-input-request" aria-label={request.kind==='question'?'Turi question':'Your decision'}>
  <p>{request.prompt}</p>
  <div className="chat-input-options">{request.options?.map(option=><button type="button" className="secondary-button"
   key={option.id} disabled={disabled} onClick={()=>void onResponse({requestId:request.requestId,optionId:option.id})}>
   {option.label}{option.description && <small>{option.description}</small>}
  </button>)}</div>
  {freeform && <form onSubmit={event=>{event.preventDefault();if(text.trim())void onResponse({requestId:request.requestId,text:text.trim()});}}>
   <label>Reply<input aria-label="Reply to Turi" value={text} onChange={event=>setText(event.target.value)} maxLength={16384} disabled={disabled}/></label>
   <button className="secondary-button" disabled={disabled||!text.trim()}>Send reply</button>
  </form>}
 </section>;
}
