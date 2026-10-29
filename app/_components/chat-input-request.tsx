'use client';
import {useEffect,useState} from 'react';
import {approvalReviewReady,type ChatInputRequest} from '../../lib/chat-inputs';
export function ChatInputRequestCard({request,disabled,onResponse}:{request:ChatInputRequest;disabled:boolean;
 onResponse:(response:{requestId:string;optionId?:string;text?:string})=>Promise<void>}){
 const [text,setText]=useState('');
 const [clientReady,setClientReady]=useState(false);
 useEffect(()=>{setClientReady(true);},[]);
 const unavailable=disabled||!clientReady;
 const freeform=request.allowFreeform!==false && request.kind==='question';
 return <section className="chat-input-request" aria-label={request.kind==='question'?'Turi question':'Your decision'}>
  <p>{request.prompt}</p>
  {request.kind==='tool-approval'&&(approvalReviewReady(request)?<div className="chat-approval-preview">
   <h3>Proposed action</h3><p><code>{request.action!.toolName}</code></p>
   <p>Review these exact proposed inputs before approving. They do not establish accepted customer facts.</p>
   <pre aria-label="Proposed action inputs">{JSON.stringify(request.action!.input,null,2)}</pre>
  </div>:<p role="status">The exact proposed inputs are unavailable. Reopen this conversation before approving.</p>)}
  <div className="chat-input-options">{request.options?.map(option=><button type="button" className="secondary-button"
   key={option.id} disabled={unavailable||(request.kind==='tool-approval'&&option.id==='approve'&&!approvalReviewReady(request))} onClick={()=>void onResponse({requestId:request.requestId,optionId:option.id})}>
   {option.label}{option.description && <small>{option.description}</small>}
  </button>)}</div>
  {freeform && <form onSubmit={event=>{event.preventDefault();if(!unavailable&&text.trim())void onResponse({requestId:request.requestId,text:text.trim()});}}>
   <label>Reply<input aria-label="Reply to Turi" value={text} onChange={event=>setText(event.target.value)} maxLength={16384} disabled={unavailable}/></label>
   <button className="secondary-button" disabled={unavailable||!text.trim()}>Send reply</button>
  </form>}
 </section>;
}
