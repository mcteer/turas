import {createHash} from 'node:crypto';
export function normalizeMessageText(text:string){return text.replace(/\r\n?/g,'\n').normalize('NFC');}
export function messageDigest(text:string){return createHash('sha256').update(JSON.stringify({message:normalizeMessageText(text)})).digest('hex');}
