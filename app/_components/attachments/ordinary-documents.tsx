"use client";
import { useEffect, useRef, useState } from "react";
import { extractAttachmentText, getExtractableFileType } from "../../../lib/attachment-extract";
import { attachmentLimits } from "../../../lib/conversations/attachment-text";

import {composeOrdinaryMessage,type OrdinaryAttachment} from '../../../lib/conversations/ordinary-documents';

async function nativeFile(file:File){
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('The file could not be read.'));reader.onerror=()=>reject(Error('The file could not be read.'));reader.onabort=()=>reject(Error('The file could not be read.'));reader.readAsDataURL(file);});
 const mediaType=(file.type||'application/octet-stream').split(';')[0].toLowerCase();
 return {type:'file' as const,filename:file.name,mediaType,data:`data:${mediaType};base64,${data.slice(data.indexOf(',')+1)}`};
}
export function OrdinaryDocuments({ documents, onChange, onPreparingChange, disabled, buttonLabel = "Attach document", nativeFilesEnabled = false }: {
  documents: OrdinaryAttachment[]; onChange: (value: OrdinaryAttachment[]) => void;
  onPreparingChange: (value: boolean) => void; disabled: boolean; buttonLabel?: string; nativeFilesEnabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null), generation = useRef(0);
  const [ready,setReady]=useState(false);
  const [preparing, setPreparing] = useState(false), [error, setError] = useState("");
  useEffect(() => { setReady(true); return () => { generation.current++; onPreparingChange(false); }; }, [onPreparingChange]);
  async function add(files: File[]) {
    if (!ready || disabled || preparing || !files.length) return;
    setError("");
    if (files.length + documents.length > attachmentLimits.files) { setError("Attach up to five documents per message."); return; }
    const ticket = ++generation.current; setPreparing(true); onPreparingChange(true);
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
      if (generation.current === ticket) onChange([...documents, ...added]);
    } catch (failure) { if (generation.current === ticket) setError(failure instanceof Error ? failure.message : "The document could not be read."); }
    finally { if (generation.current === ticket) { setPreparing(false); onPreparingChange(false); } }
  }
  return <div className="ordinary-documents">
    <input ref={input} type="file" multiple hidden accept={nativeFilesEnabled?undefined:".csv,.docx,.epub,.html,.json,.log,.md,.odp,.ods,.odg,.odt,.pdf,.pptx,.rtf,.txt,.xlsx,.xml,.yaml,.yml"}
      aria-label="Chat document files" disabled={!ready || disabled || preparing} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void add(files); }} />
    <button type="button" className="composer-attach" aria-label={buttonLabel} disabled={!ready || disabled || preparing} onClick={() => input.current?.click()}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" /></svg>
    </button>
    {preparing && <span role="status">Preparing document…</span>}
    {!!documents.length && <ul className="chat-document-list">{documents.map((document, index) => <li key={index}>
      <span>{document.filename}{'truncated' in document&&document.truncated && <small>Partial document · first 120,000 characters</small>}</span>
      <button type="button" aria-label={`Remove ${document.filename}`} disabled={!ready || disabled || preparing} onClick={() => onChange(documents.filter((_, i) => i !== index))}>×</button>
    </li>)}</ul>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ReceivedDocuments({ documents }: { documents: Array<{filename:string;truncated?:boolean}> }) {
  return <ul className="chat-document-list" aria-label="Attached documents">{documents.map((document, index) => <li key={index}>
    <span>{document.filename}{'truncated' in document&&document.truncated && <small>Partial document · first 120,000 characters</small>}</span>
  </li>)}</ul>;
}
