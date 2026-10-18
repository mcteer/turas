import {createHash} from 'node:crypto';
type FileIdentity={filename:string;mediaType:string;sha256:string};
/** Compare actual inline bytes, never resolve a sandbox path. Eve labels its
 * inline staged files with this digest-scoped alias instead of the source name. */
export function nativeProviderFilePresent(file:FileIdentity,parts:readonly unknown[]){
 return parts.some(value=>{
  if(!value||typeof value!=='object')return false;
  const part=value as {type?:unknown;filename?:unknown;mediaType?:unknown;data?:{type?:unknown;data?:unknown}};
  if(part.type!=='file'||part.mediaType!==file.mediaType||part.data?.type!=='data')return false;
  const data=part.data.data;if(typeof data!=='string'&&!(data instanceof Uint8Array))return false;
  const digest=createHash('sha256').update(typeof data==='string'?Buffer.from(data,'base64'):data).digest('hex');
  return digest===file.sha256&&(part.filename===file.filename||part.filename===`/workspace/attachments/${digest.slice(0,16)}/${file.filename}`);
 });
}
