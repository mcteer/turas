import { createHmac,timingSafeEqual } from 'node:crypto';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { learningHash } from './repository';
const sign=(body:string)=>createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update(`learning-cursor-v1:${body}`).digest();
export function learningCursor(scope:unknown,at:Date,id:string):string{
 const body=Buffer.from(JSON.stringify({v:1,b:learningHash(scope),at:at.toISOString(),id,exp:Date.now()+900000})).toString('base64url');
 const cursor=`${body}.${sign(body).toString('base64url')}`;
 if(cursor.length>512)throw Error('Learning cursor exceeded its contract');return cursor;
}
export function parseLearningCursor(cursor:string|undefined,scope:unknown):{at:string;id:string}|null{
 if(!cursor)return null;
 try{
  if(cursor.length>512)throw Error();const [body,signature,...extra]=cursor.split('.'),actual=Buffer.from(signature,'base64url'),expected=sign(body);
  if(extra.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
  const value=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(value.v!==1||value.b!==learningHash(scope)||!Number.isSafeInteger(value.exp)||value.exp<=Date.now()||typeof value.at!=='string'||!Number.isFinite(Date.parse(value.at))||typeof value.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id))throw Error();
  return {at:value.at,id:value.id};
 }catch{throw new HttpFailure(409,'cursor_changed','Learning view changed; refresh the list');}
}
