import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../../config';
import {HttpFailure} from '../../../contracts/http';
const schema=z.object({at:z.iso.datetime(),id:z.uuid(),expiresAt:z.number().int().positive()}).strict();
const signature=(text:string,binding:string)=>createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(JSON.stringify(['specialist-cursor-v1',binding,text])).digest();
export function encodeSpecialistCursor(at:string,id:string,binding:string,now=Date.now()){
 const text=Buffer.from(JSON.stringify(schema.parse({at,id,expiresAt:now+900000}))).toString('base64url');
 return text+'.'+signature(text,binding).toString('base64url');
}
export function decodeSpecialistCursor(cursor:string,binding:string,now=Date.now()){
 try{
  if(cursor.length>500)throw Error('Cursor too large');
  const parts=cursor.split('.');if(parts.length!==2)throw Error('Invalid cursor');
  const expected=signature(parts[0],binding),actual=Buffer.from(parts[1],'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Invalid signature');
  const value=schema.parse(JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8')));
  if(value.expiresAt<=now||value.expiresAt>now+900000)throw Error('Expired cursor');
  return value;
 }catch{throw new HttpFailure(422,'invalid_cursor','Refresh the specialist task list');}
}
