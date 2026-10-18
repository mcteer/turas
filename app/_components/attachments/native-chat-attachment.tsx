"use client";
import {useEffect,useRef,useState} from 'react';
import {getWebUrl,getFileType,formatBytes} from '../../../lib/chat-attachments';
const privateFile=/^\/api\/conversations\/[a-f0-9-]{36}\/native-uploads\/[a-f0-9-]{36}$/;
const raster=/^image\/(?:png|jpeg|gif|webp|avif)$/i;
export function NativeChatAttachment({filename,mediaType='application/octet-stream',url,size}:{filename?:string;mediaType?:string;url?:string;size?:number}){
 const [failedImage,setFailedImage]=useState<string>(),[local,setLocal]=useState<string>(),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const owned=Boolean(url&&privateFile.test(url)),active=useRef<AbortController|null>(null),objectUrl=useRef<string|null>(null);
 useEffect(()=>{setLocal(undefined);setError('');return ()=>{active.current?.abort();if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}};},[url]);
 async function load(){
  if(!url||loading)return;setLoading(true);setError('');const controller=new AbortController();active.current=controller;
  try{
   const response=await fetch(url,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error();
   const {data:metadata}=await response.json() as {data:{size:number;sha256:string;chunkBytes:number;mediaType:string}};
   if(!Number.isInteger(metadata.size)||metadata.size<1||metadata.size>10*1024*1024||metadata.chunkBytes!==512*1024||! /^[a-f0-9]{64}$/.test(metadata.sha256))throw Error();
   const bytes=new Uint8Array(metadata.size);let offset=0;
   for(let index=0;offset<bytes.length;index++){
    const chunk=await fetch(`${url}/chunks/${index}`,{signal:controller.signal,cache:'no-store'});if(!chunk.ok)throw Error();
    const part=new Uint8Array(await chunk.arrayBuffer());if(part.length!==Math.min(metadata.chunkBytes,bytes.length-offset))throw Error();bytes.set(part,offset);offset+=part.length;
   }
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');if(digest!==metadata.sha256)throw Error();
   if(controller.signal.aborted)return;
   const blob=URL.createObjectURL(new Blob([bytes],{type:metadata.mediaType}));if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=blob;setLocal(blob);
  }catch{if(!controller.signal.aborted)setError('File access could not be confirmed. Retry to check access.');}finally{setLoading(false);}
 }
 const display=owned?local:url,webUrl=!owned&&display?getWebUrl(display):undefined;
 const imageUrl=raster.test(mediaType)&&display&&(owned||webUrl||display.startsWith('blob:')||/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(display))?display:undefined;
 const href=webUrl?.href??(display?.startsWith('blob:')?display:undefined);
 const label=filename||'Attached file',detail=[getFileType(mediaType,filename),formatBytes(size)].filter(Boolean).join(' · ');
 const content=<>{imageUrl&&imageUrl!==failedImage?<img className="chat-file-preview" alt="" src={imageUrl} onError={()=>setFailedImage(imageUrl)}/>:<svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28" fill="none" stroke="currentColor"><path d="M4 1h10l6 6v20H4zM14 1v7h6M8 14h8M8 19h8"/></svg>}<span className="chat-file-meta"><strong>{label}</strong><small>{detail}</small></span></>;
 return <div className="chat-file-card">{href?<a href={href} download={owned?label:undefined} target={owned?undefined:'_blank'} rel="noopener noreferrer">{content}<span aria-hidden="true">↓</span></a>:<span>{content}</span>}{owned&&!local&&<button type="button" disabled={loading} onClick={()=>void load()}>{loading?'Loading file…':`View ${label}`}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
