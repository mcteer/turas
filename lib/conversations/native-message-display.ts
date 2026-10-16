import type {EveMessage} from 'eve/react';

export type NativeAttachmentReference={
 eventId:string;text?:string;inlineFileCount?:number;
 fileOrder?:{kind:'staged'|'inline';index:number}[];
 files:{filename?:string;mediaType:string;size:number;url:string}[];
};
export type NativeUserDisplayPart={type:'text';text:string}|{
 type:'file';filename?:string;mediaType?:string;size?:number;url?:string;
};

/** Use exact consumed-message metadata to present compact native deliveries.
 * Original inline files keep their native URLs; staged files use owned routes.
 * Ordinals preserve distinct files even when their names and types coincide. */
export function nativeUserDisplayParts(message:EveMessage,reference?:NativeAttachmentReference):NativeUserDisplayPart[]{
 const original=message.parts.flatMap<NativeUserDisplayPart>(part=>part.type==='text'?[{type:'text',text:part.text}]
  :part.type==='file'?[{type:'file',filename:part.filename,mediaType:part.mediaType,url:part.url}]:[]);
 const inline=original.filter(part=>part.type==='file');
 const order=reference?.fileOrder,count=reference?.inlineFileCount;
 if(message.role!=='user'||!reference||typeof reference.text!=='string'||!Number.isSafeInteger(count)||Number(count)<0||!Array.isArray(order)||
  order.length!==Number(count)+reference.files.length)return original;
 const identities=new Set<string>();
 for(const item of order){
  if(!['staged','inline'].includes(item.kind)||!Number.isSafeInteger(item.index)||item.index<0||
    item.index>=(item.kind==='staged'?reference.files.length:Number(count)))return original;
  const key=`${item.kind}:${item.index}`;if(identities.has(key))return original;identities.add(key);
 }
 const staged=(index:number):NativeUserDisplayPart=>({type:'file',...reference.files[index]});
 if(inline.length===Number(count)&&reference.files.length){
  return [...(reference.text?[{type:'text' as const,text:reference.text}]:[]),
   ...order.map(item=>item.kind==='staged'?staged(item.index):inline[item.index])];
 }
 // Existing native histories already contain every file; replace only their
 // staged links, preserving the original text and file positions.
 if(inline.length===order.length){let index=0;return original.map(part=>{
  if(part.type!=='file')return part;const item=order[index++];return item.kind==='staged'?staged(item.index):part;
 });}
 return original;
}
