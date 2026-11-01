"use client";

import {useEffect,useRef,useState} from 'react';

export function ComposerAttachmentMenu({onFiles,filesDisabled,onLink,onSources,disabled=false}:{
 onFiles?:()=>void;filesDisabled?:boolean;onLink:()=>void;onSources?:()=>void;disabled?:boolean;
}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 function close(focus=false){setOpen(false);if(focus)trigger.current?.focus();}
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 useEffect(()=>{
  if(!open)return;
  root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
 },[open]);
 function choose(action:()=>void){close(true);action();}
 return <div className="composer-add-menu" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button ref={trigger} type="button" className="composer-add-trigger" aria-label="Add attachments" aria-haspopup="menu" aria-expanded={open}
   disabled={disabled} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);}}}>
   <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14"/></svg>
  </button>
  {open&&<div className="composer-add-popover" role="menu" aria-label="Attach to conversation" onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();close(true);return;}
   if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
   event.preventDefault();const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
   if(!items.length)return;const index=items.indexOf(document.activeElement as HTMLButtonElement);
   items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
  }}>
   {onFiles&&<button type="button" role="menuitem" disabled={filesDisabled} onClick={()=>choose(onFiles)}><span>Add photos &amp; files</span><small>Upload from computer</small></button>}
   {onSources&&<button type="button" role="menuitem" onClick={()=>choose(onSources)}><span>Customer sources</span><small>Select existing evidence</small></button>}
   <button type="button" role="menuitem" onClick={()=>choose(onLink)}><span>Add a link</span><small>Include a web page</small></button>
  </div>}
 </div>;
}
