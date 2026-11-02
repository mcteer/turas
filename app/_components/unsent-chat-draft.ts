'use client';
const prefix='turas-unsent-text-v1:';
const sequences=new Map<string,number>();
const bytes=new TextEncoder();
const keyFor=(conversationId:string)=>prefix+conversationId;
async function cipherKey(csrfToken:string){
 if(!/^[a-f0-9]{64}$/.test(csrfToken))throw Error('Current login required');
 const digest=await crypto.subtle.digest('SHA-256',bytes.encode('turas-unsent-text-v1:'+csrfToken));
 return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function encode(value:Uint8Array){return btoa(Array.from(value,byte=>String.fromCharCode(byte)).join(''));}
function decode(value:string){return Uint8Array.from(atob(value),char=>char.charCodeAt(0));}
/** Text only, encrypted per tab/current login. This never restores a dispatch
 * key, approval, attachment bytes or an automatic-send instruction. */
export async function readUnsentChatDraft(conversationId:string,csrfToken:string):Promise<string|null>{
 const key=keyFor(conversationId),raw=sessionStorage.getItem(key);if(!raw)return null;
 try{
  if(raw.length>100000)throw Error('Draft too large');
  const value=JSON.parse(raw);
  if(value.version!==1||typeof value.iv!=='string'||typeof value.data!=='string')throw Error('Invalid draft');
  const iv=decode(value.iv);if(iv.length!==12)throw Error('Invalid IV');
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:bytes.encode(key)},await cipherKey(csrfToken),decode(value.data));
  const text=new TextDecoder('utf-8',{fatal:true}).decode(clear);
  if(text.length>16384)throw Error('Draft too large');return text;
 }catch{if(sessionStorage.getItem(key)===raw)sessionStorage.removeItem(key);return null;}
}
export async function saveUnsentChatDraft(conversationId:string,csrfToken:string,text:string){
 const key=keyFor(conversationId),sequence=(sequences.get(key)??0)+1;sequences.set(key,sequence);
 if(!text){sessionStorage.removeItem(key);return;}
 if(text.length>16384)return;
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes.encode(key)},await cipherKey(csrfToken),bytes.encode(text));
 if(sequences.get(key)!==sequence)return;
 sessionStorage.setItem(key,JSON.stringify({version:1,iv:encode(iv),data:encode(new Uint8Array(data))}));
}
