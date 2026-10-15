"use client";
import {useState} from 'react';
import {getWebUrl,getFileType,formatBytes} from '../../../lib/chat-attachments';
/** The original attachment preview/link behavior, using the current theme. */
export function NativeChatAttachment({filename,mediaType='application/octet-stream',url,size}:{filename?:string;mediaType?:string;url?:string;size?:number}){
 const [failedImage,setFailedImage]=useState<string>();
 const webUrl=url?getWebUrl(url):undefined;
 const imageUrl=mediaType.startsWith('image/')&&url&&(webUrl||url.startsWith('blob:')||/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(url))?url:undefined;
 const href=webUrl?.href??(url?.startsWith('blob:')?url:undefined);
 const label=filename||'Attached file',detail=[getFileType(mediaType,filename),formatBytes(size)].filter(Boolean).join(' · ');
 const content=<>{imageUrl&&imageUrl!==failedImage?<img className="chat-file-preview" alt="" src={imageUrl} onError={()=>setFailedImage(imageUrl)}/>:<svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28" fill="none" stroke="currentColor"><path d="M4 1h10l6 6v20H4zM14 1v7h6M8 14h8M8 19h8"/></svg>}<span className="chat-file-meta"><strong>{label}</strong><small>{detail}</small></span></>;
 return <div className="chat-file-card">{href?<a href={href} target="_blank" rel="noopener noreferrer">{content}<span aria-hidden="true">↗</span></a>:<span>{content}</span>}</div>;
}
