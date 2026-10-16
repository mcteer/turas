import {z} from 'zod';
import {attachmentLimits} from './attachment-text';

export const nativeTextPartSchema=z.object({type:z.literal('text'),text:z.string().min(1).max(attachmentLimits.messageBytes)}).strict();
const fileMetadata={type:z.literal('file'),filename:z.string().trim().min(1).max(240).refine(value=>!/[\u0000-\u001f\u007f]/.test(value)),
 mediaType:z.string().max(160).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i)};
export const stagedNativeFileSchema=z.object({...fileMetadata,data:z.string().regex(/^turas-upload:[0-9a-f-]{36}$/),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().min(1).max(attachmentLimits.bytes)}).strict();
export const nativeFilePartSchema=z.union([stagedNativeFileSchema,z.object({...fileMetadata,
 data:z.string().max(Math.ceil(attachmentLimits.bytes/3)*4+256).regex(/^data:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+;base64,[A-Za-z0-9+/]*={0,2}$/i)}).strict()]);
export const hydratedNativeMessageBytes=Math.ceil(attachmentLimits.bytes/3)*4*attachmentLimits.files+attachmentLimits.messageBytes;
function messageSchema(maximum:number){return z.array(z.union([nativeTextPartSchema,nativeFilePartSchema])).min(1).max(11)
 .superRefine((parts,ctx)=>{
  const files=parts.filter(part=>part.type==='file');
  if(!files.length||files.length>attachmentLimits.files)ctx.addIssue({code:'custom',message:'Include one to five native files'});
  if(new TextEncoder().encode(JSON.stringify(parts)).byteLength>maximum)ctx.addIssue({code:'custom',message:'Document message exceeds its transport limit'});
  for(const part of files){
   if('sha256' in part)continue;
   const comma=part.data.indexOf(','),declared=part.data.slice(5,part.data.indexOf(';')).toLowerCase(),encoded=part.data.slice(comma+1);
   if(declared!==part.mediaType.toLowerCase()||encoded.length%4!==0)ctx.addIssue({code:'custom',message:'File bytes do not match their declared encoding'});
   const size=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
   if(size<1||size>attachmentLimits.bytes)ctx.addIssue({code:'custom',message:'Attachments must be 10 MB or smaller'});
  }
 });}
export const ordinaryNativeMessageSchema=messageSchema(attachmentLimits.messageBytes);
/** Only local preparation and the server-owned hydration boundary use this.
 * HTTP send bodies retain ordinaryNativeMessageSchema's small transport cap. */
export const hydratedNativeMessageSchema=messageSchema(hydratedNativeMessageBytes);
export type OrdinaryNativeMessage=z.infer<typeof ordinaryNativeMessageSchema>;
export type OrdinaryNativeFile=z.infer<typeof nativeFilePartSchema>;

/** Eve's documented text-summary contract for UserContent. The native runtime
 * receives the original parts, including bytes; this is only its audit summary. */
export function summarizeNativeMessage(parts:OrdinaryNativeMessage){
 return parts.map(part=>part.type==='text'?part.text:`[file: ${part.filename} (${part.mediaType})]`).join('\n');
}
export function nativeMessageText(parts:OrdinaryNativeMessage){return parts.filter(part=>part.type==='text').map(part=>part.text).join('\n');}
