import {createHash} from 'node:crypto';
import {ordinaryNativeMessageSchema,type OrdinaryNativeMessage,summarizeNativeMessage} from '../../conversations/native-message';
import {attachmentLimits,parseAttachmentMessage} from '../../conversations/attachment-text';
import {HttpFailure} from '../../contracts/http';
import {normalizeMessageText} from './message-integrity';

/** Accept local bytes only. Remote URLs, framework paths and caller-supplied
 * source references cannot enter the native upload pipeline through this API. */
export function parseOrdinaryNativeMessage(input:unknown):OrdinaryNativeMessage{
 const parsed=ordinaryNativeMessageSchema.safeParse(input);
 if(!parsed.success)throw new HttpFailure(422,'invalid_native_message','Invalid document message');
 const normalized=parsed.data.map(part=>{
  if(part.type==='text')return {...part,text:normalizeMessageText(part.text)};
  const encoded=part.data.slice(part.data.indexOf(',')+1),bytes=Buffer.from(encoded,'base64');
  if(!bytes.length||bytes.length>attachmentLimits.bytes||bytes.toString('base64')!==encoded)
   throw new HttpFailure(422,'invalid_native_file','Invalid file encoding');
  const mediaType=part.mediaType.toLowerCase();
  return {...part,filename:part.filename.normalize('NFC'),mediaType,data:`data:${mediaType};base64,${encoded}`};
 });
 const text=normalized.filter(part=>part.type==='text').map(part=>part.text).join('\n');
 const documents=parseAttachmentMessage(text);
 if(normalized.filter(part=>part.type==='file').length+(documents?.documents.length??0)>attachmentLimits.files)
  throw new HttpFailure(422,'too_many_documents','Attach up to five documents');
 if(Buffer.byteLength(JSON.stringify(normalized))>attachmentLimits.messageBytes||(!documents&&Buffer.byteLength(text)>16384))
  throw new HttpFailure(413,'native_message_too_large','Document message exceeds its transport limit');
 return normalized;
}
export function nativeMessageDigest(parts:OrdinaryNativeMessage){
 return createHash('sha256').update(JSON.stringify({contractVersion:'ordinary-native-message-v2',parts:parts.map(part=>part.type==='text'?part:{type:'file',filename:part.filename,mediaType:part.mediaType,
  sha256:createHash('sha256').update(Buffer.from(part.data.slice(part.data.indexOf(',')+1),'base64')).digest('hex')})})).digest('hex');
}
export {summarizeNativeMessage};
