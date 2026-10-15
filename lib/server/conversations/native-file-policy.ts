import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';

/** Optional operator check scope. Ordinary releases use the existing explicit
 * feature switch; a bounded check may enable just one conversation until expiry. */
export function ordinaryNativeFilesEnabled(conversationId?:string){
 if(process.env.TURAS_ORDINARY_NATIVE_FILES_ENABLED!=='1'||process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED==='1')return false;
 const restricted=process.env.TURAS_ORDINARY_NATIVE_FILES_CONVERSATION_ID,until=process.env.TURAS_ORDINARY_NATIVE_FILES_EXPIRES_AT;
 if(!restricted&&!until)return true;
 return z.uuid().safeParse(restricted).success&&restricted===conversationId&&
  z.iso.datetime({offset:true}).safeParse(until).success&&Date.parse(until!)>Date.now();
}
export function assertNativeFileEvaluationOpen(conversationId:string){
 if(process.env.TURAS_ORDINARY_NATIVE_FILES_CONVERSATION_ID===conversationId&&!ordinaryNativeFilesEnabled(conversationId))
  throw new HttpFailure(503,'native_files_unavailable','This conversation is temporarily unavailable');
}
export function nativeFileEvaluationDeadline(conversationId:string){
 assertNativeFileEvaluationOpen(conversationId);
 return process.env.TURAS_ORDINARY_NATIVE_FILES_CONVERSATION_ID===conversationId?
  new Date(process.env.TURAS_ORDINARY_NATIVE_FILES_EXPIRES_AT!):null;
}
