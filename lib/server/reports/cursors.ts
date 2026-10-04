import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {getServerConfig} from '../config';
import {HttpFailure} from '../../contracts/http';
import {reportDigest} from './commands';
const schema=z.strictObject({at:z.iso.datetime(),id:z.uuid(),scope:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.number().int().positive()});
function sign(value:string){return createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update('reports-cursor-v1:').update(value).digest('base64url');}
export function createReportCursor(scope:unknown,at:string,id:string){const body=Buffer.from(JSON.stringify({at,id,scope:reportDigest(scope),expiresAt:Date.now()+600000})).toString('base64url');return body+'.'+sign(body);}
export function readReportCursor(raw:string|undefined,scope:unknown){
 if(!raw)return null;try{
  if(raw.length>2000)throw new Error();const [body,signature,...extra]=raw.split('.');if(extra.length || !body || !signature)throw new Error();
  const expected=Buffer.from(sign(body)),provided=Buffer.from(signature);if(expected.length!==provided.length || !timingSafeEqual(expected,provided))throw new Error();
  const parsed=schema.parse(JSON.parse(Buffer.from(body,'base64url').toString('utf8')));if(parsed.scope!==reportDigest(scope) || parsed.expiresAt<=Date.now())throw new Error();return parsed;
 }catch{throw new HttpFailure(422,'invalid_input','Report cursor expired or changed');}
}
