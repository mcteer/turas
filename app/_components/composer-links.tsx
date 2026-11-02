"use client";
import {useImperativeHandle,useRef,useState,type Ref} from 'react';
import {getWebUrl,getMessageLinks,removeMessageLink} from '../../lib/chat-attachments';

export type ComposerLinksControl={open:()=>void};
export function ComposerLinks({text,onChange,disabled,control,hideTrigger=false}:{text:string;onChange:(text:string)=>void;disabled:boolean;control?:Ref<ComposerLinksControl>;hideTrigger?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),[url,setUrl]=useState(''),[error,setError]=useState('');
 const links=getMessageLinks(text);
 function open(){if(disabled)return;setError('');dialog.current?.showModal();}
 useImperativeHandle(control,()=>({open}),[disabled]);
 function add(){
  if(disabled)return;
  const value=url.trim();if(!getWebUrl(value)){setError('Enter a complete link beginning with https:// or http://.');return;}
  const next=links.includes(value)?text:[text.trimEnd(),value].filter(Boolean).join('\n');
  if(next.length>16384){setError('The message is too long. Shorten it before adding a link.');return;}
  onChange(next);dialog.current?.close();setUrl('');setError('');
 }
 return <div className="composer-links">
  {!hideTrigger&&<button type="button" className="composer-attach" aria-label="Add a link" disabled={disabled} onClick={open}>
   <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></svg>
  </button>}
  {links.length>0&&<ul className="chat-link-list" aria-label="Message links">{links.map(link=><li key={link}>
   <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
   <button type="button" disabled={disabled} aria-label={`Remove link ${link}`} onClick={()=>onChange(removeMessageLink(text,link))}>×</button>
  </li>)}</ul>}
  <dialog ref={dialog} className="chat-link-dialog" aria-labelledby="chat-link-title">
   <h2 id="chat-link-title">Add a link</h2><p>Include a page for Turi to reference with your message.</p>
   <label className="field-label" htmlFor="chat-link-url">Link URL</label>
   <input id="chat-link-url" className="field" type="url" autoFocus disabled={disabled} value={url} onChange={event=>{setUrl(event.target.value);setError('');}} aria-invalid={Boolean(error)} aria-describedby={error?'chat-link-error':undefined}
    onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();add();}}}/>
   {error&&<p id="chat-link-error" role="alert">{error}</p>}
   <div className="chat-link-dialog-actions"><button type="button" className="secondary-button" onClick={()=>dialog.current?.close()}>Cancel</button><button type="button" className="primary-button" disabled={disabled} onClick={add}>Add link</button></div>
  </dialog>
 </div>;
}
