import {z} from 'zod';
import {attachmentLimits} from './attachment-text';

export const nativeTextPartSchema=z.object({type:z.literal('text'),text:z.string().min(1).max(attachmentLimits.messageBytes)}).strict();
export const nativeFilePartSchema=z.object({type:z.literal('file'),filename:z.string().trim().min(1).max(240).refine(value=>!/[\u0000-\u001f\u007f]/.test(value)),
 mediaType:z.string().max(160).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i),
 data:z.string().max(attachmentLimits.messageBytes).regex(/^data:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/i)}).strict();
export const ordinaryNativeMessageSchema=z.array(z.union([nativeTextPartSchema,nativeFilePartSchema])).min(1).max(11)
 .superRefine((parts,ctx)=>{
  const files=parts.filter(part=>part.type==='file');
  if(!files.length||files.length>attachmentLimits.files)ctx.addIssue({code:'custom',message:'Include one to five native files'});
  if(new TextEncoder().encode(JSON.stringify(parts)).byteLength>attachmentLimits.messageBytes)ctx.addIssue({code:'custom',message:'Document message exceeds its transport limit'});
  for(const part of files){
   const comma=part.data.indexOf(','),declared=part.data.slice(5,part.data.indexOf(';')).toLowerCase(),encoded=part.data.slice(comma+1);
   if(declared!==part.mediaType.toLowerCase()||encoded.length%4!==0)ctx.addIssue({code:'custom',message:'File bytes do not match their declared encoding'});
  }
 });
export type OrdinaryNativeMessage=z.infer<typeof ordinaryNativeMessageSchema>;
export type OrdinaryNativeFile=z.infer<typeof nativeFilePartSchema>;

/** Eve's documented text-summary contract for UserContent. The native runtime
 * receives the original parts, including bytes; this is only its audit summary. */
export function summarizeNativeMessage(parts:OrdinaryNativeMessage){
 return parts.map(part=>part.type==='text'?part.text:`[file: ${part.filename} (${part.mediaType})]`).join('\n');
}
export function nativeMessageText(parts:OrdinaryNativeMessage){return parts.filter(part=>part.type==='text').map(part=>part.text).join('\n');}
