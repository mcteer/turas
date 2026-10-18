"use client";
import { useEffect, useRef, useState } from "react";
import { extractAttachmentText, getExtractableFileType } from "../../../lib/attachment-extract";
import {NativeChatAttachment} from "./native-chat-attachment";
import { attachmentLimits } from "../../../lib/conversations/attachment-text";

import {composeOrdinaryMessage,type OrdinaryAttachment} from '../../../lib/conversations/ordinary-documents';

async function nativeFile(file:File){
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('The file could not be read.'));reader.onerror=()=>reject(Error('The file could not be read.'));reader.onabort=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});
 const mediaType=(file.type||'application/octet-stream').split(';')[0].toLowerCase();
 return {type:'file' as const,filename:file.name,mediaType,data:`data:${mediaType};base64,${data.slice(data.indexOf(',')+1)}`};
}
export function OrdinaryDocuments({ documents, onChange, onPreparingChange, disabled, buttonLabel = "Attach document", nativeFilesEnabled = false,conversationId }: {
  documents: OrdinaryAttachment[]; onChange: (value: OrdinaryAttachment[]) => void;
  onPreparingChange: (value: boolean) => void; disabled: boolean; buttonLabel?: string; nativeFilesEnabled?: boolean;conversationId?:string;
}) {
  const input = useRef<HTMLInputElement>(null), generation = useRef(0), preparingNow = useRef(false), mounted = useRef(false);
  const latest = useRef({documents,onChange,onPreparingChange,disabled,nativeFilesEnabled});
  latest.current={documents,onChange,onPreparingChange,disabled,nativeFilesEnabled};
  const [ready,setReady]=useState(false);
  const [preparing, setPreparing] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    mounted.current=true;setReady(true);
    const form=input.current?.closest('form.chat-composer');
    const pasted=(event:Event)=>{
      if(!(event.target instanceof HTMLTextAreaElement)||event.target.getAttribute('aria-label')!=='Message Turi')return;
      const paste=event as ClipboardEvent,files=Array.from(paste.clipboardData?.items??[]).flatMap(item=>{
        if(item.kind!=='file')return [];const file=item.getAsFile();return file?[file]:[];
      });
      if(files.length){event.preventDefault();void add(files);}
    };
    const dragged=(event:Event)=>{if(Array.from((event as DragEvent).dataTransfer?.types??[]).includes('Files'))event.preventDefault();};
    const dropped=(event:Event)=>{
      const transfer=(event as DragEvent).dataTransfer;
      if(!Array.from(transfer?.types??[]).includes('Files'))return;
      event.preventDefault();void add(Array.from(transfer?.files??[]));
    };
    const keydown=(event:Event)=>{
      const key=event as KeyboardEvent,target=event.target;
      if(event.defaultPrevented||key.isComposing||key.key!=='Backspace'||!(target instanceof HTMLTextAreaElement)||target.value!==''||target.disabled||target.readOnly||latest.current.disabled||preparingNow.current)return;
      if(latest.current.documents.length){event.preventDefault();latest.current.onChange(latest.current.documents.slice(0,-1));}
    };
    form?.addEventListener('paste',pasted);form?.addEventListener('dragover',dragged);form?.addEventListener('drop',dropped);form?.addEventListener('keydown',keydown);
    return ()=>{mounted.current=false;generation.current++;preparingNow.current=false;latest.current.onPreparingChange(false);
      form?.removeEventListener('paste',pasted);form?.removeEventListener('dragover',dragged);form?.removeEventListener('drop',dropped);form?.removeEventListener('keydown',keydown);};
  }, []);
  async function add(files: File[]) {
    if (!mounted.current || latest.current.disabled || preparingNow.current || !files.length) return;
    const {documents,nativeFilesEnabled}=latest.current;
    setError("");
    if (files.length + documents.length > attachmentLimits.files) { setError("Attach up to five documents per message."); return; }
    const ticket = ++generation.current; preparingNow.current=true;setPreparing(true);latest.current.onPreparingChange(true);
    try {
      const added: OrdinaryAttachment[] = [];
      for (const file of files) {
        if (file.size > attachmentLimits.bytes) throw Error("Attachments must be 10 MB or smaller.");
        if (file.name.length > 240) throw Error("This document's filename is too long.");
        const type = getExtractableFileType(file.type, file.name);
        let prepared=false;
        if(type){const url=URL.createObjectURL(file);try{const extracted=await extractAttachmentText(url,type);added.push({filename:file.name,mediaType:file.type||'application/octet-stream',...extracted});prepared=true;}catch(failure){if(!nativeFilesEnabled)throw failure;}finally{URL.revokeObjectURL(url);}}
        if(!prepared){if(!nativeFilesEnabled)throw Error('This file could not be prepared as a chat document.');added.push(await nativeFile(file));}
        composeOrdinaryMessage('',[...documents,...added]);
      }
      if (mounted.current&&generation.current === ticket) latest.current.onChange([...documents, ...added]);
    } catch (failure) { if (mounted.current&&generation.current === ticket) setError(failure instanceof Error ? failure.message : "The document could not be read."); }
    finally { if (mounted.current&&generation.current === ticket) {preparingNow.current=false;setPreparing(false);latest.current.onPreparingChange(false); } }
  }
  return <div className="ordinary-documents">
    <input ref={input} type="file" multiple hidden accept={nativeFilesEnabled?undefined:".csv,.docx,.epub,.html,.json,.log,.md,.odp,.ods,.odg,.odt,.pdf,.pptx,.rtf,.txt,.xlsx,.xml,.yaml,.yml"}
      aria-label="Chat document files" disabled={!ready || disabled || preparing} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void add(files); }} />
    <button type="button" className="composer-attach" aria-label={buttonLabel} disabled={!ready || disabled || preparing} onClick={() => input.current?.click()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" /></svg>
    </button>
    {preparing && <span role="status">Preparing document…</span>}
    {!!documents.length && <ul className="chat-document-list" aria-label="Message attachments">{documents.map((document, index) => {
      const staged='data' in document&&'sha256' in document&&conversationId;
      const preview='data' in document&&!('sha256' in document)&&/^image\/(?:png|jpeg|gif|webp|avif)$/i.test(document.mediaType)&&/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(document.data);
      return <li key={index}>
        {staged?<NativeChatAttachment filename={document.filename} mediaType={document.mediaType} size={document.size} url={`/api/conversations/${conversationId}/native-uploads/${document.data.slice('turas-upload:'.length)}`}/>
          :preview?<NativeChatAttachment filename={document.filename} mediaType={document.mediaType} url={document.data}/>
          :<span>{document.filename}{'truncated' in document&&document.truncated && <small>Partial document · first 120,000 characters</small>}</span>}
        <button type="button" aria-label={`Remove ${document.filename}`} disabled={!ready || disabled || preparing} onClick={() => {if(!preparingNow.current&&!latest.current.disabled)latest.current.onChange(latest.current.documents.filter((_, i) => i !== index));}}>×</button>
      </li>;
    })}</ul>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ReceivedDocuments({ documents }: { documents: Array<{filename:string;truncated?:boolean}> }) {
  return <ul className="chat-document-list" aria-label="Attached documents">{documents.map((document, index) => <li key={index}>
    <span>{document.filename}{'truncated' in document&&document.truncated && <small>Partial document · first 120,000 characters</small>}</span>
  </li>)}</ul>;
}
